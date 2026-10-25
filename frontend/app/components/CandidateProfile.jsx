import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";
export function CandidateProfile({ userId, onClose }) {
  const [data, setData] = useState(null);
  const [work, setWork] = useState([]);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setData(null);
    Promise.all([
      fetch(`/api/users/${userId}`, { signal: controller.signal }),
      fetch(`/api/users/${userId}/work-record`, { signal: controller.signal }),
    ]).then(async responses => {
      if (responses.some(response => !response.ok)) throw new Error("This profile could not be loaded. Try again to see the student's work and reviews.");
      const [profile, projects] = await Promise.all(responses.map(response => response.json()));
      if (!controller.signal.aborted) { setData(profile); setWork(projects); }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [userId, retry]);
  return <Dialog open={Boolean(userId)} onOpenChange={open => !open && onClose()}>
    <DialogContent className="max-h-[85vh] overflow-y-auto space-y-4">
      <DialogTitle>Student profile</DialogTitle>
      <DialogDescription>See their skills, completed projects and reviews before deciding.</DialogDescription>
      {error ? <p role="alert">{error} <Button onClick={() => setRetry(value => value + 1)}>Retry profile</Button></p> : !data ? <p role="status">Loading profile…</p> : <>
        <div className="space-y-2"><h2 className="font-medium text-lg">{data.user.name}{data.user.sampleData ? " · Sample account" : ""}</h2><p className="text-sm whitespace-pre-wrap">{data.user.bio || "This student has not added an introduction yet."}</p><p className="text-sm text-muted-foreground">{data.user.skills?.join(", ")}</p></div>
        <section className="space-y-2 border-t border-border pt-4"><h3 className="font-medium">Completed work</h3>{work.length ? work.map(project => <p className="text-sm" key={project._id}>{project.title} · {project.category}{project.sampleData ? " · Sample work" : ""}</p>) : <p className="text-sm text-muted-foreground">No completed projects on Bid·Hub yet.</p>}</section>
        <section className="space-y-3 border-t border-border pt-4"><h3 className="font-medium">{data.reviews.length ? `${data.user.rating}/5 from ${data.reviews.length} reviews` : "No reviews yet"}</h3>{data.reviews.map(review => <article key={review._id} className="space-y-1 text-sm"><p>{review.rating}/5 · {review.reviewerId?.name || "Project participant"}</p><p className="whitespace-pre-wrap">{review.comment}</p></article>)}</section>
      </>}
    </DialogContent>
  </Dialog>;
}
