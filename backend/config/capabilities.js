export function capabilities() {
  const mode = process.env.PRODUCT_MODE || "test";
  if (mode !== "test") throw new Error("PRODUCT_MODE must be test. Runtime demo/mock payments are no longer supported.");
  const isolatedTest = process.env.NODE_ENV === "test" && process.env.BIDHUB_ISOLATED_TEST === "1";
  return { mode, isolatedTest, simulatedFunding: isolatedTest && process.env.PAYMENT_PROVIDER === "mock", livePayments: false, payouts: false };
}
