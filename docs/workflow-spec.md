# Supported workflow

Actors: anonymous visitors read published briefs; students propose only on open projects; clients publish and agree only their own projects. Only the selected student and owning client may submit/review work, read contract discussion, or inspect confidential evidence. Both participants may review a completed project once. Uploaded bytes remain private until deliberately associated with a published brief or participant submission.

## State rules

| Entity | Transitions and authority |
|---|---|
| Project | OPEN → PENDING_FUNDING when owner accepts an exact pending offer; verified/demo funding → ASSIGNED → IN_PROGRESS; all required milestones approved → COMPLETED. Pre-agreement cancellation preserves history. |
| Proposal | PENDING may be revised/withdrawn by its author before agreement. Each revision is retained. Accepted snapshot is immutable. Rejected/withdrawn proposals cannot fund. |
| Contract | Immutable project/client/student/bid/version/currency/totalPaise/schedule snapshot. Advertised budget remains an estimate. Accepting an unchanged offer requires no second student acceptance. Changing terms requires a new student offer. |
| Funding | One contract-scoped attempt: CREATING → READY → settlement; uncertain provider creation is retained as RECOVERY_REQUIRED. Retrying never silently creates a second payable order. |
| Submission | Numbered immutable versions, PENDING/CHANGES_REQUESTED → SUBMITTED; review must name the current submission ID. Feedback is required for revisions. |
| Approval | SUBMITTED → APPROVED or CHANGES_REQUESTED, owner only, transactionally. All APPROVED milestones complete work. Approval never asserts an actual payout. |
| Finance | DEMO simulates funding explicitly even under production Node. Razorpay test mode verifies captured paise/INR; live keys/payouts remain disabled. Ledger funding and simulated release are distinct from work approval. |
| Review | Completed project, other participant only, one review per author/project, explicit human feedback. |

Money is bounded integer paise at agreement/funding boundaries. If the student omits a custom schedule, the offer uses the client's checkpoints proportionally allocated to the offered total, with exact integer rounding. This schedule must be presented before submission; acceptance freezes it. Contract records do not mutate when presentation data changes.

## Action inventory

Publish: POST /api/projects; propose: POST /api/projects/:id/bids; revise/withdraw: PATCH /api/bids/:id; agree/fund: POST /api/payments/checkout-session with bidId; capture: POST /api/payments/verify or signed webhook; demo confirmation: POST /api/payments/simulate-payment; checkout dismissal: POST /api/payments/cancel; deliver: PATCH /api/milestones/:id/submit; review: PATCH /api/milestones/:id/release with explicit action and submissionId; feedback: POST /api/reviews; discussion: POST/GET /api/messages; private file upload/download: /api/uploads/files. Authentication, ownership, eligible starting state and validation precede writes. In-app notification failures must not misrepresent a committed primary action.

Recovery: primary transitions are transactional, duplicate capture is idempotent, uncertain money remains operator-visible. No unsupported refund or payout is invented. Missing durable production attachment storage disables that capability; local demo disk storage remains supported. No production reseeding or destructive migration is permitted.

## Permission matrix

| Action | Anonymous | Prospective student | Selected student | Owning client | Other client/student |
|---|---|---|---|---|---|
| Read published brief/index | Yes | Yes | Yes | Yes | Yes |
| Download published OPEN brief materials | No | Yes | Yes when participant | Yes | Other clients: no |
| Upload own private file / edit own profile | No | Own account | Own account | Own account | Own account only |
| Propose, revise, withdraw | No | Own PENDING offer on OPEN project | Never agreed/funded terms | No | No access to another student's offer |
| Read proposals | No | Own only | Own only | All on owned project | Own only for students |
| Agree exact offer and fund | No | No | No | Yes, owned eligible project, exact version | No |
| Deliver / view private submissions | No | No | Deliver; view historical evidence | View; review current submission | No |
| Review work / request changes | No | No | No | Current SUBMITTED version only | No |
| Contract chat | No | No | Yes after assignment, including completed history | Yes | No |
| Request operator recovery | No | No | Agreed participant | Agreed participant | No |
| Human feedback | No | No | Once after COMPLETED | Once after COMPLETED | No |

Explicit default: pre-award clarification is a signed-in board, visible to the owner and prospective students while the brief is OPEN. Never post confidential attachments or private contact details there. A clarification does not amend terms. The student must revise their proposal to offer changed scope/price/timeline. Scope fields cannot be edited after proposals arrive; cancellation plus a new brief is the supported alternative for a substantial rewrite. A withdrawn proposal is terminal for that project; it cannot be silently reactivated.

## Pages, dialogs and actions

Amounts at API boundaries are strict positive decimal INR with no currency symbols, bounded precision and at most two fractional digits. Agreement uses integer paise and exact positive checkpoint sums. Strings/arrays, dates, roles, version IDs and attachment ownership are checked before writes. Legacy metadata is unknown, not inferred.

| Surface/action | HTTP/input | Permission/state | Committed effect and UI/retry |
|---|---|---|---|
| Auth sign in/register | POST `/auth/login`, `/auth/register`; typed email/password/name/role | Anonymous; rate-limited | Token/session, then GET `/auth/me`; deep-link intent is retained. Network outage shows retry; invalid token prompts sign-in. No password-reset or college-email verification action is claimed. |
| Browse/landing directory, search/filter/sort/pages | GET `/projects` with bounded `search/category/status/location/sort/page/limit`; GET `/projects/public/stats`, `/reviews/public` | Public published data | Saved metadata drives filters before pagination; error differs from empty; stale search results ignored. Local UI settings do not mutate projects. |
| Open project/refresh/back | GET `/projects/:id`, authenticated GET `/:id/bids` | Published details; bids owner/author scoped | Navigate to stable `/project/:id`; fresh data on reload; no public ledger. |
| Post draft/add/remove checkpoints/skills | Browser storage `bidhub_post_draft:<userId>` | Client account UI | Local safe draft only; all fields and attachment references persist until confirmed publish. Incomplete checkpoints must be completed or removed. |
| Attach brief files | POST `/uploads/files` multipart | Signed in; storage capability available | Private upload ownership record; association validated when publishing. Label says materials become visible to prospective students. Failure retains form input; no public fallback. |
| ZIP/GitHub manifest | POST `/import/local` multipart; POST `/import/github` repo URL | Signed in; bounded and rate-limited | Manifest metadata only. Published/draft metadata preserves GitHub revision. Import failure remains visible; it is not verified/source-hosted work. |
| Publish | POST `/projects`; all brief fields, schedule, files, `clientRequestId` | Client only | Project, milestones and activity commit together; repeated identity returns same project; UI prevents duplicate publish/upload overlap. |
| Place/revise/withdraw proposal | POST `/projects/:id/bids`; PATCH `/bids/:id`, `action=REVISE/WITHDRAW` | Author student; OPEN; no contract | Offer version/history + proportional schedule. Retry identical creation recovers original; differing creation instructs revision. Agreement and revision serialize on bid/project. |
| Reject proposal | PATCH `/bids/:id/reject` | Owner, OPEN/PENDING | Transaction with notification; repeated rejection is recoverable. |
| Clarification | GET/POST `/projects/:id/clarifications`, bounded `content` | OPEN owner or student | Visible signed-in brief discussion. Keep private work in contract chat. |
| Checkout disclaimer/accept | POST `/payments/checkout-session`, `bidId/proposalVersion` | Owner; OPEN/PENDING_FUNDING; exact reviewed version | Immutable contract and one durable funding attempt. READY retries reuse order. CREATING/uncertain outcomes block second orders. Both UI entry points show exact terms and call shared adapter. |
| Confirm test/demo funding | POST `/payments/verify` or signed `/payments/webhook`; explicit demo `/simulate-payment` | Owner for browser verification; authentic provider webhook | Captured INR order/amount/currency/identity checked server-side; transactional assignment and allocations once. Failed/unknown/conflicting events remain durable for reconciliation. |
| Dismiss checkout | POST `/payments/cancel` with owned project/session | Client owner | Retains potentially payable orders, including legacy ones. No blind reopening/FAILED status based on modal dismissal. |
| Funding ledger | GET `/payments?page/limit` | Own records only | Bounded transactions plus full-account aggregate financial stats. Failure shows unavailable, never fabricated zero. Demo releases labelled. |
| Submit checkpoint | PATCH `/milestones/:id/submit`; notes, optional links/files | Selected student; active project; PENDING/CHANGES_REQUESTED; funded allocation; no recovery pause | Immutable numbered evidence record; milestone SUBMITTED and allocation PENDING_REVIEW transactionally. Input retained on failure; stale modal target/account responses ignored. |
| Review/check evidence/history | GET `/milestones/:id/submission`, `?history=true`; authenticated file download | Participants only | Current version and bounded historical versions; optional URLs and owned private files; no guessed-upload access. |
| Approve/request revision | PATCH `/milestones/:id/release`; `APPROVED/CHANGES_REQUESTED`, active `submissionId`, feedback for revision | Owner; funded current SUBMITTED version | Work APPROVED or CHANGES_REQUESTED; allocation release is simulated only in demo. No transfer. All required work approved derives COMPLETED atomically. Stale version gives 409 and requires refresh. |
| Contract messages/load older/poll | POST `/messages`, `projectId/content/requestId`; GET `/messages/:projectId?page/limit` | Participants after assignment, including completed projects | Message+notification transaction; stable request identity; failed send retains text; polling merges latest messages without hiding older pagination; account/target changes discard stale results. |
| Completed feedback | POST `/reviews`, project/reviewee/rating/comment; GET user reviews | Other participant, COMPLETED; one author/project | Human review, rating and notification/activity in transaction; repeated request recovers existing review. No automatic testimonial. |
| Recovery/termination request | POST `/projects/:id/recovery`, bounded reason | Agreed participants; awaiting funding or active work | Durable operator case and pause, with contract/evidence/history retained. No invented refund. Read-only recovery report and test-provider reconciliation scripts support operator work. |
| Own profile/edit/photo | GET `/users/:id` with self bearer token, PATCH own `/users/:id`, POST `/users/avatar` | Owner; photo capability configured | No self-view inflation; App and Profile update together; unavailable photo storage explained. Avatars preserved. |
| Notifications | GET `/notifications`; PATCH read/read-all routes | Recipient only | Persistent reads; retry on errors; account key clears prior user's notifications. Notifications are in-app, not email delivery. |
| Theme/nav/overlay controls | Browser state, shared Radix primitives | All; UI role mirrors authenticated role | Existing light/dark selection persists. Keyboard focus returns on close. Responsive navigation retains avatar/profile/ledger access. |

## Financial and operational invariants

Startup awaits unique index initialization. Remote provider calls occur outside transactions. One Contract exists per project and one FundingAttempt per contract. An order whose creation outcome is uncertain is retained for operator inspection, not replaced by a new request. `PaymentEvent` identity is durable before acknowledgement; unknown or failed legacy orders never force assignment. Existing capture, signature and metadata validation remains enforced.

Work and financial views are separate: APPROVED work contributes amount-weighted work progress; financial stats aggregate allocation rows only and remain independent of pagination. Test-provider approval does not create a release timestamp or transfer. Demo releases have no transfer ID and represent no actual money movement.

Legacy cancellation is a tombstone, not deletion. Recovery keeps evidence and messages accessible, pauses new work decisions and does not modify financial history. No live refunds, payouts, legal escrow, automatic dispute decision, college verification, password-reset delivery or deployment is implemented or claimed. See the deployment runbook for required external release gates.
