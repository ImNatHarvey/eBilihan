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
- **eGovPH-linked sign-in** — OTP-based login/registration standing in for a full SSO
  round-trip. Login works with **any** PH mobile number, not just a fixed demo one —
  see [Sign-in flow](#sign-in-flow) below.

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

There's no username/password — sign-in is OTP-based over SMS, standing in for a real
eGovPH SSO identity (login doesn't yet do a full SSO round-trip).

### Login (any mobile number)

1. Tap **"Login via eGovPH SSO"**.
2. Enter **any** valid PH mobile number (`09XXXXXXXXX` or `+639XXXXXXXXX` — both
   formats are accepted and normalized automatically) and tap **Send OTP**.
3. A 6-digit code is sent by SMS via eMessage to that exact number.
4. Enter the code and tap **Verify & Sign In**.

There is no restriction to a single hardcoded number — this works for any evaluator's
own real phone. On the **first** successful OTP verification for a given number, a
brand-new store auto-provisions **instantly**: a placeholder owner profile, a default
store name, and the same 6 seeded starter products every store gets
(`server/src/store/db.ts` `seedDemoProducts`). No separate registration step is
required. Logging in again later with the same number signs back into that same store
(it won't re-seed or duplicate products).

### Register ("New store? Register here")

A separate flow, unchanged: it fetches a stand-in eGovPH profile
(`GET /auth/egovph/demo-profile` — not real SSO, see the doc comments in
`server/src/routes/auth.ts`), lets you set a real Store Name and pick a Location
(Region/Province/City/Barangay), then OTPs that profile's mobile number before
creating the store.

### Remaining demo-number env vars

`VITE_DEMO_MOBILE_E164` (frontend `.env`) / `DEMO_MOBILE_E164` (`server/.env`) still
exist, but **no longer gate login**. They now only affect:
- The Register flow's stand-in eGovPH profile (`DEMO_EGOVPH_PROFILE.mobile`).
- The Loan-verification demo flow's borrower/OTP number
  (`LoanVerificationFlow.tsx`).

### Troubleshooting

- **"Can't reach the eBilihan server..."** — the backend isn't running, crashed, or
  `VITE_API_BASE_URL` points somewhere unreachable. Confirm `cd server && npm run dev`
  is running in its own terminal and printed `eBilihan server listening on
  http://localhost:4000` with no errors, and that `VITE_API_BASE_URL` matches how you're
  accessing the backend (see [Getting started](#getting-started)).
- **OTP request succeeds, but the SMS never arrives on a given number** — this is a
  known limitation of the current eMessage API credential, not an app bug. eMessage's
  `POST /messaging/v1/sms/push` returns `{"data":{"message":"SMS was successfully
  created."}}` for **any** valid number, including ones it never actually delivers to —
  some SMS-gateway credentials only guarantee real delivery to a small set of
  pre-registered/whitelisted test numbers even though the API itself accepts every
  request. If evaluators report OTPs never arriving, check with eGovPH/hackathon
  organizers about lifting any sandbox/whitelist restriction on the `EMESSAGE_API_TOKEN`
  in use, rather than assuming the login code itself is broken.

## Security model

The mobile app never holds an eGov secret — Vite inlines every `VITE_`-prefixed env var
into the built bundle shipped inside the APK/IPA, so anything sensitive there is
extractable. `server/` exists specifically to hold secrets (eGovPH `partner_secret`,
eVerify `client_secret`, eGovPay's merchant token/HMAC key, eReport's `access_code`) and
expose only narrow, safe endpoints to the app. The one exception is eVerify's Face
Liveness Web SDK, which the borrower's device talks to directly per eVerify's own
integration guide.

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
