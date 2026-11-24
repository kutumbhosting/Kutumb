# Live bank feed for bank-transfer reconciliation

Instead of downloading a NAB statement and uploading it, the Event
Registration page can now pull incoming transfers straight from the bank
through **Basiq**, an Australian open-banking provider that works under the
Consumer Data Right (CDR). The bank password is typed only on the bank's own
page, access is read-only, and consent can be revoked at any time from the
NAB app or Basiq.

The matching is exactly the same as the statement upload
(`server/lib/paymentReconciliation.js`); only the source of the credits changes.
Uploading a statement still works and is the fallback.

## One-time setup

1. Create an account at dashboard.basiq.io and an application. Start in
   sandbox, then request production access (Basiq charges per connected
   user in production — check their current pricing).
2. Copy the application's API key.
3. Admin → API Keys → **Live Bank Feed (Basiq)** → paste the API key.
4. `npm run migrate` (adds the `kutumb_bank_transactions` table).
5. Same settings section → **Connect Bank**. The account
   holder logs in to NAB in the new tab and shares the account whose BSB and
   account number is shown to registrants.
6. Optional: to ignore the holder's other accounts, copy that account's id into
   *Basiq Account ID* in Settings.

CDR consent lasts up to 12 months. When it expires the button changes back to
**Connect Bank**.

## Using it

Pick the event → **🔄 Sync from Bank**. The server:

1. asks the bank for fresh data (waits up to ~45s, otherwise uses Basiq's last copy),
2. pulls credits from the day before the event's first registration to today,
3. stores each credit once in `kutumb_bank_transactions`,
4. reconciles only credits not already matched to any registration,
5. updates registrations, sends confirmation emails and tickets, and saves a
   run you can download as the usual Excel report.

A credit matched to one event is never offered to another event, so the same
account can receive money for several events, donations and personal
transfers without double counting.

## Files

- `server/lib/basiqClient.js` — token, consent link, refresh, transaction fetch
- `server/lib/reconciliationRun.js` — shared "apply a reconciliation" logic (moved out of the route)
- `server/routes/reconciliation.routes.js` — `/bank-feed/status`, `/bank-feed/connect`, `/bank-feed/sync`
- `server/lib/settings.js` — three new settings
- `server/db/schema.sql` — `kutumb_bank_transactions`
- `src/pages/admin/EventRegistration.tsx` — Connect Bank / Sync from Bank buttons
