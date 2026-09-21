import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOGO_PATH = path.join(__dirname, "../../public/kutumb-logo.png");
const LOGO_EXISTS = fs.existsSync(LOGO_PATH);
const LOGO_HTML = LOGO_EXISTS
  ? `<img src="cid:kutumbLogo" alt="Kutumb" width="148" height="40" style="height:40px;width:148px;max-width:148px;display:block;margin-bottom:16px;border:0;" />`
  : "";
function logoAttachment() {
  return LOGO_EXISTS
    ? [{ filename: "kutumb-logo.png", path: LOGO_PATH, cid: "kutumbLogo" }]
    : [];
}

let transporter = null;

// Kutumb's community WhatsApp group — included in the membership
// confirmation email so new members can join right away.
const WHATSAPP_GROUP_INVITE = "https://chat.whatsapp.com/Etit0vlcVj18n3WNvrcEFR?s=cl&p=i&ilr=4";

// Kutumb's bank account for bank-transfer payments — shown in the
// registration and donation emails. (The website's payment panel has its own
// copy in RegistrationPaymentPanel.tsx; keep the two in step.)
const BANK_DETAILS = {
  accountName: "Kutumb Australia Inc",
  bsb: "082-356",
  account: "778280517",
};

/**
 * The "choose how to pay" section of the registration email: one row per
 * payment method the admin has switched on (Settings & Access → Payment
 * Methods). Card / PayPal / Square rows link to the pay page with that
 * method pre-selected; the bank-transfer row lists the account details
 * inline so it works straight from the inbox.
 *
 * Built from inline-styled divs and one small table per row, because that's
 * what renders reliably across Gmail, Outlook and Yahoo.
 */
function buildPaymentOptionsHtml({ payUrl, fee, registrationNumber, paymentMethods }) {
  const methods = paymentMethods || {};
  const link = (method) => `${payUrl}?method=${method}`;

  const row = ({ title, description, buttonLabel, href, buttonColor }) => `
    <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="vertical-align:middle;padding-right:10px;">
            <div style="font-size:14px;font-weight:600;color:#111827;">${title}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:2px;">${description}</div>
          </td>
          <td style="vertical-align:middle;text-align:right;white-space:nowrap;">
            <a href="${href}" target="_blank" rel="noopener" style="display:inline-block;background:${buttonColor};color:#ffffff;text-decoration:none;padding:9px 16px;border-radius:6px;font-weight:600;font-size:13px;">${buttonLabel}</a>
          </td>
        </tr>
      </table>
    </div>`;

  const rows = [];
  if (methods.card) {
    rows.push(row({
      title: "💳 Credit / debit card",
      description: "Secure checkout powered by Stripe",
      buttonLabel: `Pay $${fee}`,
      href: link("card"),
      buttonColor: "#635bff",
    }));
  }
  if (methods.paypal) {
    rows.push(row({
      title: "PayPal",
      description: "Pay with your PayPal account",
      buttonLabel: `Pay $${fee}`,
      href: link("paypal"),
      buttonColor: "#0070ba",
    }));
  }
  if (methods.square) {
    rows.push(row({
      title: "Square",
      description: "Secure checkout powered by Square",
      buttonLabel: `Pay $${fee}`,
      href: link("square"),
      buttonColor: "#1f2937",
    }));
  }
  if (methods.bankTransfer) {
    const reference = registrationNumber || "your name";
    rows.push(`
    <div style="border:1px solid #fed7aa;background:#fff7ed;border-radius:8px;padding:12px 14px;margin:0 0 10px;">
      <div style="font-size:14px;font-weight:600;color:#9a3412;">🏦 Bank transfer</div>
      <div style="font-size:13px;color:#111827;margin-top:6px;line-height:1.6;">
        Account Name: <strong>${BANK_DETAILS.accountName}</strong><br />
        BSB: <strong>${BANK_DETAILS.bsb}</strong><br />
        Account Number: <strong>${BANK_DETAILS.account}</strong><br />
        Amount: <strong>$${fee}</strong><br />
        Reference: <strong>${reference}</strong>
      </div>
      <div style="font-size:12px;color:#6b7280;margin-top:6px;">
        Please use the reference above so we can match your payment. Tickets are issued
        once your transfer has been verified.
        Once you've transferred, <a href="${link("bank")}" target="_blank" rel="noopener" style="color:#c2410c;">let us know here</a>
        with your transaction number.
      </div>
    </div>`);
  }

  if (rows.length === 0) return "";
  return `
    <p style="font-size:14px;font-weight:600;margin:20px 0 8px;">Or choose how you'd like to pay:</p>
    ${rows.join("")}`;
}

function getTransporter() {
  if (transporter) return transporter;

  if (!process.env.SMTP_HOST) {
    console.warn(
      "⚠️  SMTP_HOST not set - emails will NOT be sent. Configure .env (see .env.example)."
    );
    return null;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true", // true for port 465, false for 587/25
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });

  return transporter;
}

const FROM_ADDRESS =
  process.env.EMAIL_FROM || `"Kutumb" <${process.env.SMTP_USER || "pramod@kutumb.org.au"}>`;

/**
 * Returns whether SMTP looks configured, and (if so) actually verifies the
 * connection/credentials with the mail server - so config problems are
 * caught immediately instead of only failing silently later at send time.
 */
export async function checkEmailConfig() {
  if (!process.env.SMTP_HOST) {
    return { configured: false, verified: false, error: "SMTP_HOST is not set in .env" };
  }

  const t = getTransporter();
  if (!t) return { configured: false, verified: false, error: "SMTP not configured" };

  try {
    await t.verify();
    return { configured: true, verified: true, from: FROM_ADDRESS };
  } catch (err) {
    return { configured: true, verified: false, from: FROM_ADDRESS, error: err.message };
  }
}

/** Sends a simple test email - used by /api/email/test-send for diagnostics. */
export async function sendTestEmail(to) {
  return send({
    to,
    subject: "Kutumb test email",
    html: `
      <div style="font-family: Arial, sans-serif;">
        ${LOGO_HTML}
        <p>This is a test email from your Kutumb app - if you're reading this,
        SMTP is configured correctly and membership/event confirmation emails
        will be delivered.</p>
      </div>
    `,
    attachments: logoAttachment(),
  });
}

/**
 * Generic sender. Returns { sent: boolean, error?: string } instead of throwing,
 * so a mail outage never blocks the registration flow itself.
 */
async function send({ to, subject, html, attachments = [] }) {
  const t = getTransporter();
  if (!t) return { sent: false, error: "SMTP not configured" };

  try {
    await t.sendMail({ from: FROM_ADDRESS, to, subject, html, attachments });
    return { sent: true };
  } catch (err) {
    console.error("EMAIL SEND ERROR:", err.message);
    return { sent: false, error: err.message };
  }
}

export async function sendMembershipConfirmationEmail({
  to,
  name,
  membershipNumber,
  qrPngBuffer,
  cardPdfBuffer, // the same styled PDF card shown in the popup/download button
}) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#7c3f00;">Welcome to Kutumb, ${name}!</h2>
      <p>Your membership application has been received and confirmed.</p>
      <p style="font-size: 18px;"><strong>Membership Number: ${membershipNumber}</strong></p>
      <p>Your membership card is attached to this email as a PDF, and your QR code is shown below.</p>
      <img src="cid:membershipQr" alt="Membership QR Code" style="width:180px;height:180px;" />
      <p style="margin:24px 0 8px;">Join our community WhatsApp group to stay up to date with events and activities:</p>
      <a href="${WHATSAPP_GROUP_INVITE}" style="display:inline-block;background:#25D366;color:#ffffff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:600;font-size:14px;">
        Join the Kutumb WhatsApp Group
      </a>
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject: "Welcome to Kutumb - Your Membership is Confirmed",
    html,
    attachments: [
      ...logoAttachment(),
      ...(qrPngBuffer
        ? [{ filename: "membership-qr.png", content: qrPngBuffer, cid: "membershipQr" }]
        : []),
      ...(cardPdfBuffer
        ? [{ filename: `kutumb-membership-card-${membershipNumber}.pdf`, content: cardPdfBuffer }]
        : []),
    ],
  });
}

export async function sendEventConfirmationEmail({
  to,
  name,
  eventName,
  eventDate,
  registrationNumber, // optional
  fee, // optional - total fee owed (0 or undefined = no fee)
  membershipNumber, // optional - mentioned as plain text only, no card/QR/PDF
  payToken, // optional - the registration's opaque pay_token; powers the "Pay Now" link below
  baseUrl, // optional - required (together with payToken) for the "Pay Now" link to appear
  paymentMethods, // optional - { bankTransfer, card, square, paypal } booleans; which payment options to list
  flyerBuffer, // optional - the event's flyer image, attached as a keepsake
  flyerFilename, // optional - original filename, used to infer extension/content type
}) {
  const membershipLine = membershipNumber
    ? `<p style="font-size:14px;">Your Kutumb Membership Number: <strong>${membershipNumber}</strong></p>`
    : "";

  const registrationLine = registrationNumber
    ? `<p style="font-size:14px;">Registration Number: <strong>${registrationNumber}</strong></p>`
    : "";

  const feeOwed = typeof fee === "number" && fee > 0;
  // Only ever build this link when there's actually a fee owed AND we have
  // both a token and a base URL to build it from — payToken is only set on
  // registrations created after the pay_token column existed, so an older
  // pending row (or a call site that doesn't pass baseUrl) just quietly
  // gets no link rather than a broken one.
  const payUrl = feeOwed && payToken && baseUrl ? `${baseUrl}/pay/${payToken}` : null;
  // The main button opens the pay page, which offers every enabled method;
  // the option rows below jump straight to one method on that same page.
  // With no methods passed, only the main button and copy-paste link appear.
  const payOptions = payUrl
    ? buildPaymentOptionsHtml({ payUrl, fee, registrationNumber, paymentMethods })
    : "";
  const payButton = payUrl
    ? `<p style="text-align:center;margin:20px 0 4px;">
         <a href="${payUrl}" target="_blank" rel="noopener" style="display:inline-block;background:#c2410c;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px;">
           Pay $${fee} Now
         </a>
       </p>
       ${payOptions}
       <p style="font-size:12px;color:#888;text-align:center;">
         Or copy and paste this link into your browser: <a href="${payUrl}" style="color:#888;">${payUrl}</a>
       </p>`
    : "";

  // Tickets (one QR code per attendee — you, any additional adults, any
  // children) are a separate email, sent only once a registration is
  // actually confirmed (see sendEventTickets) — never before payment for a
  // paid event, so set that expectation here rather than leaving it a
  // surprise, or worse, implying a ticket exists already.
  const paymentLine = feeOwed
    ? `<p style="font-size:14px;">Registration Fee: <strong>$${fee}</strong> &middot; Payment Status: <strong style="color:#b45309;">Pending</strong></p>
       ${payButton}
       <p style="font-size:13px;color:#555;">
         Once your payment has been recorded, you'll receive a separate confirmation email —
         and your ticket(s), with a QR code for each person on this registration, will be
         generated and emailed to you at that point.
       </p>`
    : `<p style="font-size:14px;">Registration Fee: <strong>Free</strong></p>
       <p style="font-size:13px;color:#555;">
         Your ticket(s) — a QR code for each person on this registration — will follow in a
         separate email shortly.
       </p>`;

  // A paid event's registration is only a hold until payment actually
  // clears — don't tell them it's "Confirmed" in the subject line and
  // opening sentence while a fee is still outstanding; that's the same
  // premature-success messaging that was fixed in the success dialog and
  // the post-submit toast, just showing up in the inbox instead.
  const heading = feeOwed ? "Registration Received — Payment Required" : "Registration Confirmed";
  const openingLine = feeOwed
    ? `Hi ${name}, we've received your registration for:`
    : `Hi ${name}, you're registered for:`;
  const subject = feeOwed ? `Registration Received (Payment Required) - ${eventName}` : `Registration Confirmed - ${eventName}`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#7c3f00;">${heading}</h2>
      <p>${openingLine}</p>
      <p style="font-size:16px;"><strong>${eventName}</strong>${eventDate ? ` &mdash; ${eventDate}` : ""}</p>
      ${registrationLine}
      ${membershipLine}
      ${paymentLine}
      <p>We look forward to seeing you there!</p>
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject,
    html,
    attachments: [
      ...logoAttachment(),
      ...(flyerBuffer ? [{ filename: flyerFilename || "event-flyer.jpg", content: flyerBuffer }] : []),
    ],
  });
}

const ATTENDEE_CATEGORY_LABELS = {
  primary_adult: "Registrant",
  adult: "Additional Adult",
  child_under5: "Child (Under 5)",
  child_5plus: "Child (5+)",
};

/**
 * Sends one email per registration with every attendee's individual QR
 * ticket — the primary registrant, each additional adult, and each child
 * (under-5 and 5+) — inline in the email body (as cid images, same
 * technique as the membership QR) and as a combined multi-page PDF
 * attachment for printing or showing at the door. Only ever called once a
 * registration is actually confirmed (see sendEventTickets in tickets.js,
 * which is what enforces the "only after payment" rule and the one-time
 * send guard).
 */
export async function sendEventTicketsEmail({
  to,
  name,
  eventName,
  eventDate,
  registrationNumber,
  attendees, // [{ name, category, qrPngBuffer }]
  ticketsPdfBuffer,
}) {
  const ticketBlocks = attendees
    .map(
      (a, i) => `
        <div style="margin:20px 0;padding:16px;border:1px solid #eee;border-radius:8px;text-align:center;">
          <img src="cid:eventTicketQr${i}" alt="QR code for ${a.name}" style="width:160px;height:160px;" />
          <p style="margin:10px 0 2px;font-size:14px;font-weight:bold;">${a.name}</p>
          <p style="margin:0;font-size:12px;color:#b45309;font-weight:600;">
            ${ATTENDEE_CATEGORY_LABELS[a.category] || "Attendee"}
          </p>
        </div>`
    )
    .join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#15803d;">Your Tickets 🎟️</h2>
      <p>Hi ${name}, here ${attendees.length === 1 ? "is your ticket" : `are your ${attendees.length} tickets`} for:</p>
      <p style="font-size:16px;"><strong>${eventName}</strong>${eventDate ? ` &mdash; ${eventDate}` : ""}</p>
      ${registrationNumber ? `<p style="font-size:14px;">Registration Number: <strong>${registrationNumber}</strong></p>` : ""}
      <p style="font-size:13px;color:#555;">
        Each person listed below has their own scannable QR code — show it at check-in
        (on your phone or printed from the attached PDF). One scan per ticket.
      </p>
      ${ticketBlocks}
      <p>We look forward to seeing you there!</p>
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject: `Your Tickets - ${eventName}`,
    html,
    attachments: [
      ...logoAttachment(),
      ...attendees.map((a, i) => ({
        filename: `ticket-${i + 1}.png`,
        content: a.qrPngBuffer,
        cid: `eventTicketQr${i}`,
      })),
      ...(ticketsPdfBuffer
        ? [{ filename: `kutumb-tickets-${registrationNumber || "event"}.pdf`, content: ticketsPdfBuffer }]
        : []),
    ],
  });
}

/**
 * Sent when a registrant says they've made a bank transfer and enters its
 * reference. It is an acknowledgement only — the registration stays pending
 * until the transfer is actually found in Kutumb's bank account, at which
 * point the real "Payment Confirmed" email and the tickets go out.
 */
export async function sendBankTransferReceivedEmail({
  to,
  name,
  eventName,
  registrationNumber,
  fee,
  transactionNumber,
}) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#7c3f00;">Bank Transfer Details Received</h2>
      <p>Hi ${name}, thanks - we've noted your bank transfer for:</p>
      <p style="font-size:16px;"><strong>${eventName}</strong></p>
      ${registrationNumber ? `<p style="font-size:14px;">Registration Number: <strong>${registrationNumber}</strong></p>` : ""}
      <p style="font-size:14px;">Amount: <strong>$${fee}</strong> &middot; Your Reference: <strong>${transactionNumber}</strong></p>
      <p style="font-size:14px;">Status: <strong style="color:#b45309;">Awaiting verification</strong></p>
      <p style="font-size:14px;font-weight:600;color:#9a3412;">
        Your ticket(s) will be issued after your payment has been verified.
      </p>
      <p style="font-size:13px;color:#555;">
        We'll confirm your registration as soon as the payment shows in our bank account
        (this can take a few business days). You'll then receive a confirmation email, and
        your ticket(s) with a QR code for each person on this registration.
      </p>
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject: `Bank Transfer Received (Pending Verification) - ${eventName}`,
    html,
    attachments: logoAttachment(),
  });
}

export async function sendEventPaymentConfirmationEmail({
  to,
  name,
  eventName,
  eventDate,
  registrationNumber,
  fee,
  transactionNumber,
}) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#15803d;">Payment Confirmed ✅</h2>
      <p>Hi ${name}, thank you - your payment has been recorded for:</p>
      <p style="font-size:16px;"><strong>${eventName}</strong>${eventDate ? ` &mdash; ${eventDate}` : ""}</p>
      ${registrationNumber ? `<p style="font-size:14px;">Registration Number: <strong>${registrationNumber}</strong></p>` : ""}
      <p style="font-size:14px;">Amount: <strong>$${fee}</strong> &middot; Payment Status: <strong style="color:#15803d;">Paid</strong></p>
      ${transactionNumber ? `<p style="font-size:14px;">Transaction Reference: <strong>${transactionNumber}</strong></p>` : ""}
      <p>You have paid in full - we look forward to seeing you there!</p>
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject: `Payment Confirmed - ${eventName}`,
    html,
    attachments: logoAttachment(),
  });
}

/**
 * Sends the same admin-composed announcement to a batch of recipients, one
 * at a time (not one giant "to" list, so a bad address never exposes every
 * other member's email in their inbox headers, and a failure for one
 * recipient doesn't block the rest). Kept sequential with a small delay
 * rather than firing all sends in parallel, to stay well under typical SMTP
 * provider rate limits when the member list is large.
 *
 * Returns { total, sent, failed, failures: [{ to, error }] } so the admin
 * console can show a clear summary instead of a single pass/fail flag.
 */
export async function sendBulkEmail({ recipients, subject, message }) {
  // Recipients may be plain email strings (legacy callers) or
  // { email, name, membershipNumber?, pendingAmount? } objects — normalize
  // so every send below can address the recipient by name and mention
  // their membership number / amount owed, when known, regardless of what
  // the admin actually typed in the message body.
  const normalized = recipients.map((r) =>
    typeof r === "string"
      ? { email: r, name: "", membershipNumber: null, pendingAmount: null }
      : {
          email: r.email,
          name: r.name || "",
          membershipNumber: r.membershipNumber || null,
          pendingAmount: r.pendingAmount != null && Number(r.pendingAmount) > 0 ? Number(r.pendingAmount) : null,
        }
  );

  const results = { total: normalized.length, sent: 0, failed: 0, failures: [] };

  // Plain admin-composed text, lightly wrapped in the same branded shell as
  // every other outgoing email. Line breaks in the textarea are preserved
  // since the message is otherwise plain text, not HTML, from the admin.
  const bodyHtml = String(message || "")
    .split(/\r?\n/)
    .map((line) => (line.trim() ? `<p style="margin:0 0 12px;">${escapeHtml(line)}</p>` : ""))
    .join("");

  for (const { email: to, name, membershipNumber, pendingAmount } of normalized) {
    // Personalized "Dear <name>," greeting up top for every recipient,
    // falling back to "Dear Member," when a name isn't on file.
    const trimmedName = String(name || "").trim();
    const greeting = trimmedName ? `Dear ${escapeHtml(trimmedName)},` : "Dear Member,";

    // Every email to a registered member always states their membership
    // number, and every email about an event registration with a pending
    // balance always states the amount owed — regardless of what the admin
    // typed, so this can never be accidentally left out.
    const membershipLine = membershipNumber
      ? `<p style="margin:0 0 12px;font-size:14px;">Your Kutumb Membership Number: <strong>${escapeHtml(String(membershipNumber))}</strong></p>`
      : "";
    const pendingAmountLine = pendingAmount
      ? `<p style="margin:0 0 12px;font-size:14px;color:#c2410c;font-weight:bold;">Amount Pending: $${pendingAmount.toFixed(2)}</p>`
      : "";

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
        ${LOGO_HTML}
        <p style="margin:0 0 12px;">${greeting}</p>
        ${membershipLine}
        ${pendingAmountLine}
        ${bodyHtml}
        <p style="margin-top:24px;color:#555;font-size:13px;">
          With Best Regards, &middot; Kutumb Executive Team
        </p>
      </div>
    `;

    const result = await send({ to, subject, html, attachments: logoAttachment() });
    if (result.sent) {
      results.sent += 1;
    } else {
      results.failed += 1;
      results.failures.push({ to, error: result.error || "Unknown error" });
    }
    // Small pacing delay between sends - avoids tripping SMTP provider
    // rate limits on larger member lists.
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return results;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendDonationThankYouEmail({
  to,
  name,
  amount,
  membershipNumber, // optional
  bankTransferred,
  transactionNumber,
}) {
  const membershipLine = membershipNumber
    ? `<p style="font-size:14px;">Kutumb Membership Number: <strong>${membershipNumber}</strong></p>`
    : "";

  const transferLine = bankTransferred
    ? `<p style="font-size:14px;">Payment Status: <strong style="color:#15803d;">Paid</strong> &middot; Transaction Reference: <strong>${transactionNumber || "(not provided)"}</strong></p>`
    : `<p style="font-size:14px;">Payment Status: <strong style="color:#b45309;">Pending</strong> - please complete your bank transfer using the details below when ready.</p>
       <div style="border:2px solid #fed7aa;background:#fff7ed;border-radius:8px;padding:12px 16px;margin:12px 0;font-size:14px;">
         <p style="font-weight:600;color:#9a3412;margin:0 0 4px;">Kutumb Bank Details</p>
         <p style="margin:2px 0;">Account Name: ${BANK_DETAILS.accountName}</p>
         <p style="margin:2px 0;">BSB: ${BANK_DETAILS.bsb}</p>
         <p style="margin:2px 0;">Account: ${BANK_DETAILS.account}</p>
       </div>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: auto;">
      ${LOGO_HTML}
      <h2 style="color:#7c3f00;">Thank You for Your Donation, ${name}!</h2>
      <p>We've recorded your pledged donation of <strong>$${amount}</strong> to Kutumb.</p>
      ${membershipLine}
      ${transferLine}
      <p>Your generosity helps us continue serving the community. Thank you for your support!</p>
      <p style="margin-top:24px;color:#555;font-size:13px;">
        With Best Regards, &middot; Kutumb Executive Team
      </p>
    </div>
  `;

  return send({
    to,
    subject: "Thank You for Your Donation to Kutumb",
    html,
    attachments: logoAttachment(),
  });
}
