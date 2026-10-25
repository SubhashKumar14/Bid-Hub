const running = new Map();
let sdk;
async function post(path, body, token) {
  const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({ message: "Unexpected server response. Please retry." }));
  if (!response.ok) throw new Error(data.message || "Checkout failed");
  return data;
}
function loadSdk() {
  if (window.Razorpay) return Promise.resolve();
  return sdk ||= new Promise((resolve, reject) => {
    const script = document.createElement("script"); script.src = "https://checkout.razorpay.com/v1/checkout.js";
    const failed = () => { clearTimeout(timer); sdk = null; script.remove(); reject(new Error("Razorpay checkout could not load. Your agreement and order are saved. Try opening checkout again.")); };
    const timer = setTimeout(failed, 15000);
    script.onload = () => { clearTimeout(timer); if (!window.Razorpay) return failed(); resolve(); };
    script.onerror = failed;
    document.body.appendChild(script);
  });
}
export function checkout(bidId, token, currentUser, proposalVersion) {
  const key = token + ":" + bidId;
  if (running.has(key)) return running.get(key);
  const promise = (async () => {
    const order = await post("/api/payments/checkout-session", { bidId, proposalVersion }, token);
    if (localStorage.getItem("token") !== token) throw new Error("Account changed. Reopen checkout in your current account.");
    if (order.settled) return order;
    if (order.provider === "mock") return post("/api/payments/simulate-payment", { sessionId: order.sessionId }, token);
    await loadSdk();
    if (localStorage.getItem("token") !== token) throw new Error("Account changed. Reopen checkout in your current account.");
    return new Promise((resolve, reject) => {
      const modal = new window.Razorpay({ key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId, name: "Bid-Hub test checkout", prefill: { name: currentUser?.name, email: currentUser?.email },
        handler: response => post("/api/payments/verify", response, token).then(resolve, reject),
        modal: { ondismiss: () => reject(new Error("You closed checkout. Your agreement and order are saved. Check the funding status before paying again.")) },
      });
      modal.on("payment.failed", () => { modal.close(); reject(new Error("Razorpay could not confirm this test payment. Your agreement is saved. Refresh the funding status before trying again.")); });
      modal.open();
    });
  })().finally(() => running.delete(key));
  running.set(key, promise); return promise;
}
