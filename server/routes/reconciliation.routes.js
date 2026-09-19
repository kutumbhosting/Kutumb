// server/routes/reconciliation.routes.js
//
// Mounted at /api/events/reconcile.
//
//   POST /api/events/reconcile            — upload a bank statement for one
//                                            event, match it against that
//                                            event's registrations, flip
//                                            Pending → Paid where matched,
//                                            and save the run for later
//                                            export.
//   GET  /api/events/reconcile/latest      — the most recent saved run for
//                                            one event (so the "Download
//                                            Excel Report" button still
//                                            works after a page reload).
//   GET  /api/events/reconcile/:id/export  — regenerate and download the
//                                            Excel report for a saved run.

import { Router } from "express";
import multer from "multer";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../lib/auth.js";
import { parseBankStatement } from "../lib/bankStatementParser.js";
import { reconcile, groupAllocationsByRegistration } from "../lib/paymentReconciliation.js";
import { buildReconciliationWorkbook } from "../lib/reconciliationReportBuilder.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

function dbRowToRegistration(r) {
  return {
    id: r.id,
    eventName: r.event_name,
    eventYear: r.event_year,
    name: r.name,
    email: r.email,
    phone: r.phone,
    adults: r.adults,
    children: r.children,
    comments: r.comments,
    registrationNumber: r.registration_number,
    isMember: r.is_member,
    membershipNumber: r.membership_number,
    fee: Number(r.fee),
    perPersonFee: Number(r.per_person_fee),
    bankTransferred: r.bank_transferred,
    transactionNumber: r.transaction_number,
    paymentStatus: r.payment_status,
    paymentAmount: r.payment_amount !== null ? Number(r.payment_amount) : null,
    paymentDate: r.payment_date,
    paymentMatchConfidence: r.payment_match_confidence,
    paymentMatchNote: r.payment_match_note,
    createdAt: r.created_at,
  };
}

/* -----------------------------
   📤 UPLOAD BANK STATEMENT + RECONCILE
------------------------------ */
router.post("/", requireAdmin, upload.single("bankStatement"), async (req, res) => {
  try {
    const { eventName, eventYear } = req.body;
    if (!eventName || !eventYear) {
      return res.status(400).json({ message: "Missing event" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No bank statement file uploaded" });
    }

    let parsed;
    try {
      parsed = await parseBankStatement(req.file.buffer, req.file.originalname);
    } catch (err) {
      return res.status(400).json({ message: err.message || "Couldn't read that file" });
    }
    if (parsed.transactions.length === 0) {
      return res.status(400).json({
        message:
          "No credit transactions were found in that file. Check it's the right statement, or that it has Date/Amount/Details columns.",
      });
    }

    const { rows: dbRows } = await pool.query(
      "SELECT * FROM kutumb_event_registrations WHERE event_name = $1 AND event_year = $2 ORDER BY created_at",
      [eventName, eventYear]
    );
    if (dbRows.length === 0) {
      return res.status(404).json({ message: "No registrations found for this event" });
    }
    const registrations = dbRows.map(dbRowToRegistration);

    const { allocations, unmatchedCredits } = reconcile(registrations, parsed.transactions);
    const grouped = groupAllocationsByRegistration(allocations, (reg) => reg.id);

    // ── Apply updates: only flip Pending/N-A → Paid; never touch a row
    // already Paid, and never overwrite a manually-entered transaction
    // number. Already-Paid rows missing amount/date get those backfilled
    // only (so older manually-marked-Paid rows still gain the new columns).
    const updatedRows = [];
    for (const reg of registrations) {
      const match = grouped.get(reg.id);
      if (!match) continue;

      const wasPaid = reg.paymentStatus === "Paid";
      const newStatus = wasPaid ? reg.paymentStatus : "Paid";

      const { rows } = await pool.query(
        `UPDATE kutumb_event_registrations SET
           payment_status = $1,
           payment_amount = COALESCE(payment_amount, $2),
           payment_date = COALESCE(payment_date, $3),
           payment_match_confidence = $4,
           payment_match_note = $5,
           transaction_number = CASE WHEN transaction_number IS NULL OR transaction_number = ''
                                      THEN $6 ELSE transaction_number END,
           bank_transferred = TRUE
         WHERE id = $7
         RETURNING *`,
        [newStatus, match.amount, match.date, match.confidence, match.reason, match.bankReference, reg.id]
      );
      const finalRow = dbRowToRegistration(rows[0]);
      updatedRows.push({
        email: reg.email,
        name: reg.name,
        previousStatus: reg.paymentStatus,
        newStatus: finalRow.paymentStatus,
        amount: match.amount,
        confidence: match.confidence,
      });
    }

    // Re-fetch fresh rows for the report (guarantees we reflect exactly
    // what's now in the DB, including rows that had no match at all).
    const { rows: freshDbRows } = await pool.query(
      "SELECT * FROM kutumb_event_registrations WHERE event_name = $1 AND event_year = $2 ORDER BY created_at",
      [eventName, eventYear]
    );
    const reportRows = freshDbRows.map(dbRowToRegistration).map((r) => {
      const match = grouped.get(r.id);
      return { ...r, bankReference: match ? match.bankReference : "" };
    });

    const dates = parsed.transactions.map((t) => t.date).filter(Boolean);
    const dateRange =
      dates.length > 0
        ? `${new Date(Math.min(...dates.map((d) => d.getTime()))).toLocaleDateString("en-AU")} – ${new Date(
            Math.max(...dates.map((d) => d.getTime()))
          ).toLocaleDateString("en-AU")}`
        : null;

    const summary = {
      totalRegistrations: registrations.length,
      totalTransactionsInFile: parsed.transactions.length,
      newlyMatched: updatedRows.filter((u) => u.previousStatus !== "Paid").length,
      alreadyPaid: registrations.filter((r) => r.paymentStatus === "Paid").length,
      stillUnpaid: reportRows.filter((r) => r.paymentStatus !== "Paid").length,
      amountMatched: reportRows.reduce((s, r) => s + (Number(r.paymentAmount) || 0), 0),
      unmatchedCreditsCount: unmatchedCredits.length,
      unmatchedCreditsValue: unmatchedCredits.reduce((s, u) => s + u.transaction.amount, 0),
      dateRange,
    };

    const reportPayload = {
      eventName,
      eventYear,
      uploadedFilename: req.file.originalname,
      dateRange,
      rows: reportRows,
      unmatchedCredits,
    };

    const { rows: savedRun } = await pool.query(
      `INSERT INTO kutumb_bank_reconciliations (event_name, event_year, uploaded_filename, run_by, summary, report)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, run_at`,
      [
        eventName,
        eventYear,
        req.file.originalname,
        req.admin?.email || req.admin?.name || null,
        JSON.stringify(summary),
        JSON.stringify(reportPayload),
      ]
    );

    res.json({
      message: `Reconciled ${parsed.transactions.length} bank credit(s) against ${registrations.length} registration(s): ${summary.newlyMatched} newly marked Paid.`,
      reconciliationId: savedRun[0].id,
      summary,
      updated: updatedRows,
      unmatchedCredits: unmatchedCredits.map((u) => ({
        date: u.transaction.date,
        amount: u.transaction.amount,
        details: u.transaction.raw,
        classification: u.classification,
      })),
    });
  } catch (err) {
    console.error("BANK RECONCILIATION ERROR:", err);
    res.status(500).json({ message: "Reconciliation failed" });
  }
});

/* -----------------------------
   🔁 LATEST SAVED RUN FOR AN EVENT (so the download button survives a reload)
------------------------------ */
router.get("/latest", requireAdmin, async (req, res) => {
  try {
    const { eventName, eventYear } = req.query;
    if (!eventName || !eventYear) return res.status(400).json({ message: "Missing event" });

    const { rows } = await pool.query(
      `SELECT id, uploaded_filename, run_at, summary FROM kutumb_bank_reconciliations
       WHERE event_name = $1 AND event_year = $2 ORDER BY run_at DESC LIMIT 1`,
      [eventName, eventYear]
    );
    if (rows.length === 0) return res.json(null);
    res.json({
      reconciliationId: rows[0].id,
      uploadedFilename: rows[0].uploaded_filename,
      runAt: rows[0].run_at,
      summary: rows[0].summary,
    });
  } catch (err) {
    console.error("RECONCILIATION LATEST ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* -----------------------------
   📥 DOWNLOAD EXCEL REPORT FOR A SAVED RUN
------------------------------ */
router.get("/:id/export", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM kutumb_bank_reconciliations WHERE id = $1",
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ message: "Reconciliation run not found" });

    const report = rows[0].report;
    const workbook = buildReconciliationWorkbook({
      eventName: report.eventName,
      eventYear: report.eventYear,
      uploadedFilename: report.uploadedFilename,
      dateRange: report.dateRange,
      rows: report.rows,
      unmatchedCredits: report.unmatchedCredits,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const eventLabel =
      report.eventYear && !String(report.eventName).trim().endsWith(String(report.eventYear))
        ? `${report.eventName}_${report.eventYear}`
        : report.eventName;
    const safeName = `${eventLabel}_Payment_Reconciliation`.replace(/[^\w\-]+/g, "_");

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}.xlsx"`);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("RECONCILIATION EXPORT ERROR:", err);
    res.status(500).json({ message: "Export failed" });
  }
});

export default router;
