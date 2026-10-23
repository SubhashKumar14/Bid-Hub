import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function ProjectRecovery({ project, token, participant, onUpdate }) {
  const [items, setItems] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!token || project.status !== "OPEN") return;
    const controller = new AbortController();
    fetch(`/api/projects/${project._id}/clarifications`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }).then(async r => { if (!r.ok) throw new Error("Could not load clarifications."); return r.json(); }).then(setItems).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [project._id, token, project.status]);
  if (!token || (project.status !== "OPEN" && !participant)) return null;
  const open = project.status === "OPEN";
  if (!open && !["ASSIGNED", "IN_PROGRESS", "PENDING_FUNDING"].includes(project.status)) return null;
  const submit = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/projects/${project._id}/${open ? "clarifications" : "recovery"}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(open ? { content: text } : { reason: text }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.message);
      if (open) setItems(prev => [{ ...data, authorId: { name: "You" } }, ...prev]); else onUpdate();
      setText("");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="space-y-3 border-t border-border py-5">
    <h2 className="text-lg font-medium">{open ? "Brief clarifications" : "Contract recovery"}</h2>
    <p className="text-xs text-muted-foreground">{open ? "Visible to the client and other signed-in prospective students. Do not share private work or contact details. Changes to your offer require a proposal revision." : "Request operator help for termination, a funding problem or a dispute. Work pauses while reviewed; no automatic refund or payout is available."}</p>
    {project.recoveryPending ? <p role="status">Recovery is pending operator review. Evidence and discussion remain available.</p> : <>
      <label htmlFor="project-question" className="text-sm">{open ? "Question or clarification" : "Recovery reason"}</label>
      <Textarea id="project-question" value={text} onChange={e => setText(e.target.value)} maxLength={open ? 2000 : 5000} />
      <Button variant="outline" disabled={busy || text.trim().length < (open ? 1 : 10)} onClick={submit}>{open ? "Post clarification" : "Request operator review"}</Button>
    </>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {open && items.map(item => <p key={item._id} className="text-sm border-b border-border py-2"><strong>{item.authorId?.name || "Participant"}: </strong>{item.content}</p>)}
  </section>;
}
