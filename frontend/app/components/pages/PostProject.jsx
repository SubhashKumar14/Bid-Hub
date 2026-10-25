import { CATEGORIES } from "../../../../shared/categories.js";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Paperclip, Github, Lightbulb, X, Plus } from "lucide-react";
import { BrandIcon } from "../../brand/BrandIcon";
import { useState, useEffect, useRef } from "react";
import { useCapabilities } from "../../../api/capabilities";
import { toast } from "sonner";

const categories = CATEGORIES.map(value => ({label:value,value}));

const SUGGESTED_SKILLS = {
  "Product Design": ["Figma", "UX/UI", "Wireframing", "Prototyping", "Design Systems"],
  "Web Development": ["React", "TypeScript", "Tailwind CSS", "Next.js", "Node.js"],
  "Backend & APIs": ["Node.js", "Express", "MongoDB", "PostgreSQL", "REST APIs"],
  "Writing & Content": ["Copywriting", "Technical Writing", "Editorial", "SEO", "Research"],
  "Video & Motion": ["Premiere Pro", "DaVinci Resolve", "After Effects", "Color Grading", "Sound Design"],
  "Graphic Design": ["Typography", "Illustrator", "Brand Identity", "Print Design", "Packaging"],
  "Data & Research": ["Python", "SQL", "Data Analysis", "User Research", "Market Sizing"],
};

export function PostProject({ token, currentUser, onDone }) {
  const capabilities = useCapabilities();
  const active = useRef(token);
  useEffect(() => { active.current = token; return () => { active.current = ""; }; }, [token]);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("Web Development");
  const [level, setLevel] = useState("intermediate");
  const [budget, setBudget] = useState("");
  const [duration, setDuration] = useState("2 weeks");
  const [deadline, setDeadline] = useState("");
  const [location, setLocation] = useState("Remote");

  // Custom Skills state
  const [skills, setSkills] = useState([]);
  const [newSkillInput, setNewSkillInput] = useState("");

  // Milestones state
  const [milestones, setMilestones] = useState([
    { title: "Discovery, architecture & setup", amount: "10000" },
    { title: "Core deliverables & milestone handover", amount: "15000" },
  ]);

  // File uploads state
  const [attachments, setAttachments] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);

  // Import State
  const [importRevision, setImportRevision] = useState("");
  const [importSource, setImportSource] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [fileManifest, setFileManifest] = useState([]);
  const [manifestStats, setManifestStats] = useState(null);
  const [importingSource, setImportingSource] = useState(false);

  const draftKey = "bidhub_post_draft:" + (currentUser?._id || "guest");
  const publishLock = useRef(false);
  const [publishing, setPublishing] = useState(false);
  const publishId = useRef(crypto.randomUUID());
  const publishContent = useRef(null);
  // Restore draft if available
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.clientRequestId) publishId.current = parsed.clientRequestId;
        publishContent.current = parsed.lastAttempt || null;
        if (parsed.milestones) setMilestones(parsed.milestones);
        if (parsed.attachments) setAttachments(parsed.attachments);
        if (parsed.location) setLocation(parsed.location);
        if (parsed.level) setLevel(parsed.level);
        if (parsed.duration) setDuration(parsed.duration);
        if (parsed.fileManifest) setFileManifest(parsed.fileManifest);
        setImportRevision(parsed.importRevision || "");
        if (parsed.importSource) setImportSource(parsed.importSource);
        if (parsed.title) setTitle(parsed.title);
        if (parsed.description) setDescription(parsed.description);
        if (parsed.category) setCategory(parsed.category);
        if (parsed.budget) setBudget(parsed.budget);
        if (parsed.deadline) setDeadline(parsed.deadline);
        if (Array.isArray(parsed.skills) && parsed.skills.length) setSkills(parsed.skills);
      }
    } catch {}
  }, []);

  // Auto-save draft
  useEffect(() => {
      localStorage.setItem(draftKey, JSON.stringify({
        title, description, category, budget, deadline, skills, milestones, attachments, location, level, duration, fileManifest, importSource, importRevision, clientRequestId: publishId.current, lastAttempt: publishContent.current,
      }));
  }, [title, description, category, budget, deadline, skills, milestones, attachments, location, level, duration, fileManifest, importSource, importRevision]);

  const addSkill = (skillToAdd) => {
    const s = (skillToAdd || newSkillInput).trim();
    if (!s) return;
    if (!skills.includes(s)) {
      setSkills([...skills, s]);
    }
    setNewSkillInput("");
  };

  const removeSkill = (skillToRemove) => {
    setSkills(skills.filter((s) => s !== skillToRemove));
  };

  const addMilestone = () => {
    setMilestones([...milestones, { title: "", amount: "" }]);
  };

  const removeMilestone = (index) => {
    if (milestones.length <= 1) {
      toast.error("Project must have at least one milestone");
      return;
    }
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
      if (active.current !== token || localStorage.getItem("token") !== token) return;
      if (!res.ok) throw new Error(data.message || "Failed to upload attachments");
      setAttachments([...attachments, ...data]);
      toast.success("Attachments indexed successfully");
    } catch (err) {
      if (active.current !== token) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (active.current === token) setUploadingFiles(false);
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
      if (active.current !== token || localStorage.getItem("token") !== token) return;
      if (!res.ok) throw new Error(data.message || "ZIP import rejected");
      setImportRevision(data.commitSha || "");
      setFileManifest(data.manifest);
      setManifestStats({ fileCount: data.fileCount, totalSize: data.totalSize });
      toast.success(`Added a list of ${data.fileCount} files. The source files were not uploaded.`);
    } catch (err) {
      if (active.current !== token) return;
      setError(err.message);
      toast.error(err.message);
      setImportSource("");
    } finally {
      if (active.current === token) setImportingSource(false);
    }
  };

  const handleGithubImport = async () => {
    if (!githubUrl) {
      toast.error("Please enter a public GitHub repository URL");
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
      if (active.current !== token || localStorage.getItem("token") !== token) return;
      if (!res.ok) throw new Error(data.message || "GitHub repository import failed");
      setImportRevision(data.commitSha || "");
      setFileManifest(data.manifest);
      setManifestStats({ fileCount: data.fileCount, totalSize: data.totalSize });
      toast.success("Repository file list added. Check it before publishing.");
    } catch (err) {
      if (active.current !== token) return;
      setError(err.message);
      toast.error(err.message);
      setImportSource("");
    } finally {
      if (active.current === token) setImportingSource(false);
    }
  };

  const handlePublish = async () => {
    if (!title.trim() || !description.trim() || !category || !budget || !deadline) {
      toast.error("Please complete all required fields: title, description, category, budget, deadline.");
      return;
    }

    if (publishLock.current || uploadingFiles || importingSource) return;
    setError("");
    const validMilestones = milestones;
    if (milestones.some(m => !m.title.trim() || !m.amount)) { setError("Complete every milestone row or remove it before publishing."); return; }
    if (!skills.length) { setError("Add at least one skill required for this scope."); return; }
    if (validMilestones.length === 0) {
      toast.error("Please configure at least one milestone with title and amount");
      return;
    }

    try {
      publishLock.current = true;
      setPublishing(true);
      const publishBody = {
          clientRequestId: publishId.current,
          title: title.trim(),
          description: description.trim(),
          category,
          budget,
          deadline,
          skillsRequired: skills,
          milestones: validMilestones,
          files: attachments,
          fileManifest,
          importSource,
          importRevision,
          remote: location.toLowerCase().includes("remote"),
          location,
          level,
          duration,
        };
      const content = JSON.stringify({...publishBody,clientRequestId:undefined});
      if (publishContent.current && publishContent.current !== content) publishId.current=crypto.randomUUID();
      publishContent.current=content; publishBody.clientRequestId=publishId.current;
      const saved=JSON.parse(localStorage.getItem(draftKey) || "{}");
      localStorage.setItem(draftKey,JSON.stringify({...saved,lastAttempt:content,clientRequestId:publishId.current}));
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(publishBody),
      });
      const data = await res.json();
      if (active.current !== token || localStorage.getItem("token") !== token) return;
      if (!res.ok) throw new Error(data.message || "Failed to publish brief");
      
      localStorage.removeItem(draftKey);
      toast.success("Project brief published successfully");
      onDone();
    } catch (err) {
      if (active.current !== token) return;
      setError(err.message);
      toast.error(err.message);
    } finally { publishLock.current = false; if (active.current === token) setPublishing(false); }
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 grid lg:grid-cols-12 gap-8">
      {error && <div role="alert" className="border border-destructive rounded p-4 text-sm">{error} <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button></div>}
      <main className="lg:col-span-8 space-y-6">
        <header className="pb-4 border-b border-border">
          <span className="eyebrow text-xs">New project brief</span>
          <h1 className="text-3xl font-medium tracking-tight text-foreground mt-1">Post a Project</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Explain what you need, when it is due and how you will review it. Students will propose their own price and milestone breakdown.
          </p>
        </header>

        {/* Section 1: The Basics */}
        <section id="basics" className="bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <BrandIcon name="project-brief" size={18} className="text-[var(--brand-accent)]" />
            <h2 className="text-base font-medium text-foreground">Project Overview</h2>
          </div>

          <div>
            <label htmlFor="project-title" className="text-xs font-medium text-foreground block mb-1">
              Project Title <span className="text-[var(--brand-accent)]">*</span>
            </label>
            <Input
              id="project-title"
              placeholder="e.g. Design a sign-up flow for a student club website"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="project-category" className="text-xs font-medium text-foreground block mb-1">
                Discipline / Category <span className="text-[var(--brand-accent)]">*</span>
              </label>
              <Select value={category} onValueChange={value => { setCategory(value); setSkills([]); }}>
                <SelectTrigger id="project-category" className="w-full">
                  <SelectValue placeholder="Choose category" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border rounded-[8px]">
                  {categories.map((c) => (
                    <SelectItem key={c.value} value={c.value} className="cursor-pointer text-xs">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="project-skill-level" className="text-xs font-medium text-foreground block mb-1">
                Experience Level
              </label>
              <Select value={level} onValueChange={setLevel}>
                <SelectTrigger id="project-skill-level" className="w-full">
                  <SelectValue placeholder="Skill level" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border rounded-[8px]">
                  <SelectItem value="beginner" className="cursor-pointer text-xs">Introductory</SelectItem>
                  <SelectItem value="intermediate" className="cursor-pointer text-xs">Intermediate</SelectItem>
                  <SelectItem value="advanced" className="cursor-pointer text-xs">Advanced / Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor="project-location" className="text-xs font-medium text-foreground block mb-1">
                Location Mode
              </label>
              <Input
                id="project-location"
                placeholder="Remote, Bengaluru, Delhi…"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>

          {/* Required Skills Picker */}
          <div>
            <label className="text-xs font-medium text-foreground block mb-1">
              Required Skills & Technologies
            </label>
            <div className="flex gap-2 mb-2">
              <Input
                placeholder="Add a required skill (e.g. React, Figma, Python)…"
                value={newSkillInput}
                onChange={(e) => setNewSkillInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSkill();
                  }
                }}
                className="h-9 text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addSkill()}
                className="rounded-[5px] text-xs h-9 px-3 shrink-0"
              >
                <Plus className="size-3.5 mr-1" /> Add
              </Button>
            </div>

            {/* Selected Skills Chips */}
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {skills.map((s) => (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-[4px] bg-secondary text-foreground font-mono"
                  >
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSkill(s)}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                      aria-label={`Remove ${s}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Suggested Skills for chosen category */}
            {SUGGESTED_SKILLS[category] && (
              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-1.5 pt-1">
                <span>Suggested:</span>
                {SUGGESTED_SKILLS[category].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => addSkill(s)}
                    className="underline hover:text-foreground cursor-pointer"
                  >
                    +{s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section 2: Scope & Deliverables */}
        <section id="scope" className="bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <BrandIcon name="contract" size={18} className="text-[var(--brand-accent)]" />
            <h2 className="text-base font-medium text-foreground">Scope & Specification</h2>
          </div>

          <div>
            <label htmlFor="project-description" className="text-xs font-medium text-foreground block mb-1">
              Brief Description <span className="text-[var(--brand-accent)]">*</span>
            </label>
            <Textarea
              id="project-description"
              rows={6}
              className="mt-1"
              placeholder="State the objective, context, key deliverables, and criteria for milestone sign-off…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="project-attachments" className="text-xs font-medium text-foreground block mb-1">
              Supporting Attachments (Briefs, Specs, Assets)
            </label>
            <div className="mt-1 border border-dashed border-input rounded-[5px] p-6 text-center bg-secondary/20 relative">
              <input
                id="project-attachments"
                type="file"
                aria-label="Attach project files"
                multiple
                className="absolute inset-0 opacity-0 cursor-pointer"
                onChange={handleFileUpload}
                disabled={uploadingFiles || !capabilities?.privateAttachments}
              />
              <Paperclip className="size-5 mx-auto text-muted-foreground" />
              <p className="text-xs font-medium mt-2 text-foreground">
                {uploadingFiles ? "Uploading attachments…" : capabilities?.privateAttachments ? "Click to upload brief materials (visible to signed-in prospective students)" : "Attachments unavailable; private storage must be configured."}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">PDF, DOCX, PPTX, PNG, JPG · 10 MB per file, up to 10 files</p>
            </div>
            {attachments.length > 0 && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {attachments.map((file, idx) => (
                  <span key={idx} className="text-xs px-2 py-1 rounded-[4px] bg-secondary text-foreground font-mono flex items-center gap-1.5 border border-border">
                    <Paperclip className="size-3 text-muted-foreground" /> {file.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Codebase / GitHub Import (Optional) */}
          <div className="border border-border rounded-[6px] p-4 space-y-3 bg-secondary/15">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-foreground inline-flex items-center gap-1.5">
                <Github className="size-3.5" /> Existing project files (optional)
              </h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Add a file list from a ZIP or public GitHub repository. File names will be visible in the brief; the source files themselves are not uploaded. Attach any files the student needs separately.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 pt-1">
              <div className="border border-border/80 rounded-[5px] p-3 bg-card flex flex-col justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground">Project ZIP file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Read the file names from a ZIP. This does not share the source files.</p>
                </div>
                <div className="mt-3 relative">
                  <input
                    aria-label="Upload project ZIP archive"
                    type="file"
                    accept=".zip"
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    onChange={handleZipImport}
                    disabled={importingSource}
                  />
                  <Button variant="outline" size="sm" className="w-full text-xs h-8">
                    Select ZIP
                  </Button>
                </div>
              </div>

              <div className="border border-border/80 rounded-[5px] p-3 bg-card flex flex-col justify-between">
                <div>
                  <p className="text-xs font-medium text-foreground">Public GitHub repository</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Add the repository's current file list.</p>
                </div>
                <div className="mt-2.5 flex gap-1.5">
                  <Input
                    id="github-repository-url"
                    aria-label="GitHub repository URL"
                    placeholder="github.com/org/repo"
                    className="text-xs h-8"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                  />
                  <Button variant="outline" size="sm" className="h-8 text-xs shrink-0" onClick={handleGithubImport} disabled={importingSource}>
                    Read file list
                  </Button>
                </div>
              </div>
            </div>

            {importingSource && (
              <p className="text-xs text-muted-foreground" role="status">Reading the file list…</p>
            )}

            {manifestStats && (
              <div className="text-xs bg-secondary/50 p-2.5 rounded-[5px] border border-border flex items-center justify-between">
                <div>
                  <span className="font-medium text-foreground capitalize">File list from {importSource}</span>
                  <span className="text-muted-foreground text-xs block">{manifestStats.fileCount} files listed. Source content is not stored.</span>
                </div>
                <div className="text-right">
                  <span className="font-mono text-xs">{(manifestStats.totalSize / (1024 * 1024)).toFixed(2)} MB</span>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Section 3: Budget & Timeline */}
        <section id="money" className="bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-border/60">
            <BrandIcon name="milestone" size={18} className="text-[var(--brand-accent)]" />
            <h2 className="text-base font-medium text-foreground">Budget & Timeline</h2>
          </div>

          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="project-budget" className="text-xs font-medium text-foreground block mb-1">
                Client Budget (₹) <span className="text-[var(--brand-accent)]">*</span>
              </label>
              <Input
                id="project-budget"
                placeholder="25000"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="project-duration" className="text-xs font-medium text-foreground block mb-1">
                Estimated Duration
              </label>
              <Input
                id="project-duration"
                placeholder="e.g. 2 weeks"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="project-deadline" className="text-xs font-medium text-foreground block mb-1">
                Application Deadline <span className="text-[var(--brand-accent)]">*</span>
              </label>
              <Input
                id="project-deadline"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>
        </section>

        {/* Section 4: Milestones */}
        <section id="milestones" className="bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border/60">
            <h2 className="text-base font-medium text-foreground">Milestones</h2>
            <Button variant="outline" size="sm" className="rounded-[4px] text-xs h-7 px-2.5" onClick={addMilestone}>
              + Add milestone
            </Button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Give each milestone a clear result and an amount. The amounts must add up to your budget. Students can propose a different split before you agree.
          </p>

          <div className="space-y-3 pt-1">
            {milestones.map((m, idx) => (
              <div key={idx} className="grid sm:grid-cols-[1fr_130px_36px] gap-2 items-end">
                <div>
                  <label htmlFor={`milestone-title-${idx}`} className="text-xs text-muted-foreground block mb-0.5">
                    Checkpoint {idx + 1} Deliverable
                  </label>
                  <Input
                    id={`milestone-title-${idx}`}
                    placeholder={`e.g. ${idx === 0 ? "Architecture & Setup" : "Final Delivery & QA"}`}
                    value={m.title}
                    onChange={(e) => handleMilestoneChange(idx, "title", e.target.value)}
                    className="h-10 text-xs"
                  />
                </div>
                <div>
                  <label htmlFor={`milestone-amount-${idx}`} className="text-xs text-muted-foreground block mb-0.5">
                    Amount (₹)
                  </label>
                  <Input
                    id={`milestone-amount-${idx}`}
                    placeholder="10000"
                    value={m.amount}
                    onChange={(e) => handleMilestoneChange(idx, "amount", e.target.value)}
                    className="h-10 text-xs font-mono"
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  className="size-10 rounded-[4px] text-muted-foreground hover:text-destructive"
                  aria-label={`Remove checkpoint ${idx + 1}`}
                  onClick={() => removeMilestone(idx)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom Actions */}
        <div className="flex justify-between items-center pt-2">
          <Button variant="ghost" onClick={() => onDone()} className="rounded-[5px] text-xs">
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={handlePublish}
            disabled={publishing || uploadingFiles || importingSource}
            className="rounded-[5px] px-6 h-11 text-sm font-medium"
          >
            {publishing ? "Publishing…" : "Publish Project Brief"}
          </Button>
        </div>
      </main>

      {/* Sidebar: Writing Tips & Guide */}
      <aside className="lg:col-span-4">
        <div className="sticky top-24 space-y-4">
          <div className="bg-card border border-border rounded-[8px] p-5 space-y-3">
            <div className="flex items-center gap-1.5 text-foreground font-medium text-xs">
              <Lightbulb className="size-4 text-[var(--brand-accent)]" />
              <span>A useful project brief</span>
            </div>
            <ul className="space-y-3 text-xs text-muted-foreground leading-relaxed">
              <li>
                <strong className="text-foreground block font-medium">Say what you want to receive.</strong>
                Name the deliverable, such as a Figma file, a working page or an edited article. Explain what you will check before approving it.
              </li>
              <li>
                <strong className="text-foreground block font-medium">Share what the student will need.</strong>
                Mention existing designs, accounts, APIs or reference material. Do not put passwords or private credentials in the brief.
              </li>
              <li>
                <strong className="text-foreground block font-medium">Leave room for feedback.</strong>
                Break the work into parts you can review separately. Allow time for a revision before the final delivery date.
              </li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
