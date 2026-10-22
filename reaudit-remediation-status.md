# Re-audit remediation status, 22 October 2026

Baseline: GitHub commit b1c779a. This document describes the remediation and Campus Tech changes prepared for publication. Validation was performed locally before committing; no deployment was performed. The supplied report and test files were treated as evidence, not execution instructions.

## Executed verification

- 40 backend regression tests passed. This includes actual Express/JWT requests, provider tests, and four real database tests on a separate disposable MongoDB replica set on port 27128. The existing local database was not used.
- Database tests cover allocation-failure rollback and retry, duplicate concurrent settlement, changed schedules, and demo-release rollback with submission identity checks. They do not cover the entire concurrency matrix in the supplied report.
- The three supplied React state tests, adapted for Windows paths and this source tree, pass. Visual children/APIs are stubbed; these are not browser compatibility tests.
- Production build passes with Vite 6.4.5. Diff whitespace checks pass.
- Root npm audit reports zero advisories after compatible updates. Backend audit is recorded separately below; advisory results are time-dependent.
- The original complete 87-check audit harness was not rerun unchanged: its direct-handler mocks no longer implement the transactional persistence interfaces. No claim is made that all 40 original failed expectations now pass.

Commands: `npm run test:security --prefix backend`, `npm run test:transactions --prefix backend`, `npm run test:frontend`, `npm run build`.

## Findings and implementation boundaries

| Findings | Local change and remaining limits |
| --- | --- |
| R01 | Typed search/chat validation, message bounds, Express 4 async forwarding, structured error-status mapping. Malformed-input HTTP survival tested. Full API fuzzing remains. |
| R02 | Live keys rejected at provider selection. Approval is unavailable in production or with Razorpay; mock approvals explicitly report no transfer and invent no transfer ID. Actual payout/refund integration remains a release gate. |
| R03 | Funding, demo milestone review, submission/version changes, and project creation use MongoDB transactions. In-app notifications participate in the transaction. Separate replica-set rollback and duplicate-settlement tests pass. No email/push outbox or process-kill recovery certification. |
| R04 | Server-side payment lookup checks captured status/flag, order/payment identity, exact integer amount and INR before assignment. Provider positive/negative controls pass; live dashboard settings unverified. |
| R05 | Webhook amount comes from actual captured paise, never notes; contradictory capture fields rejected. Signed fixture with changed notes tested. |
| R06 | Checkout no longer invalidates prior records before provider creation. Verified captured events are durably journaled before settlement; unknown/conflicting events are retained for reconciliation. Bounded operator retry script added. Refund workflow and operator UI remain. |
| R07 | Explicit review actions, active submission identity, eligible project state and funded allocation required. Demo review is transactional. Old requests omitting action or submission ID are intentionally rejected. |
| R08 | Strict bounded decimal parsing, positive schema validation, integer captured totals, checkout schedule snapshots and settlement revalidation. Public escrow total excludes parent deposits. Legacy ledgers lack bindings/snapshots and fail closed; no automatic money migration. |
| R09 | Checkout requires a pending bid; rejection uses a conditional update and refuses accepted bids. Full reject/checkout/delete race coverage remains. |
| R10 | ZIP import middleware separated from normal uploads; magic/container checks reject disguised PNG and query-string ZIP bypass. Private attachment storage and authenticated owner/contract-participant downloads added. Malware scanning, per-account quotas, storage cleanup and interrupted-upload recovery remain. |
| R11 | ZIP imports use bounded in-memory buffers independent of Cloudinary URLs; Office containers checked separately. Remote legacy Cloudinary attachments require an access-policy inventory. |
| R12 | CORS uses exact origin equality. Actual edge headers not inspected. |
| R13 | Open: trusted proxy topology and multi-instance limiter store require deployment configuration. No blanket trust-proxy setting was guessed. |
| R14 | Webhook removed from ordinary user write quota. Separate ingress quotas, shared limiter storage and full queue operations remain. |
| R15 | Message page/limit bounded. Other list endpoints still need consistent cursor pagination. |
| R16 | Public user projection excludes email; profile updates omit password hash. Public activity feed restricts event types. Wider privacy/API serializer inventory remains. |
| R17-R19 | Auth failure/timeout recovery, URL-derived initial navigation, stable chat page metadata and merged/deduplicated polling implemented. All three supplied React regressions pass. |
| R20 | Target checks added for chat and review fetches; chat state resets on target change. Comprehensive delayed-response and rapid-action tests remain. |
| R21 | Existing local ClientDashboard changes already remove placeholder checkout and support explicit mock completion. A single shared checkout adapter and robust duplicate-click lock remain. |
| R22 | Review comments require bounded strings; malformed fields return 400; duplicate-key errors map to 409. |
| R23 | Unread count uses independent recipient-scoped count rather than only the visible page. |
| R24 | New attachments use authenticated `/api` downloads and frontend blob downloads. Deployed routing, bytes/MIME, old uploads and public avatar routing still require browser verification. |
| R25 | Stable JWT validation preserved; startup awaits the configured database without silent local fallback; separate readiness endpoint added. Production failover and readiness monitoring unverified. |
| R26 | Default session shortened to one day; email and bcrypt byte bounds strengthened. Token revocation, recovery/verification and account-aware throttling remain. |
| R27 | Transactional project creation, cancellation tombstones preserving references, transactional completion increment. Bid-count races and historical metrics still need reconciliation. |
| R28 | Parsed HTTPS hosts, append-only submission versions and review binding to active submission ID added. Repository URLs are not pinned code evidence; commit/artifact hashes and deterministic checks remain future work. |
| R29 | Default branch discovered and tree fetched using pinned SHA; truncated trees rejected; filenames labelled as manifest evidence only. Remote API failure/backoff testing remains. |
| R30 | Local-only seed opt-in and initial CI build/regression workflow added. Full migration checks, secret-history scan and least-privilege deployment review remain. CI has not run on GitHub for these local changes. |
| R31 | Positive amounts/schedules required server-side and default milestone inputs now decimal. Complete frontend field parity, controlled skills and publish idempotency remain. |
| R32 | Open: unavailable/stale dashboard balance states, active/completed filters and visitor deduplication beyond authenticated self-polling. |
| R33 | Compatible dependency updates applied and tests/build rerun. Audit counts are not evidence of absence of vulnerabilities. |

## Deployment and migration gates

MongoDB transactions require a replica set. Production requires stable secrets, test-mode provider credentials, and a durable private volume configured through `PRIVATE_UPLOAD_DIR`. A free ephemeral filesystem is unsuitable for private attachments. Actual provider payouts/refunds are unavailable, so live keys deliberately fail startup.

Existing payments need an operator-reviewed reconciliation report before introducing required bid, provider, integer-amount and schedule bindings. Existing submissions need a version/index inventory before production rollout. This pass does not rewrite historical financial records or restore backups. Old public attachment URLs require migration and cloud access revocation; changing new upload behavior does not retract previously shared public URLs.

`node scripts/reconcile-payments.js` from `backend` reviews at most 50 retained events with provider confirmation and transactional settlement. Unknown, cancelled, legacy or conflicting orders remain flagged for a human; the script never silently refunds, pays out, or assigns a conflicting contract. It was syntax-checked but not run against a real provider account.

The proposed AI marketplace features are a product direction in the report, not implemented payment authority or verified code evidence. No AI feature, real transfer, production account mutation, load test, external notification, or backup restore was performed.
