# BidHub Demo Walkthrough

## Local setup

1. Install dependencies from both manifests: run npm ci at the repository root, then change to backend and run npm ci there.
2. From backend, copy .env.example to .env. Set NODE_ENV=development for local work, a MongoDB URI, a stable random JWT secret of at least 32 characters, and Razorpay Test Mode key ID and secret. Configure webhook secret when exercising webhook delivery. Configure Cloudinary for uploads; production startup requires all Cloudinary credentials.
3. Start MongoDB, then start the API from backend with npm start.
4. In a second terminal at the repository root, run npm run dev.
5. Open the Vite URL, register a client and student in separate sessions, and sign in.

For a local workflow demo without calling Razorpay, set PAYMENT_PROVIDER=mock and NODE_ENV=development in backend/.env. The mock route is owner-authenticated and disabled in production. Mock results are not evidence of Razorpay behavior.

## Client and student flow

1. As the client, create a project with milestones.
2. As the student, browse the project, submit a bid, and refresh the project page to confirm it remains visible.
3. As the client, open the bid and proceed to escrow checkout. In Razorpay Test Mode, complete the provider's test checkout; the browser sends the returned order, payment, and signature values to the backend.
4. Confirm the project is assigned and funds appear in the milestone ledger. Refresh both dashboards.
5. As the student, submit milestone work with repository/demo/video links and notes.
6. As the client, request a revision, then review the resubmitted work and release the milestone.
7. Confirm notifications, ledger state, and project completion after the last milestone. Refresh each dashboard.

## Verification commands

Run from backend: npm run test:security; npm run test:payment-flow; npm run test:security-chat; npm run test:runtime.

Run the production frontend build from the repository root with npm run build. Integration scripts require a reachable local MongoDB. Configure no real/live payment keys for tests. Use Razorpay Test Mode credentials for a real checkout demonstration.
