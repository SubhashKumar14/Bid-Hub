import { MockProvider } from "./MockProvider.js";
import { RazorpayProvider } from "./RazorpayProvider.js";
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

  const providerEnv = (process.env.PAYMENT_PROVIDER || "").toLowerCase().trim();

  if (providerEnv === "razorpay") {
    // Sanitize keys in case there are tabs/spaces from raw copy-pasting
    const keyId = (process.env.RAZORPAY_KEY_ID || process.env.Test_API_Key || "").trim();
    const keySecret = (process.env.RAZORPAY_KEY_SECRET || process.env.Test_Key_Secret || "").trim();
    const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
    
    if (keyId && keySecret) {
      activeProvider = new RazorpayProvider(keyId, keySecret, webhookSecret);
      activeProviderName = "razorpay";
      console.log("Active Payment Provider: Razorpay (Production/Test)");
    } else {
      console.warn("WARNING: PAYMENT_PROVIDER is razorpay but Razorpay API credentials are missing. Falling back to MockProvider.");
      activeProvider = new MockProvider();
      activeProviderName = "mock";
    }
  } else {
    // default to mock
    activeProvider = new MockProvider();
    activeProviderName = "mock";
    console.log("Active Payment Provider: Mock (Simulation)");
  }

  return activeProvider;
}

export function getActiveProviderName() {
  if (!activeProvider) {
    getPaymentProvider();
  }
  return activeProviderName;
}
