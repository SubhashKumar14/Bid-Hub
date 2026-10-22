import crypto from "crypto";

export function verifyRazorpaySignature({ keyId, keySecret, orderId, paymentId, signature, production }) {
  if (
    typeof keyId !== "string" || !keyId ||
    typeof keySecret !== "string" || !keySecret ||
    keyId === "rzp_test_placeholder" ||
    keySecret === "placeholdersecret" ||
    typeof orderId !== "string" || !orderId ||
    typeof paymentId !== "string" || !paymentId ||
    typeof signature !== "string" || !signature
  ) {
    return false;
  }
  if (
    production &&
    (!/^order_[A-Za-z0-9]+$/.test(orderId) ||
      !/^pay_[A-Za-z0-9]+$/.test(paymentId) ||
      /mock/i.test(orderId) ||
      /mock/i.test(paymentId))
  ) {
    return false;
  }

  const expected = crypto.createHmac("sha256", keySecret).update(`${orderId}|${paymentId}`).digest();
  if (!/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  const supplied = Buffer.from(signature, "hex");
  return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
}
