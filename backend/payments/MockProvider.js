import { PaymentProvider } from "./PaymentProvider.js";
import { PaymentLedger } from "../models/PaymentLedger.js";

export class MockProvider extends PaymentProvider {
  async createCheckout(project, bid, numericAmount, clientUrl) {
    const mockSessionId = "mock_sess_" + Math.random().toString(36).substring(2, 12);
    const mockCheckoutUrl = `${clientUrl}/client?payment_status=success&session_id=${mockSessionId}`;

    // Create PaymentLedger record in PENDING_CHECKOUT state
    await PaymentLedger.create({
      projectId: project._id,
      clientId: project.clientId,
      studentId: bid.studentId._id || bid.studentId,
      amount: numericAmount,
      status: "PENDING_CHECKOUT",
      stripeSessionId: mockSessionId,
      transactionRef: "TXN-MOCK-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
    });

    return {
      provider: "mock",
      url: mockCheckoutUrl,
      sessionId: mockSessionId,
    };
  }

  async verifyWebhook(rawBody, headers) {
    throw new Error("MockProvider does not receive external webhooks");
  }
}
