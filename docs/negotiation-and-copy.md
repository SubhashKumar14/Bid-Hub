# Negotiation and app copy, 26 October 2026

Branch: `codex/negotiation-and-copy`, based on `437c4aa` on main. This change preserves the existing stack, theme tokens, typography and brand assets.

## Negotiating a project

1. A student proposes a price, timeline, approach and allocation for every published milestone. Each allocation is positive integer paise; the complete breakdown must equal the proposed total. Names and milestone membership come from the published brief. Optional dates must be future dates no later than the project's delivery date. The suggested proportional split remains available, and changing a custom split never silently resets it.
2. The client can accept the exact student proposal or send a counteroffer with a different price, timeline, work description, milestone amounts and dates. The student can decline, accept, or revise their own proposal. Sending a counteroffer does not create an agreement or a payment order.
3. The student must review and explicitly confirm a counteroffer before accepting it. Acceptance atomically saves an immutable contract, records who accepted and the source counteroffer/version, and sets `PENDING_FUNDING`. The advertised budget remains unchanged. The client then uses the existing shared test checkout.
4. A pending counteroffer must be withdrawn or declined before the client can accept the original proposal. A newer counteroffer or student revision closes the earlier unanswered counteroffer. Agreement with another student, or cancelling the brief, also closes pending counteroffers. Sent terms and previous proposal versions remain in the negotiation history.
5. After agreement, proposal and counteroffer edits are rejected. Assignment still requires verified captured Razorpay test funding. Approval, completion and reviews follow the existing work lifecycle. Approval does not send a payout.

Custom allocations apply to the milestones already listed in the brief. Adding/removing milestones or replacing the published scope requires a new brief; this feature does not silently rewrite that scope.

## API contract

| Endpoint | Input and permissions | Result/retry rule |
|---|---|---|
| `POST /api/projects/:id/bids` | Student; existing price/timeline/proposal plus optional `schedule` | One proposal per student/project. Repeated identical terms recover the stored proposal. |
| `PATCH /api/bids/:id` | Proposal owner; `action=REVISE`, `proposalVersion`, stable `requestId`, terms and optional schedule; or `action=WITHDRAW` with `proposalVersion` | Revisions retain old terms and increment the version. Stale edits fail. Repeating the same revision identity/content returns that revision once. |
| `POST /api/bids/:id/counteroffers` | Project client; `proposalVersion`, `previousCounterofferVersion` (0 initially), stable `requestId`, `amount`, `timeline`, `proposal`, optional `message`, `schedule` | Appends a new numbered counteroffer. The same identity/content returns the original result. Changed content or a stale previous counteroffer version fails. |
| `PATCH /api/bids/:id/counteroffers/:counterofferId` | Exact `proposalVersion` and `counterofferVersion`; student chooses `ACCEPT`/`DECLINE`, project client chooses `WITHDRAW` | The immutable offer ID and versions identify the decision. Repeated identical decisions return the existing outcome; conflicting or closed decisions fail. |

Schedule entries use `{ milestoneId, amount, dueDate }`, where amount is a decimal rupee string and dueDate is an optional `YYYY-MM-DD`. Server responses use canonical milestone titles and `amountPaise`. The normalizer also accepts an explicit integer `amountPaise`, but rejects requests supplying both amount representations.

The API records all negotiation writes and their notifications in transactions. A notification failure rolls the operation back; the UI retains entered terms and reports an error. Client and student views refetch saved state, including across reloads. No optimistic agreement or financial success is shown.

## Copy and usability

The landing, registration, browse, project, posting, profile, dashboard, payment, message, recovery and submission screens were reviewed. Copy now explains the action and next step in plain language. No participant-authored briefs, proposals, biographies, messages or reviews are rewritten.

- Removed unsupported verification/location wording, internal file-manifest jargon and sales filler. File-list imports explain that source files are not hosted.
- One term, milestone, is used for the units of work. Status badges display readable labels. Test payment notices remain explicit.
- The payment history shows each record once, labels project funding and allocations, and removes invented debit/credit signs and work-signoff balances. Failed clipboard copying offers a selectable reference and an actual retry.
- Submission notes come first, links are labelled optional, and review shows the exact submission version and approval consequence. The redundant browser confirmation was removed from the already explicit review dialog.
- Browse retry preserves filters. Project refresh preserves the existing page while loading. Form errors retain input, in-flight fields are disabled, and stale negotiation drafts cannot overwrite newer terms.
- Small metadata was raised to at least 12px. Native date controls follow the selected light/dark appearance so their calendar icons stay visible. Existing responsive layouts, assets, fonts and theme colors are retained.

## Configuration and compatibility

No database reset or mandatory backfill is needed. New negotiation fields are additive; old proposals continue to use their saved allocation or the suggested split. Existing immutable contracts are not rewritten. Update any external proposal-editing client to send the required version and revision request ID. Existing test-only payment restrictions remain in effect.

## Verification

The new tests use separate client/student accounts, actual API handlers, real MongoDB transactions and a disposable replica set. Only the external payment transport is replaced in the explicitly isolated automated browser environment. The user reports completing the earlier external configuration checks; this change does not independently repeat hosted Razorpay capture or deployment verification.

Final results: build passed, 44 security checks passed, 24 replica-set checks passed, 3 frontend checks passed and all 11 browser/integration scenarios passed, with no skipped tests counted. The final targeted negotiation journey also passed after light/dark visual polish. Details and failed-run accounting are in [verification-results.md](verification-results.md).

The new browser scenario covers a custom student split, declined and accepted client counteroffers, interrupted save/accept responses, exact contract persistence, client dashboard recovery before any order exists, test funding, two approved milestones and both participant reviews. Database regressions cover validation, role/ownership checks, stale versions, idempotency, immutable agreement terms, rollback and competing acceptances.
