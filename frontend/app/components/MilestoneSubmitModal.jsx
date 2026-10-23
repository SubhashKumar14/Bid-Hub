import { useState, useEffect, useRef } from "react";
import { useCapabilities } from "../../api/capabilities";
import { SubmissionHistory } from "./SubmissionHistory";
import { toast } from "sonner";
import { Loader2, Github, Link, FileText, Upload, Trash2 } from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";

export function MilestoneSubmitModal({ open, onClose, milestoneId, milestoneTitle, token, onSuccess }) {
  const capabilities = useCapabilities();
  const [githubUrl, setGithubUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState(null);

  const targetRef = useRef("");
  useEffect(() => () => { targetRef.current = ""; }, []);
  targetRef.current = open ? `${milestoneId}:${token}` : "";
  // Fetch previous submission if it exists
  const fetchPreviousSubmission = async () => {
    if (!milestoneId || !token) return;
    const target = targetRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/submission`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (target !== targetRef.current) return;
      if (res.ok && data) {
        setPreviousSubmission(data);
        setGithubUrl(data.githubUrl || "");
        setDemoUrl(data.demoUrl || "");
        setVideoUrl(data.videoUrl || "");
        setDescription(data.description || "");
        setAttachments(data.attachments || []);
      } else {
        if (!res.ok) { setHistoryError(true); setError(data.message || "Submission history unavailable. Close and reopen to retry."); }
        setPreviousSubmission(null);
        setGithubUrl("");
        setDemoUrl("");
        setVideoUrl("");
        setDescription("");
        setAttachments([]);
      }
    } catch (err) {
      if (target === targetRef.current) { setHistoryError(true); setError("Could not load submission history. Close and reopen to retry."); }
    } finally {
      if (target === targetRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    setError(""); setHistoryError(false); setDescription(""); setGithubUrl(""); setDemoUrl(""); setVideoUrl(""); setAttachments([]); setPreviousSubmission(null); setSubmitting(false); setUploading(false);
    if (open) {
      fetchPreviousSubmission();
    }
  }, [open, milestoneId, token]);

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const target = targetRef.current;
    setError("");
    setUploading(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await fetch("/api/uploads/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (target !== targetRef.current) return;
      if (!res.ok) throw new Error(data.message || "Failed to upload files");
      setAttachments((prev) => [...prev, ...data]);
      toast.success("Files uploaded successfully");
    } catch (err) {
      if (target !== targetRef.current) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (target === targetRef.current) setUploading(false);
    }
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      toast.error("Submission notes must be at least 10 characters");
      return;
    }

    const target = targetRef.current;
    if (submitting || uploading) return;
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/submit`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          githubUrl: githubUrl.trim(),
          demoUrl: demoUrl.trim(),
          videoUrl: videoUrl.trim(),
          description: description.trim(),
          attachments,
        }),
      });
      const data = await res.json();
      if (target !== targetRef.current) return;
      if (!res.ok) throw new Error(data.message || "Submission failed");
      toast.success("Milestone submitted for review");
      onSuccess();
      onClose();
    } catch (err) {
      if (target !== targetRef.current) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (target === targetRef.current) setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent aria-describedby="milestone-submit-description" className="w-full max-w-lg bg-card border-border rounded-[12px] p-0 shadow-xl overflow-hidden flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <span className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Milestone Deliverable</span>
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground mt-1">{milestoneTitle}</DialogTitle>
            <DialogDescription id="milestone-submit-description" className="sr-only">Submit deliverables for this milestone.</DialogDescription>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Changes Requested Callout */}
          {previousSubmission && previousSubmission.status === "CHANGES_REQUESTED" && (
            <div className="bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] rounded-[8px] p-4 text-xs space-y-1">
              <span className="font-semibold text-[var(--status-danger-fg)] uppercase tracking-wider text-[10px]">Changes Requested by Client</span>
              <p className="text-xs text-foreground/90 italic">"{previousSubmission.reviewComment}"</p>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-xs text-muted-foreground animate-pulse">
              Loading submission record…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* GitHub URL */}
              <div className="space-y-1.5">
                <label htmlFor="milestone-github-url" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Github className="size-3.5 text-muted-foreground" /> Repository URL
                </label>
                <input
                  id="milestone-github-url"
                  type="url"
                  placeholder="https://github.com/username/project-repo"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-[5px] bg-input-background border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                />
              </div>

              {/* Demo URL */}
              <div className="space-y-1.5">
                <label htmlFor="milestone-demo-url" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Link className="size-3.5 text-muted-foreground" /> Deliverable / Live Demo URL
                </label>
                <input
                  id="milestone-demo-url"
                  type="url"
                  placeholder="https://project.vercel.app or Figma share link"
                  value={demoUrl}
                  onChange={(e) => setDemoUrl(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-[5px] bg-input-background border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                />
              </div>

              {/* Video URL */}
              <div className="space-y-1.5">
                <label htmlFor="milestone-video-url" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Link className="size-3.5 text-muted-foreground" /> Walkthrough Video URL (Loom/YouTube/Drive)
                </label>
                <input
                  id="milestone-video-url"
                  type="url"
                  placeholder="https://www.loom.com/share/…"
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-[5px] bg-input-background border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                />
              </div>

              {/* Description / Notes */}
              <div className="space-y-1.5">
                <label htmlFor="milestone-notes" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5 text-muted-foreground" /> Summary Notes
                </label>
                <textarea
                  id="milestone-notes"
                  placeholder="Describe your implementation details, verify completed features, or leave comments (min 10 characters)…"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                  rows={3}
                  className="w-full rounded-[5px] bg-input-background border border-input px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring"
                />
              </div>

              {/* Attachments Selector */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                  <Upload className="size-3.5 text-muted-foreground" /> Attachments (Optional, max 10MB per file)
                </span>
                <div className="flex items-center justify-center border border-dashed border-input rounded-[8px] p-5 bg-secondary/20 hover:bg-secondary/40 transition-colors relative cursor-pointer group">
                  <input
                    type="file"
                    aria-label="Attach files to milestone submission"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploading || submitting || !capabilities?.privateAttachments}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="text-center space-y-1">
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        <p className="text-xs text-muted-foreground">Uploading files…</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="size-5 mx-auto text-muted-foreground" />
                        <p className="text-xs text-foreground font-medium">{capabilities?.privateAttachments ? "Click to attach files" : "Attachments unavailable; ask the operator to configure private storage."}</p>
                        <p className="text-[10px] text-muted-foreground">PDF, DOCX, PPTX, PNG, JPG</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Uploaded Attachments list */}
                {attachments.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-[4px] bg-secondary border border-border">
                        <span className="font-medium text-foreground truncate max-w-[80%]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          disabled={submitting}
                          aria-label={`Remove attachment ${file.name}`}
                          className="min-h-11 min-w-11 inline-flex items-center justify-center text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </form>
          )}
        </div>

        {previousSubmission && <div className="px-5 pb-3"><SubmissionHistory key={`${milestoneId}:${token}`} milestoneId={milestoneId} token={token} /></div>}
        {error && <p role="alert" className="px-5 py-2 text-sm text-destructive">{error}</p>}
        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting} className="rounded-[5px] text-xs">
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || uploading || description.trim().length < 10 || loading || historyError}
            className="rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-medium"
          >
            {submitting ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" /> Submitting…
              </>
            ) : (
              "Submit Deliverable"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
