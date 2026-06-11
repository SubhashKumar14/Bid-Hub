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

  if (providerEnv !== "razorpay") {
    throw new Error(
      "Razorpay is not configured.\n\nPlease provide:\nRAZORPAY_KEY_ID\nRAZORPAY_KEY_SECRET\n\nto continue."
    );
  }

  // Sanitize keys in case there are tabs/spaces from raw copy-pasting
  const keyId = (process.env.RAZORPAY_KEY_ID || "").trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || "").trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay is not configured.\n\nPlease provide:\nRAZORPAY_KEY_ID\nRAZORPAY_KEY_SECRET\n\nto continue."
    );
  }

  activeProvider = new RazorpayProvider(keyId, keySecret, webhookSecret);
  activeProviderName = "razorpay";
  console.log("Active Payment Provider: Razorpay (Production/Test)");

  return activeProvider;
}

export function getActiveProviderName() {
  if (!activeProvider) {
    getPaymentProvider();
  }
  return activeProviderName;
}
