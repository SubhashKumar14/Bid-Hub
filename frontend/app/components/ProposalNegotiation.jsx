import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { MilestoneAllocationEditor, OfferSchedule, allocationDraft, currentAllocations, money } from "./MilestoneAllocationEditor";
import { offerSchedule } from "../../../backend/lib/offer.js";

const statusText = { PENDING: "Waiting for a reply", ACCEPTED: "Accepted", DECLINED: "Declined", WITHDRAWN: "Withdrawn", SUPERSEDED: "No longer open" };
export function ProposalNegotiation({ bid, project, milestones, token, isOwner, onChanged }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [allocations, setAllocations] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmedId, setConfirmedId] = useState("");
  const identity = useRef(null);
  const current = bid.counteroffers?.at(-1);
  const open = project.status === "OPEN" && bid.status === "PENDING";
  const begin = () => {
    const terms = current?.status === "PENDING" ? current : bid;
    setDraft({ amount: terms.amount, timeline: terms.timeline, proposal: terms.proposal, message: "", proposalVersion: bid.version, previousCounterofferVersion: current?.version || 0 });
    setAllocations(terms.schedule?.length ? allocationDraft(terms.schedule) : null);
    identity.current = null; setError(""); setEditing(true);
  };
  const send = async event => {
    event.preventDefault(); setError("");
    try {
      const rows = currentAllocations(draft.amount, milestones, allocations);
      offerSchedule(draft.amount, milestones, rows, project.deadline);
      const content = JSON.stringify({ ...draft, schedule: rows });
      if (identity.current?.content !== content) identity.current = { content, id: crypto.randomUUID() };
      setBusy(true);
      const response = await fetch(`/api/bids/${bid._id}/counteroffers`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...draft, schedule: rows, requestId: identity.current.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "The counteroffer was not saved. Try again with the same terms.");
      setEditing(false); await onChanged();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const decide = async action => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/bids/${bid._id}/counteroffers/${current._id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, proposalVersion: current.baseProposalVersion, counterofferVersion: current.version }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Your reply was not saved. Refresh the proposal before trying again.");
      setConfirmedId(""); await onChanged();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  return <section className="min-w-0 space-y-4 border-t border-border pt-4" aria-label="Proposal terms and counteroffers">
    <div className="space-y-2"><h4 className="text-sm font-medium">Proposed milestones</h4><OfferSchedule schedule={bid.schedule} /></div>
    {current && <div className="space-y-3 border-t border-border pt-3">
      <div className="flex flex-wrap justify-between gap-2"><h4 className="font-medium text-sm">Client counteroffer {current.version}</h4><span className="text-xs text-muted-foreground">{!open && current.status === "PENDING" ? "Closed with project" : statusText[current.status]}</span></div>
      <p className="text-sm">{money(current.amount)} · {current.timeline}</p>
      <p className="text-sm whitespace-pre-wrap break-words">{current.proposal}</p>
      {current.message && <p className="text-xs text-muted-foreground whitespace-pre-wrap">Client note: {current.message}</p>}
      <OfferSchedule schedule={current.schedule} />
      {open && current.status === "PENDING" && (isOwner ? <><p className="text-xs text-muted-foreground">The student needs to accept these terms before you can fund the project. You can withdraw this counteroffer to return to their proposal.</p><Button variant="outline" disabled={busy} onClick={() => decide("WITHDRAW")}>Withdraw counteroffer</Button></> : <>
        <p className="text-xs text-muted-foreground">Accepting saves this price, work description, timeline and milestone breakdown as your agreement. Work starts after the client confirms test funding.</p>
        <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1 size-4 shrink-0" checked={confirmedId === current._id} onChange={event => setConfirmedId(event.target.checked ? current._id : "")} />I agree to these counteroffer terms.</label>
        <div className="flex flex-wrap gap-2"><Button disabled={busy || confirmedId !== current._id} onClick={() => decide("ACCEPT")}>{busy ? "Saving reply…" : "Accept counteroffer"}</Button><Button variant="outline" disabled={busy} onClick={() => decide("DECLINE")}>Decline counteroffer</Button></div>
      </>)}
    </div>}
    {open && isOwner && !editing && <Button variant="outline" onClick={begin}>{current?.status === "PENDING" ? "Replace counteroffer" : "Make a counteroffer"}</Button>}
    {editing && draft && <form onSubmit={send} className="space-y-3 border-t border-border pt-4" aria-label="New counteroffer">
      <h4 className="font-medium">Propose different terms</h4>
      <p className="text-xs text-muted-foreground">The student can accept or decline. Sending this does not hire them or start a payment.</p>
      {(draft.proposalVersion !== bid.version || draft.previousCounterofferVersion !== (current?.version || 0)) && <p role="alert" className="text-sm text-destructive">The terms changed while you were editing. <button type="button" className="underline" onClick={begin}>Load the latest terms</button> before sending.</p>}
      <fieldset disabled={busy} className="min-w-0 space-y-3">
      <div><label htmlFor={`counter-price-${bid._id}`} className="text-sm">Total price (₹)</label><Input id={`counter-price-${bid._id}`} inputMode="decimal" required value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} /></div>
      <div><label htmlFor={`counter-timeline-${bid._id}`} className="text-sm">Timeline</label><Input id={`counter-timeline-${bid._id}`} maxLength={200} required value={draft.timeline} onChange={event => setDraft({ ...draft, timeline: event.target.value })} /></div>
      <div><label htmlFor={`counter-work-${bid._id}`} className="text-sm">Work to deliver</label><Textarea id={`counter-work-${bid._id}`} required maxLength={10000} value={draft.proposal} onChange={event => setDraft({ ...draft, proposal: event.target.value })} /></div>
      <MilestoneAllocationEditor prefix={`counter-${bid._id}`} price={draft.amount} milestones={milestones} value={allocations} onChange={setAllocations} deadline={project.deadline} disabled={busy} />
      <div><label htmlFor={`counter-note-${bid._id}`} className="text-sm">Message to the student (optional)</label><Textarea id={`counter-note-${bid._id}`} maxLength={2000} value={draft.message} placeholder="Explain what you changed and why." onChange={event => setDraft({ ...draft, message: event.target.value })} /></div>
      </fieldset>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy || draft.proposalVersion !== bid.version || draft.previousCounterofferVersion !== (current?.version || 0)}>{busy ? "Sending…" : "Send counteroffer"}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => { setEditing(false); setError(""); }}>Cancel editing</Button></div>
    </form>}
    {error && <p role="alert" className="text-sm text-destructive break-words">{error}</p>}
    {Boolean(bid.history?.length || bid.counteroffers?.length) && <details className="text-sm border-t border-border pt-3"><summary className="cursor-pointer min-h-11 py-3">Proposal and negotiation history</summary><div className="space-y-4 py-3">
      {bid.history?.map(version => <div key={`proposal-${version.version}`} className="space-y-2"><h5 className="font-medium">Student proposal {version.version} · {money(version.amount)} · {version.timeline}</h5><p className="whitespace-pre-wrap">{version.proposal}</p><OfferSchedule schedule={version.schedule} /></div>)}
      {bid.counteroffers?.map(offer => <div key={offer._id} className="space-y-2"><h5 className="font-medium">Client counteroffer {offer.version} · {statusText[offer.status]}</h5><p>{money(offer.amount)} · {offer.timeline}</p><p className="whitespace-pre-wrap">{offer.proposal}</p><OfferSchedule schedule={offer.schedule} /></div>)}
    </div></details>}
  </section>;
}
