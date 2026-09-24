# Automatic registration emails

Settings: Admin → Settings → **Automatic Registration Emails**.

Two levels of control, both must be on for an email to go out:

- **Master switches** (checkboxes): Payment reminders · Auto-cancel unpaid · Welcome email.
- **Per event** (the "Which events" table): tick Payment reminders / Auto-cancel unpaid /
  Welcome email for each upcoming event. New events start with reminders and welcome
  ticked and **auto-cancel unticked** — tick it for each event you want enforced.
  Reminders and auto-cancel don't apply to free events.

The final reminder only mentions a cancellation date for events ticked for auto-cancel. If
auto-cancel is ticked after a plain final reminder has gone out, a second final reminder
with the date is sent first, and cancellation follows at least 20 hours later.
Times are Sydney time. Checked every 15 minutes; acts once the send hour has passed.

| Email | Who | When (defaults) |
| --- | --- | --- |
| Payment reminder | Paid events, registration still awaiting payment (not within 24h of registering) | Mon & Thu 10:00, while the event is more than 6 days away |
| Final reminder | Same, still unpaid | 6 days before the event (states the cancellation date) |
| Cancellation | Still unpaid after the final reminder | 5 days before the event — spots released, registrant and admin mailbox emailed |
| Welcome ("See you tomorrow") | Every confirmed registration, free and paid, QR tickets attached | Day before the event |

Never auto-cancelled (listed in the admin email instead): part-payments, people who said
they paid by bank transfer that isn't matched yet (unless that setting is on), anyone who
registered in the final week, and anyone who never received the final reminder.

Before cancelling, all stored bank credits are reconciled once more. A cancelled
registration can't be paid through its old link, doesn't count towards capacity or totals,
and the person can register again. An admin can reinstate it by setting Payment Status to Paid.

Emails are only recorded as sent when they actually go out, so nothing is sent twice and a
mail outage is retried. Events whose date has no specific day (e.g. "November, 2026") are
skipped. **Preview what's due now** shows exactly who would get what without sending anything.

All of this needs working email (SMTP settings in `.env`).
