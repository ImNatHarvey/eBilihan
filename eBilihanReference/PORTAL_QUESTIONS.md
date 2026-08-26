# Portal AI Assistant — Questions to Ask

Thirteen questions for the DICT API Developer Portal's embedded AI assistant, which is trained
on the API directory. Each is written to be pasted verbatim.

**Six are blocking** — Q1, Q2 (including Q2e), Q3, Q12, Q13 and Q14. Q14 supersedes Q1: it is a live observation from a real ID, not an assertion. Each changes code, an estimate,
or whether a path can be exercised at all. The rest close gaps where this project is
inferring rather than reading.

Paste answers back into this file under each question as you get them.

| # | Topic | Blocking | Changes |
|---|---|---|---|
| 1 | eVerify match codes | **YES** | `server/src/routes/loans.ts:33` (`MATCHED_CODES`) |
| 2 | eGovPay TEST mode + callback payload | **YES** | `server/src/routes/payments.ts`; whether a settled sale is demonstrable |
| 3 | Billing per endpoint | **YES** | Every cost estimate we have; which calls to avoid in the UI |
| 4 | SSO base URL registration | no | Deployment sequencing |
| 5 | eMessage delivery restrictions | no | Diagnosis only |
| 6 | Credential field names | no | `CREDENTIALS_GUIDE.md`; unblocks `EVERIFY_PUBKEY` |
| 7 | Face Liveness `action: "post"` | no | Possible simplification of the liveness return flow |
| 8 | eReport error codes | no | `server/src/lib/upstreamError.ts` |
| 9 | SSO profile completeness | no | Whether the eReport gender fallback can be dropped |
| 10 | Exchange code lifetime | no | Docs only |
| 11 | Liveness session reuse | no | Whether one check can serve two calls |
| 12 | Exchange-code partner binding | **YES** | Whether the portal's test tool can validate our credentials at all |
| 13 | eReport test mode for submit_complaint | **YES** | Whether the eReport write path can be exercised at all |
| 14 | eVerify returns an undocumented response shape | **YES** | How `matched` is decided at all — live evidence, strongest in this file |

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

### Q2e — the `digest` input · **BLOCKING, and currently the single thing stopping eGovPay**

> For eGovPAY **Generate Payment**, I need the exact input to the `digest` HMAC, because
> `hash_hmac('sha256', "$amount|$txnid", $token)` is ambiguous on three points and my
> requests are being rejected with
> `{"errors":{"digest":["The digest is not valid."]}}`:
>
> **(1) The key.** My header is `X-eGovPay-Token: test_<32-char-key>` and it authenticates
> successfully. For the digest, is `$token` the **full header value including the `test_`
> prefix**, or **only the 32-character key without it**? Please state which explicitly —
> answering "it is your API token" does not distinguish these two and will not help me.
>
> **(2) The amount.** For an amount of `120`, is the signed string `"120|MYTXNID"`, or is
> the amount normalised first — `"120.00|MYTXNID"` or `"120.0000|MYTXNID"`? Your Check
> Transaction response returns amounts as `"1000.0000"`, so normalisation is plausible.
>
> **(3) A worked example.** Please give one complete example where the key is stated in
> full: a key value, an amount, a txnid, the exact string that gets signed, and the
> resulting digest — so I can reproduce it locally and verify my implementation before
> spending more credits. The example in your documentation
> (`amount: 1000`, `txnid: "TESTREF123"`,
> `digest: "c5989a520055e65025a695bb1483b30b6cd7923c79c648fff5e757bbabc62fa2"`) cannot be
> reproduced because the key used to produce it is not published.

**Why it blocks.** Everything else about our Generate Payment request is confirmed valid —
the gateway faulted **only** `digest`, which means `settlement_template_uuid`,
`redirect_url`, `callback_url`, `items`, `amount`, `txnid`, `currency`, `expires_at` and
`link_expires_at` all passed validation, and the `test_`-prefixed token authenticates.
eGovPay is one field away from working.

**Already eliminated locally, at zero cost:** the output encoding. The documented digest is
64 lowercase hex characters — PHP's `hash_hmac` default — and that is what we send. Also
tried and failed: 234 combinations of 13 candidate keys × 6 message forms × 3 encodings
against the documented example. None reproduce it, which is expected if it was signed with
an unpublished merchant token.

**Answer:**

---

## Q3 — Billing per endpoint · **BLOCKING**

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

**Also ask, same topic:** for the **standalone Face Liveness** API, how long does a session
token from `POST /v1/liveness/session` stay valid before the capture must be completed, and
how long afterwards can `GET /v1/liveness/result/{token}` still be called? We create sessions
on one machine and may complete the capture on another (no webcam on the dev PC), so the
window matters.

**Answer:**

---

## Q12 — Exchange-code partner binding · **BLOCKING** *(documentation contradiction)*

> On the eGov SSO catalog page, can an `exchange_code` produced by the **Generate exchange
> code** button be redeemed at `POST /api/token` using **my own** `partner_code` and
> `partner_secret` — or can it only be redeemed by the platform's own partner? Your guide
> says the button *"mints a fresh, single-use `exchange_code` for that account, which you feed
> straight into step 3"* (step 3 uses my `partner_code` / `partner_secret`), but the tool
> itself says it mints the code *"against this platform's own eGov partner using a test
> identity"*. Those read as contradictory. Redeeming such a code with my own credentials
> returns `403 forbidden` — `"You don't have permission to access this resource."` Is that
> expected, and if so what is the supported way to test `POST /api/token` end to end?

**Why it blocks.** It decides whether the portal's own test tool can validate a third-party
integration at all, or whether the widget is the only path.

**Established from live testing, 0 credits:**

- `check_access` → `{"ok":true}`. Our `partner_code` is valid and the account is approved.
- `POST /api/token`, real credentials + deliberately invalid code (`"not-a-real-code-000"`)
  → **`422`**, upstream faulting only that field:
  `{"message":"Invalid exchange_code","errors":{"exchange_code":["Invalid exchange_code"]}}`.
  Per the documented split (`403` = bad credentials, `422` = bad code), this proves
  **`partner_code` and `partner_secret` are both accepted**.
- A real, freshly-minted code from **Generate exchange code**, same credentials → **`403
  forbidden`** at the token step.

Credentials that pass, a `422` on garbage, but a `403` on a portal-minted code, points at the
code being bound to a partner that isn't ours. If that is confirmed, the documentation should
not say to feed its output into step 3.

**Answer:**

---

## Q13 — eReport test mode for `submit_complaint` · **BLOCKING**

> For the eReport API: is there a test or sandbox mode for `POST /api/integration/submit_complaint`
> that lets me exercise the write path **without filing a real complaint into the live triage
> queue**? Specifically: is there a test flag or header, a designated test `report_type`, a
> separate sandbox base URL, or a test account whose submissions are routed away from real
> case handlers? If a complaint is submitted for integration testing, how do I withdraw or
> cancel it, and who should be notified?
>
> I do not want to file a fabricated report to obtain a case number. If there is no test
> mode, I will leave this endpoint unexercised rather than submit a false report.

**Why it blocks.** `submit_complaint` is the only eReport endpoint we have not called, and
it is the one that matters — it is the write path. But it files a genuine complaint with
real authorities. Choosing a low-stakes `report_type` does not change that: a fabricated
report still enters a live queue and consumes a real person's attention, and a disclaimer in
the message body is not consent from whoever triages it.

**If the answer is no:** eReport's write path stays documented as *"implemented against the
documented contract, not exercised"*, and the README and video say exactly that. An honest
gap is preferable to a case number obtained by filing something untrue.

**Answer:**

---

## Q14 — eVerify returns an undocumented response shape · **BLOCKING** *(live observation)*

> For NationalID eVerify `POST /api/query/qr`: I submitted a genuine PhilSys ID together
> with a live Face Liveness session for the **same person who owns that ID**, and received
> HTTP 200 with:
>
> ```json
> { "data": { "code": "FOJ3128", "full_name": "<present>", ... },
>   "meta": { "result_grade": 1, ... } }
> ```
>
> This does not match your documentation in three ways:
>
> 1. **`data.code` is `"FOJ3128"`** — not `AAA000` or `AAA001`, the only values your
>    examples and your assistant describe. What does `FOJ3128` mean? Please list every
>    possible `code` value with its meaning, including the format family this belongs to.
> 2. **`meta.result_grade` is the number `1`** — your documentation shows a string
>    (`"FAILED_FACE"`). Is `result_grade` numeric or a string? If numeric, what does `1`
>    signify, and what is the full scale?
> 3. **`data.verified` was absent entirely** — your face-mismatch example shows
>    `"verified": false`. Is `verified` only present on failure, or has the field been
>    removed?
>
> The practical question: **given a response like the one above, how do I determine
> whether the identity was successfully matched?** I need a rule I can implement that is
> correct for both outcomes, not just a list of success codes — because a wrong rule
> either refuses legitimate borrowers or approves unverified ones.
>
> Related: do sandbox/hackathon eVerify credentials query live PhilSys records at all, or
> only a test dataset? If they cannot match a real ID, that changes what this integration
> can demonstrate.

**Why it blocks.** This is the strongest evidence in this file: a real ID, a real face, a
live 200 response — not documentation, and not an assistant's assertion. It shows the
documented response shape is wrong, and our match logic was built on that shape.

**What we did with it:** nothing automatic. `FOJ3128` was **not** added to the accepted set,
because "an identity was returned" is not the same as "the identity was verified", and
guessing wrong in that direction approves an unverified borrower for credit. The check
still refuses, pending an authoritative answer.

**Note for the platform team:** your AI assistant previously answered that `AAA000` and
`AAA001` are the only match codes, distinguished by input method. That is contradicted by
this live response. It also supplied a worked HMAC example for eGovPAY whose digest does
not reproduce (its own stated key and string give `6d727f54a7f935e8…`, not the
`2023908815121b6d…` it claimed). Both cost us credits to discover.

**Answer:**
