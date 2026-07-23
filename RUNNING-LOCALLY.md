# Running Kutumb locally on Windows

## Quick start

1. Make sure **Node.js 18+** is installed: https://nodejs.org
2. **Fully extract the ZIP file first** - right-click it, choose
   "Extract All...", and open the extracted `Kutumb-main` folder. Running
   `app.cmd` directly from inside Explorer's zip preview (without
   extracting) is the most common reason it appears to "flash and close" -
   `npm` can't find `package.json` in that temporary view, fails instantly,
   and the window closes before you can read why.
3. Double-click **`app.cmd`** inside the extracted folder (or run it from a
   Command Prompt).

If `app.cmd` ever does close unexpectedly, it now always prints a clear
`[ERROR] ...` message first and waits for a key press before closing - so if
you see that happen again, the message on screen will say exactly what to
fix (missing Node.js, extraction issue, `npm install`/build failure, etc).

The first time you run it, `app.cmd` will:
- create a `.env` file from `.env.example` (if one doesn't exist yet)
- run `npm install` to fetch dependencies
- run `npm run build` to build the production frontend into `dist/`
- start the server and open **http://localhost:8080** in your browser

On later runs it skips install/build automatically (since `node_modules` and
`dist` already exist), and starts straight away.

### Useful commands

| Command                | What it does                                             |
|------------------------|-----------------------------------------------------------|
| `app.cmd`               | Normal start (installs/builds only if needed)             |
| `app.cmd install`       | Forces a fresh `npm install`                               |
| `app.cmd rebuild`       | Forces a fresh frontend build (run after changing source)  |

To stop the server, press **Ctrl+C** in the console window `app.cmd` opened.

To use a different port, set the `PORT` environment variable before running,
e.g. in Command Prompt: `set PORT=3000 && app.cmd`.

---

## Membership registration features

Membership registration (`/membership`) now:

- Requires **Name, Email and Phone** (compulsory fields).
- Rejects duplicate registrations where the **same Name + Email combination**
  already exists (a different person can share an email, and the same person
  can appear once per unique name/email pair).
- Auto-generates a **membership number** in the format `YYNNNN`:
  - `YY` = last two digits of the year of registration
  - `NNNN` = a 4-digit sequence, restarting at `0001` every calendar year
  - e.g. the 1st member of 2026 is `260001`, the 221st member of 2027 is `270221`
  - This is computed **live** as "highest existing number for that year + 1"
    every time - there's no separate saved counter. So if the
    highest-numbered member for a year is deleted, that number is freed up
    and will be issued to the next new member. Deleting a member who isn't
    currently the highest-numbered one does not free up their number,
    since numbering only ever moves forward from whatever is left.
- Shows a popup card immediately after registration with the membership
  number, a QR code (top-right corner), and the member's name/email/phone.
- Lets you **download the card as a PDF** from the popup.
- Sends a **confirmation email** automatically to the member's email
  address, with the full membership card (logo, QR, membership number,
  name/email/phone) attached as a PDF - the same file the popup's
  "Download PDF Card" button produces.

Event registrations (`/events`) work the same way for **required fields**
(name, email, phone). If the registrant's email matches an existing member,
their membership number and QR code are also included in the event
confirmation email and the popup.

Sending the card via WhatsApp is available as a backend API
(`POST /api/members/send-whatsapp`) but is no longer exposed as a button in
the popup UI.

### Data storage

- `server/data/members/members.json` - every member record now stores its
  `membershipNumber` **and** a persisted `qrCode` (base64 PNG data URL), so
  the QR never needs to be regenerated to match what was originally issued.
  Any member record that existed before this feature (with no membership
  number yet) is automatically assigned one the first time the server starts,
  in the original order members joined.
- `server/data/events/*.json` - event registrations now also store
  `isMember` and `membershipNumber` when the registrant is a recognised
  Kutumb member, so this is visible directly in admin CSV exports.

### Automatic Past Events archiving

Every time the upcoming events list is loaded (Home, Events, or Admin page),
and once an hour in the background, the server checks each upcoming event's
date. Once an event's date has fully passed, it is automatically:

- removed from the Upcoming Events list,
- added to the Past Events list (carrying over its description and flyer
  image, plus a computed attendee count from its registration records),
- and Past Events are always shown **newest event first** (descending by
  date), regardless of the order they were added.

Dates like `"May 9, 2026"` and `"April 11-15, 2026"` are understood
directly. Month-only dates like `"September, 2026"` are treated as not yet
finished until the entire month has passed. If a date can't be confidently
parsed, that event is left alone in Upcoming rather than being archived by
mistake.

An admin can also trigger the check manually at any time by calling
`POST /api/upcoming-events/archive-now`.

### Email setup (required for confirmation emails to actually send)

Full step-by-step instructions (Gmail/Microsoft 365/generic hosting, app
passwords, and a troubleshooting table) are in
**[EMAIL-SETUP.md](./EMAIL-SETUP.md)**.

Quick check any time: visit `http://localhost:8080/api/email/status` while
the app is running, or send yourself a test email via
`POST /api/email/test-send` (see EMAIL-SETUP.md for the exact command).

If `SMTP_HOST` is left blank, the app still works normally - it just skips
sending the email and logs a warning in the console instead of failing the
registration.

### WhatsApp setup (required for the "Send via WhatsApp" button)

The membership card is sent via WhatsApp using **Meta's WhatsApp Cloud API**,
from the Kutumb business number **+61409809164**.

Full step-by-step instructions (getting credentials, the public-URL
requirement, and the WhatsApp 24-hour messaging rule that trips people up
most often) are in **[WHATSAPP-SETUP.md](./WHATSAPP-SETUP.md)**.

Quick check any time: visit `http://localhost:8080/api/whatsapp/status`
while the app is running to see exactly what's configured and what isn't.

Until it's fully configured, clicking "Send" in the popup shows a friendly
error message (now including WhatsApp's actual error detail) rather than
crashing the app.
