import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Github, Link, FileText, ArrowRight, CornerDownRight, X, ExternalLink, Paperclip } from "lucide-react";
import { Button } from "./ui/button";

export function MilestoneReviewModal({ open, onClose, milestoneId, milestoneTitle, token, onSuccess }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [isRequestingChanges, setIsRequestingChanges] = useState(false);
  const [reviewComment, setReviewComment] = useState("");

  const fetchSubmission = async () => {
    if (!milestoneId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/submission`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
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
    if (open) {
      fetchSubmission();
      setIsRequestingChanges(false);
      setReviewComment("");
    }
  }, [open, milestoneId]);

  const handleApprove = async () => {
    if (!window.confirm("Are you sure you want to approve this milestone? This will release the allocated escrow funds to the student.")) return;

    setReviewing(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/release`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: "APPROVED" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to release milestone");
      toast.success("Milestone approved and escrow funds released successfully!");
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
      toast.error("Feedback comment is required to request changes.");
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
          reviewComment: reviewComment.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to request changes");
      toast.success("Changes requested successfully. Student notified.");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setReviewing(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <span className="eyebrow">Review Milestone Deliverables</span>
            <h2 className="font-serif text-xl mt-1">{milestoneTitle}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full transition-colors text-muted-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground animate-pulse font-serif">
              Fetching submitted deliverables...
            </div>
          ) : !submission ? (
            <div className="py-16 text-center text-sm text-muted-foreground italic">
              No submission record found for this milestone.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Submitted By */}
              <div className="flex items-center gap-2 pb-3 border-b border-border/50">
                <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground overflow-hidden">
                  {submission.submittedBy?.avatarUrl ? (
                    <img src={submission.submittedBy.avatarUrl} alt="" className="size-full object-cover" />
                  ) : (
                    submission.submittedBy?.name?.charAt(0).toUpperCase() || "S"
                  )}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Submitted By</p>
                  <p className="text-sm font-semibold">{submission.submittedBy?.name || "Student"}</p>
                </div>
              </div>

              {/* GitHub Link */}
              <div className="paper hairline rounded-xl p-4 bg-background/40 flex items-center justify-between gap-4">
                <div className="flex items-start gap-2.5 min-w-0">
                  <Github className="size-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground font-semibold">GitHub Repository</p>
                    <p className="text-sm text-foreground/80 truncate font-mono mt-0.5">{submission.githubUrl}</p>
                  </div>
                </div>
                <a
                  href={submission.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-[var(--brand-gold)] hover:underline flex-shrink-0 font-medium"
                >
                  Open <ExternalLink className="size-3" />
                </a>
              </div>

              {/* Live Demo Link */}
              {submission.demoUrl && (
                <div className="paper hairline rounded-xl p-4 bg-background/40 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Link className="size-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-semibold">Live Demo URL</p>
                      <p className="text-sm text-foreground/80 truncate font-mono mt-0.5">{submission.demoUrl}</p>
                    </div>
                  </div>
                  <a
                    href={submission.demoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--brand-gold)] hover:underline flex-shrink-0 font-medium"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                </div>
              )}

              {/* Demo Video Link */}
              {submission.videoUrl && (
                <div className="paper hairline rounded-xl p-4 bg-background/40 flex items-center justify-between gap-4">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <Link className="size-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground font-semibold">Demo Video URL</p>
                      <p className="text-sm text-foreground/80 truncate font-mono mt-0.5">{submission.videoUrl}</p>
                    </div>
                  </div>
                  <a
                    href={submission.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-[var(--brand-gold)] hover:underline flex-shrink-0 font-medium"
                  >
                    Open <ExternalLink className="size-3" />
                  </a>
                </div>
              )}

              {/* Notes / Description */}
              {submission.description && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5">
                    <FileText className="size-3.5" /> Submission Notes
                  </p>
                  <p className="text-sm bg-muted/30 border border-border p-3.5 rounded-xl leading-relaxed whitespace-pre-wrap">
                    {submission.description}
                  </p>
                </div>
              )}

              {/* Attachments */}
              {submission.attachments && submission.attachments.length > 0 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                    <Paperclip className="size-3.5" /> Attached Files
                  </span>
                  <div className="space-y-1.5">
                    {submission.attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-background border border-border">
                        <span className="font-medium truncate max-w-[75%]">{file.name}</span>
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-[var(--brand-gold)] hover:underline font-medium"
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
                <div className="pt-3 border-t border-border space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-red-500 flex items-center gap-1">
                      <CornerDownRight className="size-3.5" /> Revision Details / Feedback
                    </label>
                    <textarea
                      placeholder="Specify what needs to be changed (e.g. Navbar mobile layout, validation bugs, test cases)..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      required
                      disabled={reviewing}
                      rows={3}
                      className="w-full rounded-xl bg-background border border-border px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex justify-between items-center gap-2">
          {isRequestingChanges ? (
            <>
              <Button variant="ghost" onClick={() => setIsRequestingChanges(false)} disabled={reviewing}>
                Back
              </Button>
              <Button
                onClick={handleRequestChanges}
                disabled={reviewing || !reviewComment.trim()}
                className="bg-red-600 hover:bg-red-700 text-white rounded-xl"
              >
                {reviewing ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" /> Sending...
                  </>
                ) : (
                  "Submit Revision Request"
                )}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                className="text-red-500 border-red-500/20 hover:bg-red-500/10 rounded-xl"
                onClick={() => setIsRequestingChanges(true)}
                disabled={reviewing || !submission || loading}
              >
                Request Changes
              </Button>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose} disabled={reviewing}>
                  Close
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={reviewing || !submission || loading}
                  className="bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90 rounded-xl font-semibold"
                >
                  {reviewing ? (
                    <>
                      <Loader2 className="size-4 mr-1.5 animate-spin" /> Releasing...
                    </>
                  ) : (
                    "Approve & Release Escrow"
                  )}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
