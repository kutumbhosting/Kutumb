import { Router } from "express";
import crypto from "crypto";
import { pool } from "../db/pool.js";
import { requireAdmin } from "../lib/auth.js";
import { getStripe } from "../lib/stripeClient.js";
import { getSetting } from "../lib/settings.js";
import { logAudit } from "../lib/audit.js";
import { slugify } from "../lib/slugify.js";

const router = Router();

// Ticket types are keyed by a plain slug (eventId), not a foreign key to
// kutumb_upcoming_events — this looks the real event row back up by
// matching its slugified title, so we can enforce "ticket type seats can't
// add up to more than the event's total capacity".
async function findEventBySlug(eventId) {
  const { rows } = await pool.query("SELECT * FROM kutumb_upcoming_events");
  return rows.find((e) => slugify(e.title) === eventId) || null;
}

async function getAllocatedSeats(eventId, excludeTicketTypeId = null) {
  const { rows } = await pool.query(
    excludeTicketTypeId
      ? "SELECT COALESCE(SUM(quantity_total),0) AS total FROM kutumb_ticket_types WHERE event_id = $1 AND id != $2"
      : "SELECT COALESCE(SUM(quantity_total),0) AS total FROM kutumb_ticket_types WHERE event_id = $1",
    excludeTicketTypeId ? [eventId, excludeTicketTypeId] : [eventId]
  );
  return Number(rows[0].total);
}

/* ============================================================
   PUBLIC: Stripe publishable key for the storefront's Stripe.js SDK.
   Safe to expose — the publishable key is designed to be public (it's
   embedded in every Stripe.js page load on any site that uses it). The
   secret key never leaves the server.
   ============================================================ */
router.get("/config", async (req, res) => {
  const publishableKey = await getSetting("stripe_publishable_key");
  res.json({ publishableKey: publishableKey || null });
});

/* ============================================================
   ADMIN: manage ticket types, view orders/waitlist for an event
   ============================================================ */
router.get("/admin/:eventId/ticket-types", requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM kutumb_ticket_types WHERE event_id = $1 ORDER BY id", [req.params.eventId]);
  const event = await findEventBySlug(req.params.eventId);
  const allocated = rows.reduce((sum, tt) => sum + tt.quantity_total, 0);
  res.json({
    ticketTypes: rows,
    capacity: event ? Number(event.capacity) : null,
    allocated,
    remaining: event ? Math.max(Number(event.capacity) - allocated, 0) : null,
  });
});

router.post("/admin/:eventId/ticket-types", requireAdmin, async (req, res) => {
  const { name, description, priceCents, quantityTotal } = req.body;
  if (!name?.trim()) return res.status(400).json({ message: "Ticket type name is required" });

  const qty = Number(quantityTotal) || 0;
  const event = await findEventBySlug(req.params.eventId);
  if (event && qty > 0) {
    const allocated = await getAllocatedSeats(req.params.eventId);
    const capacity = Number(event.capacity);
    if (capacity > 0 && allocated + qty > capacity) {
      return res.status(400).json({
        message: `This would allocate ${allocated + qty} seats, but the event's total capacity is ${capacity} (${capacity - allocated} remaining). Ticket type seats can't add up to more than the event capacity.`,
      });
    }
  }

  const { rows } = await pool.query(
    `INSERT INTO kutumb_ticket_types (event_id, name, description, price_cents, quantity_total)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.eventId, name.trim(), description || null, Number(priceCents) || 0, qty]
  );
  await logAudit(req.admin, "ticket_type.create", req.params.eventId, { name });
  res.status(201).json(rows[0]);
});

router.put("/admin/ticket-types/:id", requireAdmin, async (req, res) => {
  const { name, description, priceCents, quantityTotal } = req.body;

  const { rows: existingRows } = await pool.query("SELECT * FROM kutumb_ticket_types WHERE id = $1", [req.params.id]);
  const existing = existingRows[0];
  if (!existing) return res.status(404).json({ message: "Ticket type not found" });

  if (quantityTotal !== undefined) {
    const qty = Number(quantityTotal) || 0;
    const event = await findEventBySlug(existing.event_id);
    if (event && qty > 0) {
      const allocated = await getAllocatedSeats(existing.event_id, existing.id);
      const capacity = Number(event.capacity);
      if (capacity > 0 && allocated + qty > capacity) {
        return res.status(400).json({
          message: `This would allocate ${allocated + qty} seats, but the event's total capacity is ${capacity} (${capacity - allocated} remaining across other ticket types).`,
        });
      }
    }
  }

  const { rows } = await pool.query(
    `UPDATE kutumb_ticket_types SET name = COALESCE($1,name), description = COALESCE($2,description),
      price_cents = COALESCE($3,price_cents), quantity_total = COALESCE($4,quantity_total)
      WHERE id = $5 RETURNING *`,
    [name, description, priceCents, quantityTotal, req.params.id]
  );
  await logAudit(req.admin, "ticket_type.update", rows[0]?.event_id, { id: req.params.id });
  res.json(rows[0]);
});

router.delete("/admin/ticket-types/:id", requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT event_id FROM kutumb_ticket_types WHERE id = $1", [req.params.id]);
  await pool.query("DELETE FROM kutumb_ticket_types WHERE id = $1", [req.params.id]);
  await logAudit(req.admin, "ticket_type.delete", rows[0]?.event_id, { id: req.params.id });
  res.json({ message: "Ticket type deleted" });
});

router.get("/admin/:eventId/orders", requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM kutumb_orders WHERE event_id = $1 ORDER BY created_at DESC", [req.params.eventId]);
  res.json(rows);
});

router.get("/admin/:eventId/waitlist", requireAdmin, async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM kutumb_waitlist WHERE event_id = $1 ORDER BY created_at ASC", [req.params.eventId]);
  res.json(rows);
});

router.post("/admin/waitlist/:id/notify", requireAdmin, async (req, res) => {
  const { rows } = await pool.query("UPDATE kutumb_waitlist SET notified_at = now() WHERE id = $1 RETURNING *", [req.params.id]);
  await logAudit(req.admin, "waitlist.notify", rows[0]?.event_id, { id: req.params.id });
  res.json(rows[0]);
});

/* ============================================================
   PUBLIC: browse ticket types, checkout, waitlist
   ============================================================ */
router.get("/:eventId/ticket-types", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id, name, description, price_cents, currency, quantity_total, quantity_sold FROM kutumb_ticket_types WHERE event_id = $1 ORDER BY price_cents ASC",
    [req.params.eventId]
  );
  res.json(rows);
});

router.post("/:eventId/waitlist", async (req, res) => {
  const { name, email, phone, ticketTypeId, requestedQty } = req.body;
  if (!name?.trim() || !email?.trim()) return res.status(400).json({ message: "Name and email are required" });
  const { rows } = await pool.query(
    `INSERT INTO kutumb_waitlist (event_id, ticket_type_id, name, email, phone, requested_qty)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [req.params.eventId, ticketTypeId || null, name.trim(), email.trim(), phone || null, Number(requestedQty) || 1]
  );
  res.status(201).json(rows[0]);
});

// Auto-provisions a single "General" ticket type for an event the first
// time it's needed, using the price the caller supplies (only used on
// creation — once it exists, its stored price is authoritative, so a
// buyer can never influence the price after the fact). This is what lets
// registration-triggered payments work for events that never had ticket
// types manually configured by an admin.
async function ensureGeneralTicketType(client, eventId, priceCents) {
  const { rows: existing } = await client.query(
    "SELECT * FROM kutumb_ticket_types WHERE event_id = $1 AND name = 'General' LIMIT 1",
    [eventId]
  );
  if (existing.length > 0) return existing[0];

  const event = await findEventBySlug(eventId);
  const quantityTotal = event ? Number(event.capacity) || 0 : 0;

  const { rows: inserted } = await client.query(
    `INSERT INTO kutumb_ticket_types (event_id, name, description, price_cents, quantity_total)
     VALUES ($1, 'General', 'Standard registration fee', $2, $3) RETURNING *`,
    [eventId, Math.round(Number(priceCents) || 0), quantityTotal]
  );
  return inserted[0];
}

/* Checkout — this is where real capacity safety matters, so it runs inside
   a single Postgres transaction with row locks (SELECT ... FOR UPDATE) on
   the ticket types being purchased. That guarantees two simultaneous
   buyers can never both grab the last ticket, without needing any
   in-process file-locking trick (this is the DB doing what it's for). */
router.post("/:eventId/checkout", async (req, res) => {
  const client = await pool.connect();
  try {
    const { buyerName, buyerEmail, buyerPhone, items } = req.body;
    if (!buyerName?.trim() || !buyerEmail?.trim() || !items?.length) {
      return res.status(400).json({ message: "buyerName, buyerEmail and items are required" });
    }

    await client.query("BEGIN");

    let subtotal = 0;
    const orderItemsToInsert = [];
    const lineItems = [];

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      if (qty < 1) continue;

      // "general" is a sentinel meaning "no admin-configured ticket type
      // exists yet — create the standard one now" rather than a real id.
      let ticketTypeId = item.ticketTypeId;
      if (ticketTypeId === "general") {
        const general = await ensureGeneralTicketType(client, req.params.eventId, item.generalPriceCents);
        ticketTypeId = general.id;
      }

      const { rows } = await client.query(
        "SELECT * FROM kutumb_ticket_types WHERE id = $1 AND event_id = $2 FOR UPDATE",
        [ticketTypeId, req.params.eventId]
      );
      const tt = rows[0];
      if (!tt) {
        await client.query("ROLLBACK");
        return res.status(400).json({ message: "Invalid ticket type" });
      }
      if (tt.quantity_total > 0 && tt.quantity_sold + qty > tt.quantity_total) {
        await client.query("ROLLBACK");
        return res.status(409).json({ message: `Sold out: "${tt.name}" doesn't have ${qty} spots left. Join the waitlist instead?`, soldOut: true, ticketTypeId: tt.id });
      }

      subtotal += tt.price_cents * qty;
      orderItemsToInsert.push({ ticketTypeId: tt.id, quantity: qty, unitPriceCents: tt.price_cents, name: tt.name, currency: tt.currency });
      lineItems.push({
        price_data: { currency: (tt.currency || "AUD").toLowerCase(), product_data: { name: tt.name }, unit_amount: tt.price_cents },
        quantity: qty,
      });
    }

    if (orderItemsToInsert.length === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ message: "No tickets selected" });
    }

    // Free tickets: confirm immediately inside the same transaction.
    if (subtotal === 0) {
      const orderRes = await client.query(
        `INSERT INTO kutumb_orders (event_id, buyer_name, buyer_email, buyer_phone, status, subtotal_cents, total_cents)
         VALUES ($1,$2,$3,$4,'paid',0,0) RETURNING id`,
        [req.params.eventId, buyerName.trim(), buyerEmail.trim(), buyerPhone || null]
      );
      const orderId = orderRes.rows[0].id;
      await insertItemsAndAttendees(client, orderId, req.params.eventId, orderItemsToInsert, buyerName.trim(), buyerEmail.trim());
      await client.query("COMMIT");
      return res.status(201).json({ free: true, orderId });
    }

    // Paid tickets: reserve the inventory now (inside this transaction) and
    // create the Stripe session — inventory is committed either way; if the
    // buyer abandons checkout we simply have an order stuck at "pending"
    // (visible to admin), rather than ever risking overselling.
    const orderRes = await client.query(
      `INSERT INTO kutumb_orders (event_id, buyer_name, buyer_email, buyer_phone, status, subtotal_cents, total_cents)
       VALUES ($1,$2,$3,$4,'pending',$5,$5) RETURNING id`,
      [req.params.eventId, buyerName.trim(), buyerEmail.trim(), buyerPhone || null, subtotal]
    );
    const orderId = orderRes.rows[0].id;
    for (const oi of orderItemsToInsert) {
      await client.query(
        "INSERT INTO kutumb_order_items (order_id, ticket_type_id, quantity, unit_price_cents) VALUES ($1,$2,$3,$4)",
        [orderId, oi.ticketTypeId, oi.quantity, oi.unitPriceCents]
      );
      await client.query("UPDATE kutumb_ticket_types SET quantity_sold = quantity_sold + $1 WHERE id = $2", [oi.quantity, oi.ticketTypeId]);
    }

    const stripe = await getStripe();
    if (!stripe) {
      await client.query("ROLLBACK");
      return res.status(503).json({ message: "Payments aren't configured yet. Ask the admin to add a Stripe secret key in the Admin Console." });
    }

    const baseUrl = (await getSetting("public_base_url")) || process.env.PUBLIC_BASE_URL || "http://localhost:8080";
    // Embedded Checkout renders inside our own page (in a modal) instead of
    // redirecting to a Stripe-hosted page. Stripe still fully hosts the
    // actual card fields inside an iframe for PCI compliance — only the
    // surrounding page chrome is ours. `return_url` is where the browser
    // is sent (a real navigation, not just the iframe) once payment
    // completes; {CHECKOUT_SESSION_ID} is a literal placeholder Stripe
    // substitutes itself.
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      ui_mode: "embedded",
      customer_email: buyerEmail.trim(),
      line_items: lineItems,
      return_url: `${baseUrl}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
      metadata: { orderId: String(orderId), eventId: req.params.eventId },
    });
    await client.query("UPDATE kutumb_orders SET stripe_session_id = $1 WHERE id = $2", [session.id, orderId]);

    await client.query("COMMIT");
    res.status(201).json({ clientSecret: session.client_secret, orderId });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("CHECKOUT ERROR:", err);
    res.status(500).json({ message: "Could not start checkout" });
  } finally {
    client.release();
  }
});

async function insertItemsAndAttendees(client, orderId, eventId, items, buyerName, buyerEmail) {
  for (const oi of items) {
    const { rows } = await client.query(
      "INSERT INTO kutumb_order_items (order_id, ticket_type_id, quantity, unit_price_cents) VALUES ($1,$2,$3,$4) RETURNING id",
      [orderId, oi.ticketTypeId, oi.quantity, oi.unitPriceCents]
    );
    const orderItemId = rows[0].id;
    await client.query("UPDATE kutumb_ticket_types SET quantity_sold = quantity_sold + $1 WHERE id = $2", [oi.quantity, oi.ticketTypeId]);
    for (let n = 0; n < oi.quantity; n++) {
      const qrToken = crypto.randomBytes(16).toString("hex");
      await client.query(
        "INSERT INTO kutumb_attendees (order_item_id, event_id, name, email, qr_token) VALUES ($1,$2,$3,$4,$5)",
        [orderItemId, eventId, buyerName, buyerEmail, qrToken]
      );
    }
  }
}

/* Stripe webhook — mounted with express.raw() in server.js so the signature
   can be verified. Confirms payment and issues QR attendee tickets. */
export async function stripeWebhookHandler(req, res) {
  const stripe = await getStripe();
  const webhookSecret = await getSetting("stripe_webhook_secret");
  if (!stripe || !webhookSecret) return res.status(503).send("Stripe not configured");

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], webhookSecret);
  } catch (err) {
    console.error("WEBHOOK SIGNATURE ERROR:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = Number(session.metadata?.orderId);
    const eventId = session.metadata?.eventId;
    if (orderId) {
      const { rows } = await pool.query("SELECT * FROM kutumb_orders WHERE id = $1", [orderId]);
      const order = rows[0];
      if (order && order.status !== "paid") {
        await pool.query("UPDATE kutumb_orders SET status = 'paid', stripe_payment_intent = $1 WHERE id = $2", [session.payment_intent, orderId]);
        // Inventory was already reserved at checkout time — just issue attendee QR tickets now.
        const items = await pool.query("SELECT * FROM kutumb_order_items WHERE order_id = $1", [orderId]);
        for (const oi of items.rows) {
          for (let n = 0; n < oi.quantity; n++) {
            const qrToken = crypto.randomBytes(16).toString("hex");
            await pool.query(
              "INSERT INTO kutumb_attendees (order_item_id, event_id, name, email, qr_token) VALUES ($1,$2,$3,$4,$5)",
              [oi.id, eventId, order.buyer_name, order.buyer_email, qrToken]
            );
          }
        }
      }
    }
  }

  res.json({ received: true });
}

// Used by the /checkout/return page: Stripe sends the browser back here
// with ?session_id=... after Embedded Checkout completes. We look up our
// own order by that Stripe session id (webhook usually marks it paid
// first, but we also double-check directly with Stripe in case the
// webhook hasn't landed yet) and report a simple status back.
router.get("/session-status", async (req, res) => {
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ message: "session_id is required" });

  try {
    const { rows } = await pool.query("SELECT * FROM kutumb_orders WHERE stripe_session_id = $1", [session_id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.status !== "paid") {
      // Webhook may not have arrived yet — ask Stripe directly as a fallback.
      const stripe = await getStripe();
      if (stripe) {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        if (session.payment_status === "paid") {
          await pool.query("UPDATE kutumb_orders SET status = 'paid', stripe_payment_intent = $1 WHERE id = $2", [session.payment_intent, order.id]);
          order.status = "paid";
        }
      }
    }

    res.json({ status: order.status, orderId: order.id, eventId: order.event_id, totalCents: order.total_cents });
  } catch (err) {
    console.error("SESSION STATUS ERROR:", err);
    res.status(500).json({ message: "Could not check payment status" });
  }
});

router.get("/order/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM kutumb_orders WHERE id = $1", [req.params.id]);
  if (!rows[0]) return res.status(404).json({ message: "Order not found" });
  const items = await pool.query(
    `SELECT oi.*, tt.name AS ticket_type_name FROM kutumb_order_items oi
     JOIN kutumb_ticket_types tt ON tt.id = oi.ticket_type_id WHERE oi.order_id = $1`,
    [req.params.id]
  );
  const attendees = await pool.query(
    `SELECT a.* FROM kutumb_attendees a JOIN kutumb_order_items oi ON oi.id = a.order_item_id WHERE oi.order_id = $1`,
    [req.params.id]
  );
  res.json({ ...rows[0], items: items.rows, attendees: attendees.rows });
});

export default router;
