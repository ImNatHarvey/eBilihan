# eBilihan — Setup and Run

Everything needed to go from a fresh clone to a running app. No prior knowledge of the
project assumed.

Every command below states the directory it runs from, as a `cd` from the **repository
root** — never "from the previous directory". Copy them whole.

---

## 1 · Prerequisites

| Tool | Version | Notes |
|---|---|---|
| **Node.js** | **20.19+** or **22.12+** | Required by Vite 8. **Not enforced** — neither `package.json` declares an `engines` field, so an older Node will fail at build time with a confusing error rather than a clear one. |
| **npm** | 10+ | Ships with the Node versions above. |
| **Git** | any recent | |

Check what you have:

```bash
node --version
npm --version
```

Only needed for the Android build (§7), not for web development:

- **Android Studio** with an SDK and an emulator or a physical device
- **JDK 17+** (Android Studio bundles one)

---

## 2 · Layout

This is a **two-package repository**. They install separately and have their own
`node_modules`:

```
eBilihan/
├── eBilihan-app/          ← the mobile app (Vite + React + Capacitor)
│   ├── src/
│   └── server/            ← the backend (Express) — a separate npm package
├── eBilihanReference/     ← eGov API docs (PDFs), credential guide, portal questions
└── SETUP.md               ← this file
```

**There is no root-level script that runs both.** You start two processes in two terminals.

---

## 3 · Install

Two installs. Run both.

```bash
cd eBilihan-app
npm install
```

```bash
cd eBilihan-app/server
npm install
```

> If `npm install` warns about blocked install scripts, that's expected and harmless here.

---

## 4 · Environment variables

Two `.env` files. Both are gitignored; neither is optional.

**Backend** — holds every credential:

```bash
cd eBilihan-app/server
cp .env.example .env
```

**Frontend** — holds only URLs, never a secret:

```bash
cd eBilihan-app
cp .env.example .env
```

Now fill in `server/.env`. Both example files document every variable inline — what it is,
what breaks without it, which portal catalog issues it, and whether it's shown once.

**Getting the actual values is a separate job:** follow
**[`eBilihanReference/CREDENTIALS_GUIDE.md`](eBilihanReference/CREDENTIALS_GUIDE.md)**, which
walks the six API catalogs in order and flags the seven values the portal shows only once.

One value you generate yourself rather than fetching:

```bash
openssl rand -hex 32     # paste into JWT_SECRET in server/.env
```

For local development the frontend's defaults are already correct — `VITE_API_BASE_URL`
points at `http://localhost:4000`, which matches the backend's default `PORT`.

---

## 5 · Run it

**Two terminals. Start the backend first** — the frontend calls it on load, and starting it
second means the first page load fails.

### Terminal 1 — backend (port 4000)

```bash
cd eBilihan-app/server
npm run dev
```

### Terminal 2 — frontend (port 5173)

```bash
cd eBilihan-app
npm run dev
```

Then open <http://localhost:5173>.

> In a desktop browser the app draws a phone bezel around itself, so it is reviewed at real
> mobile width. That's a development aid only — on a real device it renders full-bleed.

---

## 6 · Verify it works, before touching real APIs

Four checks, none of which spends an API credit.

**1 — Backend started cleanly.** Terminal 1 should end with:

```
eBilihan server listening on http://localhost:4000
```

and **no** `[config] Missing env var …` lines. Each such warning names a variable still
missing from `server/.env`; the routes that depend on it will fail until it's filled in.

**2 — Health check:**

```bash
curl http://localhost:4000/health
# {"ok":true}
```

**3 — eGov SSO readiness.** This calls eGov SSO's `check_access`, which the portal documents
as free and "never an error" — a safe, zero-credit probe:

```bash
curl http://localhost:4000/auth/sso/health
# {"ok":true}
```

`{"ok":false,"reason":"..."}` means the partner code is unknown or revoked, **or the portal
account isn't approved yet** — not a bug in the app.

**4 — Frontend loads.** <http://localhost:5173> shows the eBilihan logo and a **Sign in**
card, and redirects to `/login` if you aren't signed in. The browser console should have no
red errors. A network tab request to `/auth/sso/widget-config` returning 200 confirms the
frontend is reaching the backend.

**Then sign in** with a sandbox account — no real eGovPH account needed:

| Username | OTP | PIN |
|---|---|---|
| `+639090000001` … `+639090000005` | `123456` | `000000` |

First sign-in lands on **Onboarding**, where you set a store name and location. After that
you get the Home tab with six seeded starter products.

---

## 7 · Android build (Capacitor)

Separate from the web flow above — you don't need any of this for day-to-day development.

The `android/` and `ios/` folders are **gitignored and generated**, so a fresh clone has to
create them.

**One-time:**

```bash
cd eBilihan-app
npx cap add android
```

**Every time you want native to reflect your code** — build the web assets first, because
Capacitor copies `dist/`, not your source:

```bash
cd eBilihan-app
npm run build
npx cap sync
npx cap open android
```

That opens Android Studio; run from there onto an emulator or device.

**On a real device, `localhost` means the phone, not your laptop.** Set
`VITE_API_BASE_URL` in `eBilihan-app/.env` to your machine's LAN IP —
`http://192.168.1.20:4000` — then `npm run build && npx cap sync` again, since Vite bakes
that value in at build time.

**Barcode/QR scanning needs a secure context.** Browsers only allow camera access over HTTPS
or on `localhost`; plain `http://<lan-ip>` is blocked. On a native Android build this doesn't
apply. For iOS you need macOS and Xcode (`npx cap add ios`).

---

## 8 · Troubleshooting

**`[config] Missing env var X` on backend start**
`server/.env` is missing `X`. The routes that use it will fail; everything else still works.
See `server/.env.example` for what it is and `CREDENTIALS_GUIDE.md` for where to get it.

**"Can't reach the eBilihan server…"**
The frontend can't reach the backend. In order: is Terminal 1 still running? Does
`VITE_API_BASE_URL` in `eBilihan-app/.env` match the backend's actual port? Does
`curl http://localhost:4000/health` work? On a device, is it a LAN IP rather than
`localhost`? Changing `VITE_API_BASE_URL` requires restarting the Vite dev server — it is
read at startup, not per request.

**Port already in use (4000 or 5173)**
Something else is listening. Find it:

```bash
# Windows (PowerShell)
Get-NetTCPConnection -LocalPort 4000 -State Listen | Select-Object OwningProcess

# macOS / Linux
lsof -i :4000
```

Stop that process, or change `PORT` in `server/.env` — and update `VITE_API_BASE_URL` to
match.

**Signed out every time the backend restarts**
Working as designed. The data store is in-memory (`server/src/store/db.ts`), so a restart
wipes every account. `GET /auth/me` then 401s and the app returns you to sign-in. Sign in
again with a sandbox account. Note this also applies to a deployed backend that cold-starts.

**Camera or scanner won't open**
Needs HTTPS or `localhost`. Plain `http://<lan-ip>` is blocked by the browser. Use a tunnel,
or a native build.

**`429` / "quota exhausted"**
The portal account is out of credits — not a bug. Even calls documented as free need a
non-zero balance. Ask an administrator for a top-up.

**`403` from eGov SSO with credentials you believe are correct**
Either the credential was revoked (generating a new eGov SSO credential revokes the previous
one — there's only ever one active per developer), or the portal account isn't approved yet.
`GET /auth/sso/health` distinguishes them.

**"This eGovPH sign-in link has expired"**
An `exchange_code` is single-use and short-lived. Refreshing the callback page or navigating
back re-submits a spent code. Start sign-in again.

**Typecheck or lint after making changes**

```bash
cd eBilihan-app
npx tsc -b
npm run lint
```

```bash
cd eBilihan-app/server
npx tsc --noEmit -p tsconfig.json
```

Three `react(only-export-components)` warnings from `button.tsx`, `badge.tsx` and
`PhoneFrame.tsx` are pre-existing and expected.

---

## 9 · Command reference

| Where | Command | Does |
|---|---|---|
| `eBilihan-app/` | `npm run dev` | Vite dev server → 5173 |
| `eBilihan-app/` | `npm run build` | `tsc -b && vite build` → `dist/` |
| `eBilihan-app/` | `npm run lint` | oxlint |
| `eBilihan-app/` | `npm run preview` | Serve a production build |
| `eBilihan-app/server/` | `npm run dev` | `tsx watch src/index.ts` → 4000 |
| `eBilihan-app/server/` | `npm run build` | `tsc -p tsconfig.json` → `dist/` |
| `eBilihan-app/server/` | `npm start` | `node dist/index.js` (build first) |

There is **no test suite** — no runner is installed in either package. Don't invent test
commands; if you add tests, install a runner and add the script.
