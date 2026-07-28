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
  round-trip (see [Demo / test sign-in](#demo--test-sign-in) below).

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

## Demo / test sign-in

There's no username/password — sign-in is OTP-based, targeting a demo mobile number
(standing in for a real eGovPH SSO identity, since login doesn't yet do a full SSO
round-trip). The number is configurable via env var and **must match exactly** between
frontend and backend:

- `VITE_DEMO_MOBILE_E164` (frontend `.env`)
- `DEMO_MOBILE_E164` (`server/.env`)

On first login, a demo store auto-provisions under that number with sample products
already seeded, so testing can start immediately.

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
