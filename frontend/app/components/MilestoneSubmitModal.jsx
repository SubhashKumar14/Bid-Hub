import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Github, Link, FileText, Upload, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";

export function MilestoneSubmitModal({ open, onClose, milestoneId, milestoneTitle, token, onSuccess }) {
  const [githubUrl, setGithubUrl] = useState("");
  const [demoUrl, setDemoUrl] = useState("");
  const [description, setDescription] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previousSubmission, setPreviousSubmission] = useState(null);

  // Fetch previous submission if it exists
  const fetchPreviousSubmission = async () => {
    if (!milestoneId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/submission`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok && data) {
        setPreviousSubmission(data);
        setGithubUrl(data.githubUrl || "");
        setDemoUrl(data.demoUrl || "");
        setDescription(data.description || "");
        setAttachments(data.attachments || []);
      } else {
        setPreviousSubmission(null);
        setGithubUrl("");
        setDemoUrl("");
        setDescription("");
        setAttachments([]);
      }
    } catch (err) {
      console.error("Failed to load previous submission details", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchPreviousSubmission();
    }
  }, [open, milestoneId]);

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

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
      if (!res.ok) throw new Error(data.message || "Failed to upload files");
      setAttachments((prev) => [...prev, ...data]);
      toast.success("Files uploaded successfully!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!githubUrl.trim()) {
      toast.error("GitHub Repository URL is required.");
      return;
    }
    if (!githubUrl.includes("github.com")) {
      toast.error("Please enter a valid GitHub URL.");
      return;
    }

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
          description: description.trim(),
          attachments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Submission failed");
      toast.success("Milestone submitted successfully for review!");
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <div>
            <span className="eyebrow">Milestone Submit</span>
            <h2 className="font-serif text-xl mt-1">{milestoneTitle}</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded-full transition-colors text-muted-foreground">
            <X className="size-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Changes Requested Callout */}
          {previousSubmission && previousSubmission.status === "CHANGES_REQUESTED" && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-xs space-y-1.5">
              <span className="font-bold text-red-500 uppercase tracking-wider text-[10px]">Changes Requested by Client</span>
              <p className="font-serif text-sm italic text-foreground/90">"{previousSubmission.reviewComment}"</p>
            </div>
          )}

          {loading ? (
            <div className="py-20 text-center text-sm text-muted-foreground animate-pulse font-serif">
              Loading submission details...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* GitHub URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Github className="size-3.5" /> GitHub Repository URL <span className="text-red-500">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://github.com/username/project-repo"
                  value={githubUrl}
                  onChange={(e) => setGithubUrl(e.target.value)}
                  required
                  disabled={submitting}
                  className="w-full rounded-xl bg-background border border-border px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-gold)]"
                />
              </div>

              {/* Demo URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Link className="size-3.5" /> Live Demo URL (Optional)
                </label>
                <input
                  type="url"
                  placeholder="https://project.vercel.app"
                  value={demoUrl}
                  onChange={(e) => setDemoUrl(e.target.value)}
                  disabled={submitting}
                  className="w-full rounded-xl bg-background border border-border px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-gold)]"
                />
              </div>

              {/* Description / Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <FileText className="size-3.5" /> Notes to Client
                </label>
                <textarea
                  placeholder="Describe your implementation details, verify completed features, or leave comments..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={submitting}
                  rows={4}
                  className="w-full rounded-xl bg-background border border-border px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--brand-gold)]"
                />
              </div>

              {/* Attachments Selector */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                  <Upload className="size-3.5" /> Attachments (Optional, max 50MB)
                </span>
                <div className="flex items-center justify-center border-2 border-dashed border-border rounded-xl p-6 bg-background/50 hover:bg-background/80 transition-colors relative cursor-pointer group">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploading || submitting}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <div className="text-center space-y-1">
                    {uploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="size-6 animate-spin text-[var(--brand-gold)]" />
                        <p className="text-xs text-muted-foreground">Uploading files...</p>
                      </div>
                    ) : (
                      <>
                        <Upload className="size-6 mx-auto text-muted-foreground group-hover:text-[var(--brand-gold)] transition-colors" />
                        <p className="text-xs text-muted-foreground font-medium">Click or Drag files to attach</p>
                        <p className="text-[10px] text-muted-foreground/60">ZIP, PDF, PNG, JPG, JPEG, WEBP</p>
                      </>
                    )}
                  </div>
                </div>

                {/* Uploaded Attachments list */}
                {attachments.length > 0 && (
                  <div className="space-y-1.5 mt-2">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted border border-border">
                        <span className="font-medium truncate max-w-[80%]">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(idx)}
                          disabled={submitting}
                          className="text-muted-foreground hover:text-red-500 p-1"
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

        {/* Footer */}
        <div className="p-4 border-t border-border bg-card flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || uploading || !githubUrl.trim() || loading}
            className="bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 mr-1.5 animate-spin" /> Submitting...
              </>
            ) : (
              "Submit Deliverable"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
