# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

eBilihan — "Where Every Sari-Sari Store Grows Smarter" — an intelligent POS and digital
ledger mobile app for Philippine sari-sari store owners, built with Vite + React +
TypeScript, packaged for Android/iOS via Capacitor, and integrating six eGOV APIs
(eGovPH SSO, eMessage, eGovPay, NationalID eVerify, Face Liveness, eReport).

This is a two-package monorepo, not a single app:

- **`/` (root)** — the Capacitor mobile app (Vite + React + TS + Tailwind v4 + Zustand + React Query).
- **`/server`** — a small Express/TypeScript backend-for-frontend (BFF) that holds every
  eGov API secret and proxies requests for the mobile app. **It is not optional** — see
  Security model below.

Ground truth for every eGov endpoint used here is
`eBilihanReference/eGOV API/**/*.png` (screenshots of each API's docs/integration pages)
and `eBilihanReference/eGOV API/API Credentials.png` (the exact credential field names).
When extending an integration, re-read the relevant screenshot rather than guessing —
several of these APIs have non-obvious contracts (see "API contracts" below) and this
file cannot cover every field.

## Commands

### Frontend (`/`)
```
npm run dev       # Vite dev server, http://localhost:5173
npm run build     # tsc -b && vite build -> dist/
npm run lint      # oxlint
npm run preview   # preview a production build
```

### Backend (`/server`)
```
npm run dev       # tsx watch src/index.ts, http://localhost:4000
npm run build     # tsc -p tsconfig.json -> dist/
npm run start     # node dist/index.js (run build first)
```
Both frontend and backend have their own `node_modules` and must be
`npm install`ed independently. There is no root-level script that runs both — start
the backend first, then the frontend, in two terminals.

### Mobile (Capacitor)
```
npm run build                  # build the web assets first
npx cap add android            # first-time only
npx cap add ios                # first-time only, macOS + Xcode required
npx cap sync                   # copy web assets + plugins into native projects
npx cap open android           # opens Android Studio
npx cap open ios               # opens Xcode
```
There is no test suite configured (no test runner installed in either package). Don't
invent test commands — if adding tests, install a runner first and add the script here.

## Security model — read before touching auth/payments/verify code

**The mobile app never holds an eGov secret.** Vite inlines every `VITE_`-prefixed env
var into the built web bundle at build time, and that bundle ships inside the compiled
APK/IPA — anyone can unzip it and read those strings. Several of these APIs return
secrets that must never be client-side:

- eGovPH: `partner_secret` (docs literally say "never expose it on the client side")
- eVerify: `client_secret`
- eGovPay: the merchant API token, which is also an HMAC signing key (see below)
- eReport: `access_code` / the integration `access_token` it mints

So `/server` exists specifically to hold these and expose only safe, narrow endpoints
to the mobile app. **`src/api/*.ts` on the frontend calls `/server`, never an eGov base
URL directly** (the one exception is eVerify's Face Liveness Web SDK, a client-side
script the borrower's device talks to directly — see below). If you're asked to "call
the eGov API directly from the app," push back and route it through `/server` instead,
unless the value in question is explicitly public (see `EVERIFY_PUBKEY`).

`/server` itself currently has no real persistence (see `server/src/store/db.ts` — an
in-memory `Map`, wiped on restart) and issues its own JWT session tokens
(`server/src/lib/session.ts`) distinct from any upstream eGov token. Swapping in a real
database means changing `store/db.ts`'s internals only; the route handlers shouldn't need
to change.

## Architecture

```
Capacitor mobile app (this repo, /)
  │  Authorization: Bearer <ebilihan session JWT>
  ▼
eBilihan backend (/server)
  │  holds partner_secret / client_secret / API tokens; computes eGovPay's HMAC digest
  ▼
eGov APIs (eGovPH, eVerify, eMessage, eGovPay, eReport)
```

Exception: the borrower's device talks **directly** to eVerify's Face Liveness Web SDK
domain during loan verification (a `<script>` tag, per eVerify's own integration guide) —
only the resulting `session_id` (never a secret) flows back through `/server`.

### Frontend layout
- `src/api/*` — one file per backend resource (`auth.ts`, `products.ts`, `orders.ts`,
  `payments.ts`, `verify.ts`, `loans.ts`, `wallet.ts`, `reports.ts`), each a thin axios
  wrapper around `/server`'s routes. `src/api/client.ts` holds the shared axios instance
  and attaches the session JWT from `@capacitor/preferences` to every request.
- `src/lib/everifyFaceLiveness.ts` — loads eVerify's Face Liveness Web SDK
  (`window.eKYC().start()`) and is the one place that talks to an eGov domain directly
  from the frontend.
- `src/lib/receipt.ts` / `src/lib/loanAgreementPdf.ts` — PDF generation. The receipt uses
  jsPDF's text API directly (simple, thermal-receipt-shaped); the loan agreement renders
  a styled off-screen DOM node and rasterizes it with html2canvas before embedding in
  jsPDF (richer letterhead-style formatting). Don't collapse these into one approach —
  they're intentionally different for different documents.
- `src/store/*` — Zustand stores: `authStore` (session + owner; `hydrate()` re-verifies
  against `GET /auth/me` on every app boot rather than trusting a cached owner object —
  see "Auth resets on backend restart" below), `cartStore` (POS cart, in-memory only).
- `src/features/*` — one folder per module (auth, home, pos, products, wallet, reports);
  the Wallet module's loan verification flow (`features/wallet/LoanVerificationFlow.tsx`)
  and the POS view (`features/pos/POSView.tsx`) are the two most fully-worked examples —
  follow their patterns for new features rather than the simpler CRUD pages.
- `src/components/layout/` — `PhoneFrame.tsx` (device bezel when `!Capacitor.isNativePlatform()`,
  so the app is reviewed at actual mobile width in a desktop browser instead of
  stretching full-width — see "Testing in a desktop browser" below), `AppShell.tsx`
  (header + outlet + nav), `BottomNav.tsx` (5 tabs: Home, Product, **Order** — raised
  circular center button, the primary action — Wallet, Report). Structural pattern
  (not colors) ported from the ebilihan-hackathon prototype's own layout components.
- `src/components/shared/LocationPicker.tsx` — cascading Region/Province/City/Barangay
  picker (PSGC Cloud), used by both registration and the Reports form.
- `src/components/ui/*` — hand-built shadcn/ui-style primitives (Button, Card + `StatTile`
  KPI tile, Input, Label, Badge, Dialog, `OtpInput` — 6 separate digit boxes) on Radix +
  CVA + Tailwind. **The shadcn CLI was never run** (it needs interactive prompts this
  environment couldn't satisfy) — these are manually authored equivalents. Add further
  primitives the same way rather than trying to run `npx shadcn add` here.

### Testing in a desktop browser

`PhoneFrame` only draws a bezel outside a native Capacitor shell — on an actual
device/emulator (`Capacitor.isNativePlatform()` true) it's a plain full-bleed
container, so this is purely a dev-time aid, not a production layout constraint.

### Auth resets on backend restart

`server/src/store/db.ts` is in-memory — a backend restart wipes every `StoreOwner`. A
JWT that's still cryptographically valid can therefore point at an owner that no
longer exists. `requireAuth` (`server/src/middleware/requireAuth.ts`) checks
`owners.has(payload.ownerId)` and 401s if not; `src/api/client.ts`'s response
interceptor clears the stored token and hard-redirects to `/login` **only** when the
failing request actually carried a bearer token (so a wrong-OTP 401 on the public
`/auth/login/otp/confirm` / `/auth/register/confirm` endpoints just shows an inline
error instead of forcing a redirect mid-flow). `authStore.hydrate()` calls
`GET /auth/me` on every app boot so this is caught immediately, not just on the first
failed data fetch.

### Backend layout (`/server/src`)
- `config.ts` — every env var, one block per eGov product, matching the field names
  shown in `eBilihanReference/eGOV API/API Credentials.png` exactly (`partner-code`,
  `client-id`/`client-secret`/`pubkey`, `access-token`, `api-key`,
  `settlement-template-uuid`, `access-code`).
- `lib/httpClients.ts` — one axios instance per upstream base URL.
- `lib/tokenCache.ts` — generic memoizer for upstream tokens that expire (eVerify's
  `access_token`, eReport's integration `access_token`); both are cached in-process and
  refetched ~60s before expiry.
- `lib/egovchain.ts` — **a stub, not a real integration.** See "eGovchain" below.
- `routes/*` — one file per resource, each mounted in `index.ts`. Every route except
  `/auth/*` (and `/locations/*`, also pre-auth) requires `requireAuth` (validates
  eBilihan's own JWT *and* that the owner it names still exists — see "Auth resets on
  backend restart" above).
- `routes/locations.ts` — proxies PSGC Cloud (public, unauthenticated, unrelated to the
  eGOV APIs suite — see "Location picker" below).
- `store/db.ts` — in-memory data (owners, products, orders, loans). `seedDemoProducts(ownerId)`
  gives every newly created store six starter products (with emoji `thumbnail`s) instead
  of a blank catalogue — called from both `register/confirm` and the login
  auto-provision path in `routes/auth.ts`. Replace with a real DB when this goes past MVP.

## API contracts (grounded in eBilihanReference — do not re-derive from memory)

Every integration below was read directly from the screenshots in
`eBilihanReference/eGOV API/`. Re-check the relevant screenshot before changing a
request/response shape — some of these are easy to get subtly wrong from memory:

- **eGovPH SSO**: `POST {base}/api/token` (`exchange_code`, `scope: "SSO_AUTHENTICATION"`,
  `partner_code`, `partner_secret`) → `access_token`, then
  `POST {base}/api/partner/sso_authentication` (Bearer) → citizen profile (`uniqid`,
  `email`, `mobile`, name fields, `address`, `photo`, ...). **There is no "create
  account" endpoint** — SSO only resolves an existing eGovPH identity. eBilihan's
  "registration" is really "link an eGovPH identity to a new eBilihan store profile";
  see `server/src/routes/auth.ts`. **Neither login nor registration currently uses this
  path** — see "Login AND registration currently use a hardcoded demo eGovPH identity"
  under Deviations below.
- **eMessage**: one endpoint, `POST {base}/messaging/v1/sms/push` (header
  `X-EMESSAGE-Auth`, body `{ number, message }`). It is a raw SMS sender with **no OTP
  concept of its own** — all OTP generation/expiry/verification (for both registration
  and login) is homegrown (`server/src/store/db.ts` `pendingOtps` + `routes/auth.ts`),
  and eMessage is only used to deliver the text.
- **eGovPay**: `POST {base}/api/v1/transaction` (header `X-eGovPay-Token`) needs a
  `digest` field: `hash_hmac('sha256', "$amount|$txnid", $token)` — i.e. HMAC-SHA256
  keyed by the merchant token, over the string `"{amount}|{txnid}"`. This is why
  eGovPay calls **must** happen server-side (see `server/src/routes/payments.ts`
  `computeDigest`). Also `GET {base}/api/v1/transaction/{uuid}` and
  `PUT {base}/api/v1/transaction/{uuid}/void`. Use a `test_`-prefixed token while
  integrating so no live funds move (per eGovPay's own docs).
- **NationalID eVerify**: `POST {base}/api/auth` (`client_id`, `client_secret`) →
  `access_token`. Then either:
  - `POST {base}/api/query` — demographics + `face_liveness_session_id` → full match
    (`Verify Personal Information`)
  - `POST {base}/api/query/qr/check` — QR value only, decode without biometric match
  - `POST {base}/api/query/qr` — QR value + `face_liveness_session_id` → full match
    (`QR Verify`) — **this is what the Loan Management flow uses**
  - A matched response has `data.code === "AAA001"`; anything else (e.g. face mismatch)
    must block the action gating on it. See `server/src/routes/loans.ts`
    `verify-borrower`.
- **Two separate "Face Liveness" things — do not conflate them:**
  1. **eVerify's own embedded Face Liveness Web SDK** (client-side `<script>` from
     `hackathon-everify-face-liveness.e.gov.ph`, `window.eKYC().start({ pubKey })`) —
     its `pubkey` credential is listed *under eVerify* in the credentials dialog, not
     under "Face Liveness". Its `result.session_id` is what eVerify's own `/api/query*`
     endpoints expect as `face_liveness_session_id`. **This is the one the Loan
     Management borrower-verification flow uses** (`src/lib/everifyFaceLiveness.ts`),
     because it's the flow eVerify's own docs describe end-to-end.
  2. **A standalone "Face Liveness" REST product** (`POST {base}/v1/liveness/session`,
     `GET {base}/v1/liveness/result/{sessionToken}`, header `x-api-key`, its own
     separate credential). Its session tokens are a different namespace from
     eVerify's SDK sessions — don't try to feed one into the other. Wired up in
     `server/src/routes/liveness.ts` as a general-purpose utility (e.g. a possible
     future owner-onboarding liveness check), but nothing in the current UI calls it.
     The recommended security threshold from its own docs: reject anything below a
     `confidence_score` of `95.0`, or a `status` other than `"SUCCEEDED"`.
- **eReport**: `POST {base}/api/integration/token` (`access_code`) → short-lived
  `access_token`, used as Bearer for `submit_complaint`, `verify/request` (email OTP),
  `verify/confirm` (returns a **separate** `report_view_token`, header
  `X-EReport-View-Token`, needed only for `GET /reports` and
  `GET /reports/{case_number}` — submitting a complaint does not need it).
  `src/features/reports/ReportsPage.tsx` gets its Region/Province/Municipality/Barangay
  codes from the shared `LocationPicker` (PSGC Cloud — see below), **not** from
  eReport's own `Region/Province/Municipality/Barangay List` dataset endpoints (still
  unwired — their request/response shape was never captured). Its category dropdown's
  `report_type` values (`crime`, `scam`, `fraud`, `extortion`, `other`) are a **best
  guess** too: eReport's own `Report Type List` dataset (which would enumerate the real
  accepted codes) was named in the reference screenshots' sidebar but never opened, so
  only `"crime"` is directly confirmed from the Submit Complaint example. If eReport
  rejects a category, that surfaces as a real (not faked) error via `lib/apiError.ts`.

## eGovchain — explicitly not a real integration

The brief calls for "blockchain logging" via "eGovchain" for order transactions and for
the Expense Tracker to read that ledger back. **`eBilihanReference/` contains no
eGovchain documentation at all** — no folder, no screenshots, no base URL, no auth
scheme, unlike every other integration above. `server/src/lib/egovchain.ts` is a
hash-chained in-memory stand-in (clearly commented as such) so the rest of the app has
something to call. Do not present it as a real integration in docs, demos, or future
code — replace its internals (only) once real eGovchain API docs exist.

## Deviations from the original project brief, and why

- **`@capacitor-community/barcode-scanner` → `@capacitor-mlkit/barcode-scanning`.** The
  originally-specified package is pinned to Capacitor 5 and effectively unmaintained;
  installing it alongside Capacitor 8 (current) produces broken peer-dependency
  conflicts. ML Kit is the actively maintained successor. See
  `src/hooks/useBarcodeScanner.ts`.
- **A backend was added even though the brief only specified a frontend stack.** Not
  optional — see Security model above. `/server` is a small Express app, not a
  full framework choice; if the team already has backend infra/conventions elsewhere,
  port these route handlers into that instead of standing up a second Node service.
- **eGovPH "Registration" is not a real eGovPH endpoint.** See the eGovPH bullet above.
- **Login AND registration currently use a hardcoded demo eGovPH identity, not a real
  SSO round-trip.** The exact URL to open for eGovPH's SSO login/authorize redirect (to
  obtain the initial `exchange_code`) was **not** captured — only eGovPH's
  API-documentation tab was reviewed, not its Integration tab. Rather than block on
  that:
  - `GET /auth/egovph/demo-profile` (`server/src/routes/auth.ts`,
    `DEMO_EGOVPH_PROFILE`) returns a fixed profile (name/email/mobile) standing in for
    what a real `resolveEgovphProfile(exchangeCode)` call would return. Both
    "Login via eGovPH SSO" and registration's "Continue with eGovPH" button call this.
  - **Login**: no mobile-number input — it always targets the demo profile's number
    (`DEMO_MOBILE_E164` in `src/lib/demoIdentity.ts`, currently `+639060585188`) via
    `POST /auth/login/otp/start` / `/otp/confirm`, landing on a 6-box `OtpInput`
    (`src/components/ui/otp-input.tsx`). Only works once a store has actually been
    registered with that number.
  - **Registration**: "Continue with eGovPH" fetches the demo profile (with an
    artificial ~900ms delay so it reads as a real fetch), then shows a "eGovPH Identity
    Verified" panel with the (read-only) verified name/email, an editable Store Name,
    and the Location picker (see below) before sending the OTP — no exchange-code
    paste field anymore.
  - The real-SSO code path (`Browser.open(VITE_EGOVPH_AUTHORIZE_URL)`, and
    `resolveEgovphProfile`/`POST /auth/sso/login` server-side) is untouched and takes
    over automatically once `VITE_EGOVPH_AUTHORIZE_URL` is set — but resuming
    afterward needs a deep-link listener to catch the returned `exchange_code`, which is
    **not built yet**. Swap `DEMO_EGOVPH_PROFILE`/`fetchEgovphDemoProfile()` back for
    the real resolution once that URL and listener exist.
- **Dark mode was removed on request** — the app is light-theme only
  (`src/index.css` has no `prefers-color-scheme: dark` block, and `dark:` variants were
  stripped from `components/ui/*`). Don't reintroduce `dark:` classes without being asked.

## Location picker — PSGC Cloud (not an eGov API)

Registration's Location step (Region → Province → City/Municipality → Barangay) is
backed by **PSGC Cloud** (`https://psgc.cloud/api`), a free public REST API for the
Philippine Standard Geographic Code — unrelated to the eGOV APIs suite, added because
the user asked for "a PSGC-like API" and eReport's own dataset endpoints (`Region List`,
`Province List by Params`, etc.) were never captured in the reference screenshots (only
their names appeared in a sidebar, not their request/response shape).

Verified live by fetching it directly (2026-07-28), since nothing in
`eBilihanReference/` covers it:
- `GET /regions` → `[{ name, code }]`, all 17 regions, no params, no auth.
- `GET /regions/{regionCode}/provinces` → provinces in that region (path-nested, **not**
  a `?region_code=` query filter — that param is silently ignored and returns
  everything).
- `GET /provinces/{provinceCode}/cities-municipalities` → cities + municipalities in
  that province (`type: "City" | "Mun"`).
- `GET /cities-municipalities/{cityCode}/barangays`.

Proxied through `server/src/routes/locations.ts` (unauthenticated — registration happens
before a session token exists) and consumed by `src/components/shared/LocationPicker.tsx`
+ `src/api/locations.ts`. `StoreOwner.location` (`server/src/store/db.ts` /
`src/types/index.ts`) captures the full chain (codes + names) — this could later prefill
`ReportsPage`'s region/province/municipality/barangay code fields for eReport
`submit_complaint`, since both need the same PSGC codes, though that reuse isn't wired
up yet.

## Brand

Colors and logo come from `eBilihanReference/eGov Main Colors.png` /
`eGov Light Colors.png` / `eBilihan-Logo.png`, wired up as Tailwind v4 theme tokens in
`src/index.css` (`brand-blue #0241E8`, `brand-red #A80E13`, `brand-gold #E9C400`,
`brand-ink #2E353B`, plus light tints) — use `bg-brand-*` / `text-brand-*` utilities
rather than hardcoding hex values.
