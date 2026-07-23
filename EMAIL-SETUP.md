# Setting up confirmation emails

Membership and event registrations both try to send a confirmation email
automatically, from **pramod@kutumb.org.au**. This only works once real SMTP
credentials are filled in in `.env` - without them, registrations still
succeed normally, the email is just silently skipped (with a warning logged
to the server console).

---

## Quick check: is it configured, and does it actually work?

**1. Check status** - visit this while the app is running:

```
http://localhost:8080/api/email/status
```

Unconfigured:
```json
{ "configured": false, "verified": false, "error": "SMTP_HOST is not set in .env" }
```

Configured but wrong credentials:
```json
{ "configured": true, "verified": false, "from": "\"Kutumb\" <pramod@kutumb.org.au>", "error": "Invalid login: 535 5.7.8 ..." }
```

Working correctly:
```json
{ "configured": true, "verified": true, "from": "\"Kutumb\" <pramod@kutumb.org.au>" }
```

This is also checked and printed to the server console automatically every
time the app starts (`✅ Email configured and verified...` or a `⚠️` warning
explaining what's wrong).

**2. Send yourself a real test email** (easier than registering a fake
member every time) - from a terminal, or any HTTP tool:

```
curl -X POST http://localhost:8080/api/email/test-send -H "Content-Type: application/json" -d "{\"to\":\"your.email@example.com\"}"
```

If this doesn't arrive, check your spam folder first, then work through the
steps below.

---

## Step 1 - Get SMTP credentials for pramod@kutumb.org.au

This depends on where that mailbox is actually hosted. Common cases:

### If it's a Microsoft 365 / Outlook mailbox
```
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=pramod@kutumb.org.au
SMTP_PASS=<the account's normal password, or an app password - see note below>
```
Note: if the Microsoft 365 account has multi-factor authentication (MFA)
enabled, the normal password will **not** work for SMTP - you must generate
an **App Password** instead (Microsoft 365 admin → Security → Additional
security verification → App passwords), and put that in `SMTP_PASS`.

### If it's a Google Workspace mailbox
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=pramod@kutumb.org.au
SMTP_PASS=<a 16-character App Password, NOT the normal Google password>
```
Google **requires** an App Password for SMTP (Google Account → Security →
2-Step Verification must be turned on first → App passwords). Using the
regular account password will always fail with an authentication error.

### If it's hosted with your domain registrar / a generic host (cPanel, GoDaddy, etc.)
Check your hosting provider's control panel for "Email Accounts" → SMTP
settings - it will show the exact host/port for that mailbox, typically:
```
SMTP_HOST=mail.kutumb.org.au        (or similar - check your host's docs)
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=pramod@kutumb.org.au
SMTP_PASS=<the mailbox's actual password>
```

## Step 2 - Fill in `.env` and restart

Put the values from Step 1 into `.env` in the project folder:

```
SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=pramod@kutumb.org.au
SMTP_PASS=...
EMAIL_FROM="Kutumb <pramod@kutumb.org.au>"
```

**`.env` is only read when the server starts** - if you edit it while the
app is already running, close the `app.cmd` window and run it again for the
change to take effect.

## Step 3 - Verify

Check `http://localhost:8080/api/email/status` again, or watch the console
output right after starting - it will now say either:
- `✅ Email configured and verified (sending from "Kutumb" <pramod@kutumb.org.au>)`, or
- `⚠️ Email is configured but the connection failed: <reason>`

---

## Common errors and what they mean

| Error contains...                              | Likely cause                                                      |
|-------------------------------------------------|---------------------------------------------------------------------|
| "Invalid login" / "535 5.7.8" / "Username and Password not accepted" | Wrong password, or an App Password is required (Gmail/Microsoft 365 with MFA) |
| "SmtpClientAuthentication is disabled for the Tenant/Mailbox" (535 5.7.139) | Microsoft 365 blocks basic username/password SMTP login by default - see below |
| "getaddrinfo ENOTFOUND" / "ECONNREFUSED"        | `SMTP_HOST` or `SMTP_PORT` is wrong                                |
| "self signed certificate" / TLS errors          | Try `SMTP_PORT=465` with `SMTP_SECURE=true` instead of 587/false   |
| "Missing credentials for PLAIN"                 | `SMTP_USER`/`SMTP_PASS` are blank in `.env`                        |
| Email "sends" (no error) but never arrives       | Check spam/junk folder; some hosts also require SPF/DKIM records for the sending domain to avoid being silently filtered - check with your host if this keeps happening |

If `/api/email/status` reports `verified: true` but real registration emails
still aren't arriving, the most likely cause is the last row above (spam
filtering) rather than a configuration problem - try the test-send endpoint
and check spam folders on the receiving side.

---

## "SmtpClientAuthentication is disabled for the Tenant/Mailbox" (Microsoft 365)

This is the single most common blocker for a Microsoft 365 mailbox, and
it's **not a password problem** - Microsoft 365 now blocks plain
username/password SMTP login by default on most tenants, regardless of how
correct the credentials are. Password errors and this error look different
in the message (this one explicitly says `SmtpClientAuthentication is
disabled`), so fix the hostname/password first if you see a different error,
then come back to this if you see this one specifically.

**Quick fix (works today, but see the caveat below):** ask whoever manages
your Microsoft 365 admin account to re-enable it for this mailbox:

1. Go to https://admin.exchange.microsoft.com (Exchange admin center)
2. **Recipients → Mailboxes** → select `pramod@kutumb.org.au`
3. **Manage email apps** (or similar, wording varies by tenant) → enable
   **Authenticated SMTP**
4. Alternatively, an admin with PowerShell access can run:
   ```
   Set-CASMailbox -Identity pramod@kutumb.org.au -SmtpClientAuthenticationDisabled $false
   ```
5. This can take **30 minutes up to ~25 hours** to take effect - it won't
   work instantly.

**Important caveat:** Microsoft has been actively phasing out exactly this
kind of basic username/password SMTP login tenant-wide, and re-enabling it
is increasingly treated as a temporary exception rather than a stable fix -
Microsoft's own published timeline has SMTP AUTH basic authentication
becoming **disabled by default for all existing tenants by the end of 2026**,
with a final full removal date to be announced afterwards. So this may need
re-enabling again later, or eventually stop being possible at all.

**On GoDaddy specifically:** if MFA is on and you can't find an "App
Passwords" option anywhere (including on the older
`https://account.activedirectory.windowsazure.com/Proofup.aspx` page, not
just the modern Security Info page), that's a known gap with GoDaddy-hosted
Microsoft 365 accounts - GoDaddy's MFA setup usually doesn't put the account
into the specific state Microsoft requires for App Passwords to appear at
all. This isn't fixable from the account settings themselves; only GoDaddy
support can change it, and it's not guaranteed even then. At that point,
the option below is the practical path.

**More durable fix (recommended): use Brevo as the sending relay**

Instead of authenticating directly against `smtp.office365.com`, use a
transactional email provider to actually send the mail, while it still
shows `pramod@kutumb.org.au` as the visible "From" address. **Brevo** is a
good default choice - free for 300 emails/day, no card required, and no
DNS changes needed for a single verified sender address (only needed if you
want the strongest deliverability later). No app code changes are needed -
just different `.env` values.

1. Sign up free at https://www.brevo.com
2. Go to **Senders, Domains & Dedicated IPs → Senders → Add a sender**,
   enter `pramod@kutumb.org.au`. Brevo emails that address a confirmation
   link - click it to verify.
3. Go to **SMTP & API → SMTP tab → Generate a new SMTP key**. Copy the key
   immediately - it's only shown once. Also note the **Login** shown on
   that same page (looks like `8a1b2c@smtp-brevo.com` - this is a unique
   Brevo identifier, not your actual email address).
4. Update `.env`:
   ```
   SMTP_HOST=smtp-relay.brevo.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=<the Login from step 3, e.g. 8a1b2c@smtp-brevo.com>
   SMTP_PASS=<the SMTP key from step 3>
   EMAIL_FROM="Kutumb <pramod@kutumb.org.au>"
   ```
5. Restart `app.cmd`, then check `http://localhost:8080/api/email/status`.

Other equally good alternatives if you'd rather compare: **Resend** and
**SendGrid**, both with their own free tiers and near-identical setup flow
(verify a sender address, generate an SMTP/API key, update the same four
`.env` values above).
