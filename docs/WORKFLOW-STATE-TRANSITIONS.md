# Bid-Hub workflow and recovery notes

## State transitions

- A client publishes an `OPEN` brief with a future delivery date, supported category, scope, skills, advertised budget, and milestone amounts that sum to that budget. An alias category is normalized to the canonical taxonomy. One student proposal exists per project; revisions increase its version and retain the prior terms. Only pending proposals can be revised or withdrawn.
- The owner reviews the current proposal version and accepts that version explicitly. A MongoDB transaction stores the immutable contract snapshot (scope, advertised budget, accepted price, proposal version, and agreed schedule), freezes the project in `PENDING_FUNDING`, and adjusts no payment state. Stale versions and competing agreements fail.
- The owner may retry or cancel the checkout order without dissolving the agreement. `ASSIGNED` is reached only when a matching Razorpay **captured** test payment is fetched and verified or a valid `order.paid` webhook is processed. Settlement locks the deposit and each agreed milestone allocation atomically, accepts the selected proposal, and rejects competing proposals. Duplicate captures/events are idempotent; unknown, late, or conflicting outcomes remain in recovery.
- A funded milestone moves `PENDING → SUBMITTED → APPROVED` or `CHANGES_REQUESTED → SUBMITTED` at a higher retained submission version. The client review names the currently viewed submission ID. Approval changes work state only. Payment allocations remain `LOCKED`; this application does not transfer payouts or issue refunds.
- The project reaches `COMPLETED` only after every milestone is `APPROVED`. Each participant may then leave one factual review. Reputation and completed-work history are calculated from completed, non-sample projects and reviews by the exact participants of the accepted proposal.
- A recovery request pauses project actions. Only IDs listed in `OPERATOR_USER_IDS` may resolve it. `RESUME` and `RESOLVE` require a case version, stable request ID, and reason; each committed decision is retained in case history. `RESOLVE` ends work as `CANCELLED` and retains the contract, work, and payment evidence. It does not claim a refund or payout. Uncertain provider orders/events block resolution.

The payment ledger is a record of test-mode orders and locked allocations, not a legal escrow account. Work review never changes it. Historical `RELEASED` payment rows and milestone rows are not treated as paid out; the explicit migration classifies legacy financial release labels as `UNVERIFIED` and work approvals as `APPROVED`.

## Configuration and additive migration

Use a MongoDB replica set. Runtime requires `NODE_ENV=production`, `PRODUCT_MODE=test`, `PAYMENT_PROVIDER=razorpay`, a real `rzp_test_` key ID and secret, a Razorpay webhook secret, JWT configuration, and private upload storage. Live keys are rejected; live payment and payout features are disabled. Configure the Razorpay account for automatic capture; the server still fetches the payment and requires `captured=true`, INR, matching order, and exact amount before assignment. A public, reachable webhook URL is needed to verify provider-originated delivery; local tests cannot prove remote webhook delivery.

Back up the target database, configure its URI in `backend/.env`, then inspect the additive migration with `npm run migrate:workflow --prefix backend`. Apply with `npm run migrate:workflow --prefix backend -- --apply`. It backfills immutable internal receipt references, recalculates real reputation, relabels historical approval/payment records truthfully, and adds missing indexes. It does not delete records or reconstruct old agreements. Dry-run output reports the legacy rows that will be relabelled.

## Explicit sample data

The seeder is never run at server start and refuses production, remote hosts, or general application database names. Use a dedicated local replica-set database named `bidhub_dev`, `bidhub_test`, `bidhub_samples`, or `bidhub_seed...`:

```powershell
$env:NODE_ENV = 'development'
$env:ALLOW_SAMPLE_SEED = 'yes'
$env:SEED_MONGODB_URI = 'mongodb://127.0.0.1:27017/bidhub_dev?replicaSet=rs0'
$env:SEED_PASSWORD = 'choose-a-development-only-password'
npm run seed:samples --prefix backend
```

It inserts ten linked sample projects per canonical category, including pending-funding, active-work, revision, completed, and review scenarios. Stable sample keys make reruns additive and idempotent. It never overwrites non-sample records. Sample users, work, reviews, and ledger entries are marked and excluded from real public reputation and trust metrics.

## Local checks

Run `npm run build`, `npm run test:frontend`, `npm run test:security --prefix backend`, `npm run test:transactions --prefix backend`, `npm run test:payment-flow --prefix backend`, `npm run test:security-chat --prefix backend`, and `npm run test:runtime --prefix backend`. The browser suite (`npm run test:e2e`) starts isolated local browser/API services and a disposable replica-set database; it fails if its required MongoDB executable or fixture ports are unavailable. Razorpay browser journeys require isolated local test-mode credentials. A locally generated webhook replay verifies signature parsing and idempotency, not delivery from Razorpay to a deployed URL.
