import { allocateOffer } from "../../../backend/lib/offer.js";
import { amountToPaise } from "../../../backend/lib/validation.js";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export const money = value => `₹${Number(value).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const allocationDraft = schedule => schedule.map(row => ({ milestoneId: String(row.milestoneId), amount: (row.amountPaise / 100).toFixed(2), dueDate: row.dueDate || "" }));
export function currentAllocations(price, milestones, value) {
  if (value !== null) return value;
  try { return allocationDraft(allocateOffer(price, milestones)); }
  catch { return milestones.map(row => ({ milestoneId: String(row._id), amount: "", dueDate: row.dueDate || "" })); }
}

export function OfferSchedule({ schedule = [] }) {
  return <ul className="space-y-2 text-sm">
    {schedule.map(row => <li key={String(row.milestoneId)} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b border-border/60 pb-2 last:border-0">
      <span className="min-w-0 break-words">{row.title}{row.dueDate && <span className="block text-xs text-muted-foreground">Due {row.dueDate}</span>}</span>
      <span className="font-mono tabular-nums shrink-0">{money(row.amountPaise / 100)}</span>
    </li>)}
  </ul>;
}

export function MilestoneAllocationEditor({ price, milestones, value, onChange, deadline, prefix, disabled }) {
  const rows = currentAllocations(price, milestones, value);
  let summary = "Enter a price, then split it between the milestones.";
  let balanced = false;
  try {
    const total = amountToPaise(price);
    const allocated = rows.reduce((sum, row) => sum + amountToPaise(row.amount), 0);
    const difference = total - allocated;
    balanced = difference === 0;
    summary = balanced ? `${money(total / 100)} allocated. The amounts match your price.` : difference > 0 ? `${money(difference / 100)} left to allocate.` : `${money(-difference / 100)} over your price. Reduce a milestone amount or change the price.`;
  } catch { /* The field labels and summary explain incomplete amounts. */ }
  const update = (index, field, next) => onChange(rows.map((row, i) => i === index ? { ...row, [field]: next } : row));
  return <fieldset disabled={disabled} className="min-w-0 space-y-3 border-t border-border pt-4">
    <legend className="text-sm font-medium pr-2">Milestone breakdown</legend>
    <p className="text-xs text-muted-foreground">Set an amount for each milestone. Together, they must equal your price. Dates are optional and must be on or before {deadline}.</p>
    {milestones.map((milestone, index) => <div key={milestone._id} className="min-w-0 space-y-2">
      <p className="text-sm font-medium break-words">{index + 1}. {milestone.title}</p>
      <div className="grid sm:grid-cols-2 gap-2">
        <div><label className="text-xs text-muted-foreground" htmlFor={`${prefix}-amount-${index}`}>Amount (₹)</label><Input id={`${prefix}-amount-${index}`} inputMode="decimal" required value={rows[index]?.amount || ""} onChange={event => update(index, "amount", event.target.value)} aria-describedby={`${prefix}-total`} /></div>
        <div><label className="text-xs text-muted-foreground" htmlFor={`${prefix}-date-${index}`}>Due date (optional)</label><Input id={`${prefix}-date-${index}`} type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} max={deadline} value={rows[index]?.dueDate || ""} onChange={event => update(index, "dueDate", event.target.value)} /></div>
      </div>
    </div>)}
    <p id={`${prefix}-total`} role="status" aria-live="polite" className={`text-xs ${balanced ? "text-muted-foreground" : "text-destructive"}`}>{summary}</p>
    <Button type="button" variant="outline" size="sm" onClick={() => onChange(null)}>Use suggested split</Button>
  </fieldset>;
}
