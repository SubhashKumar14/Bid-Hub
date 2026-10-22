import { downloadAttachment } from "../../api/fileApi";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Github, Link, FileText, CornerDownRight, ExternalLink, Paperclip } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

export function MilestoneReviewModal({ open, onClose, milestoneId, milestoneTitle, token, onSuccess }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [reviewComment, setReviewComment] = useState("");

  const targetRef = useRef("");
  targetRef.current = open ? `${milestoneId}:${token}` : "";
  const fetchSubmission = async () => {
    const target = targetRef.current;
    if (!milestoneId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/submission`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (target !== targetRef.current) return;
      if (res.ok) {
        setSubmission(data);
      } else {
        setSubmission(null);
      }
    } catch (err) {
      console.error("Failed to fetch submission details", err);
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSubmission(null);
    if (open) {
      fetchSubmission();
      setIsRequestingChanges(false);
      setReviewComment("");
    }
  }, [open, milestoneId, token]);

  const handleApprove = async () => {
    if (!window.confirm("Approve this milestone and release escrow funds to the student?")) return;

    setReviewing(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/release`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "APPROVED", submissionId: submission?._id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to release milestone");
      toast.success(data.message || "Milestone approved and escrow released");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReviewing(false);
    }
  };

  const handleRequestChanges = async (e) => {
    if (e) e.preventDefault();
    if (!reviewComment.trim()) {
      toast.error("Feedback comment is required to request revisions");
      return;
    }

    setReviewing(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/release`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status: "CHANGES_REQUESTED",
          submissionId: submission?._id,
          reviewComment: reviewComment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to request changes");
      toast.success("Revisions requested. Student notified.");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReviewing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent aria-describedby="milestone-review-description" className="w-full max-w-lg bg-card border-border rounded-[12px] p-0 shadow-xl overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <span className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Milestone Checkpoint</span>
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground mt-1">{milestoneTitle}</DialogTitle>
            <DialogDescription id="milestone-review-description" className="sr-only">Review submitted deliverables and sign off or request changes.</DialogDescription>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="py-16 text-center text-xs text-muted-foreground animate-pulse">
              Fetching submitted deliverables…
            </div>
          ) : !submission ? (
            <div className="py-12 text-center text-xs text-muted-foreground italic">
              No submission record found for this checkpoint.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Submitted By */}
              <div className="flex items-center gap-3 pb-3 border-b border-border">
                <div className="size-8 rounded-[4px] bg-secondary flex items-center justify-center text-xs font-medium text-foreground overflow-hidden">
                  {submission.submittedBy?.avatarUrl ? (
                    <img src={submission.submittedBy.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    submission.submittedBy?.name?.charAt(0).toUpperCase() || "S"
                  )}
                </div>
                <div>
                  <p className="text-[11px] text-muted-foreground">Submitted by</p>
                  <p className="text-sm font-medium text-foreground">{submission.submittedBy?.name || "Student"}</p>
                </div>
              </div>

              {/* GitHub Link */}
              <div className="rounded-[6px] border border-border p-3.5 bg-secondary/30 flex items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Github className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">Repository</p>
                    <p className="text-xs text-foreground truncate font-mono mt-0.5">{submission.githubUrl}</p>
                  </div>
                </div>
                <a
                  href={submission.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-brand-accent hover:underline shrink-0 font-medium"
                >
                  Open <ExternalLink className="size-3" />
                </a>
              </div>

              {/* Live Demo Link */}
              {submission.demoUrl && (
                <div className="rounded-[6px] border border-border p-3.5 bg-secondary/30 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Link className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Live Demo / Deliverable</p>
                      <p className="text-xs text-foreground truncate font-mono mt-0.5">{submission.demoUrl}</p>
                    </div>
                  </div>
                  <a
                    href={submission.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-brand-accent hover:underline shrink-0 font-medium"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                </div>
              )}

              {/* Demo Video Link */}
              {submission.videoUrl && (
                <div className="rounded-[6px] border border-border p-3.5 bg-secondary/30 flex items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Link className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-muted-foreground">Walkthrough Video</p>
                      <p className="text-xs text-foreground truncate font-mono mt-0.5">{submission.videoUrl}</p>
                    </div>
                  </div>
                  <a
                    href={submission.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-brand-accent hover:underline shrink-0 font-medium"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                </div>
              )}

              {/* Notes / Description */}
              {submission.description && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <FileText className="size-3.5" /> Notes from Student
                  </p>
                  <p className="text-xs bg-secondary/30 border border-border p-3 rounded-[6px] leading-relaxed whitespace-pre-wrap text-foreground">
                    {submission.description}
                  </p>
                </div>
              )}

              {/* Attachments */}
              {submission.attachments && submission.attachments.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Paperclip className="size-3.5" /> Attachments
                  </span>
                  <div className="space-y-1">
                    {submission.attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-[4px] bg-secondary border border-border">
                        <span className="font-medium text-foreground truncate max-w-[75%]">{file.name}</span>
                        <a
                          href={file.url}
                          onClick={event => downloadAttachment(event, file.url, file.name, token).catch(error => toast.error(error.message))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-brand-accent hover:underline font-medium"
                        >
                          Download
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Feedback comment input box if requesting changes */}
              {isRequestingChanges && (
                <div className="pt-3 border-t border-border space-y-2">
                  <label htmlFor="revision-feedback" className="text-xs font-medium text-[var(--status-danger-fg)] flex items-center gap-1">
                    <CornerDownRight className="size-3.5" /> Revision Feedback
                  </label>
                  <textarea
                    id="revision-feedback"
                    placeholder="Specify concrete changes needed before escrow approval…"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    required
                    disabled={reviewing}
                    rows={3}
                    className="w-full rounded-[5px] bg-input-background border border-input px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex justify-between items-center gap-2">
          {isRequestingChanges ? (
            <>
              <Button variant="ghost" onClick={() => setIsRequestingChanges(false)} disabled={reviewing} className="rounded-[5px] text-xs">
                Back
              </Button>
              <Button
                onClick={handleRequestChanges}
                disabled={reviewing || !reviewComment.trim()}
                variant="destructive"
                className="rounded-[5px] text-xs font-medium"
              >
                {reviewing ? (
                  <>
                    <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Sending…
                  </>
                ) : (
                  "Send Revision Request"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="text-[var(--status-danger-fg)] border-[var(--status-danger-border)] hover:bg-[var(--status-danger-bg)] rounded-[5px] text-xs"
                onClick={() => setIsRequestingChanges(true)}
                disabled={reviewing || !submission || loading}
              >
                Request Revisions
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={reviewing} className="rounded-[5px] text-xs">
                  Close
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={reviewing || !submission || loading}
                  className="rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
                >
                  {reviewing ? (
                    <>
                      <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Releasing…
                    </>
                  ) : (
                    "Approve & Release Escrow"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
