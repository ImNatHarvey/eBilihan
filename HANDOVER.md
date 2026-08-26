# Handover — read this first

**Two-minute version. Written overnight while you slept. Nothing was pushed. No credits spent.**

---

## Do this first, in order

1. **Push.** `DEPLOY_RUNBOOK.md` §1. `origin` was removed by the purge — re-add it, then
   `git push --force-with-lease origin main`. **Keep `C:\Users\jharv\Downloads\eBilihan-backup.git`
   until the deploy is verified.**
2. **Render**, then **Vercel** — runbook §2 and §3. Chicken-and-egg on the URLs: deploy Render
   with a placeholder `APP_BASE_URL`, do Vercel, come back and fix it.
3. **Verify live** — runbook §4. Four free checks before the one that costs a credit.
4. **Phone tests** — runbook §5. **Do the loan face check first.** `EVERIFY_PUBKEY` is the
   highest-risk unknown in the build: populated, never exercised, and the portal couldn't say
   where it should come from. If it's wrong the loan flow dies at the face check — find out
   before filming, not during.
5. **Message DICT** about registering `https://<vercel-url>/egovph/sso`. Only item with a human
   dependency, unknown lead time. **It doesn't block the demo** — the widget works on the
   deployed site regardless, because it returns the code via a JS callback, not a redirect.

**Budget: 6–9 credits for the full phone pass. 473 available.**

---

## Waiting on your decision

- **eGovPay digest.** Two credits eliminated both amount formats. Untested variable: whether
  the HMAC key is the bare token rather than the `test_`-prefixed one. **1 credit to test, and
  a failure would be ambiguous** (could be the key, or the key *and* something else). I'd hold
  until DICT answers Q2e. Your follow-up question is drafted in `PORTAL_QUESTIONS.md`.
- **`SUBMISSION_BRIEF.md` still doesn't exist.** You've referenced it three times. Everything
  written is from verified facts and eGovPH's own Appendix B checklist. If it exists somewhere,
  the README and status table should be re-checked against it.
- **Author metadata** left as-is per your instruction — your email is still in all 23 commits'
  author fields. Normal practice; flagging only because it was in scope for the purge.

---

## What I did

**History purge — done and verified.** `credentials.txt` removed from all history; your real
email and mobile replaced across 6 commits. All four checks pass: no commit contains either
string, `credentials.txt` appears nowhere. Backup mirror at
`C:\Users\jharv\Downloads\eBilihan-backup.git` (25 commits, 20 MB).

**Credit safety — the thing most likely to have cost you the demo.**
- Server-side cache for eReport reference data. **30 judges opening Reports now costs 2
  credits total instead of 60.**
- Rate limiting on every eGov-hitting route: 20/min, 5/min for report filing, payments, and
  identity verification. Verified locally — 31 requests, 11 rejected, no credits spent.

**Docs.** README rewritten with the honest status table, Mermaid architecture diagram (trust
boundary and both device-direct exceptions marked), sequence diagrams for SSO and the loan
identity gate, security model including the Blocker Zero audit, and the eGovPay gap with our
evidence. `DEPLOY_RUNBOOK.md` is new — every variable, every value, what breaks if you miss one.

**Earlier today:** the eGovPay digest amount fix, eVerify match narrowing (per-endpoint codes
plus explicit `verified`/`result_grade` guards), and eReport gender casing.

---

## What surprised me

**The portal assistant fabricated a hash.** It gave a worked digest example with a stated key.
I checked it offline before you spent anything — its own key and string produce `6d727f54…`,
not the `2023908815…` it claimed. That reframes its other answers: it isn't reading an
implementation, it's generating plausible text. **Its Q3 billing answer just restated our own
gateway-log observations back at us — don't cite it in the credit request.** Cite the logs.

**The purge deleted a commit.** 23 now, not 24. `b72d7e2 "Demo testing"` only ever added
`credentials.txt`, so removing the file left it empty and filter-repo pruned it. Correct
behaviour, but worth knowing before you look at the log and wonder.

**`e51564b` was yours, not a teammate's** — your own GitHub web-editor commit. No coordination
needed, and nothing in it was worth salvaging: both its troubleshooting entries are already in
`SETUP.md` in updated form, and the rest documents the sign-in flow we deleted.

**The eVerify face-mismatch response carries no `code` field at all** —
`{"data":{"verified":false},"meta":{"result_grade":"FAILED_FACE"}}`. Our check was already
failing closed on it by accident of being written defensively. That was the single most
important thing to have got right, and it was luck as much as design. It's now explicit.

**`CLAUDE.md` is out of date by two report types.** Live eReport returns 14 categories; the
file documents 12 and is missing `electric_power_concerns`. Harmless — the app fetches the
list live — but the file claims to be ground truth. Left alone; you said no unrelated changes.

---

## Honest state of the six

| API | Status |
|---|---|
| eGov SSO | ✅ Verified end to end |
| eReport | 🟡 Read verified; **write deliberately unexercised** — no sandbox, no recall, so a test filing would be a real false report |
| eMessage | 🟡 API verified; delivery needs a real handset |
| eVerify | 🟡 Credentials verified; no match performed — needs a card and a camera |
| Face Liveness | 🟡 Session creation verified; capture and threshold need a camera |
| eGovPAY | 🔴 Authenticates and fully validates; blocked on an under-specified digest formula |

Everything testable without a camera has been tested. The rest is physical or upstream, not
unwritten code.

---

*Local commits only. `git log --oneline -6` to see the session. Backup mirror is the safety
net until you've pushed and verified.*
