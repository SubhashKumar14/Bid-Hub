# Workflow verification results

## Current follow-up, 26 October 2026

Custom milestone allocations, structured client counteroffers and app copy/usability changes were prepared on `codex/negotiation-and-copy`, based on `437c4aa`. This section records local verification before publication; it does not verify deployed behavior. See [negotiation-and-copy.md](negotiation-and-copy.md) for the API, state rules, compatibility notes and scope.

| Gate | Result |
|---|---|
| `npm run build` | Passed; the existing >500 kB main-chunk warning remains |
| `npm run test:frontend` | 3 passed |
| `npm run test:security --prefix backend` | 44 passed, 0 failed, 0 skipped on the final standalone run |
| `npm run test:transactions --prefix backend` | 24 passed, 0 failed, 0 skipped against an actual disposable replica set |
| `npm run test:e2e -- --reporter=line` | 11 passed, 0 skipped, including the existing integration programs and new negotiation journey |
| `npx playwright test -g "custom milestone proposals" --reporter=line` | Final follow-up passed after visual polish; actual theme toggling preserves the counteroffer draft and dark date controls report the correct native color scheme |
| `git diff --check` | Passed |

Final build output is 558.60 kB for the main JS file (161.46 kB gzip). Light and dark 390px counteroffer screenshots were inspected; 360px counteroffer review and the existing five-width/both-theme layout checks passed. No changes were made to brand assets, fonts or theme color tokens.

New database cases validate exact custom allocations, invalid/foreign/duplicate milestone rows, expired dates, revision identity/version checks, counteroffer ownership and participant decisions, declined/withdrawn/replaced offers, atomic agreement creation, notification-failure rollback, competing acceptances and duplicate settlement of custom amounts. The browser journey submits a non-proportional split, rejects an invalid sum, declines a first client counteroffer, accepts the next, loses save/accept responses, recovers the same saved result, funds the contract, approves both milestones and leaves both participant reviews. Dashboard state is checked before any checkout order exists. Existing flows continue through both checkout entry points.

The browser uses Chromium, real local APIs and isolated MongoDB. The mock payment provider is used only in the explicitly isolated automated environment. This follow-up does not repeat real Razorpay capture or hosted deployment checks; the user reports completing the earlier external setup/verification steps. Those reported results are not counted as independently executed tests here.

The first browser pass stopped three scenarios at obsolete text assertions or the old assumption that editing a total silently replaces milestone amounts. The scenarios were updated to the new visible text and explicit breakdown step, with confirmed API responses, then the full suite passed. One storage-fixture child process timed out during a parallel security/build/database run; the unchanged full security suite passed standalone. Failed runs are not included in passing counts.

## Previous follow-up, 25 October 2026

This historical snapshot preceded commit `437c4aa`, now the baseline on main. The code was subsequently committed and pushed to `codex/workflow-repair`. The checks below used no production data; no manual deployment was performed by this review.

| Gate | Result |
|---|---|
| `npm run build` | Passed; Vite main JS 543.77 kB (157.00 kB gzip), with the existing >500 kB chunk warning |
| `npm run test:frontend` | 3 passed |
| `npm run test:security --prefix backend` | 44 passed, 0 failed, 0 skipped |
| `npm run test:transactions --prefix backend` | 19 passed, 0 failed, 0 skipped against a disposable MongoDB replica set |
| `npm run test:e2e -- --reporter=line` | 10 passed, 0 skipped, including real browser/API/replica-set journeys and existing payment, security/chat, and runtime integration programs |
| `npm ls body-parser` and backend equivalent | Both resolve to 1.20.9 |
| `git diff --check` | Passed |

The standard browser suite uses the mock provider only with its explicit isolated test flag. It covers client-dashboard and project-detail checkout entry points, exact agreement terms, two milestones, revisions, approvals, completion, reviews, retries, reloads, authorization negatives, and malformed compressed HTTP requests against the actual isolated backend. A separate attempt with real Razorpay test credentials loaded the hosted test checkout but did not reach an authorization/capture result; no funded assignment was asserted. Genuine gateway capture and remote webhook delivery remain BLOCKED. Local Vercel rewrite JSON and compiled SPA/API/assets were checked; no Vercel or Render deployment was tested.

See [final-independent-review.md](final-independent-review.md) for the detailed requirement matrix and [WORKFLOW-STATE-TRANSITIONS.md](WORKFLOW-STATE-TRANSITIONS.md) for state rules, migration, and seed instructions. The earlier record below is retained as historical evidence, not the current count.

## Earlier 23 October implementation record

Date: 23 October 2026. Baseline `5c7f3075a0302ffc5d36718f325edaf016566fd4`; repair branch `codex/workflow-repair`. No push, merge, deployment or real-money transaction performed.

## Environment and isolation

Windows, PowerShell, Node **26.1.0**, npm **11.16.0**, Mongoose **8.24.5**, Playwright **1.64.1**, downloaded Chromium, installed MongoDB **8.3**. Browser backend runs with `NODE_ENV=production`, `PRODUCT_MODE=demo`, private MongoDB GridFS, synthetic JWT secrets/accounts and no live payment capability. Vite serves the local frontend and proxies to the local backend.

DB suites create isolated replica sets at ports **27128** and **27129**, with temporary DB paths. No production or pre-existing application database was used. The optional `TEST_MONGODB_URI` path is required to point to isolated test infrastructure. Missing infrastructure is a failed gate, never a skipped integration test.

## Executed gates

| Command | Result |
|---|---|
| `npm run test:security --prefix backend` | **42 passed, 0 failed, 0 skipped**. Existing 39 checks retained, with three explicit production-mode/live-key checks added. Cancellation assertions intentionally changed from blind reopening to retained payable-order behavior. |
| `npm run test:transactions --prefix backend` | **12 passed, 0 failed, 0 skipped**, on a real replica set. |
| `npm run test:frontend` | **3 passed**, actual React state/effect harness. Child components/APIs are isolated in this older harness; it is not counted as full-browser evidence. |
| `npm run test:e2e` | **4 groups passed**, no skips: three real browser/API journeys plus all three existing integration scripts on isolated MongoDB. |
| `npm run build` | **Passed**. Vite reports the existing >500 kB main-chunk warning and Node 26's module registration deprecation warning. These are not evidence of release capacity or an optimal bundle. |
| `git diff --check` | Passed. |

The final metadata display follow-up was additionally checked with `npm run test:e2e -- --grep 'detail checkout|software checkpoints'`: **2 passed**, including all five widths and both appearances. The final production build was rerun afterward. The migration check also asserts unchanged record counts and ledger paise totals across repeated applications.

The complete browser suite was run repeatedly while repairing real failures. Earlier failures included a strict test locator, an incorrect workspace destination, obsolete fake attachment/submission fixtures in the legacy runtime script, and mobile grid/directory overflow. They were repaired and rerun. A bad automated edit briefly broke the security test file; it was restored from the baseline and the complete 42-check suite passed afterward. No failed or skipped run is counted as verification.

## Demonstrated journeys and failure behavior

1. **Writing:** client publishes using visible form controls, student proposes using the visible form, client accepts from the dashboard, confirms explicit demo funding, student submits notes without invented software URLs, client requests changes, student submits version 2, stale version approval returns 409, client approves both checkpoints, project becomes COMPLETED and each participant submits a review through the UI. Advertised budget stays ₹50,000; accepted offer and two-checkpoint schedule total ₹25,000. Completed client work is excluded from active count.
2. **Design/detail entry:** actual private PDF uploads into GridFS, safe published-brief download, denied anonymous/unlinked/unrelated access, foreign attachment association rejection, metadata persistence, clarification question/answer, proposal revision/history, stale offer acceptance rejection, exact-version acceptance from project detail, immutable ₹800 contract, participant-only evidence download with byte equality, and 10% amount-weighted work progress for a ₹80 checkpoint of ₹800. Ledger aggregation remains correct when listing one transaction per page. Duplicate messages recover the original ID. Recovery requested through UI pauses further work. HTTP failures for submission, directory, finance and profile show persistent errors; failed profile save retains entered text.
3. **Software/recovery:** simultaneous checkout requests reuse one decision/order; dismissal retains the order; simultaneous later demo confirmations produce one assignment/allocation set. A discovery checkpoint submits notes without a fabricated deployed-app link. Browser delays milestone A's request, opens B, types B's draft and completes A; B retains its draft. Keyboard focus returns after modal close. Cross-tab token change replaces the authenticated workspace. Account-scoped checkpoint draft survives reload. Login returns to the intended project rather than discarding the deep link.
4. **Existing scripts:** `payment_flow.test.js`, `security_chat.test.js`, and `runtime_verification.js` all execute against isolated DB/server fixtures from E2E. The latter contains copied frontend logic simulations, so those portions are not independent browser proof. Its upload/submission fixtures now use real owned files and active submission IDs.

Replica-set checks inject failures before allocation writes, after financial writes and during notifications; assert actual rollback; reconnect and retry; exercise duplicate/concurrent settlements; reject changed schedules; freeze agreement versions and totals; serialize simultaneous final approvals; and run the additive migration in dry-run/apply/apply sequence. Verify and webhook handlers converge using real signatures, routes, durable events and Mongo transactions; **only external gateway transport is replaced** with deterministic fixture responses. Authorized-but-uncaptured payments are rejected, cancelled legacy captures remain reconciliation cases, and uncertain provider creation blocks a second order request.

## Responsive and visual inspection

Measured document width at **360, 390, 768, 1024 and 1440px**, in **light and dark**, for directory, post form, profile, client dashboard and project detail. The student workspace and submission flow are also exercised at 360px. Long project titles and ₹99,99,999.99 budgets are included. Theme persistence is checked after reload. The 390px light/dark directory screenshots were visually inspected; existing logo, palette, typography and empty-state assets remain intact. No files under `public/`, `frontend/styles/` or `frontend/app/brand/` were changed.

Generated screenshots are local ignored artifacts under `e2e-results/`. Failed-run traces, when present, are under `test-results/`; they contain synthetic test credentials and should be treated as test artifacts, not public product evidence. Direct navigation/reload of `/browse`, `/student`, `/client`, `/post`, `/profile`, `/project/:id` is exercised locally. Public font content type is checked; production build emits hashed JS/CSS. Vercel fallback/API rewrite correctness is checked from source configuration, not claimed as a deployed observation.

## Limits and external release gates

- The GitHub CI replica-set/Chromium job is configured but **not executed remotely** because this task does not push. Its Ubuntu/Node 22 combination is not replaced by local Windows/Node 26 evidence.
- No actual Vercel/Render settings, deployed routing, cold-start behavior or production domain was changed or verified. Validate the intended commit, root build folder, output directory and real JS/CSS/API content types before release.
- No real Razorpay test order/capture/webhook delivery or checkout SDK compatibility was exercised against provider infrastructure. Configure genuine test credentials if provider mode is needed. **Live payments, payouts and refunds remain disabled/unsupported.**
- GridFS works locally with real private bytes and authorization. Remote database free-tier quotas, permissions, durability, antivirus scanning, retention operations, capacity and backup restoration remain operator tests. Public Cloudinary avatar delivery requires actual configured credentials and was not exercised remotely.
- The migration is additive and tested on synthetic data; real historical agreement inconsistencies need an operator review and backup. Original historical consent is not reconstructed from guesses.
- Recovery creates a visible pause and operator case. Automatic dispute decisions, termination settlement and compensation/refund processing are not implemented. No legal escrow claim is made.
- Mobile layouts, keyboard modal focus and Chromium journeys were checked. This is not a complete WCAG audit, screen-reader certification, Safari/Firefox/mobile-device compatibility run, load test, penetration test or proof of production readiness.

See `deployment-runbook.md` for exact variables, migration/rollback commands and operator queues. See `fix-ledger.md` for each WF01–WF22 finding and `workflow-spec.md` for supported rules/actions.
