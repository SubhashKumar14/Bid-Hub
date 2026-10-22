import { RazorpayProvider } from "./RazorpayProvider.js";
import { MockProvider } from "./MockProvider.js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables relative to current directory
const currentDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDir, "../.env") });

let activeProvider = null;
let activeProviderName = "";

export function getPaymentProvider() {
  if (activeProvider) return activeProvider;

  const providerEnv = (process.env.PAYMENT_PROVIDER || "razorpay").toLowerCase().trim();

  if (providerEnv === "mock") {
    if (process.env.NODE_ENV === "production") throw new Error("Mock payments are disabled in production.");
    activeProvider = new MockProvider();
    activeProviderName = "mock";
    console.warn("Mock payment provider enabled for this non-production environment.");
    return activeProvider;
  }
  if (providerEnv !== "razorpay") throw new Error("PAYMENT_PROVIDER must be either 'razorpay' or 'mock'.");

  // Sanitize keys in case there are tabs/spaces from raw copy-pasting
  let keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  let keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when PAYMENT_PROVIDER=razorpay.");
  }
  if (keyId === "rzp_test_placeholder" || keySecret === "placeholdersecret") throw new Error("Placeholder Razorpay credentials are not accepted.");
  if (process.env.NODE_ENV === "production" && !keyId.startsWith("rzp_test_") && !keyId.startsWith("rzp_live_")) throw new Error("Invalid Razorpay key ID configuration.");

  activeProvider = new RazorpayProvider(keyId, keySecret, webhookSecret);
  activeProviderName = "razorpay";
  console.log(`Active Payment Provider: Razorpay (${keyId.startsWith("rzp_test_") ? "Test Mode" : "Live Mode"})`);

  return activeProvider;
}

export function getActiveProviderName() {
  if (!activeProvider) {
    getPaymentProvider();
  }
  return activeProviderName;
}
