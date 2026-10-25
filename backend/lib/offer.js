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
