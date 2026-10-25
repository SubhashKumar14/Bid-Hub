import { amountToPaise } from "./validation.js";
export function allocateOffer(amount, milestones) {
  const total = amountToPaise(amount);
  if (!milestones.length || total < milestones.length) throw Object.assign(new Error("A positive allocation for every checkpoint is required."), { status: 400 });
  const weights = milestones.map(m => amountToPaise(m.amount));
  const weight = weights.reduce((a,b) => a+b, 0);
  const parts = weights.map(w => Math.max(1, Number(BigInt(total) * BigInt(w) / BigInt(weight))));
  let extra = total - parts.reduce((a,b) => a+b, 0);
  const order = weights.map((w,i) => ({ i, remainder: BigInt(total) * BigInt(w) % BigInt(weight) })).sort((a,b) => a.remainder === b.remainder ? a.i-b.i : a.remainder > b.remainder ? -1 : 1);
  for (let i=0; extra>0; i++,extra--) parts[order[i % order.length].i]++;
  // Very small offers still reserve a positive paise amount for each checkpoint.
  while (extra < 0) { const i = parts.indexOf(Math.max(...parts)); parts[i]--; extra++; }
  return milestones.map((m,i) => ({ milestoneId: m._id, title: m.title, amountPaise: parts[i], dueDate: m.dueDate || "" }));
}

// Accept only a complete allocation of the published milestones. Names come from
// the brief, never from a caller; amounts are stored as integer paise.
export function offerSchedule(amount, milestones, input, deliveryDeadline) {
  const total = amountToPaise(amount);
  const schedule = input === undefined ? allocateOffer(amount, milestones) : input;
  const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!Array.isArray(schedule) || !schedule.length || schedule.length !== milestones.length || schedule.length > 50) invalid("Include every milestone once in your price breakdown.");
  const seen = new Set();
  const rows = schedule.map(row => {
    if (!row || typeof row !== "object") invalid("Check the milestone amounts and try again.");
    const id = String(row.milestoneId || "");
    const milestone = milestones.find(item => String(item._id) === id);
    if (!milestone || seen.has(id)) invalid("Each milestone must belong to this project and appear once.");
    seen.add(id);
    if (row.amount !== undefined && row.amountPaise !== undefined) invalid("Send one amount for each milestone.");
    const amountPaise = row.amount !== undefined ? amountToPaise(row.amount) : row.amountPaise;
    if (!Number.isSafeInteger(amountPaise) || amountPaise < 1 || amountPaise > 99999999999) invalid("Each milestone needs an amount of at least ₹0.01, with no more than two decimal places.");
    const dueDate = row.dueDate === undefined ? (milestone.dueDate || "") : row.dueDate;
    if (typeof dueDate !== "string" || (dueDate && (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !Number.isFinite(Date.parse(dueDate)) || new Date(dueDate).toISOString().slice(0, 10) !== dueDate || dueDate <= new Date().toISOString().slice(0, 10) || (deliveryDeadline && dueDate > deliveryDeadline)))) invalid("Choose a future milestone date on or before the project delivery date.");
    return { milestoneId: milestone._id, title: milestone.title, amountPaise, dueDate };
  });
  if (rows.reduce((sum, row) => sum + row.amountPaise, 0) !== total) invalid("Milestone amounts must add up to your proposed price. Adjust the breakdown or the price.");
  return milestones.map(milestone => rows.find(row => String(row.milestoneId) === String(milestone._id)));
}

export function offerTerms(amount, timeline, proposal, schedule) {
  return JSON.stringify({ totalPaise: amountToPaise(amount), timeline, proposal, schedule: schedule.map(row => ({ milestoneId: String(row.milestoneId), amountPaise: row.amountPaise, dueDate: row.dueDate || "" })) });
}
