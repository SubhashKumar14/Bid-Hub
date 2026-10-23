import { useEffect, useState } from "react";
import { downloadAttachment } from "../../api/fileApi";
export function SubmissionHistory({ milestoneId, token }) {
  const [versions, setVersions] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/milestones/${milestoneId}/submission?history=true`, { signal: controller.signal, headers: { Authorization: `Bearer ${token}` } }).then(async r => { if (!r.ok) throw new Error("History unavailable; reopen to retry."); return r.json(); }).then(setVersions).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [milestoneId, token]);
  return <details className="w-full text-xs border-t border-border pt-3"><summary>Submission history ({versions.length})</summary>
    {error && <p role="alert">{error}</p>}
    {versions.map(v => <article key={v._id} className="py-3 space-y-1 border-b border-border"><p>Version {v.version} · {v.status}</p><p className="whitespace-pre-wrap">{v.description}</p>{v.reviewComment && <p>Client feedback: {v.reviewComment}</p>}{[["Repository", v.githubUrl], ["Deliverable", v.demoUrl], ["Video", v.videoUrl]].filter(([, url]) => url).map(([label, url]) => <p key={label}><a href={url} target="_blank" rel="noopener noreferrer" className="underline break-all">{label}: {url}</a></p>)}{v.attachments?.map(f => <p key={f.url}><a href={f.url} onClick={event => downloadAttachment(event, f.url, f.name, token).catch(e => setError(e.message))}>{f.name}</a></p>)}</article>)}
  </details>;
}
