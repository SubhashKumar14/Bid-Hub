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

  const providerEnv = (process.env.PAYMENT_PROVIDER || "razorpay").toLowerCase().trim();

  // Sanitize keys in case there are tabs/spaces from raw copy-pasting
  let keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  let keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  
  if (!keyId || !keySecret) {
    console.warn("\n========================================================");
    console.warn("WARNING: Razorpay credentials are not configured.");
    console.warn("Using simulated fallback placeholder credentials.");
    console.warn("========================================================\n");
    keyId = "rzp_test_placeholder";
    keySecret = "placeholdersecret";
  }

  activeProvider = new RazorpayProvider(keyId, keySecret, webhookSecret);
  activeProviderName = "razorpay";
  console.log(`Active Payment Provider: Razorpay (${keyId === "rzp_test_placeholder" ? "Simulated/Placeholder" : "Production/Test"})`);

  return activeProvider;
}

export function getActiveProviderName() {
  if (!activeProvider) {
    getPaymentProvider();
  }
  return activeProviderName;
}
