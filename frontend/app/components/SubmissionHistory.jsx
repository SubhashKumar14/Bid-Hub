import { useEffect, useState } from "react";
import { downloadAttachment } from "../../api/fileApi";
import { Button } from "./ui/button";
import { statusLabel } from "./StatusBadge";
export function SubmissionHistory({ milestoneId, token }) {
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");
  const [before, setBefore] = useState("");
  const [next, setNext] = useState("");
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch(`/api/milestones/${milestoneId}/submission?history=true${before ? `&before=${before}` : ""}`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }).then(async r => {
      if (!r.ok) throw new Error("Earlier submissions could not be loaded. Try again to see the saved versions.");
      const rows = await r.json();
      if (controller.signal.aborted) return;
      setNext(r.headers.get("X-Next-Cursor") || "");
      setVersions(prev => before ? Array.from(new Map([...prev, ...rows].map(v => [v._id, v])).values()) : rows);
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [milestoneId, token, before, retry]);
  return <details className="w-full text-xs border-t border-border pt-3"><summary>Submission history ({versions.length}{next ? "+" : ""})</summary>
    {error && <p role="alert">{error} <Button variant="outline" disabled={loading} onClick={() => setRetry(n => n + 1)}>Retry history</Button></p>}
    {versions.map(v => <article key={v._id} className="py-3 space-y-1 border-b border-border"><p>Version {v.version} · {statusLabel(v.status)}</p><p className="whitespace-pre-wrap">{v.description}</p>{v.reviewComment && <p>Client feedback: {v.reviewComment}</p>}{[["Repository", v.githubUrl], ["Deliverable", v.demoUrl], ["Video", v.videoUrl]].filter(([, url]) => url).map(([label, url]) => <p key={label}><a href={url} target="_blank" rel="noopener noreferrer" className="underline break-all">{label}: {url}</a></p>)}{v.attachments?.map(f => <p key={f.url}><a href={f.url} onClick={event => downloadAttachment(event, f.url, f.name, token).catch(e => setError(e.message))}>{f.name}</a></p>)}</article>)}
    {loading && <p role="status">Loading earlier submissions…</p>}
    {next && !error && <Button variant="outline" disabled={loading} onClick={() => setBefore(next)}>Load earlier submissions</Button>}
  </details>;
}
