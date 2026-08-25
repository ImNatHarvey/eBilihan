# Portal AI Assistant — Questions to Ask

Eleven questions for the DICT API Developer Portal's embedded AI assistant, which is trained
on the API directory. Each is written to be pasted verbatim.

**Two are blocking.** Q1 and Q2 each change code that currently ships on an assumption. The
rest close gaps where this project is inferring rather than reading, and none of them blocks
work.

Paste answers back into this file under each question as you get them.

| # | Topic | Blocking | Changes |
|---|---|---|---|
| 1 | eVerify match codes | **YES** | `server/src/routes/loans.ts:33` (`MATCHED_CODES`) |
| 2 | eGovPay TEST mode + callback payload | **YES** | `server/src/routes/payments.ts`; whether a settled sale is demonstrable |
| 3 | Billing per endpoint | no | The credit request to the organisers |
| 4 | SSO base URL registration | no | Deployment sequencing |
| 5 | eMessage delivery restrictions | no | Diagnosis only |
| 6 | Credential field names | no | `CREDENTIALS_GUIDE.md`; unblocks `EVERIFY_PUBKEY` |
| 7 | Face Liveness `action: "post"` | no | Possible simplification of the liveness return flow |
| 8 | eReport error codes | no | `server/src/lib/upstreamError.ts` |
| 9 | SSO profile completeness | no | Whether the eReport gender fallback can be dropped |
| 10 | Exchange code lifetime | no | Docs only |
| 11 | Liveness session reuse | no | Whether one check can serve two calls |

---

## Q1 — eVerify match codes · **BLOCKING**

> For the NationalID eVerify API: please list every possible value of `data.code` returned by
> `POST /api/query` (Verify Personal Information), `POST /api/query/qr` (QR Verify), and
> `POST /api/query/qr/check` (QR Check), with the meaning of each. Which codes indicate a
> successful biometric + demographic match, and which indicate a face mismatch, a record not
> found, or a low-confidence result? Your documentation shows `AAA000` in the Verify Personal
> Information success example and `AAA001` in the QR Verify success example — are both success
> codes, and if so what distinguishes them?

**Why it blocks.** `server/src/routes/loans.ts:33` currently accepts **both** codes:

```ts
const MATCHED_CODES = new Set(["AAA000", "AAA001"]);
```

It is marked `NARROW-ME` in the source. Accepting both was the safe hedge — guessing wrong
would silently block every legitimate loan — but it ships loose. **If one of these turns out
to mean something like "matched with low confidence", we are currently approving loans we
should refuse.** Narrowing is a one-line change: every match decision funnels through
`toVerdict()` / `recordVerification()` in that file, so there are no other call sites.

**Answer:**

---

## Q2 — eGovPay test mode and callbacks · **BLOCKING**

> For the eGovPAY API: (a) How do I complete a payment end-to-end in test mode with a
> `test_`-prefixed token — is there a test card, a test wallet, or a way to move a transaction
> from `INITIAL` to paid? (b) What is the exact JSON payload eGovPAY POSTs to `callback_url`
> on a transaction status change — which fields does it contain, and is it signed or does it
> include a `digest`? (c) What are all possible values of `payment_status`? (d) Where do I
> create a settlement template, and what does `settlement_template_uuid` refer to?

**Why it blocks.** Three separate things currently rest on assumption:

- **Whether a sandbox payment can be settled at all.** The docs confirm test mode exists
  (`test_` prefix, `environment_type: "TEST"`) but describe **no mechanism to complete a
  payment**, and show no `payment_status` other than `INITIAL`. If it cannot settle, the
  submission video can demonstrate Generate Payment and Void but not a completed sale — which
  is worth knowing before filming, not during.
- **`PAID` / `SETTLED`** in our code are inferred string values, not documented ones.
- **(d)** unblocks `EGOVPAY_SETTLEMENT_TEMPLATE_UUID`, without which every payment 503s.

⚠️ **The answer does not license trusting the callback body.** `POST /payments/webhook` is an
unauthenticated request from the open internet. It re-queries
`GET /api/v1/transaction/{uuid}` and writes only what the gateway says. That design stands
whether or not a `digest` turns out to exist, and must not be relaxed into trusting the
payload. Answering (b) tells us what to *log*, not what to *believe*.

**Answer:**

---

## Q3 — Billing per endpoint

> Which endpoints consume credits, for each of the six APIs (eGov SSO, NationalID eVerify,
> eMessage, eGovPAY, eReport, Face Liveness)? Your eGov SSO guide says
> `api/partner/sso_authentication` costs 1 credit and `api/token` is free — is there an
> equivalent breakdown for the other five? Do all six draw on one shared account balance?

**Why.** `sso_authentication` = 1 credit is the **only** charge documented anywhere. The
credit request to the organisers currently assumes worst case — every non-SSO call billable —
which puts it around 150. If most calls are free the real need is closer to 5–10. Also worth
knowing: free calls still require a non-zero balance (`429 quota_exceeded` when exhausted).

**Answer:**

---

## Q4 — SSO base URL registration

> Where do I register my SSO base URL for eGov SSO — is it a field in the developer portal, or
> does an administrator set it? Can I register more than one URL per credential (for example a
> development tunnel and a production domain), or only one?

**Why.** The guide says to "give eGovPH your SSO base URL" but never says where. It affects
deploy sequencing only — local testing works without it, via the widget and the Generate
exchange code button.

**Answer:**

---

## Q5 — eMessage delivery restrictions

> Does eMessage restrict SMS delivery to whitelisted or pre-registered numbers in test mode?
> `POST /messaging/v1/sms/push` returns 201 for any valid number — how do I tell an accepted
> message from a delivered one, and is there a delivery-status endpoint?

**Why.** The old gateway returned success while silently declining to deliver. Affects loan
confirmation OTPs and loan-agreement SMS (no longer sign-in — eGovPH sends that OTP now).

**Answer:**

---

## Q6 — Credential field names

> On the Credentials tab, what exactly is each field called for NationalID eVerify, eReport,
> and Face Liveness? For eVerify, where do I get the Public API Key used by the Face Liveness
> Web SDK (`window.eKYC().start({ pubKey })`) — is it on the Credentials tab, or set through
> Manage variables? For eReport, is the credential an `access_code`, or a client ID/secret pair?

**Why.** `EVERIFY_PUBKEY` is the practical blocker here: the string `public_api_key` appears
in the documentation **only** as a portal test-runner variable, never as a Credentials-tab
output. Without the key the loan flow stops at the face check. eReport's credential shape is
likewise undocumented — its Credentials page shows only the empty state.

**Answer:**

---

## Q7 — Face Liveness `action: "post"`

> For Face Liveness `POST /v1/liveness/session`: what does `action: "post"` do — where does it
> post, with what payload, and how does that differ from `redirect` and `close`?

**Why.** eBilihan uses `redirect`, which sends the owner out to a hosted page and back. If
`post` delivers the result to our backend directly it may be a cleaner fit for the
high-value-loan gate.

**Answer:**

---

## Q8 — eReport error codes

> What error codes and response bodies can eReport return for `submit_complaint`,
> `verify/request`, `verify/confirm`, and the `datasets/*` endpoints, beyond 401? Are there
> validation errors specific to `report_type` or the location codes?

**Why.** `server/src/lib/upstreamError.ts` maps upstream failures to messages a store owner
can act on. eReport's documented errors are almost entirely 401, so anything else currently
falls through to a generic message. Location-code validation matters especially — eReport
uses its own code system, not PSGC Cloud's.

**Answer:**

---

## Q9 — SSO profile completeness

> Which fields of the `sso_authentication` profile are always present versus dependent on
> citizen consent? Specifically, can I rely on `gender`, `birth_date`, `email` and `mobile`
> being populated? What does the `shared_data` array in the `authenticate` response signify?

**Why.** eReport's `submit_complaint` requires `gender`, and the app currently shows a manual
gender selector only when the SSO profile lacks one. If `gender` is always present that
fallback can go. `mobile` matters too — the loan confirmation OTP has nowhere to go without it.

**Answer:**

---

## Q10 — Exchange code lifetime

> How long is an `exchange_code` valid before expiry, and how long is the `access_token` from
> `/api/token` valid? Your guide says the token is valid 1 hour — is there a documented
> lifetime for the exchange code?

**Why.** Documentation accuracy. The code is described only as "single-use, short-lived".

**Answer:**

---

## Q11 — Liveness session reuse

> Can one eVerify `face_liveness_session_id` be used for more than one call to `/api/query` or
> `/api/query/qr`, or is it single-use? Does it expire?

**Why.** If a session can serve two calls, a borrower whose QR verification fails could retry
via the demographic path without a second face capture — one less thing to ask of someone
standing at a sari-sari store counter.

**Answer:**
