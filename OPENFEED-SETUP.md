# Live NAB feed through openfeed

The website pulls incoming transfers to **Kutumb Australia Inc — BSB 082-356, account
778280517** straight from NAB through [openfeed](https://openfeed.au) (by Biza.io), an
accredited Consumer Data Right recipient. Every 4 hours (or on **Sync now** / **Sync from
Bank**) new credits are stored in the bank ledger and reconciled against every event with
unpaid registrations — the same matching as statement uploads and the Bank File Drop Box.
A credit already imported another way (e.g. a dropped statement) isn't counted twice.

Read-only: nothing can be paid out, and NAB login details never reach openfeed or the site.

Everything is set up in **Admin → Platform Console → API Keys → Live Bank Feed (openfeed)**.

## Steps

1. **Generate keys** → **Copy public key set**. (Two private keys are created and stored
   encrypted in the database; only the public half is shown.)
2. Go to **app.openfeed.au → Register app** and register:
   - Name *Kutumb Event Registrations*, website = your site
   - Auth method **private_key_jwt**, paste the public key set as **inline JWKS**
   - Scope **openfeed-au:data:banking:read** only
   - Post-logout redirect URI: `https://www.kutumb.org.au/` (trailing slash)
3. Paste the **OAuth2 Client ID** (`app-…`) and **App ID** (bare UUID) into the settings and Save.
4. In openfeed's dashboard, **connect NAB** (log in at NAB and approve). For a business
   account this must be done by a NAB **nominated representative** of Kutumb Australia Inc —
   set one up in NAB Internet Banking / NAB Connect first if needed.
5. Back in API Keys, click **Connect**, sign in to openfeed, and on the sharing screen tick the
   Kutumb account. The site then finds it by BSB + account number automatically.
6. Click **Sync now** to test. After that it runs by itself every 4 hours.

Do step 5 on the **live site** (the address you connect from is where openfeed sends you back).

## Cost

openfeed bills the developer (Kutumb) in credits: one credit per active share each month,
and the first 10 credits are free — check https://openfeed.au/pricing for current prices.
If credits run out, syncing pauses with a clear message until topped up.

## If something goes wrong

- "no longer shared" / "expired or revoked" → click **Connect** again.
- "Kutumb NAB account not found" → Connect again and tick that account on openfeed.
- NAB data on openfeed refreshes about every 4 hours, so a transfer made minutes ago may not
  show yet — the Bank File Drop Box remains available for anything urgent.
