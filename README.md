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
- **eGovPH sign-in** — real eGov SSO. Citizens authenticate inside eGovPH (in-app
  handoff, or the Login as eGov widget) and arrive already signed in; eBilihan has no
  login, registration, or profile screens of its own (see
  [Signing in](#signing-in) below).

## Tech stack

| | |
|---|---|
| Frontend | Vite, React 19, TypeScript, Tailwind CSS v4, Zustand, TanStack Query, Radix UI |
| Mobile shell | Capacitor 8 (Android/iOS) |
| Backend | Express 5 + TypeScript ("BFF" — backend-for-frontend) |
| Auth | eGov SSO (eGovPH-managed identity) exchanged for eBilihan-issued JWT sessions (`jsonwebtoken`) |

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

### 1. Backend

```bash
cd server
npm install
cp .env.example .env   # fill in your eGov API credentials
npm run dev             # http://localhost:4000
```

### 2. Frontend

In a second terminal:

```bash
npm install
cp .env.example .env   # point VITE_API_BASE_URL at the backend above
npm run dev             # http://localhost:5173
```

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

## Signing in

There is no username, no password, and no registration form — eBilihan does not manage
identities. eGovPH does. A citizen reaches the app already authenticated, one of two ways:

1. **In-app handoff.** eGovPH opens eBilihan at `/egovph/sso?exchange_code=<code>`. In a
   browser that is an ordinary navigation; in the native shell the URL arrives as a
   Capacitor deep link and is routed to the same screen.
2. **Login as eGov widget.** eGovPH's own widget renders on the sign-in screen and runs
   its mobile/email → OTP → eGov PIN flow, then hands back an `exchange_code`.

Either way the backend redeems that single-use code
(`POST /api/token` → `POST /api/partner/sso_authentication`) and issues an eBilihan
session. First-time citizens are auto-registered from their eGovPH profile and complete a
one-off onboarding step for their **store name and location** — the only two fields
eGovPH has no concept of. Everything else (name, birthdate, gender, address, email,
mobile) is mirrored read-only from eGovPH and can only be changed there.

**Testing without a real eGovPH account:** the portal provides sandbox citizens
`+639090000001` … `+639090000005`, with a fixed OTP of `123456` and PIN `000000`. No SMS
is actually sent, and these widget calls are free of charge. The eGov SSO catalog page
also has a **Generate exchange code** button that mints a code for a chosen test account,
which can be fed straight to the backend.

## Security model

The mobile app never holds an eGov secret — Vite inlines every `VITE_`-prefixed env var
into the built bundle shipped inside the APK/IPA, so anything sensitive there is
extractable. `server/` exists specifically to hold secrets (eGovPH `partner_secret`,
eVerify `client_secret`, eGovPay's merchant token/HMAC key, eReport's `access_code`) and
expose only narrow, safe endpoints to the app. The two exceptions are eVerify's Face
Liveness Web SDK and eGovPH's Login as eGov widget, which the device talks to directly
per those APIs' own integration guides — neither ever receives a secret.

Even eGovPH's `partner_code` — which its own documentation calls safe to expose in a
browser — is not baked into the bundle. The app fetches it at runtime from
`GET /auth/sso/widget-config`, so rotating a credential is a server-side change rather
than an app rebuild and store re-release.

### The ledger is server-authoritative

No client-supplied value determines financial state:

- **Payment status** is written only from eGovPay's own Check Transaction response. The app
  can ask for a re-check (`POST /orders/:id/refresh-payment`, which takes no body); it
  cannot assert an outcome. eGovPay's status callback is treated as an unauthenticated hint
  from the open internet — it triggers a fresh query to the gateway, and its own payload is
  never trusted, whether or not it turns out to be signed.
- **A borrower's identity on a loan** can only originate from a server-held eVerify match.
  Verification returns an opaque id; the name, PhilSys number and eGovPH uniqid are read
  from that server-side record at loan creation, so a loan cannot be attached to someone
  eVerify never matched.
- **Order totals** are computed from stored product prices, not from figures sent by the app.
- **Complainant identity** on an eReport filing comes from the signed-in owner record,
  itself mirrored read-only from eGovPH — not from the request body.

**Lending policy, stated plainly because it isn't an API rule:** eBilihan declines to record
credit against a borrower under 18, and requires the store owner to pass their own Face
Liveness check for loans at or above `LOAN_LIVENESS_THRESHOLD_PHP` (default ₱1,000). Neither
is imposed by any eGov API — eVerify will happily match a minor. Both are our decisions.

### Credential hygiene

**`credentials.txt` at the repo root holds real credential values and is tracked in git.**
Two things follow from that, and they are independent:

1. **Deleting the file does not remove it from history.** It stays readable via
   `git log -p` and `git show <sha>:credentials.txt`, and in every clone or fork already
   taken. A deletion commit is cosmetic from a security standpoint.
2. **Rewriting history is a separate decision, and is not sufficient on its own.** A purge
   rewrites every commit SHA, breaks existing clones, and requires a force-push — and it
   still cannot un-leak anything already fetched.

So: **treat every value that has ever appeared in that file as compromised and rotate it
in the API Developer Portal**, regardless of what happens to the history. Because the
portal migration requires generating fresh credentials anyway, the practical order is —
generate new credentials → verify all six integrations → revoke the old ones in the
portal → delete the file → *then* decide about history separately.

The root `.gitignore` lists `credentials.txt`, which prevents it being re-added but does
not untrack the existing copy.

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
