# Kutumb Event Registration — Enhancement Summary

This document covers everything added in this change set: filtered/selected
Excel export, select-all, individual per-attendee QR check-in, under-5-free
child pricing, event coupons (single-use), and a real paid→confirmed
registration workflow with Stripe/bank-transfer/coupon payment tracking.

**Nothing existing was removed or redesigned.** Every change is additive:
new columns (with safe defaults), new tables, new routes, and new UI
elements alongside the existing ones. All existing endpoints, admin tabs,
and public pages keep working exactly as before if you never touch the new
fields.

The full project (already `npm install && npm run build`-verified —
TypeScript compiles clean, Vite build succeeds) is in this zip.

---

## 1. What changed, by requirement

| # | Requirement | Where |
|---|---|---|
| 1 | Filtered/selected Excel export | `EventRegistration.tsx` (Export Filtered / Export Selected buttons) + `POST /api/events/export-excel` |
| 2 | Select-all checkbox | `EventRegistration.tsx` table header, filter-aware, indeterminate state |
| 3 | Individual check-in status | New `kutumb_registration_attendees` table, one row per person |
| 4 | Individual QR codes | `qr_token` per attendee row, rendered via the existing `qrcode` library |
| 5 | Under-5 free children | `kutumb_upcoming_events.under5_free/child_member_fee/child_non_member_fee` + registration form split |
| 6 | Event coupons | `kutumb_event_coupons` table, admin **Coupons** tab, single-use enforcement |
| 7 | Confirm only after payment | New `registration_status` column (`pending_payment`/`confirmed`/...) |
| 8 | Coupon / bank transfer / Stripe card | `payment_method` column + existing bank-transfer flow + Stripe checkout |
| 9 | Verify payment before confirming | Stripe webhook/session-status now update the *registration* (previously only the separate ticketing order); bank transfer keeps its existing admin verification (Payment Status → Paid) |
| 10 | QR-based check-in | `checkin.routes.js` scan/manual endpoints, extended to the new attendee table |
| 11 | Recommended QR approach | See **§5** below |

---

## 2. Database changes

Run the migration (idempotent — safe on an existing database):

```bash
npm run migrate
```

This applies `server/db/schema.sql`, which **adds only**:

- `kutumb_event_registrations`: `children_under5`, `children_5plus`, `child_fee`, `payment_method`, `coupon_code`, `coupon_amount`, `registration_status` (defaults to `'confirmed'`, so every existing row is unaffected).
- `kutumb_orders`: `registration_id` (nullable FK) — links a Stripe order back to the registration it was paying for.
- `kutumb_upcoming_events`: `under5_free` (default `TRUE`), `child_member_fee`, `child_non_member_fee` (both `NULL` = "same as adult rate", i.e. old behaviour).
- **New table** `kutumb_registration_attendees` — one row per individual person (primary registrant / additional adult / child under 5 / child 5+), each with its own `qr_token` and `checked_in_at`.
- **New table** `kutumb_event_coupons` — code, event, amount, QR, validity window, and `redeemed_by_registration_id` (single-use enforcement).

No existing column was removed, renamed, or had its meaning changed. Existing registrations, orders, and events are untouched and remain fully accessible.

---

## 3. New/changed files

**Backend**
- `server/db/schema.sql` — additive migration (above)
- `server/lib/attendees.js` — **new**: generates/syncs per-attendee QR records
- `server/lib/coupons.js` — **new**: coupon code/QR generation + atomic, race-safe redemption
- `server/routes/coupons.routes.js` — **new**: admin coupon CRUD + public coupon check
- `server/routes/registrationExtras.routes.js` — **new**: coupon-apply, per-registration attendee list, Excel export
- `server/routes/checkin.routes.js` — rewritten to merge the ticketing system's attendees with the new registration attendees for one unified scan/check-in experience
- `server/routes/ticketing.routes.js` — checkout now accepts `registrationId`; webhook + session-status now update the linked registration's payment status
- `server/server.js` — registration creation/update handle the under-5 split, fee calc, `registration_status`, and attendee generation; `/api/all-registrations` and `/api/upcoming-events` return the new fields

**Frontend**
- `src/pages/admin/EventRegistration.tsx` — select-all, filtered/selected Excel export, new columns (child breakdown, registration status, payment method), "Attendees" dialog (per-person QR + manual check-in)
- `src/pages/admin/CheckIn.tsx` — camera scanning (`html5-qrcode`, already a dependency) alongside the existing type/paste flow, plus an explicit "scan again to override" for duplicates
- `src/pages/admin/Coupons.tsx` — **new** admin tab: generate/list/void coupons
- `src/pages/admin/UpcomingEvents.tsx` — under-5-free toggle + child pricing fields
- `src/pages/events/UpcomingEvents.tsx` — public registration form: separate "Children under 5" / "Children 5+" fields with live fee breakdown
- `src/components/EventRegistrationSuccessDialog.tsx` — coupon-code entry/application, alongside existing bank-transfer and card options
- `src/components/RegistrationCheckoutModal.tsx` — now passes `registrationId` through to Stripe checkout
- `src/pages/Admin.tsx` — new "Coupons" tab
- `package.json` — added a `migrate` script (`npm run migrate`) for convenience

---

## 4. The new registration/payment workflow

```
Submit registration
        │
        ├─ Free event ─────────────────────────────► registration_status = confirmed
        │
        └─ Paid event ──► registration_status = pending_payment
                │
                ├─ Pay by card (Stripe) ──► Stripe webhook / session-status confirms
                │                            payment_intent succeeded ──► payment_status = Paid,
                │                            registration_status = confirmed, payment_method = card
                │
                ├─ Pay by bank transfer ──► registrant marks "transferred" (payment_status stays
                │                            Pending until an admin verifies it in the Event
                │                            Registration table and sets Payment Status = Paid,
                │                            which also flips registration_status = confirmed)
                │
                └─ Pay by coupon ──► POST /api/events/apply-coupon redeems the coupon
                                     (single-use, row-locked). If it fully covers the fee,
                                     payment_status = Paid and registration_status = confirmed
                                     immediately; otherwise the remaining balance can still be
                                     paid by card or bank transfer.
```

A registration for a paid event is **never** treated as confirmed just because the form was submitted — `registration_status` only becomes `confirmed` once one of the three payment paths above actually clears.

---

## 5. Recommended QR check-in approach (as requested)

What's implemented, and why:

- **Scanning device**: the existing Admin Console "QR Check-in" tab now supports scanning with a phone/tablet camera in the browser (`html5-qrcode`, already a project dependency — no new native app needed), with manual type/paste as a fallback. This is the simplest reliable approach: no extra install for volunteers, works on any device with a camera and a browser.
- **What's in the QR code**: an opaque random token (`crypto.randomBytes(16).toString("hex")`) — never a name, email, or registration number. The token is looked up server-side to retrieve the attendee and event. This matches the "no personal info in the QR" requirement.
- **Duplicate scanning**: the first scan of a token checks the person in; a second scan of the *same* token is blocked with a clear "already checked in at HH:MM" message. An authorised admin can deliberately override this — in the camera scanner, by scanning the same code again within 10 seconds; in the attendee list, there's no override button by design (re-running the scan is the deliberate action).
- **Where check-in status is recorded**: `checked_in_at` + `checked_in_by` (the admin's email, from their session) on each attendee row — durable, in Postgres, immediately visible in both the Check-in tab and the Event Registration table's new "Attendees" dialog.
- **Offline behaviour**: not implemented in this pass. The scanner currently requires connectivity to call the check-in API on every scan. If venues have unreliable connectivity, a reasonable next step is a small IndexedDB queue in the browser that stores scans locally and replays them when back online — flagged here rather than guessed at, since it changes the conflict-resolution story (two offline devices could both "check in" the same person before syncing) and deserves a deliberate design pass.
- **Authenticating admins/volunteers**: reuses the existing admin login (`requireAdmin` / JWT cookie) — every check-in route already requires an authenticated admin session, so no separate volunteer-login system was added. If you want volunteers who aren't full admins, that's a natural next step (a lower-privilege role) but is a policy decision, not made here.

---

## 6. Configuration / environment variables

No new environment variables are required. Everything reuses what's already
configured:
- `DATABASE_URL` — unchanged
- Stripe keys (`stripe_secret_key`, `stripe_publishable_key`, `stripe_webhook_secret`) — same settings screen, now also used to confirm *registration* payments, not just ticketing orders
- `ENCRYPTION_KEY` — unchanged

---

## 7. Testing checklist

After `npm install && npm run migrate && npm run dev-full` (or your usual deploy):

1. **Paid event registration** — register with a fee > 0 → registration shows "Pending Payment" in the admin table.
2. **Free event registration** — register for a $0 event → shows "Confirmed" immediately.
3. **Under-5 child** — register with 1 child under 5 on an event with "under-5 free" checked → fee excludes that child.
4. **Child 5+** — same, with a 5+ child → charged at the child (or adult, if unconfigured) rate.
5. **Multiple attendees** — register 1 + 2 adults + 2 children → open "Attendees" in the admin table → 5 distinct QR codes.
6. **Stripe card payment** — pay via the success dialog's "Pay by Card" → after payment, the registration (not just a separate order) shows Paid/Confirmed.
7. **Pending bank transfer** — mark "not yet transferred" → stays Pending.
8. **Admin bank-transfer verification** — admin edits the registration, sets Payment Status = Paid with a transaction number → registration becomes Confirmed.
9. **Coupon payment** — generate a coupon in the new Coupons tab, apply it in the success dialog → registration Paid/Confirmed (or partially, with remaining balance shown).
10. **Invalid/used coupon** — try to reapply the same coupon on another registration → rejected ("already been used").
11. **Individual QR generation** — confirm each attendee in the dialog has a distinct QR image/token.
12. **QR scanning** — in Check-in tab, open the camera scanner and scan an attendee's QR → checks them in.
13. **Duplicate check-in** — scan the same code again → blocked, with an override path.
14. **Multiple attendees from one registration checking in separately** — check in only some of the people from one registration; others remain unchecked.
15. **Registration/payment status filtering** — existing Payment Status filter still works; new Registration Status column is visible.
16. **Filtered Excel export** — set a filter (e.g. Pending), click "Export Filtered" → only matching rows are in the file.
17. **Manual selection + export** — check a few rows, click "Export Selected" → only those rows.
18. **Select-all** — toggles all currently-filtered rows; indeterminate state shown when some (not all) are selected.
19. **Pagination + selection** — this table has no pagination (renders all rows for the selected event, as before) — select-all is scoped to the current filter, which is the pagination-equivalent boundary here.
20. **Existing functionality** — Members, Upcoming/Past Events, Database Tables, Files, Ticketing & Payments, Settings & Access tabs are all untouched; a full `npm run build` completes with no errors.
21. **Donation via Card/Square/PayPal** — submit the donate form with "No, not yet" for bank transfer → pay via each enabled method → donation flips to Paid.
22. **Donation via bank transfer** — submit with "Yes" and a transaction number → recorded as Paid immediately, exactly as before.
23. **Membership number in bulk emails** — send a bulk email (Members tab, or Event Registration tab) to a recipient who is a registered member → email includes their membership number.
24. **Pending amount in event emails** — send a bulk email to an event registrant with an unpaid balance → email includes "Amount Pending: $X"; send to one who's fully paid → that line doesn't appear.

---

## 7b. Square & PayPal (added in this update)

Both are wired the same way Stripe already was: the registration is only
marked **Paid/Confirmed** once the *payment provider itself* confirms
success (webhook or a server-to-server status/capture call) — never just
because the browser returned from checkout.

**New settings** (Admin Console → Settings & Access, generated automatically
from the settings schema — no new admin UI code was needed for this):
- **Square**: Access Token, Location ID, Environment (sandbox/production), Webhook Signature Key
- **PayPal**: Client ID, Client Secret, Environment (sandbox/live), Webhook ID (optional)
- **Payment Methods**: two new toggles, "Pay by Square" and "Pay by PayPal", alongside the existing Bank Transfer/Card toggles — tick one to offer it on the registration success page immediately.

**How each one confirms payment:**
- **Square** — creates a Square-hosted Payment Link (`/v2/online-checkout/payment-links`) for the registration's remaining balance; the browser is redirected there and back to `/checkout/return`. A webhook (`payment.updated`, HMAC-verified) marks the registration paid the moment Square confirms it; the return page also does a one-time fallback check against Square's Orders API in case the webhook hasn't arrived yet.
- **PayPal** — creates a PayPal order server-side, renders PayPal's own Smart Buttons (JS SDK, loaded only when this method is enabled) for approval, then **captures the order server-to-server** — that capture response is what actually confirms payment, not the button's `onApprove` callback alone. A webhook is also wired in as a second line of defence.
- Both providers write to a new `kutumb_registration_payments` table (one row per checkout attempt, keyed to the registration) and reuse the same partial-payment logic as coupons — if a payment doesn't fully cover the fee, the remaining balance is tracked and can still be paid another way.

**New files**: `server/lib/squareClient.js`, `server/lib/paypalClient.js`, `server/lib/registrationPayments.js` (shared, provider-agnostic "mark this payment/registration paid" logic used by both), `server/routes/square.routes.js`, `server/routes/paypal.routes.js`, `src/components/PayPalButton.tsx`. Changed: `server/db/schema.sql`, `server/lib/settings.js`, `server/server.js` (route mounts + Square's raw-body webhook), `src/components/EventRegistrationSuccessDialog.tsx`, `src/pages/CheckoutReturn.tsx`.

**Setting up webhooks** (for production use):
- Square: in the Square Developer Dashboard, point a webhook subscription (event: `payment.updated`) at `{your public_base_url}/api/square/webhook`, then paste its Signature Key into Settings & Access.
- PayPal: in the PayPal Developer Dashboard, add a webhook pointed at `{your public_base_url}/api/paypal/webhook` (events: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`), then paste its Webhook ID into Settings & Access. This is optional — PayPal payments are already confirmed via the direct server-to-server capture call even without it — but it adds a safety net.
- Until a signature key/webhook ID is configured, both webhook handlers still work but log a warning and skip signature verification, so initial testing isn't blocked.

## 7c. Donations now accept Card / Square / PayPal too (added in this update)

`DonateDialog.tsx` is now a two-step flow: submitting the form records the
donation (as before, `kutumb_donations`), then — if the donor didn't mark
a bank transfer as already done — the dialog shows the same online payment
options as event registrations instead of just closing:

- **Card** — Stripe **hosted** Checkout (redirect, not embedded — simpler than the ticketing system's embedded flow, and donations don't need ticket types/attendees at all).
- **Square** — a Square Payment Link for the donation's fixed amount.
- **PayPal** — the same `PayPalButton` component used for registrations (now generalized with a `kind: "registration" | "donation"` prop), server-side capture.

All three reuse the exact same "provider confirms, not the browser" pattern
already built for event registrations. A donation's amount is fixed at
creation (no partial-payment/remaining-balance concept, unlike a
registration's fee), so payment is simply all-or-nothing.

**New**: `kutumb_donation_payments` table, `server/lib/donationPayments.js`, `POST /api/donations/:id/checkout-card` + `GET /api/donations/:id/status`, `POST /api/square/donations/:id/checkout` + `GET /api/square/donation-status/:id`, `POST /api/paypal/donations/:id/create-order`. The existing Square/PayPal webhooks and the PayPal capture endpoint now check *both* the registration-payments and donation-payments tables by reference, so one webhook handles both kinds of payment. `kutumb_donations` gained `payment_status`/`payment_method` columns (existing bank-transfer donations are backfilled to `Paid`/`bank_transfer` — nothing about the existing bank-transfer flow changed).

## 7d. Emails now always include membership number / amount pending (added in this update)

Every bulk email sent from the Admin Console — both the **Members** tab and
the **Event Registration** tab — now automatically states two things when
they apply, regardless of what the admin typed in the message body:

- **"Your Kutumb Membership Number: X"** — added whenever the recipient is a registered member. This applies to both the Members bulk-email dialog and the Event Registration bulk-email dialog (an event registrant who's also a Kutumb member gets this line too, same as before individual confirmation emails already did).
- **"Amount Pending: $X"** (bold, in the event's brand orange) — added on Event Registration emails whenever that registrant still owes money for the event being emailed about (`fee − amountPaid`, computed server-side so it can't be spoofed or forgotten from the client). Not shown for Members emails (there's no per-member "amount owed" concept) or once a registration is fully paid.

This is enforced in `sendBulkEmail()` itself (`server/lib/mailer.js`), so it
can't be accidentally omitted by any future caller — every recipient object
passed to it now carries optional `membershipNumber`/`pendingAmount` fields
that get rendered automatically. The three places that build bulk-email
recipient lists (`Members.tsx`'s selected-rows list, `/api/members/send-bulk-email`'s
"send to all" and legacy-emails-array paths, and `/api/events/send-bulk-email`'s
both paths) were all updated to supply these fields.

## 7e. Donate dialog: payment method chosen upfront + homepage Donate button (added in this update)

The previous version of `DonateDialog.tsx` only revealed Card/Square/PayPal
*after* submitting the form once — easy to miss, and if none of those are
enabled yet it looked identical to the plain bank-transfer form (which is
likely what was seen). It's now a single upfront choice:

- A **"How would you like to pay?"** selector appears as soon as Card, Square, or PayPal is enabled (Settings & Access → Payment Methods), listing only the methods actually turned on, with Bank Transfer always included last.
- If **only** Bank Transfer is enabled (the default, out of the box), the selector doesn't appear at all and the form looks exactly as it did originally — no visual change until an admin turns something else on.
- Choosing Card or Square submits the form and redirects straight to that provider's checkout. Choosing PayPal submits the form and then renders the PayPal button inline, in the same dialog.

**Reminder**: Card/Square/PayPal are off by default. For them to appear anywhere (Donate dialog or Event Registration success dialog), an admin must both (a) tick them on under Settings & Access → Payment Methods, and (b) fill in that provider's credentials in the matching settings group. Bank Transfer needs no setup and is on by default.

Also added: a **Donate** button in the homepage hero section (`src/pages/Home.tsx`), alongside "Become a Member" and "View Events" — opens the same `DonateDialog`.

## 8. Assumptions made

- **"make sure if one coupon is used it should be reused"** (from your message) — read as reinforcing the original spec's explicit rule ("ensure a coupon cannot be reused improperly"), i.e. a likely typo for **should not** be reused. Implemented as strictly single-use, enforced with a row lock so two simultaneous redemption attempts can't both succeed. Let me know if you actually intended multi-use coupons (e.g. a fixed number of redemptions) — that's a small change to `kutumb_event_coupons` (a `max_uses`/`used_count` pair instead of a single status flag).
- Attendee names for additional adults/children are auto-generated ("Additional Adult 1", "Child 1 (Under 5)") rather than individually collected on the registration form, to avoid redesigning that form's structure. The admin can see/rename them via the Attendees dialog if needed (renaming isn't wired into the UI yet — the backend already supports it via a direct `kutumb_registration_attendees` update if you want that added).
- Coupons are event-specific and single-use per the spec; "applicable conditions/validity" is a free-text notes field plus an optional expiry date, not a rules engine.
- Offline QR scanning support is intentionally not implemented (see §5) — flagged as a follow-up rather than guessed at.
- "Pagination + selection" (test #19): the Event Registration table doesn't paginate today (it never did), so select-all is scoped to the filtered set rather than a page.
- Donation payments via Card/Square/PayPal are all-or-nothing (a donation's amount is fixed by the donor at submission, unlike a registration's fee) — there's no partial-donation-payment concept.
- Neither Square, PayPal, nor the donation-payment endpoints have been exercised against real sandbox credentials in this environment — the request/response shapes follow each provider's published API docs, but, as with Stripe/Square/PayPal for event registrations, haven't been fired against a live sandbox account. Treat "pay $1 through each provider end-to-end" as the first thing to test before going live.
