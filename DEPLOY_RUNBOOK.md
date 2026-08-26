# Deploy Runbook

Do these in order. Nothing here has been run for you — the history purge is done, everything
below is yours.

**Before you start, have open:** the Render dashboard, the Vercel dashboard, and
`eBilihan-app/server/.env` (the source of truth for every value you'll paste).

---

## 1 · Re-add origin and force-push

`git-filter-repo` removed the `origin` remote deliberately, so a botched rewrite can't be
pushed by reflex. History has already been purged and verified.

```bash
cd C:\Users\jharv\Downloads\eBilihan
git remote add origin https://github.com/ImNatHarvey/eBilihan.git
git remote -v
```

**Check what you're about to overwrite.** `origin/main` is at `e51564b` — your own commit
from the GitHub web editor, documenting the sign-in flow that no longer exists. It is
superseded, and nothing in it is worth keeping (both its troubleshooting entries already
live in `SETUP.md` in updated form).

```bash
git push --force-with-lease origin main
```

**This is the only force-push.** `--force-with-lease` refuses if the remote moved since your
last fetch — since you're the only developer, it won't have.

**If it's rejected**, don't reach for `--force`. Run `git fetch origin` and look at what
appeared first.

**Recovery, if anything looks wrong afterwards:**
```bash
cd C:\Users\jharv\Downloads
mv eBilihan eBilihan-broken
git clone eBilihan-backup.git eBilihan
cd eBilihan && git remote set-url origin https://github.com/ImNatHarvey/eBilihan.git
```
The mirror at `C:\Users\jharv\Downloads\eBilihan-backup.git` holds all 25 original commits.
**Keep it until the deploy is verified.** Your `.env` files are untracked and stay on disk.

> **Rotation is still required.** Anything that was in `credentials.txt` is in every clone
> taken before today. Revoke the pre-migration credentials in the portal — the rewrite does
> not un-leak them.

---

## 2 · Render — backend

New Web Service → connect the repo → it reads `render.yaml` (root dir `eBilihan-app/server`,
build `npm install && npm run build`, start `npm start`).

All **22** variables. Copy from `server/.env` except the five marked **CHANGE**.

| Variable | Production value |
|---|---|
| `PORT` | `4000` |
| `CORS_ORIGIN` | **CHANGE** → your Vercel URL, e.g. `https://ebilihan.vercel.app` |
| `JWT_SECRET` | **CHANGE** → let Render generate (`generateValue: true`) |
| `APP_BASE_URL` | **CHANGE** → your Vercel URL |
| `SERVER_BASE_URL` | **CHANGE** → this Render service's URL |
| `LOAN_LIVENESS_THRESHOLD_PHP` | `1000` |
| `EGOVPH_BASE_URL` · `EGOVPH_PARTNER_CODE` · `EGOVPH_PARTNER_SECRET` | copy from `.env` |
| `EVERIFY_BASE_URL` · `EVERIFY_CLIENT_ID` · `EVERIFY_CLIENT_SECRET` · `EVERIFY_PUBKEY` | copy |
| `EMESSAGE_BASE_URL` · `EMESSAGE_API_TOKEN` | copy |
| `EGOVPAY_BASE_URL` · `EGOVPAY_API_TOKEN` · `EGOVPAY_SETTLEMENT_TEMPLATE_UUID` | copy — token keeps its `test_` prefix |
| `EREPORT_BASE_URL` · `EREPORT_ACCESS_CODE` | copy |
| `FACE_LIVENESS_BASE_URL` · `FACE_LIVENESS_API_KEY` | copy |

**Chicken-and-egg:** `APP_BASE_URL` needs the Vercel URL and `VITE_API_BASE_URL` needs the
Render URL. Deploy Render first with a placeholder `APP_BASE_URL`, do Vercel, then come back
and correct it. Render restarts on an env change; Vercel needs a rebuild.

**What breaks if you forget one:**

| Missing | Symptom |
|---|---|
| `APP_BASE_URL` | eGovPay sends payers to `localhost` after paying — a dead page on their phone. Face Liveness redirects into the same void. **No error; it silently never completes.** |
| `SERVER_BASE_URL` | eGovPay posts callbacks to `localhost`, unreachable. Orders never settle. |
| `CORS_ORIGIN` | Every browser request blocked. App loads, nothing works. |
| `JWT_SECRET` | Falls back to an insecure dev constant. App works — which is the danger. |
| Any `*_BASE_URL` | That integration fails at call time with no startup warning. |
| Any of the 7 `required()` secrets | `[config] Missing env var X` in the Render log at boot. |

Only those 7 warn at startup. **Check the Render log after first boot** — it's the one place a
missed variable announces itself.

---

## 3 · Vercel — frontend

Import the repo. Root directory **`eBilihan-app`**. Framework: Vite. `vercel.json` handles
SPA rewrites.

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | your Render URL, e.g. `https://ebilihan-server.onrender.com` |

That's the only one. The two script-URL overrides have working defaults.

⚠️ **Vite bakes this in at build time.** Changing it later needs a **redeploy**, not a
restart. And **no credential ever goes here** — everything `VITE_`-prefixed ends up in the
bundle inside the APK.

---

## 4 · Verify live — cheapest first

**1. Health (free)**
```bash
curl https://<render-url>/health
# {"ok":true,"cache":{"entries":0,"live":0,"inFlight":0}}
```

**2. eGov SSO readiness (free)**
```bash
curl https://<render-url>/auth/sso/health
# {"ok":true}
```
`{"ok":false}` → partner code unknown/revoked, or the account isn't approved. Not a code bug.

**3. Render logs (free)** — look for `[config] Missing env var`. Any line names a variable you
missed in step 2.

**4. Frontend (free)** — open the Vercel URL. Expect the logo, a **Sign in** card, and the
eGovPH widget rendering inside it. Console clean. Network shows
`/auth/sso/widget-config` → 200 against the **Render** URL, not localhost.

**5. Sign in — 1 credit.** Sandbox: `+639090000001`, OTP `123456`, PIN `000000`. Expect
onboarding on first sign-in, then Home with six seeded products.

**6. Reports tab — 2 credits, once ever.** Categories and regions populate from live eReport.
Then `curl https://<render-url>/health` again: `cache.live` should be ≥ 2. **Reload the page —
the count must not rise.** That's the server cache proving itself, and the thing that keeps 30
judges from costing 60 credits.

---

## 5 · Phone tests — everything still unproven

Needs a real device with a camera, over HTTPS. This is the only way to close these.

| # | Test | Credits | What it proves |
|---|---|---|---|
| 1 | Sign in on the phone | 1 | Widget works on mobile |
| 2 | **Loan → face check** | 1–2 | **`EVERIFY_PUBKEY` — never exercised.** If wrong, the SDK throws and the flow dies here |
| 3 | Loan → QR scan + match | 1–2 | Whether `AAA001` really comes back. Needs a real PhilSys card |
| 4 | High-value loan (≥ ₱1,000) | 1–2 | Owner liveness gate + the 95.0 threshold |
| 5 | eMessage delivery | 1 | Needs a **real** mobile on the owner record — sandbox numbers receive nothing |

**Do #2 first.** `EVERIFY_PUBKEY` is the highest-risk unknown in the build: it's populated,
but nothing has ever used it, and the portal couldn't say where it should come from. If it's
wrong you want to know before filming, not during. It fails visibly — `startFaceLiveness`
throws a readable error rather than hanging — but it fails.

**Budget: 6–9 credits** for the full phone pass, against 473.

---

## 6 · Still blocked

**Production SSO base URL — needs a DICT administrator.** Give them
`https://<vercel-url>/egovph/sso`. Per the portal: *"not a field you configure directly in the
developer portal, but rather something set up on the eGovPH side."*

**This does not block the demo.** It only affects Mode A — eGovPH launching eBilihan from
inside its own app. **The widget works on the deployed site regardless**, because it returns
the code through a JS callback rather than a redirect. Sign-in is fully demonstrable.

**Ask now, in parallel** — the lead time is unknown and it's the only item with a human
dependency.

**eGovPay** stays blocked on the digest until DICT answers. Everything else about it is
proven, and the README states the gap accurately.

---

## Spend estimate — 30 judges against 473 credits

| Activity | Per judge | × 30 |
|---|---|---|
| Sign-in | 1 | 30 |
| Reports datasets | **0** (server-cached after the first) | **2 total** |
| Loan with face check | ~2 | 60 |
| High-value loan | ~2 | 60 |
| eGovPay | 0 (blocked) | 0 |
| **Realistic total** | | **~90–150** |

**473 available. Comfortable.**

Two things that would have broken this: without the server cache, the Reports tab alone would
cost **60** instead of 2; without the `staleTime` fix, an idle open tab burned ~2 credits per
refocus, unattended.

**The real risk is Render's free tier sleeping after ~15 minutes.** A cold start wipes the
in-memory store, signing everyone out and costing a credit per re-authentication. If judging
is a scheduled window, consider a paid instance or a keep-warm ping for its duration.
