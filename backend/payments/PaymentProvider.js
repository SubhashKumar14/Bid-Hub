export class PaymentProvider {
  /**
   * Create a checkout session or order
   * @param {Object} project Project document
   * @param {Object} bid Bid document
   * @param {number} numericAmount Amount to charge
   * @param {string} clientUrl Client Redirect Base URL
   * @returns {Promise<Object>} provider-specific checkout details
   */
  async createCheckout(project, bid, numericAmount, clientUrl) {
    throw new Error("createCheckout not implemented");
  }

  /**
   * Verify webhook request
   * @param {Buffer} rawBody Raw body buffer
   * @param {Object} headers Request headers
   * @returns {Promise<Object>} verified transaction metadata
   */
  async verifyWebhook(rawBody, headers) {
    throw new Error("verifyWebhook not implemented");
  }
}
