# Credential Acquisition Guide

How to get every value `eBilihan-app/server/.env` needs, from the DICT **API Developer
Portal** at <https://platforms.e.gov.ph/dashboard>.

> **On the accuracy of this guide.** Every navigation instruction below is quoted from the
> saved PDFs in `eBilihanReference/eGOV API/`. Where the portal's own documentation does not
> describe a step, this guide says **"not documented — check portal"** rather than guess.
> Nothing here is invented from memory of how developer portals usually work.

---

## Before you start

**Two facts that shape everything else:**

1. **The gateway base URL is issued *with* the credential and appears nowhere else.** Every
   API-documentation page in the portal carries the banner:
   > *"This spec's base URL is blank until you generate a credential — open the Credentials
   > tab to get yours."*

   So you cannot look a base URL up later. Copy it at the same moment you copy the keys.

2. **Secret keys are shown once, at creation.** The Credentials tab's empty state reads:
   > *"Generate a credential to start integrating with this API — it comes with your client
   > ID, secret, and the gateway base URL to send requests to."*

   Seven values across the six catalogs are shown-once. Have `server/.env` open in an editor
   *before* you click Generate, and paste each value straight in.

**A prerequisite that may bite you.** eGov SSO's error table lists `403 forbidden` for
*"bad `partner_code` / `partner_secret`, revoked credential, **or account not approved**"*,
and `check_access` returns `0` for an *"unapproved account"*. So an account-approval state
exists and gates everything. **How approval is granted is not documented — check portal**,
and ask the hackathon organisers if your calls 403 with credentials you know are correct.

**Set up the file first:**

```bash
cd eBilihan-app/server
cp .env.example .env
```

Then generate `JWT_SECRET` — this one is yours, not the portal's, and can be regenerated
freely:

```bash
openssl rand -hex 32
```

---

## Order of work

Do the catalogs in this order. It is not arbitrary:

| # | Catalog | Why here |
|---|---|---|
| 1 | **eGov SSO** | Nothing else in the app can be exercised without a session, and the SSO profile supplies the name and gender fields eReport requires. |
| 2 | **eMessage** | Confirms the original broken-OTP symptom is gone. |
| 3 | **NationalID – eVerify** | Borrower verification; gates the whole loan flow. |
| 4 | **Face Liveness** | Owner check for high-value loans. |
| 5 | **eGovPAY** | Has an extra step (Templates) beyond key generation. |
| 6 | **eReport** | Self-contained; nothing else depends on it. |

---

## 1 · eGov SSO

**Catalog:** `eGov SSO` → **Credentials** tab → **Generate credentials**

This is the one catalog whose flow the portal documents in detail:

> *"On the developer portal, open the eGov SSO catalog and click Generate credential. You
> get, once: `partner_code` — your partner identifier for this gateway (safe to expose in a
> browser); `partner_secret` — server-side only, never in a browser or mobile binary;
> `base_url` — the gateway base for every call."*
>
> *"One active credential per developer; revoke and regenerate if it leaks."*

| Portal value | → variable | Secrecy |
|---|---|---|
| `base_url` | `EGOVPH_BASE_URL` | re-viewable |
| `partner_code` | `EGOVPH_PARTNER_CODE` | re-viewable (browser-safe) |
| `partner_secret` | `EGOVPH_PARTNER_SECRET` | **SHOWN ONCE** |

⚠️ **One active credential per developer.** Regenerating revokes the previous one — never do
it mid-demo.

### Beyond key generation

**Giving eGovPH your SSO base URL.** eGovPH launches an integrated service by opening your
own URL with the code appended:

> *"eGovPH opens your service with the authentication parameter appended:
> `https://your-service.example/egovph/sso?exchange_code=<code>`"*

For eBilihan that URL is **`<APP_BASE_URL>/egovph/sso`**. **Where you register it is not
documented — check portal** (it may be a portal field, or something an administrator sets).
See `PORTAL_QUESTIONS.md` Q4.

You do **not** need this registered to test locally — see below.

**Development URLs are explicitly allowed:**

> *"Your SSO base URL is served over HTTPS. Any valid certificate is fine for the hackathon
> (Let's Encrypt, your host's TLS, **an HTTPS tunnel while developing**); production /
> listing inside eGovPH needs a proper certificate on your own domain."*

### Testing sign-in without registering anything

Two documented routes, both usable from `localhost`:

**Sandbox accounts** for the widget / OTP flow (`type = MOBILE_NUMBER`; the OTP and PIN are
fixed and no SMS is actually sent):

| Username | OTP | PIN |
|---|---|---|
| `+639090000001` … `+639090000005` | `123456` | `000000` |

**The Generate exchange code button**, on the eGov SSO catalog page:

> *"Mint an exchange code against this platform's own eGov partner using a test identity —
> the same thing a real SSO redirect would hand you… pick a test account on the eGov SSO
> catalog page and use Generate exchange code — it mints a fresh, single-use `exchange_code`
> for that account, which you feed straight into step 3 (no eGovPH round-trip needed)."*

Feed it to `POST /auth/sso/login`, or open `/egovph/sso?exchange_code=<code>` in the browser.

---

## 2 · eMessage

**Catalog:** `eMessage` → **Credentials** tab → **Generate credentials**

The portal shows only the generic empty state for this catalog, so the exact field label is
**not documented — check portal**. From the request documentation, the token is sent as the
`X-EMESSAGE-Auth` header.

| Portal value | → variable | Secrecy |
|---|---|---|
| gateway base URL | `EMESSAGE_BASE_URL` | re-viewable |
| API token | `EMESSAGE_API_TOKEN` | **SHOWN ONCE** |

### Worth knowing

`POST /messaging/v1/sms/push` returns `201` for any valid number, **including ones it never
delivers to**. The server logs the full response body for exactly this reason. Whether test
mode restricts delivery to whitelisted numbers is **not documented — check portal**
(`PORTAL_QUESTIONS.md` Q5).

---

## 3 · NationalID – eVerify

**Catalog:** `NationalID - eVerify` → **Credentials** tab → **Generate credentials**

| Portal value | → variable | Secrecy |
|---|---|---|
| gateway base URL | `EVERIFY_BASE_URL` | re-viewable |
| `client_id` | `EVERIFY_CLIENT_ID` | re-viewable |
| `client_secret` | `EVERIFY_CLIENT_SECRET` | **SHOWN ONCE** |

### `EVERIFY_PUBKEY` — not documented

**This is the one gap most likely to slow you down.** The Face Liveness Web SDK needs a
public key:

> `window.eKYC().start({ pubKey: "YOUR_PUBLIC_API_KEY" })`

But **the portal never documents where that value comes from.** In the saved pages the
string `public_api_key` appears *only* as a test-runner variable on the QR Verify and Verify
Personal Information pages:

> *"VARIABLES IN THIS REQUEST: `{{public_api_key}}` Not set"* · *"Manage variables"* ·
> *"Type a real value, or reference a variable like `{{public_api_key}}`."*

So it may be on the Credentials tab under a different label, or set through **Manage
variables**, or issued separately. **Check portal** — and see `PORTAL_QUESTIONS.md` Q6.

Without it the loan flow stops at the face check, so don't leave the catalog until you have
found it.

---

## 4 · Face Liveness

**Catalog:** `Face Liveness` → **Credentials** tab → **Generate credentials**

> A **separate product** from eVerify's embedded Face Liveness Web SDK in §3. Their session
> tokens are different namespaces and are not interchangeable. eBilihan uses this one for
> the store owner's own check before a high-value loan.

Generic empty state only, so field labels are **not documented — check portal**. From the
request documentation the key is sent as the `x-api-key` header and the collection names its
variables `{{baseUrl}}` and `{{apiKey}}`.

| Portal value | → variable | Secrecy |
|---|---|---|
| gateway base URL | `FACE_LIVENESS_BASE_URL` | re-viewable |
| API key | `FACE_LIVENESS_API_KEY` | **SHOWN ONCE** |

---

## 5 · eGovPAY

**Catalog:** `eGovPAY` → **Credentials** tab → **Generate credentials**

| Portal value | → variable | Secrecy |
|---|---|---|
| gateway base URL | `EGOVPAY_BASE_URL` | re-viewable |
| merchant token | `EGOVPAY_API_TOKEN` | **SHOWN ONCE** |

⚠️ **Prefix the token with `test_`.** From the docs:

> *"A `test_`-prefixed token runs in test mode and does not touch the live financial
> networks."*

This token is also the HMAC key that signs every transaction `digest`, which is why eGovPay
can never be called from the app.

### Extra step: settlement template

`EGOVPAY_SETTLEMENT_TEMPLATE_UUID` is **required on every payment** — the server returns
`503` before calling out if it is missing. The docs describe the field as:

> *"The settlement template used for bank settlements (see Templates)."*

**That Templates page is not documented — check portal.** Look for a Templates section under
the eGovPAY catalog, create one, and copy its UUID. See `PORTAL_QUESTIONS.md` Q2(d).

### Also ask while you are here

Whether a **TEST-mode payment can actually be completed end to end** is not documented
anywhere — no test card, no simulate control, and no `payment_status` value other than
`INITIAL` is described. This determines whether a settled sale can be demonstrated at all.
`PORTAL_QUESTIONS.md` **Q2 is blocking** — ask it in this catalog's AI assistant.

---

## 6 · eReport

**Catalog:** `eReport` → **Credentials** tab → **Generate credentials**

Generic empty state only. The request documentation shows `POST /api/integration/token` with
a body of `{ "access_code": "..." }`, so that is the shape the code expects — but whether the
portal still issues an `access_code` (rather than a client id/secret pair) is **not
documented — check portal**. See `PORTAL_QUESTIONS.md` Q6.

| Portal value | → variable | Secrecy |
|---|---|---|
| gateway base URL | `EREPORT_BASE_URL` | re-viewable |
| `access_code` | `EREPORT_ACCESS_CODE` | **SHOWN ONCE** |

---

## Checklist

Tick as you go. Seven of these are one-shot.

**Setup**
- [ ] `cd eBilihan-app/server && cp .env.example .env`
- [ ] `JWT_SECRET` generated with `openssl rand -hex 32`
- [ ] `APP_BASE_URL=http://localhost:5173`
- [ ] `SERVER_BASE_URL=http://localhost:4000`

**1 · eGov SSO**
- [ ] `EGOVPH_BASE_URL`
- [ ] `EGOVPH_PARTNER_CODE`
- [ ] `EGOVPH_PARTNER_SECRET` ← **once**
- [ ] Noted where to register `<APP_BASE_URL>/egovph/sso` (or confirmed it isn't needed yet)

**2 · eMessage**
- [ ] `EMESSAGE_BASE_URL`
- [ ] `EMESSAGE_API_TOKEN` ← **once**

**3 · NationalID – eVerify**
- [ ] `EVERIFY_BASE_URL`
- [ ] `EVERIFY_CLIENT_ID`
- [ ] `EVERIFY_CLIENT_SECRET` ← **once**
- [ ] `EVERIFY_PUBKEY` ← *location undocumented; don't leave the catalog without it*

**4 · Face Liveness**
- [ ] `FACE_LIVENESS_BASE_URL`
- [ ] `FACE_LIVENESS_API_KEY` ← **once**

**5 · eGovPAY**
- [ ] `EGOVPAY_BASE_URL`
- [ ] `EGOVPAY_API_TOKEN` ← **once**, prefixed `test_`
- [ ] `EGOVPAY_SETTLEMENT_TEMPLATE_UUID` ← from **Templates**, not Credentials

**6 · eReport**
- [ ] `EREPORT_BASE_URL`
- [ ] `EREPORT_ACCESS_CODE` ← **once**

**While you're in the portal**
- [ ] Checked each catalog's **Usage** tab for what actually consumes credits (`PORTAL_QUESTIONS.md` Q3)
- [ ] Asked the AI assistant **Q1** and **Q2** — both blocking

---

## You are done when

**1. Every line in `server/.env` has a value.** All 22, with only
`LOAN_LIVENESS_THRESHOLD_PHP` safe to leave blank (it defaults to `1000`):

```bash
cd eBilihan-app/server
grep -c '^[A-Z_]*=$' .env      # expect 0, or 1 if you skipped the threshold
```

**2. The backend starts with no missing-variable warnings.**

```bash
cd eBilihan-app/server
npm run dev
```

A healthy start prints `eBilihan server listening on http://localhost:4000` and **no**
`[config] Missing env var …` lines. Each such warning names a variable you still owe.

**3. Health check passes.**

```bash
curl http://localhost:4000/health
# {"ok":true}
```

**4. eGov SSO answers.** This calls the portal's `check_access`, which is documented as free
and *"never an error"* — a safe, zero-credit readiness probe:

```bash
curl http://localhost:4000/auth/sso/health
# {"ok":true}
```

`{"ok":false}` with a reason means the partner code is unknown, revoked, or **the account is
not approved** — not a code problem. `0 = unknown/revoked code or unapproved account`.

Once all four pass, start the frontend (`SETUP.md`) and sign in with a sandbox account.
