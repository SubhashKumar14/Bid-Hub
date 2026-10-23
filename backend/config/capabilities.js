export function capabilities() {
  if (process.env.RENDER && !process.env.PRODUCT_MODE) {
    process.env.PRODUCT_MODE = "demo";
  }
  if (process.env.NODE_ENV === "production" && !process.env.PRODUCT_MODE) throw new Error("Set PRODUCT_MODE=demo or test explicitly for production startup.");
  const mode = process.env.PRODUCT_MODE || "test";
  if (!["demo", "test"].includes(mode)) throw new Error("PRODUCT_MODE must be demo or test. Live payments are disabled.");
  return { mode, simulatedFunding: mode === "demo", livePayments: false, payouts: false };
}
