# eBilihan

**Where Every Sari-Sari Store Grows Smarter.**

eBilihan is an intelligent POS and digital ledger mobile app for Philippine sari-sari
store owners. It's built with Vite + React + TypeScript, packaged for Android/iOS via
Capacitor, and integrates six eGOV APIs: **eGovPH SSO**, **eMessage**, **eGovPay**,
**NationalID eVerify**, **Face Liveness**, and **eReport**.

## Features

- **POS** — barcode/QR scanning (camera, native ML Kit on device / browser fallback on
  web), cart, checkout, and thermal-style PDF receipts.
- **Product management** — catalogue with starter demo products seeded per store.
- **Digital wallet & loans** — borrower verification via QR scan + real-time face
  liveness check (eVerify), OTP-gated loan agreements with generated PDF contracts.
- **Reports** — submit civic complaints/reports (scam, overpricing, fire, etc.) through
  eReport, with a dedicated region/province/city/barangay picker.
- **eGovPH sign-in** — real eGov SSO: citizens authenticate inside eGovPH and arrive
  already signed in, with no login, registration, or profile screens of eBilihan's own
  (see [Sign-in flow](#sign-in-flow) below).

## Tech stack

| | |
|---|---|
| Frontend | Vite, React 19, TypeScript, Tailwind CSS v4, Zustand, TanStack Query, Radix UI |
| Mobile shell | Capacitor 8 (Android/iOS) |
| Backend | Express 5 + TypeScript ("BFF" — backend-for-frontend) |
| Auth | eBilihan-issued JWT sessions (`jsonwebtoken`), OTP delivered via eMessage |

## Project structure

This is a two-package monorepo:

```
eBilihan-app/
├─ src/           # Capacitor mobile app (Vite + React + TS)
└─ server/        # Express/TypeScript backend-for-frontend (BFF)
```

The backend is **not optional**. It holds every eGov API secret
(`partner_secret`, `client_secret`, API tokens, HMAC signing keys) so they never ship
inside the built mobile bundle — see [Security model](#security-model).

## Getting started

Prerequisites: Node.js 20+, npm.

Frontend and backend have separate `node_modules` and must be installed independently.

Both processes must be running **at the same time**, in two separate terminals, for the
whole time you're testing — the frontend is just a static Vite dev server; every OTP,
login, product, order, wallet, and report call is proxied through the backend. If the
backend isn't running (or has crashed), the frontend shows: *"Can't reach the eBilihan
server. Make sure it's running (cd server && npm run dev) and that VITE_API_BASE_URL
points to it."* — see [Troubleshooting](#troubleshooting) below.

### 1. Backend

```bash
cd server
npm install
cp .env.example .env   # fill in your eGov API credentials
npm run dev             # http://localhost:4000 — leave this terminal running
```

Confirm it actually started: the terminal should print
`eBilihan server listening on http://localhost:4000` with no errors. At minimum,
`EMESSAGE_BASE_URL` and `EMESSAGE_API_TOKEN` must be set to real values for OTP SMS to
send — see [Environment variables](#environment-variables).

### 2. Frontend

In a **second, separate** terminal (don't close the backend one):

```bash
npm install
cp .env.example .env   # point VITE_API_BASE_URL at the backend above
npm run dev             # http://localhost:5173
```

`VITE_API_BASE_URL` must point at wherever the backend from step 1 is actually
reachable:
- Testing in a desktop browser on the same machine: `http://localhost:4000`.
- Testing on a physical phone/emulator over the same Wi-Fi/LAN (needed for camera-based
  barcode/QR scanning, which requires a secure context): use your machine's current LAN
  IP, e.g. `http://192.168.1.23:4000`. This IP can change across reboots or Wi-Fi
  reconnects — if login/API calls stop working, recheck your machine's current IP
  (`ipconfig` on Windows, `ifconfig`/`ip addr` on macOS/Linux) against this value.

### Mobile (Capacitor)

```bash
npm run build                  # build web assets first
npx cap add android            # first-time only
npx cap add ios                # first-time only, macOS + Xcode required
npx cap sync                   # copy web assets + plugins into native projects
npx cap open android           # opens Android Studio
npx cap open ios               # opens Xcode
```

## Environment variables

See `.env.example` (frontend) and `server/.env.example` (backend) for the full,
commented list. Frontend `.env` only ever holds URLs and a public key — real eGov
secrets live in `server/.env` and are never exposed to the client.

## Sign-in flow

eBilihan does not manage identities — eGovPH does. There is no username, no password, no
registration form, and no profile editor, because eGovPH's partner requirements ask
integrated services not to have them.

### How a citizen gets in

**1. In-app handoff (eGovPH's primary path).** eGovPH opens eBilihan at
`/egovph/sso?exchange_code=<code>`. In a browser that's a normal navigation; in the
native shell the OS delivers it as a deep link, which `App.tsx` routes to the same
screen (`SsoCallbackPage`).

**2. Login as eGov widget (the sign-in screen).** eGovPH's own widget renders on
`/login` and runs its mobile/email → OTP → eGov PIN screens using only our
`partner_code`, then hands back an `exchange_code`.

Both converge on `POST /auth/sso/login`, where the backend redeems the single-use code:

```
POST {base}/api/token                       -> access_token   (1 h, free)
POST {base}/api/partner/sso_authentication  -> citizen profile (1 credit)
```

### First sign-in

A citizen we haven't seen before is auto-registered from their eGovPH profile, given the
6 seeded starter products (`server/src/store/db.ts` `seedDemoProducts`), and sent to
**`/onboarding`** to set the only two things eGovPH has no concept of:

| Field | Rule |
|---|---|
| Store Name | required, 2–60 characters |
| Location | required — Region → Province → City/Municipality → Barangay |

There's also an optional face-liveness check on that screen, which is what exercises the
standalone Face Liveness API (accepted only at `status: "SUCCEEDED"` and a confidence
score of 95.0 or above, enforced server-side).

Returning citizens are matched by `uniqid`, falling back to name + birthdate — after
which the `uniqid` is bound to that owner so later sign-ins take the fast path.

### Testing without a real eGovPH account

The portal provides sandbox citizens with fixed credentials — no SMS is sent, and these
widget calls are free of charge:

| Username | OTP | PIN |
|---|---|---|
| `+639090000001` … `+639090000005` | `123456` | `000000` |

The eGov SSO catalog page also has a **Generate exchange code** button that mints a
single-use code for a chosen test account, which can be posted straight to
`/auth/sso/login` without any eGovPH round-trip.

### What eBilihan still sends an OTP for

Exactly one thing: **confirming a loan** (`routes/loans.ts`). That's a second factor over
recording money against a verified borrower, not an identity check, so it doesn't
conflict with the above. eReport's email OTP is likewise eReport's own, and unlocks only
report *reading*.

### Troubleshooting

- **"Can't reach the eBilihan server..."** — the backend isn't running, crashed, or
  `VITE_API_BASE_URL` points somewhere unreachable. Confirm `cd server && npm run dev`
  is running in its own terminal and printed `eBilihan server listening on
  http://localhost:4000` with no errors, and that `VITE_API_BASE_URL` matches how you're
  accessing the backend (see [Getting started](#getting-started)).
- **The eGovPH sign-in widget doesn't render** — check `GET /auth/sso/health`. It calls
  eGov SSO's `check_access`, which is free and never errors: `{ ok: false }` means the
  `partner_code` is unknown, revoked, or the portal account isn't approved yet.
- **"This eGovPH sign-in link has expired"** — an `exchange_code` is single-use and
  short-lived. Redeeming the same one twice returns 422, so this is expected on a page
  refresh or a browser back-navigation; start the sign-in again.
- **`403 forbidden` from eGov SSO** — bad or revoked `EGOVPH_PARTNER_SECRET`, or an
  unapproved portal account. Regenerating the credential revokes the previous one (the
  portal allows one active credential per developer), so don't do it mid-demo.
- **`429 quota_exceeded`** — the portal account is out of credits. Even calls documented
  as free require a non-zero balance; ask an administrator for a top-up.
- **An SMS never arrives, though the API returned success** — eMessage's
  `POST /messaging/v1/sms/push` returns `{"data":{"message":"SMS was successfully
  created."}}` for **any** valid number, including ones it never delivers to; some
  gateway credentials only guarantee delivery to pre-registered test numbers. The server
  logs the full response body for exactly this reason (`server/src/lib/emessage.ts`).
  Check whether a sandbox whitelist applies to the `EMESSAGE_API_TOKEN` in use before
  assuming the app is at fault. Note this no longer affects sign-in — eGovPH sends that
  OTP itself — but it does affect loan confirmations and loan-agreement notifications.

## Security model

The mobile app never holds an eGov secret — Vite inlines every `VITE_`-prefixed env var
into the built bundle shipped inside the APK/IPA, so anything sensitive there is
extractable. `server/` exists specifically to hold secrets (eGovPH `partner_secret`,
eVerify `client_secret`, eGovPay's merchant token/HMAC key, eReport's `access_code`) and
expose only narrow, safe endpoints to the app. The two exceptions are eVerify's Face
Liveness Web SDK and eGovPH's Login as eGov widget, which the device talks to directly
per those APIs' own integration guides — neither ever receives a secret.

Even eGovPH's `partner_code` — documented as safe to expose in a browser — isn't baked
into the bundle: the app fetches it from `GET /auth/sso/widget-config` at runtime, so
rotating a credential is a server-side change rather than an app rebuild and re-release.

### The ledger is server-authoritative

No client-supplied value determines financial state. Payment status is written only from
eGovPay's Check Transaction response (the app can request a re-check, not assert an
outcome, and eGovPay's callback is re-confirmed against the gateway rather than trusted).
A borrower's identity on a loan comes only from a server-held eVerify match, addressed by
an opaque verification id. Order totals are computed from stored product prices. eReport
complainant identity is read from the signed-in owner record.

**Lending policy, flagged because it is not an API rule:** loans are declined for borrowers
under 18, and loans at or above `LOAN_LIVENESS_THRESHOLD_PHP` (default ₱1,000) require the
store owner's own Face Liveness check. No eGov API imposes either — eVerify will match a
minor perfectly happily. These are eBilihan's decisions, not a misread spec.

See the root `README.md` > **Credential hygiene** for the `credentials.txt` situation and
what has to be rotated.

## Deployment

- **Frontend** → Vercel (`vercel.json` included).
- **Backend** → Render (`render.yaml` included).

Set each service's environment variables in its respective dashboard (Vercel /
Render) — `.env` files are gitignored and never committed.

## Commands reference

### Frontend
```
npm run dev       # Vite dev server
npm run build      # tsc -b && vite build -> dist/
npm run lint       # oxlint
npm run preview    # preview a production build
```

### Backend
```
npm run dev        # tsx watch src/index.ts
npm run build       # tsc -p tsconfig.json
npm run start       # node dist/index.js (run build first)
```
