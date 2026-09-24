# Bank File Drop Box (Google Drive)

Drop a NAB statement export into the Drive folder and the site does the rest:

1. picks the file up within 5 minutes,
2. reads it with the same parser as the Upload Bank Statement button,
3. stores each credit once in the bank ledger — overlapping statements are fine,
   a credit already seen is ignored,
4. reconciles all unmatched credits against **every event that still has unpaid
   registrations**, in one pass, so each credit goes to its best match across events,
5. marks matched registrations Paid/confirmed and emails confirmations and tickets
   (same rules as today: a short payment stays Pending),
6. saves a reconciliation run per event (the usual *Download Reconciliation Report* button),
7. keeps a copy of the original file in the database (downloadable under Recent files in the settings section),
8. removes the file from the folder — to Drive's bin by default (recoverable for
   30 days), or permanently if *After import* is set to `delete`.

Credits that match nothing stay in the ledger and are retried on the next import,
so a transfer that arrives before someone registers is matched later.

A file that can't be read (PDF, wrong columns) is left in the folder and listed
with the reason. It isn't retried until it's replaced or edited.

Folder: https://drive.google.com/drive/folders/1wo2VFMi_2zZQSeQbJgFBSqBXS5enTCME
(change it in Settings if needed).

## Letting other people drop files

Only kutumbhosting@gmail.com sets anything up (the script, once). Everyone else
just needs access to the folder:

1. In Google Drive, signed in as kutumbhosting@gmail.com, right-click the folder →
   **Share** → add each person's email as **Editor** → Send.
2. They open the **Bank File Drop Box** link in the website footer (or the folder
   in the Google Drive app on their phone) and drop the NAB CSV in.
3. Within 5 minutes the file is imported and taken out of the folder, and they get
   an email saying whether it worked. Failures also go to the admin mailbox.

Each person needs a Google account; a free one can be made with any email address.
Share only with people you trust — dropping a statement can mark registrations as
paid — and avoid "Anyone with the link".

A file someone else drops is owned by them, and Google only lets the owner bin it.
For those files the script takes the file *out of the folder* instead; it stays in
the uploader's own Drive. The website keeps a copy either way and never imports the
same file twice.

## What to drop

NAB Internet Banking → the account → Transactions → choose dates → Export →
**CSV** (best) or Excel. .xlsx, old .xls and Google Sheets all work. PDFs don't.
Statements with one Amount column or separate Debit / Credit columns both work.

## Setup — Google Apps Script (recommended, free, ~3 minutes)

The pick-up runs as a small script inside kutumbhosting@gmail.com's Google
account, on Google's servers, every 5 minutes. It sends each file to the website
and removes it once the website confirms the import. Because Google runs it, it
keeps working when the website's host puts the server to sleep, and it needs no
Google Cloud project.

1. `npm run migrate` once, then restart the site.
2. Admin → Platform Console → **API Keys & Settings** → **Bank File Drop Box
   (Google Drive)**. Check the Drive Folder ID (a pasted folder link is fine), then
   click **Copy script**. The script already contains the website address, folder
   and a private key.
3. Signed in as kutumbhosting@gmail.com, open script.google.com → **New project**,
   paste over the sample code, Save.
4. Choose **install** in the function list → **Run** → allow the permissions
   (Advanced → Go to project → Allow).

The same settings section then shows "last checked in …" and the recent files. If a file can't be imported it stays in
the folder, the reason appears under *Recent files*, and an email goes to
kutumbhosting@gmail.com (or `ADMIN_ALERT_EMAIL` in `.env`).

Copy and paste the script again if the website address or the folder changes.
Keep the script private — its key lets it upload statements.

The website must be reachable on the internet for this to work. If it only runs on
a PC via app.cmd, nothing can be picked up while that PC is off.

## Optional — server-side polling

The site can also check the folder itself through a Google OAuth connection
(the optional Client ID/Secret fields in the same settings section, then
*Connect Google Drive* there). This only works while the server process is running, so hosts that
sleep or scale to zero won't fire it. Not needed if the script is set up.

For that you need, signed in as kutumbhosting@gmail.com: a Google Cloud project
with the Drive API enabled, an External OAuth consent screen published to
**In production** (Testing expires the connection every 7 days), and a Web
application OAuth client with redirect URI
`https://<your site>/api/events/reconcile/drive/callback`.

## Settings

| Setting | Default |
| --- | --- |
| Drive Folder ID | 1wo2VFMi_2zZQSeQbJgFBSqBXS5enTCME |
| After import | `trash` (or `delete`) — copy the script again after changing |
| Check folder every N minutes (server-side only) | 5 |

## Also new: event-prefixed registration numbers

New registrations are numbered `<EVENT CODE>-R<seq>`, e.g. **UTS26-R0012**
(Utsav 2026), **IYD26-R0003** (International Yoga Day 2026). The code is
3 letters from the event name + the 2-digit year; if two events would get the same
code, the second gets a letter (UTS26B). Existing registrations keep their old
R0001-style numbers and the sequence continues (R0040 → UTS26-R0041).

The number is shown as **Reference** on the bank-transfer panel and in the
registration email, and payers can type it with or without the hyphen/spaces.
A prefixed number always outranks an old plain one when matching, and a plain
`R0012` is ignored when it's really part of another event's `XXX26 R0012`.
