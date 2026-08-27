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

Ground truth for every eGov endpoint used here is `eBilihanReference/eGOV API/**/*.pdf` —
saved pages from the DICT **API Developer Portal** (`platforms.e.gov.ph`), one folder per
API. Read them with `pdftotext -layout "<file>.pdf" -` rather than opening them as images.
When extending an integration, re-read the relevant PDF rather than guessing — several of
these APIs have non-obvious contracts (see "API contracts" below) and this file cannot
cover every field.

> The portal replaced an earlier set of per-product hosts; every legacy base URL and
> credential is dead. Base URLs are now issued **with** each credential and are not
> documented anywhere else — see "API contracts" below.

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
- `src/lib/everifyFaceLiveness.ts` and `src/lib/egovLoginWidget.ts` — the only two places
  the frontend talks to an eGov domain directly, both by design: eVerify's Face Liveness
  Web SDK (`window.eKYC().start()`) and eGovPH's Login as eGov widget
  (`EgovLogin.render()`). Neither ever sees a secret.
- `src/features/auth/` — `LoginPage.tsx` (the eGovPH handoff, and the whole of sign-in),
  `SsoCallbackPage.tsx` (`/egovph/sso?exchange_code=...`), `OnboardingPage.tsx` (store
  name + location, first sign-in only).
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
  picker (PSGC Cloud), used by onboarding. **Reports uses a different one** —
  `features/reports/ReportLocationPicker.tsx`, on eReport's own incompatible code system.
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

Every integration below was read directly from the PDFs in
`eBilihanReference/eGOV API/**/*.pdf` (the DICT API Developer Portal at
`platforms.e.gov.ph`). Extract them with `pdftotext -layout <file>.pdf -` and re-read the
relevant one before changing a request/response shape — several of these are easy to get
subtly wrong from memory.

**Base URLs are per-credential.** Each API's gateway base URL is issued together with its
credential on that catalog's Credentials tab and appears nowhere else — not in the docs,
not in any dialog afterwards. Every `{base}` below comes from an env var for that reason;
never hardcode one.

- **eGov SSO**: two calls. `POST {base}/api/token` (`exchange_code`,
  `scope: "SSO_AUTHENTICATION"`, `partner_code`, `partner_secret`) → `access_token`
  (valid 1 hour, free), then `POST {base}/api/partner/sso_authentication` (Bearer, empty
  body) → citizen profile (`uniqid`, `email`, `mobile`, `birth_date`, `gender`, split
  name fields, `address`, `photo`, ...). **1 credit per profile fetch** — the only charge
  the portal documents anywhere.
  **There is no authorize/redirect URL and never was.** eGovPH launches an integrated
  service by opening *your* base URL with `?exchange_code=...` appended
  (`https://<app>/egovph/sso?exchange_code=...` → `SsoCallbackPage`), or the citizen
  authenticates in the **Login as eGov widget**
  (`widgets.e.gov.ph/v1.0.0/egov-login.min.js`, `src/lib/egovLoginWidget.ts`), which runs
  eGovPH's own mobile/email → OTP → PIN screens using only `partner_code` and hands back
  an `exchange_code`. Both converge on `POST /auth/sso/login`. The code is **single-use
  and short-lived** — redeem immediately, and never redeem twice (StrictMode will try).
  Appendix A documents the four calls the widget makes (`check_access`, `otp_generate`,
  `otp_validate`, `authenticate`), all free; only `check_access` is used directly here,
  as a health probe. Sandbox accounts `+639090000001`…`5`, OTP `123456`, PIN `000000`.
  **There is no "create account" endpoint** — SSO resolves an identity; eBilihan
  auto-registers a store owner from the returned profile on first sign-in.
- **eMessage**: one endpoint, `POST {base}/messaging/v1/sms/push` (header
  `X-EMESSAGE-Auth`, body `{ number, message }`, 201 on success). It is a raw SMS sender
  with **no OTP concept of its own**. Sign-in no longer uses it — eGovPH runs that OTP.
  What remains is the loan-confirmation code (`pendingOtps` in `server/src/store/db.ts` +
  `routes/loans.ts`) and the loan-agreement notification.
- **eGovPay**: `POST {base}/api/v1/transaction` (header `X-eGovPay-Token`) needs a
  `digest` field: `hash_hmac('sha256', "$amount|$txnid", $token)` — i.e. HMAC-SHA256
  keyed by the merchant token, over the string `"{amount}|{txnid}"`. This is why
  eGovPay calls **must** happen server-side (see `server/src/routes/payments.ts`
  `computeDigest`). Also `GET {base}/api/v1/transaction/{uuid}` and
  `PUT {base}/api/v1/transaction/{uuid}/void`. Use a `test_`-prefixed token while
  integrating so no live funds move (per eGovPay's own docs).
  `redirect_url` and `callback_url` are both required and both typed `url` — they are
  built server-side from `APP_BASE_URL` / `SERVER_BASE_URL` (`routes/payments.ts`), not
  passed up from the app, because a custom scheme like `ebilihan://` is not a URL the
  gateway accepts and the app cannot know the backend's public origin.
  `POST /payments/webhook` receives the status callbacks; it sits **before** the router's
  `requireAuth` (eGovPay's server carries no session) and authenticates by recomputing
  the same HMAC digest.
- **NationalID eVerify**: `POST {base}/api/auth` (`client_id`, `client_secret`) →
  `data.access_token` + `data.expires_at` (**unix seconds, as a string**). Then either:
  - `POST {base}/api/query` — demographics (`first_name`, `last_name`, `birth_date`
    required; `middle_name`, `suffix` optional) + `face_liveness_session_id`
    (`Verify Personal Information`)
  - `POST {base}/api/query/qr/check` — QR value only, decode without biometric match
  - `POST {base}/api/query/qr` — QR value + `face_liveness_session_id` (`QR Verify`)
  - **The documented response shape is wrong — do not match on it.** The docs show
    `data.code` as `AAA001` (QR Verify) / `AAA000` (Verify Personal Information). Neither
    value has ever been observed live. Two runs against the live gateway (2026-08-26):

    |                     | mismatch (other person's ID) | match (own ID + own face) |
    |---------------------|------------------------------|---------------------------|
    | `data.code`         | absent                       | `FOJ3128`                 |
    | `data.verified`     | `false`                      | absent                    |
    | `meta.result_grade` | `0`                          | `1`                       |
    | identity fields     | none                         | full PhilSys record       |

    So `server/src/routes/loans.ts` (`recordVerification`) decides from the **observed
    shape**, not the docs: four conjunctive clauses — `verified !== false`; `result_grade`
    not a failure (string not beginning `FAILED`, number `>= 1`, `0` a hard fail); `code`
    a non-empty string (**presence only, never a specific value** — `FOJ3128` proves the
    vocabulary is larger than documented, so enumerating success codes is impossible); and
    `full_name` a non-empty string. Every clause is a positive requirement, so an
    unfamiliar response fails closed. **Do not loosen any clause without a live
    observation**, and do not reintroduce a matched-code allowlist.
- **Two separate "Face Liveness" things — do not conflate them:**
  1. **eVerify's own embedded Face Liveness Web SDK** (client-side `<script>` from
     `hackathon-everify-face-liveness.e.gov.ph`, `window.eKYC().start({ pubKey })`) —
     its `pubkey` credential is listed *under eVerify* in the credentials dialog, not
     under "Face Liveness". Its `result.session_id` is what eVerify's own `/api/query*`
     endpoints expect as `face_liveness_session_id`. Confirmed live (2026-07) that the
     script is real and its `.start()` opens a full-screen iframe
     (`https://liveness.everify.gov.ph/?t=basic&...`) — but it throws synchronously if
     `pubKey` is blank, which silently aborted the Loan flow back to square one before
     this was diagnosed (fixed by fetching the pubKey from `GET /verify/pubkey` instead
     of assuming it's present client-side). Note the portal's Variables panel labels this
     credential `public_api_key`; our env var is `EVERIFY_PUBKEY`.
     `src/lib/everifyFaceLiveness.ts` wraps it and **is called live** by
     `LoanVerificationFlow.tsx`. It **fails closed**: it returns a real `session_id` or it
     throws. A previous version invented `demo-liveness-<timestamp>` after a 20s timeout,
     which eVerify can only ever reject — while making the UI look like the check had
     passed. Don't reintroduce that: a liveness check that can't report its result must
     not report success.
  2. **A standalone "Face Liveness" REST product** (`POST {base}/v1/liveness/session`,
     `GET {base}/v1/liveness/result/{sessionToken}`, header `x-api-key`, its own
     separate credential). Its session tokens are a different namespace from
     eVerify's SDK sessions — don't try to feed one into the other. Used for the store
     owner's own onboarding liveness check (`OnboardingPage.tsx` → `src/api/liveness.ts`).
     Its documented security threshold — `status === "SUCCEEDED"` **and**
     `confidence_score >= 95.0` — is enforced in `server/src/routes/liveness.ts`, which
     returns a `passed` verdict rather than a raw score. Keep that decision server-side:
     a client that only receives `passed` has nothing left to reinterpret.
- **eReport**: `POST {base}/api/integration/token` (`access_code`) → short-lived
  `access_token`, used as Bearer for `submit_complaint`, `verify/request` (email OTP),
  `verify/confirm` (returns a **separate** `report_view_token`, header
  `X-EReport-View-Token`, needed only for `GET /reports` and
  `GET /reports/{case_number}` — submitting a complaint does not need it).
  **eReport has its own region/province/municipality/barangay code list — it is NOT
  PSGC Cloud's codes**, despite both nominally being "PSGC". Confirmed live
  (2026-07-28): `submit_complaint` flatly rejects PSGC Cloud codes ("Region code does
  not exist", etc.) because eReport's codes use different numbering for the same area
  (9-digit `"010000000"` for Region I here vs. PSGC Cloud's 10-digit `"0100000000"`).
  The real dataset endpoints (named in the reference screenshots' sidebar but never
  opened until probed live) are `GET {base}/api/integration/datasets/{regions,
  provinces,municipalities,barangays,report_types}` — `provinces` etc. take a
  `region_code`/`province_code`/`municipality_code` query param and return
  `{ data: [{ id, attributes: { name, ... } }] }` (JSON:API shape). Proxied at
  `server/src/routes/reports.ts` `/datasets/*` and consumed by
  `src/features/reports/ReportLocationPicker.tsx` — **do not** reuse the shared
  `LocationPicker` (PSGC Cloud) for Reports, they are incompatible code systems.
  `report_type` has 12 real confirmed values (`scam`, `gas_station_concerns`,
  `red_tape`, `child_abuse`, `women_abuse`, `OFW_APP`, `overpricing`, `fire`,
  `"Senior Citizen"`, `accident`, `crime`, `illegal_dumping`), fetched live via
  `listReportTypes()` rather than hardcoded.

## eGovchain — explicitly not a real integration

The brief calls for "blockchain logging" via "eGovchain" for order transactions and for
the Expense Tracker to read that ledger back. **`eBilihanReference/` contains no
eGovchain documentation at all** — no folder, no screenshots, no base URL, no auth
scheme, unlike every other integration above. `server/src/lib/egovchain.ts` is a
hash-chained in-memory stand-in (clearly commented as such) so the rest of the app has
something to call. Do not present it as a real integration in docs, demos, or future
code — replace its internals (only) once real eGovchain API docs exist.

## Server-owned fields — read before touching any write endpoint

**A client may set what it is the author of. The server owns everything derived from an
external system's word, or from its own records.** This was violated across five write
paths at once, so treat it as a standing rule rather than a fixed bug.

**Never write `{ ...existing, ...req.body }`.** It was the root cause in four of the five
cases. It silently grants write access to every field the type gains later, including ones
that don't exist yet. Use an explicit allow-list (see `routes/products.ts`
`EDITABLE_PRODUCT_FIELDS`) or an explicit destructure (see `routes/auth.ts` `/onboarding`).

What that means concretely, and why:

- **Payment status is written by eGovPay's Check Transaction response and nothing else.**
  `POST /orders/:id/refresh-payment` takes **no body at all**. The old `PATCH /orders/:id`
  accepted `{ paymentStatus: "paid" }` from any authenticated caller and appended a sale to
  the ledger — the same capability as the "Simulate Payment Success" button that was
  removed from the UI, still live in the API behind it. Deleting a button does not remove a
  capability.
- **Identity never comes from a request body.** A borrower's name reaches a loan only via
  `verifiedBorrowers` (`store/db.ts`), keyed by an opaque `verificationId` minted inside
  `recordVerification` after a real eVerify match. Previously the verified name lived in
  React state and was posted back — which made the entire eVerify gate advisory, since any
  client could POST a loan naming anyone. A gate the client can decline to apply is not a gate.
- **Prices come from the stored product.** `POST /orders` reads `unitPrice` and `name` from
  `products.get(...)`; the request supplies only `productId` and `quantity`. The total that
  enters the ledger must never be a number the caller chose.
- **Complainant identity comes from the owner record**, which is SSO-sourced and read-only.
  Otherwise a session-holder can file an official complaint under an invented identity
  *using our eReport credential*.

The scoping that was already correct and must stay: `requireAuth` checks the owner still
exists, and every route filters on `ownerId`. There is no cross-tenant path — the defects
above were integrity, not confidentiality. Keep it that way.

## Authentication is eGovPH's, not ours — don't add screens back

eGovPH's partner requirements (SSO integration guide, Appendix B) are explicit that an
integrated service must **disable or hide its own login and registration pages, and its
own profile/password management**. Sessions and profile data belong to eGovPH. That is a
scoring criterion, not a stylistic preference.

So, concretely:

- `LoginPage.tsx` is a single eGovPH handoff. There is no mobile-number field, no OTP
  screen, and no registration tab. **Don't add one back**, however convenient — including
  "just for the demo".
- Name, birthdate, gender, address, email and mobile are rendered **read-only** wherever
  they appear (`OnboardingPage.tsx`). They are mirrored from the SSO profile into
  `StoreOwner` and only eGovPH may change them.
- `/onboarding` exists because store name and location are eBilihan's own data, which
  eGovPH has no concept of. It runs once, gated by `needsOnboarding` (server-side:
  `!storeName || !location`), and is unreachable afterwards.
- The one OTP eBilihan still owns is the **loan confirmation** in `routes/loans.ts`. That
  is a second factor over recording money, not an identity check, so it does not conflict
  with the above. eReport's email OTP is likewise eReport's own, and gates only report
  *reading*.

### Auto-registration, and matching returning citizens
First sign-in auto-creates a `StoreOwner` from the SSO profile (`registerOwnerFromProfile`)
and seeds the demo catalogue. Returning citizens are matched by `uniqid` first, then by
name + birthdate, at which point the `uniqid` is **bound** to that owner so the next
sign-in takes the fast path — exactly the sequence eGovPH's integration logic prescribes.

## Post-submission work

**Make "New Loan" a route, not a dialog.** `features/wallet/WalletPage.tsx` opens
`LoanVerificationFlow` inside a Radix `Dialog`, and that mismatch has now produced two
separate on-device bugs:

1. The dialog closed itself mid-verification, because eVerify's SDK appends its overlay to
   `document.body` — outside the dialog's subtree — so the borrower's first tap inside
   eVerify's own UI registered as an outside click. The flow unmounted, the match call went
   out anyway and was billed, and the result was applied to a component that no longer
   existed. Symptom: vanished modal, no error, spent credit.
2. Fixing that with `onInteractOutside` exposed the second: Radix's default `modal` sets
   `pointer-events: none` on `<body>`, so eVerify's overlay rendered completely and
   received no taps at all. Our own QR scanner (mounted in `AppShell`, also outside the
   dialog) was inert for the same reason. Now `modal={false}`, at the cost of the focus
   trap, scroll lock and `aria-hidden`.

Both are symptoms of one thing: **a multi-step flow that hands off to third-party
full-screen overlays does not belong in a modal.** As a route it needs no
`onInteractOutside`, no `modal={false}`, and keeps its accessibility properties. Not done
before submission because it is a structural change and the current form is working and
measured; do it before this goes further.

## Deviations from the original project brief, and why

- **`@capacitor-community/barcode-scanner` → `@capacitor-mlkit/barcode-scanning`.** The
  originally-specified package is pinned to Capacitor 5 and effectively unmaintained;
  installing it alongside Capacitor 8 (current) produces broken peer-dependency
  conflicts. ML Kit is the actively maintained successor, but it's native-only (Android/
  iOS) — there's no real web implementation. `src/hooks/useBarcodeScanner.ts` branches
  on `Capacitor.isNativePlatform()`: native builds use ML Kit; browser tabs open
  `WebBarcodeScannerModal.tsx` instead (`@zxing/browser`, dynamically imported so it
  doesn't bloat the main bundle — getUserMedia + canvas decoding, chosen over the
  newer native `BarcodeDetector` API since that still isn't supported on iOS Safari).
  The web path is bridged through `store/scannerStore.ts` so callers (`POSView`,
  `LoanVerificationFlow`) just `await scanOnce(kind)` either way — `kind` ("barcode" |
  "qr") restricts which formats are matched, which matters: an unrestricted multi-format
  scan can misdetect noise as a false match on a blurry frame, so the same physical
  barcode could decode differently between two scan attempts. **Requires a secure
  context** (HTTPS or `localhost`) — browsers block camera access on plain
  `http://<lan-ip>`, which is part of why deploying (real HTTPS) fixed scanning that
  didn't work when testing over a local network IP.
- **A backend was added even though the brief only specified a frontend stack.** Not
  optional — see Security model above. `/server` is a small Express app, not a
  full framework choice; if the team already has backend infra/conventions elsewhere,
  port these route handlers into that instead of standing up a second Node service.
- **Dark mode was removed on request** — the app is light-theme only
  (`src/index.css` has no `prefers-color-scheme: dark` block, and `dark:` variants were
  stripped from `components/ui/*`). Don't reintroduce `dark:` classes without being asked.
- **No fabricated success values anywhere — this one matters most.** Earlier fallbacks
  manufactured data that looked real whenever an upstream call failed: a
  `demo-liveness-<timestamp>` session id after a 20s timeout, a `LOCAL-xxxx` eReport case
  number, a `local-<orderId>` payment reference, a "Simulate Payment Success (testing
  only)" button, and a hardcoded verified borrower name. All are gone, and the real error
  surfaces instead. Each asserted something untrue about a government system — that a
  person was physically present, that authorities had received a report of a serious
  incident, that money had moved. Before adding any fallback here, ask whether it would
  state something false to the person holding the phone; if it would, show the failure.

## Location picker — PSGC Cloud (not an eGov API)

Registration's Location step (Region → Province → City/Municipality → Barangay) is
backed by **PSGC Cloud** (`https://psgc.cloud/api`), a free public REST API for the
Philippine Standard Geographic Code — unrelated to the eGOV APIs suite, added because
the user asked for "a PSGC-like API". **This is a different code system from eReport's
own region/province/municipality/barangay codes** (see the eReport bullet above) —
don't cross-wire them; a code that's valid in one is very likely invalid in the other
despite both nominally being "PSGC".

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
`src/types/index.ts`) captures the full chain (codes + names) for the store's own
address — **not** reusable for eReport's location fields, which need
`ReportLocationPicker` (`src/features/reports/ReportLocationPicker.tsx`) and eReport's
own `/reports/datasets/*` endpoints instead (see the eReport bullet above).

## Brand

Colors and logo come from `eBilihanReference/eGov Main Colors.png` /
`eGov Light Colors.png` / `eBilihan-Logo.png`, wired up as Tailwind v4 theme tokens in
`src/index.css` (`brand-blue #0241E8`, `brand-red #A80E13`, `brand-gold #E9C400`,
`brand-ink #2E353B`, plus light tints) — use `bg-brand-*` / `text-brand-*` utilities
rather than hardcoding hex values.
