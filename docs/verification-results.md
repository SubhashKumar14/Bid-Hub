# Workflow verification results

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
