# Setting up "Send via WhatsApp"

The membership card popup can send the PDF card over WhatsApp, sent **from**
your Kutumb business number **+61409809164**, using Meta's official
**WhatsApp Cloud API** (this is the same free API Meta provides for
businesses - there's no third-party service to pay for).

There are three things that all have to be true at once for a send to work:

1. Your WhatsApp Cloud API credentials are filled in in `.env`
2. `PUBLIC_BASE_URL` is a real public web address (not `localhost`)
3. The recipient is allowed to receive the message (see the 24-hour rule below)

If any one of these isn't right, the send will fail - this guide covers all
three, plus how to check exactly what went wrong.

---

## Quick check: is it even configured?

Visit this in your browser while the app is running:

```
http://localhost:8080/api/whatsapp/status
```

It'll tell you plainly what's missing, e.g.:

```json
{
  "configured": false,
  "senderNumber": null,
  "publicBaseUrl": "http://localhost:8080",
  "publicBaseUrlIsPublic": false,
  "readyToSend": false,
  "notes": [
    "WHATSAPP_PHONE_NUMBER_ID and/or WHATSAPP_ACCESS_TOKEN missing from .env",
    "PUBLIC_BASE_URL must be a real public https URL (not localhost) so Meta can fetch the card PDF"
  ]
}
```

The server console also prints this at startup (look for `✅ WhatsApp
configured` or `⚠️ WhatsApp is NOT configured`).

---

## Step 1 - Create the Meta app & get your credentials

1. Go to https://developers.facebook.com and log in (or create a Meta
   developer account).
2. Click **My Apps → Create App**. Choose the **"Business"** app type.
3. Once created, on the app dashboard click **Add Product**, find
   **WhatsApp**, and click **Set up**.
4. This takes you to **WhatsApp → API Setup**. On this page you'll see:
   - A **temporary access token** (valid ~24 hours - fine for testing, but
     you'll want a permanent one for real use, see Step 3).
   - A **test phone number** provided by Meta, with its own **Phone number
     ID** - useful for your very first test message.
   - A **"To"** field where you can add up to 5 test recipient numbers.

For your very first test, you can use Meta's test number + your own phone
added as a recipient, without touching +61409809164 at all - this proves the
whole pipeline works before dealing with your real business number.

## Step 2 - Register +61409809164 as your real sending number

1. Still in **WhatsApp → API Setup** (or **WhatsApp → Configuration**),
   click **Add phone number**.
2. Enter +61409809164 and verify it (Meta sends a verification code via SMS
   or a call to that number).
3. **Important:** a phone number can only be registered with WhatsApp
   Business API if it is **not** already active on regular WhatsApp / WhatsApp
   Business app on a phone. If +61409809164 currently has WhatsApp installed
   on a phone, you'll need to either delete that WhatsApp account first or
   use a different number.
4. Once verified, this number gets its own **Phone number ID** - copy it,
   this is your real `WHATSAPP_PHONE_NUMBER_ID`.

## Step 3 - Get a permanent access token

The default token shown on the API Setup page expires in ~24 hours. For a
token that doesn't expire:

1. Go to **Meta Business Suite → Business Settings → Users → System Users**
   (business.facebook.com/settings).
2. Create a System User (e.g. "Kutumb App"), assign it **Admin** access to
   your WhatsApp app.
3. Click **Generate New Token**, select your app, and tick the
   `whatsapp_business_messaging` and `whatsapp_business_management`
   permissions.
4. Copy the generated token - this is your `WHATSAPP_ACCESS_TOKEN`. Store it
   somewhere safe; Meta will only show it to you once.

## Step 4 - Fill in `.env`

```
WHATSAPP_PHONE_NUMBER_ID=<the phone number ID from Step 2>
WHATSAPP_BUSINESS_ACCOUNT_ID=<found on the WhatsApp > API Setup page>
WHATSAPP_ACCESS_TOKEN=<the permanent token from Step 3>
WHATSAPP_SENDER_NUMBER=+61409809164
```

Restart the app (`app.cmd`) after editing `.env` - it's only read at startup.

## Step 5 - Set `PUBLIC_BASE_URL` to a real public address

This is the step people most often miss. When you click "Send", the app
tells Meta *"here's a link to the PDF, go download it and send it"* - Meta's
servers do the downloading, not your PC. If `PUBLIC_BASE_URL` is
`http://localhost:8080`, Meta's servers try to reach your own laptop over
the internet and obviously can't - the send will fail every time, even with
perfect credentials.

**Options while testing locally:**
- Use a tunnel like [ngrok](https://ngrok.com): run `ngrok http 8080`, copy
  the `https://xxxx.ngrok-free.app` URL it gives you, and set
  `PUBLIC_BASE_URL=https://xxxx.ngrok-free.app` in `.env`. Restart the app.
  (Free ngrok URLs change every restart, so update `.env` each time.)

**Once actually deployed** (e.g. to a real server/hosting provider with a
domain), set `PUBLIC_BASE_URL` to that real domain instead, e.g.
`PUBLIC_BASE_URL=https://members.kutumb.org.au`, and you won't need ngrok
again.

## Step 6 - The 24-hour rule (very common reason sends fail)

WhatsApp Business rules require one of these to be true before you can send
someone a free-form message (like our PDF document):

- **They messaged your WhatsApp number first**, and it's been **less than
  24 hours** since their last message to you, **or**
- You use a **pre-approved message template** (a short, Meta-reviewed
  message format) - required for the very first contact with someone, or
  once the 24-hour window has closed.

In practice, for a brand-new member who has never messaged +61409809164 on
WhatsApp, sending the card directly will likely fail with an error like:

> "(#131047) Message failed to send because more than 24 hours have passed
> since the customer last replied to this number."

**Practical workarounds:**
- Ask new members to send a quick "Hi" to +61409809164 on WhatsApp once
  (e.g. mention it on the registration page) before clicking Send - this
  opens the 24-hour window.
- Or, set up an approved **message template** in Meta Business Manager
  (WhatsApp → Message Templates → Create Template) for sending the card -
  this is the correct long-term solution for reaching people who haven't
  messaged you first, but requires Meta's review (usually a few hours to a
  day) before it can be used.

## How to read the error you get in the app

When a send fails, the popup will now show Meta's actual error message
(not just "failed"), and the full error detail is also logged to the server
console for the exact `code`/`error_subcode`. Common ones:

| Message contains...                          | Likely cause                                      |
|-----------------------------------------------|----------------------------------------------------|
| "more than 24 hours have passed"              | 24-hour rule (Step 6) - need a template or a fresh message from the recipient |
| "Invalid OAuth access token" / "Session has expired" | Token is wrong, expired, or missing permissions (Step 3) |
| "recipient phone number not in allowed list"  | Using a test number in Sandbox mode - only pre-added test numbers can receive messages until the app is fully live |
| "Unsupported post request" / phone number ID errors | `WHATSAPP_PHONE_NUMBER_ID` is wrong (Step 2) |
| (nothing happens / times out)                  | `PUBLIC_BASE_URL` unreachable from the internet (Step 5) |

If you're still stuck, check `/api/whatsapp/status` first, then check the
server console output right after clicking Send - it will show the raw
Meta API error response.
