# Workflow configuration, migration and recovery

This branch is for review. Nothing was pushed, merged or deployed as part of this repair. Keep live money disabled.

## Supported modes

| Setting | Supported behavior |
|---|---|
| `NODE_ENV=production`, `PRODUCT_MODE=demo` | Complete workflow with the separate MockProvider. Funding and releases are simulated and labelled. No gateway credentials or bank accounts required. |
| `PRODUCT_MODE=test`, `PAYMENT_PROVIDER=razorpay` | Razorpay **test** orders and captured-payment verification. Work approval works independently; actual transfers/refunds are unavailable. Requires genuine provider test credentials and webhook configuration. |
| `PRODUCT_MODE=test`, `PAYMENT_PROVIDER=mock` | Local/test processes only; production Node rejects this combination. Use deliberate `PRODUCT_MODE=demo` for a hosted demonstration. |
| Any live payment key / live product mode | Unsupported. Live product mode and live gateway keys in the provider path are rejected. No payout or refund implementation is enabled. |

Production startup requires explicit `PRODUCT_MODE`, stable `JWT_SECRET` (32+ characters), `MONGODB_URI`, and a working replica set. Changing `JWT_SECRET` invalidates all existing sessions. Preserve it across restarts.

`render.yaml` now describes an explicit demo with `PRIVATE_STORAGE=mongodb`. It does not provision or verify a MongoDB account. The existing service's actual environment must be reviewed separately; editing this file does not update a deployed service.

## Private files and public avatars

Recommended configuration for the existing free-service topology:

```dotenv
NODE_ENV=production
PRODUCT_MODE=demo
PAYMENT_PROVIDER=mock
MONGODB_URI=mongodb+srv://<restricted-app-user>:<password>@<cluster>/<database>?retryWrites=true&w=majority
JWT_SECRET=<stable-random-secret-at-least-32-characters>
CLIENT_URL=https://<frontend-host>
PRIVATE_STORAGE=mongodb
```

GridFS stores private bytes in the same database's `privateAttachments.files` and `privateAttachments.chunks` collections; `uploads` holds ownership metadata. No public Cloudinary URL or disk fallback serves these files. Retain both metadata and GridFS collections in backups. The app DB user needs the corresponding read/write/index permissions. Verify database storage/transfer quotas and monitor growth; there is no automatic archival/garbage-collection policy in this release. Unassociated uploads remain private to their uploader and still consume space.

Alternatively unset `PRIVATE_STORAGE` and provide an absolute `PRIVATE_UPLOAD_DIR` on a **durable private volume**. An ephemeral `/tmp` or application checkout path is not durable production storage. The local development disk adapter is for development. With neither production adapter configured, attachment endpoints return 503 and UI upload controls explain their unavailability. Changing adapters does not migrate existing bytes: copy and verify historical files explicitly before switching, or keep the old adapter until migration is complete. There is no automatic cross-provider fallback.

Cloudinary is optional and used only for public profile photos. Supply valid `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` to enable production avatar uploads. Existing avatar URLs remain intact; absent credentials disable new photos without taking down the API. Private evidence is never stored as a public avatar.

Each ordinary file is at most 10 MiB, up to 10 per upload. PDF/Office/image signatures are checked, files download as attachments with `nosniff`, and references must belong to the uploading user. This is format validation, not antivirus scanning. Repository ZIP imports are a separate manifest-only route; compressed ZIP size is at most 10 MiB and expanded content at most the configured size limit. `MAX_PROJECT_FILES` defaults to 20 (1–1000), `MAX_PROJECT_SIZE_MB` to 50 (1–50, matching the archive safety ceiling), and image count to 8. GitHub imports discover default branches and retain the returned commit SHA. They do not store source files or prove executable behavior.

## Additive migration

1. Take a database backup that includes GridFS and verify that the backup can be read. Arrange a short maintenance window for agreement/funding writes. Never reseed production.
2. Install locked dependencies at repository root and in `backend`: `npm ci --ignore-scripts` and `npm ci --ignore-scripts --prefix backend`.
3. From `backend`, with the intended database environment loaded, run `node scripts/workflow-migration.js` for a report, then `node scripts/workflow-migration.js --apply` after reviewing the report.
4. The migration fills **missing** metadata with unknown values (`remote:null`, empty location/level/duration), versions old proposals as 1, recalculates ratings from persisted human reviews, and creates additive indexes. It never deletes projects, submissions, ledgers, events or contracts. There is no `dropDatabase`, reseed or `syncIndexes` operation.
5. Existing funded agreements are not reconstructed from unverified historical wording. Keep their ledgers/evidence, inspect inconsistent or cancelled legacy orders with the operator tools, and do not create a second order for an unresolved legacy funding decision. Historical displayed totals use their milestone schedule if an authoritative contract total is absent. New agreements always receive immutable snapshots.
6. Confirm unique indexes on project/client publish identity, project contract and contract funding attempt. Startup's Mongoose model initialization also builds schema indexes; review errors rather than ignoring an index conflict.

Rollback: restore application code only after disabling new funding/agreement writes and reviewing any new contracts/attempts. Preserve additive collections/fields and financial evidence. Older code does not understand the new agreement, approval and recovery rules; do **not** send new records through the old settlement/cancellation handlers. Restore a backup only under an explicit operator recovery plan that accounts for every provider event since that backup.

## Operator queues

From `backend`:

```text
node scripts/recovery-report.js
node scripts/reconcile-payments.js
```

The first command is read-only and lists work recovery cases, CREATING/RECOVERY_REQUIRED funding attempts and unresolved payment events. Treat output as private operational data. CREATING after a crash may represent an order that was created remotely; never delete its attempt to make retry create a second order.

The reconciliation command is a bounded retry for Razorpay **test** events and rechecks captured amount/currency/order server-side before settlement. It never sends refunds or transfers. Unknown, legacy-cancelled, conflicting or mismatched events remain unresolved. Cross-check provider records, the immutable contract, deposits and allocations. Preserve evidence and document any operator decision. Work recovery pauses future submissions/approvals, keeps contract status/evidence, and does not invent a refund; termination, compensation and resuming after a dispute require a reviewed operator decision. There is no automatic commercial dispute-resolution feature.

## Frontend hosting

Use repository root as Vercel root, `npm run build`, output `dist`, and the root `vercel.json`. `index.html`, the root package manifest, public assets and Vite configuration live at repository root. `frontend/` alone is **not** a standalone build project; the matching nested rewrite file is retained for consistency, not an alternative build root. API rewrite stays before the clean-URL SPA fallback to `/`.

Before release, confirm the intended commit/root in the actual dashboard, then request `/browse`, `/student`, `/client`, `/post`, `/profile`, `/project/<fixture-id>` directly and refresh. Verify `/api/health` is JSON and a generated JS/CSS/brand URL has its real content type. Local Vite routing tests do not prove Vercel behavior. No hosting dashboard was changed or deployed in this task.

## Required checks

```text
npm run test:security --prefix backend
npm run test:frontend
npm run test:transactions --prefix backend
npx playwright install chromium
npm run build
npm run test:e2e
```

For DB tests provide `TEST_MONGODB_URI` pointing to an **isolated replica-set test database**, or `MONGOD_BINARY` pointing to a local MongoDB executable. The default Windows binary is `C:/Program Files/MongoDB/Server/8.3/bin/mongod.exe`. Transaction/browser harnesses use ports 27128/27129 and temporary DB directories when launching their own instances. Never supply the production database as `TEST_MONGODB_URI`: tests create synthetic users and projects. Missing database/browser infrastructure fails the gate; it is not skipped.

CI includes a separate MongoDB 8 replica-set/Chromium job and executes the DB and E2E gates. Legacy payment/chat/runtime smoke commands run within E2E against that isolated DB. Invoking those legacy scripts directly now requires explicit `TEST_MONGODB_URI` so they cannot silently use the app database. Legacy copied frontend simulations are not counted as browser proof.

External release blockers: deployed routing/environment inspection; genuine Razorpay test credentials/webhook delivery if provider mode is needed; Cloudinary credentials for photos; remote MongoDB quota, durability and restore validation; deployed browser compatibility and production load. Live payments, payouts, automatic refunds, college-email verification and password-reset delivery are unsupported.
