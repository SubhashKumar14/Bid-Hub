import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import { Paperclip, Sparkles, Lightbulb, Github, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const categories = [
  { label: "Product Design", value: "Product Design" },
  { label: "Web Development", value: "Web Development" },
  { label: "Writing & Content", value: "Writing & Content" },
  { label: "Video & Motion", value: "Video & Motion" },
];

export function PostProject({ token, onDone }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("intermediate");
  const [budget, setBudget] = useState("");
  const [duration, setDuration] = useState("");
  const [deadline, setDeadline] = useState("");
  
  // Milestones state
  const [milestones, setMilestones] = useState([
    { title: "Discovery & research", amount: "₹10,000" },
    { title: "Hi-fi prototyping", amount: "₹15,000" },
  ]);

  // File uploads state
  const [attachments, setAttachments] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Import State
  const [importSource, setImportSource] = useState(""); // "zip" | "github"
  const [githubUrl, setGithubUrl] = useState("");
  const [fileManifest, setFileManifest] = useState([]);
  const [manifestStats, setManifestStats] = useState(null); // { fileCount, totalSize }
  const [importingSource, setImportingSource] = useState(false);

  const addMilestone = () => {
    setMilestones([...milestones, { title: "", amount: "" }]);
  };

  const removeMilestone = (index) => {
    const next = [...milestones];
    next.splice(index, 1);
    setMilestones(next);
  };

  const handleMilestoneChange = (index, field, value) => {
    const next = [...milestones];
    next[index][field] = value;
    setMilestones(next);
  };

  const handleFileUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingFiles(true);
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
      if (!res.ok) throw new Error(data.message || "Failed to upload attachments");
      setAttachments([...attachments, ...data]);
      toast.success("Attachments uploaded successfully!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingFiles(false);
    }
  };

  const handleZipImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportingSource(true);
    setImportSource("zip");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/import/local", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "ZIP import rejected");
      setFileManifest(data.manifest);
      setManifestStats({ fileCount: data.fileCount, totalSize: data.totalSize });
      toast.success(`ZIP import parsed: ${data.fileCount} files manifest indexed.`);
    } catch (err) {
      toast.error(err.message);
      setImportSource("");
    } finally {
      setImportingSource(false);
    }
  };

  const handleGithubImport = async () => {
    if (!githubUrl) {
      toast.error("Please enter a GitHub repository URL");
      return;
    }

    setImportingSource(true);
    setImportSource("github");
    try {
      const res = await fetch("/api/import/github", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repoUrl: githubUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "GitHub repository import failed");
      setFileManifest(data.manifest);
      setManifestStats({ fileCount: data.fileCount, totalSize: data.totalSize });
      toast.success(`GitHub repository manifest imported successfully!`);
    } catch (err) {
      toast.error(err.message);
      setImportSource("");
    } finally {
      setImportingSource(false);
    }
  };

  const handlePublish = async () => {
    if (!title || !description || !category || !budget || !deadline) {
      toast.error("Please fill in all basic fields");
      return;
    }

    // Filter milestones that are complete
    const validMilestones = milestones.filter((m) => m.title && m.amount);
    if (validMilestones.length === 0) {
      toast.error("Please add at least one complete milestone checkpoint");
      return;
    }

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          description,
          category,
          budget,
          deadline,
          skillsRequired: ["UX/UI", "React", "Node", "Tailwind"].slice(0, 3), // default mock tags
          milestones: validMilestones,
          files: attachments,
          fileManifest,
          importSource,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to publish brief");
      toast.success("Project brief published successfully on the wall!");
      onDone();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8 py-12 grid lg:grid-cols-12 gap-8">
      <main className="lg:col-span-8 space-y-8">
        <header>
          <span className="eyebrow">New brief</span>
          <h1 className="font-serif text-4xl mt-2">Post a project</h1>
          <p className="text-muted-foreground mt-2 max-w-xl">A good brief takes ten quiet minutes to write. Students will thank you for it.</p>
        </header>

        <section id="basics" className="paper hairline rounded-2xl p-6 lg:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-xl">The basics</h2>
            <CheckCircle2 className="size-4 text-[var(--brand-gold)]" />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Project title</label>
            <Input
              placeholder="e.g. Redesign the onboarding flow for a campus fintech app"
              className="mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Skill level required</label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Any level" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section id="scope" className="paper hairline rounded-2xl p-6 lg:p-8 space-y-5">
          <h2 className="font-serif text-xl">Scope & deliverables</h2>
          <div>
            <label className="text-sm text-muted-foreground">Describe the project</label>
            <Textarea
              rows={6}
              className="mt-1.5"
              placeholder="Write like you're talking to a quiet, careful student. What is this, who is it for, what does success look like?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Attachments upload (Cloudinary/Local fallback)</label>
            <div className="mt-1.5 hairline rounded-xl p-6 text-center bg-input-background/60 relative">
              <input
                type="file"
                multiple
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload}
                disabled={uploadingFiles}
              />
              <Paperclip className="size-5 mx-auto text-muted-foreground" />
              <p className="text-sm mt-2">{uploadingFiles ? "Uploading attachments..." : "Drop files or browse"}</p>
              <p className="text-xs text-muted-foreground mt-1">PDF, ZIP, images · up to 50 MB</p>
            </div>
            {attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {attachments.map((file, idx) => (
                  <span key={idx} className="text-xs px-2.5 py-1.5 rounded-md bg-secondary text-secondary-foreground font-mono flex items-center gap-1.5">
                    <Paperclip className="size-3" /> {file.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Code Import (ZIP/GitHub) */}
          <div className="border border-dashed border-border/80 rounded-xl p-5 space-y-4 bg-card/20">
            <h3 className="text-sm font-medium inline-flex items-center gap-2">
              <Github className="size-4" /> Import Project codebase (Manifest limits strictly enforced)
            </h3>
            <p className="text-xs text-muted-foreground">
              We parse files tree and build a lightweight manifest of file paths and sizes instead of copying raw source code to MongoDB. Limits: max 20 files, 50MB size.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {/* Local Folder Zip Import */}
              <div className="hairline rounded-lg p-4 bg-secondary/10 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold">1. Upload Folder (ZIP format)</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Select project directory zip archive to index.</p>
                </div>
                <div className="mt-4 relative">
                  <input
                    type="file"
                    accept=".zip"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleZipImport}
                    disabled={importingSource}
                  />
                  <Button variant="outline" size="sm" className="w-full text-xs">
                    Upload Zip
                  </Button>
                </div>
              </div>

              {/* GitHub Repo Tree Import */}
              <div className="hairline rounded-lg p-4 bg-secondary/10 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-bold">2. Import GitHub Repository</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Paste public GitHub URL (e.g. github.com/user/repo)</p>
                </div>
                <div className="mt-3 flex gap-1.5">
                  <Input
                    placeholder="github.com/user/repo"
                    className="text-xs h-8"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                  />
                  <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={handleGithubImport} disabled={importingSource}>
                    Fetch
                  </Button>
                </div>
              </div>
            </div>

            {importingSource && (
              <p className="text-xs text-[var(--brand-gold)] animate-pulse">Parsing files manifest from source...</p>
            )}

            {manifestStats && (
              <div className="text-xs bg-secondary/35 p-3 rounded-lg border border-border flex items-center justify-between">
                <div>
                  <span className="font-semibold block capitalize">Import Source: {importSource}</span>
                  <span className="text-muted-foreground">{manifestStats.fileCount} valid files indexed (node_modules/.git ignored)</span>
                </div>
                <div className="text-right">
                  <span className="font-mono block">{(manifestStats.totalSize / (1024 * 1024)).toFixed(2)} MB</span>
                  <span className="text-[10px] text-muted-foreground">manifest stored</span>
                </div>
              </div>
            )}
          </div>
        </section>

        <section id="money" className="paper hairline rounded-2xl p-6 lg:p-8 space-y-5">
          <h2 className="font-serif text-xl">Budget & timeline</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-muted-foreground">Budget (₹)</label>
              <Input
                placeholder="40,000"
                className="mt-1.5"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Duration</label>
              <Input
                placeholder="3 weeks"
                className="mt-1.5"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm text-muted-foreground">Deadline</label>
              <Input
                type="date"
                className="mt-1.5"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
        </section>

        <section id="milestones" className="paper hairline rounded-2xl p-6 lg:p-8 space-y-5">
          <h2 className="font-serif text-xl">Milestones</h2>
          <p className="text-sm text-muted-foreground">Split the work into checkpoints. Funds release as each is signed off by you.</p>
          {milestones.map((m, idx) => (
            <div key={idx} className="grid sm:grid-cols-[1fr_140px_44px] gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Milestone {idx + 1} Checkpoint Description</label>
                <Input
                  placeholder={`e.g. ${idx === 0 ? "Discovery" : idx === 1 ? "Hi-fi Prototype" : "Hand-off"}`}
                  className="mt-1.5"
                  value={m.title}
                  onChange={(e) => handleMilestoneChange(idx, "title", e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Escrow Amount</label>
                <Input
                  placeholder="₹12,000"
                  className="mt-1.5"
                  value={m.amount}
                  onChange={(e) => handleMilestoneChange(idx, "amount", e.target.value)}
                />
              </div>
              <Button variant="ghost" className="h-10 text-muted-foreground hover:text-red-500" onClick={() => removeMilestone(idx)}>
                −
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="rounded-full" onClick={addMilestone}>
            + Add milestone checkpoint
          </Button>
        </section>

        <div className="flex justify-between items-center">
          <Button variant="ghost" onClick={() => onDone()}>Cancel</Button>
          <Button
            onClick={handlePublish}
            className="rounded-full px-6 bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
          >
            Publish brief
          </Button>
        </div>
      </main>

      <aside className="lg:col-span-4">
        <div className="sticky top-24 space-y-4">
          <div className="paper hairline rounded-2xl p-5">
            <div className="flex items-center gap-2 text-[var(--brand-gold)]">
              <Lightbulb className="size-4" /><span className="eyebrow">Writing tips</span>
            </div>
            <ul className="mt-3 space-y-3 text-sm">
              <li><span className="block text-foreground">Lead with the why.</span><span className="text-muted-foreground">Students bid more carefully when they understand the audience.</span></li>
              <li><span className="block text-foreground">Show the messy first.</span><span className="text-muted-foreground">Attach the current site / draft / footage. Real beats polished.</span></li>
              <li><span className="block text-foreground">Be specific about "done."</span><span className="text-muted-foreground">Name the deliverable, the file format, and where it lives after.</span></li>
            </ul>
          </div>

          <div className="paper hairline rounded-2xl p-5">
            <div className="flex items-center gap-2 text-[var(--brand-gold)]">
              <Sparkles className="size-4" /><span className="eyebrow">Example</span>
            </div>
            <p className="mt-3 font-serif italic text-sm leading-relaxed text-muted-foreground">
              "We're a four-year-old slow-fashion label out of Jaipur. Our current site looks like a weekend project, because it was. Looking for a designer who reads, who cares about type, and who can sit with our craft for two weeks before starting layout work."
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
