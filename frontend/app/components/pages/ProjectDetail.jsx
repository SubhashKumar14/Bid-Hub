import { checkout } from "../../../api/checkout";
import { allocateOffer } from "../../../../backend/lib/offer.js";
import { ProjectRecovery } from "../ProjectRecovery";
import { CandidateProfile } from "../CandidateProfile";
import { SubmissionHistory } from "../SubmissionHistory";
import { downloadAttachment } from "../../../api/fileApi";
import { ShieldCheck, ArrowLeft, MapPin, Clock, Paperclip, Star } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Separator } from "../ui/separator";
import { StatusBadge } from "../StatusBadge";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { PaymentDisclaimerModal } from "../PaymentDisclaimerModal";
import { PaymentSuccessModal } from "../PaymentSuccessModal";
import { MilestoneReviewModal } from "../MilestoneReviewModal";
import { BrandState } from "../../brand/BrandState";

const formatCurrency = (val) => {
  if (val === undefined || val === null) return "";
  if (typeof val === "number") {
    return `₹${val.toLocaleString("en-IN")}`;
  }
  if (val.toString().includes("₹")) return val;
  const num = parseFloat(val.toString().replace(/[₹$,\s]/g, ""));
  return isNaN(num) ? val : `₹${num.toLocaleString("en-IN")}`;
};

export function ProjectDetail({ setPage, role, token, currentUser }) {
  const projectId = window.location.pathname.startsWith("/project/") ? window.location.pathname.split("/").pop() : localStorage.getItem("currentProjectId");
  const live = useRef(true);
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const [error, setError] = useState("");
  const [candidateId,setCandidateId]=useState(null);
  const [project, setProject] = useState(null);
  const [contract, setContract] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [selectedBidId, setSelectedBidId] = useState(null);
  const [pendingPayment, setPendingPayment] = useState(null);

  // Milestone review states
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewMilestoneId, setReviewMilestoneId] = useState(null);
  const [reviewMilestoneTitle, setReviewMilestoneTitle] = useState("");

  const openReviewModal = (milestoneId, milestoneTitle) => {
    setReviewMilestoneId(milestoneId);
    setReviewMilestoneTitle(milestoneTitle);
    setReviewModalOpen(true);
  };

  // Bid form state
  const [bidAmount, setBidAmount] = useState("");
  const [bidTimeline, setBidTimeline] = useState("");
  const [bidProposal, setBidProposal] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [hasAlreadyBid, setHasAlreadyBid] = useState(false);
  const [editingBid, setEditingBid] = useState(false);

  // Review states
  const [hasAlreadyReviewed, setHasAlreadyReviewed] = useState(false);
  const [existingReviewData, setExistingReviewData] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchPendingCheckout = async (loadedProject) => {
    const ownerId = loadedProject.clientId?._id || loadedProject.clientId;
    if (!token || ownerId !== currentUser?._id || loadedProject.status !== "PENDING_FUNDING") {
      setPendingPayment(null);
      return;
    }
    const response = await fetch(`/api/projects/${projectId}/checkout`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!live.current) return;
    if (!response.ok) {
      setPendingPayment(null);
      throw new Error(data.message || "Failed to load checkout details");
    }
    setPendingPayment(data.pendingPayment || null);
  };

  const fetchProjectData = async () => {
    if (!projectId) return;
    setError("");
    setLoading(true);
    try {
      // 1. Fetch project details
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const projectData = await projectRes.json();
      if (!live.current) return;
      if (!projectRes.ok) throw new Error(projectData.message || "Failed to load project details");
      setProject(projectData.project);
      setMilestones(projectData.milestones || []);
      if (token && projectData.project.status !== "OPEN") {
        const r = await fetch(`/api/projects/${projectId}/contract`, { headers: { Authorization: `Bearer ${token}` } });
        setContract(r.ok ? await r.json() : null);
      }
      await fetchPendingCheckout(projectData.project);

      // 2. Fetch bids if user is logged in
      let bidsData = [];
      if (token) {
        const bidsRes = await fetch(`/api/projects/${projectId}/bids`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        bidsData = await bidsRes.json();
        if (!live.current) return;
        if (bidsRes.ok) {
          setBids(bidsData);
          // Check if current user already placed a bid
          const myBid = bidsData.find(b => (b.studentId?._id || b.studentId) === currentUser?._id);
          if (myBid) {
            setHasAlreadyBid(true);
            setBidAmount(myBid.amount);
            setBidTimeline(myBid.timeline);
            setBidProposal(myBid.proposal);
          }
        }
      }

      // 3. Fetch reviews if project is completed
      if (token && projectData.project.status === "COMPLETED" && currentUser) {
        const isClient = (projectData.project.clientId?._id || projectData.project.clientId) === currentUser._id;
        const acceptedBid = bidsData.find(b => b.status === "ACCEPTED");
        const hiredStudentId = acceptedBid?.studentId?._id || acceptedBid?.studentId;
        const revieweeId = isClient ? hiredStudentId : (projectData.project.clientId?._id || projectData.project.clientId);

        if (revieweeId) {
          const reviewsRes = await fetch(`/api/reviews/users/${revieweeId}/reviews`);
          if (reviewsRes.ok) {
            const reviewsData = await reviewsRes.json();
            const myReview = reviewsData.find(r => 
              (r.projectId?._id === projectData.project._id || r.projectId === projectData.project._id) &&
              (r.reviewerId?._id === currentUser._id || r.reviewerId === currentUser._id)
            );
            if (myReview) {
              setHasAlreadyReviewed(true);
              setExistingReviewData(myReview);
            } else {
              setHasAlreadyReviewed(false);
              setExistingReviewData(null);
            }
          }
        }
      }
    } catch (err) {
      if (!live.current) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      if (live.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
    const interval = setInterval(async () => {
      if (!projectId) return;
      try {
        const projectRes = await fetch(`/api/projects/${projectId}`);
        const projectData = await projectRes.json();
        if (!live.current) return;
      if (!live.current) return;
        if (projectRes.ok) {
          setProject(projectData.project);
          setMilestones(projectData.milestones || []);
          await fetchPendingCheckout(projectData.project);
        }

        if (token) {
          const bidsRes = await fetch(`/api/projects/${projectId}/bids`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const bidsData = await bidsRes.json();
          if (!live.current) return;
          if (bidsRes.ok) {
            setBids(bidsData);
            const myBid = bidsData.find(b => (b.studentId?._id || b.studentId) === currentUser?._id);
            if (myBid) {
              setHasAlreadyBid(true);
            } else {
              setHasAlreadyBid(false);
            }
          }
        }
      } catch (err) {
      if (!live.current) return;
        console.error("Project details polling error:", err);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [projectId, token, currentUser]);

  const handlePlaceBid = async () => {
    if (!token) {
      toast.error("Please sign in to submit a proposal");
      setPage("auth");
      return;
    }

    if (!bidAmount || !bidTimeline || !bidProposal) {
      toast.error("Please fill in price, timeline, and proposal");
      return;
    }

    setSubmittingBid(true);
    try {
      const myBid = bids.find(b => (b.studentId?._id || b.studentId) === currentUser?._id);
      const res = await fetch(myBid ? `/api/bids/${myBid._id}` : `/api/projects/${projectId}/bids`, {
        method: myBid ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: bidAmount,
          action: "REVISE",
          timeline: bidTimeline,
          proposal: bidProposal,
        }),
      });
      const data = await res.json();
      if (!live.current) return;
      if (!res.ok) throw new Error(data.message || "Failed to place bid");
      toast.success("Proposal submitted successfully");
      setHasAlreadyBid(true);
      setEditingBid(false);
      fetchProjectData();
    } catch (err) {
      if (!live.current) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubmittingBid(false);
    }
  };

  const handleAcceptBid = (bidId) => {
    setSelectedBidId(bidId);
    setDisclaimerOpen(true);
  };

  const confirmCheckout = async () => {
    setDisclaimerOpen(false);
    if (!selectedBidId) return;
    try { await checkout(selectedBidId, token, currentUser, bids.find(b => b._id === selectedBidId)?.version || contract?.proposalVersion || 1); if (localStorage.getItem("token") !== token) return; setSuccessOpen(true); fetchProjectData(); }
    catch (error) { if (localStorage.getItem("token") !== token) return; setError(error.message); toast.error(error.message); }
  };

  const handleCancelCheckout = async () => {
    try {
      const res = await fetch("/api/payments/cancel", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionId: pendingPayment ? pendingPayment.stripeSessionId : undefined,
          projectId: project ? project._id : undefined,
        }),
      });
      const data = await res.json();
      if (!live.current) return;
      if (!res.ok) throw new Error(data.message || "Failed to cancel checkout");
      toast.success("Checkout dismissed. The agreed contract and pending order are retained.");
      fetchProjectData();
    } catch (err) {
      if (!live.current) return;
      setError(err.message);
      toast.error(err.message);
    }
  };

  const handleResumeCheckout = () => {
    if (!pendingPayment) { if (contract?.bidId) handleAcceptBid(contract.bidId); else toast.error("Checkout recovery is not ready. Request operator review below."); return; }
    const selectedBid = bids.find(b => (b.studentId?._id || b.studentId) === pendingPayment.studentId);
    if (selectedBid) {
      setSelectedBidId(selectedBid._id);
      setDisclaimerOpen(true);
    } else {
      toast.error("Selected proposal not found in proposals list.");
    }
  };

  const handleSubmitReview = async () => {
    if (!token) {
      toast.error("Please sign in to submit feedback");
      return;
    }

    if (!reviewComment.trim()) {
      toast.error("Please write your feedback comment");
      return;
    }

    const isClient = currentUser && ((project.clientId?._id || project.clientId) === currentUser._id);
    const acceptedBid = bids.find(b => b.status === "ACCEPTED");
    const hiredStudentId = acceptedBid?.studentId?._id || acceptedBid?.studentId;
    const revieweeId = isClient ? hiredStudentId : (project.clientId?._id || project.clientId);

    if (!revieweeId) {
      toast.error("Recipient not found for review");
      return;
    }

    setSubmittingReview(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: project._id,
          revieweeId,
          rating: reviewRating,
          comment: reviewComment,
        }),
      });
      const data = await res.json();
      if (!live.current) return;
      if (!res.ok) throw new Error(data.message || "Failed to submit review");
      toast.success("Feedback submitted successfully");
      fetchProjectData();
    } catch (err) {
      if (!live.current) return;
      setError(err.message);
      toast.error(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 lg:px-8 py-20 text-center">
        <p className="text-base text-muted-foreground animate-pulse">Loading project brief…</p>
      </div>
    );
  }

  if (error && !project) return <div role="alert" className="p-8"><p>{error}</p><Button onClick={fetchProjectData}>Retry</Button></div>;
  if (!project) {
    return (
      <div className="mx-auto max-w-7xl px-5 lg:px-8 py-20">
        <BrandState
          name="not-found"
          title="Project brief not found"
          description="This brief may have been archived, completed, or removed by its author."
          action={
            <Button onClick={() => setPage("browse")} className="rounded-[5px] bg-primary text-primary-foreground text-xs h-9 px-4">
              Return to project directory
            </Button>
          }
        />
      </div>
    );
  }

  const isOwner = currentUser && (project.clientId?._id || project.clientId) === currentUser._id;
  const isStudent = currentUser && currentUser.role === "student";

  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8 py-8">
      <button
        type="button"
        onClick={() => setPage("browse")}
        className="text-xs font-medium text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center gap-1.5 mb-6 transition-colors"
      >
        <ArrowLeft className="size-3.5" /> Back to directory
      </button>

      {error && <p role="alert" className="text-sm text-destructive py-3">{error} <Button variant="outline" onClick={fetchProjectData}>Retry</Button></p>}
      {project.sampleData && <p role="status" className="text-sm text-muted-foreground">Sample data: illustrative work only. No gateway transaction or genuine reputation is represented.</p>}
      {contract && <section className="border border-border rounded p-4 mb-5 text-sm space-y-2"><h2 className="font-medium">Agreed contract: {formatCurrency(contract.totalPaise / 100)}</h2><p>Proposal version {contract.proposalVersion} · {contract.timeline} · Advertised estimate: {formatCurrency(project.budget)}</p><p>{contract.evidencePolicy}</p><details><summary>Agreed brief and proposal</summary><p className="whitespace-pre-wrap">{contract.brief}</p><p className="whitespace-pre-wrap">{contract.proposal}</p></details></section>}
      {isOwner && project.status === "OPEN" && <Button variant="outline" className="mb-5" onClick={async () => {
        if (!window.confirm("Cancel this open brief? Proposals and history will be retained. No funding or refund is involved.")) return;
        try {
          const response = await fetch(`/api/projects/${projectId}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
          const data = await response.json(); if (!live.current) return;
          if (!response.ok) throw new Error(data.message);
          await fetchProjectData();
        } catch (e) { if (live.current) setError(e.message); }
      }}>Cancel open brief</Button>}
      {/* Owner Escrow Action Callout */}
      {project.status === "PENDING_FUNDING" && isOwner && (
        <div className="mb-6 p-5 rounded-[8px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--status-warning-fg)] flex items-center gap-2">
              <ShieldCheck className="size-4" /> Test funding required
            </h3>
            <p className="text-xs text-muted-foreground">
              An immutable offer is agreed. Confirm test funding of{" "}
              <span className="font-semibold text-foreground font-mono tabular-nums">{formatCurrency(pendingPayment?.amount ?? (contract?.totalPaise / 100))}</span>. An uncertain attempt requires operator review before another order.
            </p>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <Button
              className="rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-5 h-9 font-medium"
              onClick={handleResumeCheckout}
            >
              Resume Test Funding
            </Button>
            <Button
              variant="outline"
              className="rounded-[5px] text-xs px-4 h-9 border-border hover:bg-secondary text-muted-foreground hover:text-foreground"
              onClick={handleCancelCheckout}
            >
              Dismiss Checkout
            </Button>
          </div>
        </div>
      )}

      {project.status === "PENDING_FUNDING" && isOwner && !pendingPayment && (
        <div className="mb-6 p-5 rounded-[8px] bg-[var(--status-danger-bg)] border border-[var(--status-danger-border)] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-[var(--status-danger-fg)] flex items-center gap-2">
              <ShieldCheck className="size-4" /> Checkout needs attention
            </h3>
            <p className="text-xs text-muted-foreground">
              The saved checkout is unavailable or uncertain. Request operator review below; do not create another payable order.
            </p>
          </div>
          <Button
            variant="outline"
            className="rounded-[5px] text-xs px-4 h-9 text-[var(--status-danger-fg)] border-[var(--status-danger-border)]"
            onClick={handleCancelCheckout}
          >
            Dismiss Checkout
          </Button>
        </div>
      )}

      {project.status === "PENDING_FUNDING" && isStudent && pendingPayment && pendingPayment.studentId === currentUser._id && (
        <div className="mb-6 p-5 rounded-[8px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)]">
          <h3 className="text-sm font-semibold text-[var(--status-warning-fg)] flex items-center gap-2">
            <ShieldCheck className="size-4" /> Proposal agreed · awaiting test funding
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            The client has selected your proposal. Work begins after test funding is confirmed.
          </p>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Main Column */}
        <article className="min-w-0 lg:col-span-8 space-y-6">
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
              <span className="text-xs uppercase tracking-wider font-mono text-muted-foreground">
                {project.category} · #{project._id.substring(18)}
              </span>
              <StatusBadge tone={project.status === "OPEN" ? "success" : project.status === "IN_PROGRESS" ? "info" : project.status === "COMPLETED" ? "success" : "muted"}>
                {project.status}
              </StatusBadge>
            </div>
            <h1 className="text-2xl lg:text-3xl font-semibold tracking-tight text-foreground">
              {project.title}
            </h1>
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground pt-1">
              <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> Delivery deadline: {project.deadline || "Not set"}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" /> {project.location || (project.remote === true ? "Remote" : project.remote === false ? "On-site" : "Location not specified")}</span>
              {project.level && <span>Experience: {project.level}</span>}
              {project.duration && <span>Estimated duration: {project.duration}</span>}
              <span className="inline-flex items-center gap-1.5 text-foreground"><ShieldCheck className="size-3.5 text-brand-accent" /> Test funding · no legal escrow</span>
            </div>
          </header>

          {/* Project Brief Section */}
          <section className="rounded-[8px] bg-card border border-border p-6 space-y-5">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">The Brief</h2>
              <p className="mt-3 text-base leading-relaxed text-foreground whitespace-pre-line">
                {project.description}
              </p>
            </div>

            {project.skillsRequired && project.skillsRequired.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Skills Required</h3>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {project.skillsRequired.map(s => (
                    <span key={s} className="text-xs px-2.5 py-1 rounded-[4px] bg-secondary text-foreground font-medium">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {project.files && project.files.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Attachments</h3>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {project.files.map(f => (
                    <a
                      key={f.url}
                      href={f.url}
                      onClick={event => downloadAttachment(event, f.url, f.name, token).catch(error => toast.error(error.message))}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs rounded-[5px] bg-card border border-border px-3 py-1.5 hover:bg-secondary text-foreground transition-colors"
                    >
                      <Paperclip className="size-3 text-muted-foreground" /> {f.name}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {project.fileManifest && project.fileManifest.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Imported File Manifest ({project.importSource || "Local"})
                </h3>
                <div className="mt-2.5 rounded-[6px] border border-border p-3 bg-secondary/30 max-h-48 overflow-y-auto space-y-1 text-xs text-muted-foreground font-mono">
                  {project.fileManifest.map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span className="truncate max-w-[80%]">{item.path}</span>
                      <span>{(item.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Milestone Timeline */}
          {(isOwner || isStudent) && <ProjectRecovery key={`${project._id}:${token}`} project={project} token={token} participant={isOwner || bids.some(b => b.status === "ACCEPTED" && (b.studentId?._id || b.studentId) === currentUser?._id) || contract?.studentId === currentUser?._id} onUpdate={fetchProjectData} />}
          <section className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Milestones & Checkpoints</h2>
            <div className="rounded-[8px] bg-card border border-border divide-y divide-border overflow-hidden">
              {milestones.length === 0 ? (
                <div className="text-center p-6 text-xs text-muted-foreground">No milestones configured for this project.</div>
              ) : (
                milestones.map((m, i) => (
                  <div key={m._id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="size-6 rounded-[4px] bg-secondary text-foreground text-xs font-mono font-medium flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{m.title}</p>
                        <p className="text-xs text-muted-foreground">Checkpoint {i + 1}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <span className="text-sm font-mono tabular-nums font-medium text-foreground">{formatCurrency(m.amount)}</span>
                      {m.status === "SUBMITTED" && isOwner ? (
                        <Button
                          size="xs"
                          className="rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 px-3 text-xs font-medium"
                          onClick={() => openReviewModal(m._id, m.title)}
                        >
                          Review Work
                        </Button>
                      ) : (
                        <StatusBadge tone={["RELEASED", "APPROVED"].includes(m.status) ? "success" : m.status === "SUBMITTED" ? "info" : "muted"}>
                          {m.status}
                        </StatusBadge>
                      )}
                    </div>
                    {m.activeSubmissionId && (isOwner || contract?.studentId === currentUser?._id) && <SubmissionHistory key={`${m._id}:${m.activeSubmissionId}:${m.status}:${token}`} milestoneId={m._id} token={token} />}
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Project Feedback Section */}
          {project.status === "COMPLETED" && currentUser && (
            (() => {
              const isClient = (project.clientId?._id || project.clientId) === currentUser._id;
              const acceptedBid = bids.find(b => b.status === "ACCEPTED");
              const hiredStudentId = acceptedBid?.studentId?._id || acceptedBid?.studentId;
              const isHiredStudent = hiredStudentId === currentUser._id;

              if (!isClient && !isHiredStudent) return null;

              return (
                <section className="space-y-3">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project Evidence & Review</h2>
                  <div className="rounded-[8px] bg-card border border-border p-6 space-y-4">
                    {hasAlreadyReviewed ? (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-[var(--status-success-fg)] inline-flex items-center gap-1.5">
                            ✓ Your review was submitted
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {existingReviewData?.createdAt && new Date(existingReviewData.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`size-4 ${
                                star <= existingReviewData?.rating
                                  ? "fill-brand-accent text-brand-accent"
                                  : "text-muted-foreground/30"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-sm text-foreground/90 leading-relaxed italic">
                          "{existingReviewData?.comment}"
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-xs text-muted-foreground">
                          {isClient
                            ? `Contract complete. Leave factual feedback for ${acceptedBid?.studentId?.name || "the student"} to build their verified record.`
                            : `Contract complete. Leave factual feedback for ${project.clientId?.name || "the client"}.`}
                        </p>

                        <div className="space-y-1.5">
                          <span className="text-xs font-medium text-muted-foreground">Rating</span>
                          <div className="flex gap-1" role="group" aria-label="Select rating">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                aria-label={`${star} star${star === 1 ? "" : "s"}`}
                                aria-pressed={reviewRating === star}
                                className="min-h-11 min-w-11 inline-flex items-center justify-center hover:scale-105 transition-transform"
                              >
                                <Star
                                  className={`size-5 ${
                                    star <= reviewRating
                                      ? "fill-brand-accent text-brand-accent"
                                      : "text-muted-foreground/30"
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="review-comment" className="text-xs font-medium text-muted-foreground">Feedback</label>
                          <Textarea
                            id="review-comment"
                            rows={3}
                            placeholder="Write your direct, factual experience completing this project…"
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            className="rounded-[5px] bg-input-background border-input text-sm"
                          />
                        </div>

                        <Button
                          onClick={handleSubmitReview}
                          disabled={submittingReview}
                          className="rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-5 h-9 font-medium"
                        >
                          {submittingReview ? "Submitting…" : "Submit Review"}
                        </Button>
                      </div>
                    )}
                  </div>
                </section>
              );
            })()
          )}

          {/* Proposals List - Owner Only */}
          {isOwner && (
            <section className="space-y-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Proposals Received ({bids.length})
              </h2>
              <div className="space-y-3">
                {bids.length === 0 ? (
                  <div className="rounded-[8px] bg-card border border-border">
                    <BrandState
                      name="no-proposals"
                      title="No proposals submitted yet"
                      description="Students browsing the directory will submit proposals here."
                      compact
                    />
                  </div>
                ) : (
                  bids.map(b => (
                    <div key={b._id} className="rounded-[8px] bg-card border border-border p-5 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <Avatar className="size-10 rounded-[4px] border border-border shrink-0">
                            {b.studentId?.avatarUrl ? (
                              <img src={b.studentId.avatarUrl} alt={b.studentId.name} className="size-full object-cover" />
                            ) : (
                              <AvatarFallback className="rounded-[4px] bg-secondary text-foreground text-xs font-medium">
                                {(b.studentId?.name || "S").split(" ").map(n => n[0]).join("")}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{b.studentId?.name || "Student"}</p>
                            <p className="text-xs text-muted-foreground truncate">{b.studentId?.college || "College"}</p>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              <Button variant="outline" onClick={()=>setCandidateId(b.studentId?._id || b.studentId)}>View candidate work record</Button>
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-mono tabular-nums font-semibold text-foreground">{formatCurrency(b.amount)}</p>
                          <p className="text-xs text-muted-foreground">{b.timeline}</p>
                        </div>
                      </div>

                      <p className="text-xs text-foreground/80 leading-relaxed bg-secondary/30 p-3 rounded-[6px]">
                        {b.proposal}
                      </p>

                      <div className="flex items-center justify-between pt-1">
                        <div>
                          {b.status === "ACCEPTED" ? (
                            <StatusBadge tone="success">Selected & Contracted</StatusBadge>
                          ) : (
                            <StatusBadge tone="muted">{b.status}</StatusBadge>
                          )}
                        </div>

                        {project.status === "OPEN" && b.status === "PENDING" && (
                          <div className="flex gap-2"><Button variant="outline" onClick={async()=>{try{const response=await fetch(`/api/bids/${b._id}/reject`,{method:"PATCH",headers:{Authorization:`Bearer ${token}`}});const data=await response.json();if(!response.ok)throw new Error(data.message);await fetchProjectData();}catch(e){if(live.current)setError(e.message);}}}>Reject proposal</Button><Button
                            size="sm"
                            className="rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-4"
                            onClick={() => handleAcceptBid(b._id)}
                          >
                            Accept Proposal
                          </Button></div>
                        )}

                        {project.status === "PENDING_FUNDING" && b.status === "PENDING" && pendingPayment && (b.studentId?._id || b.studentId) === pendingPayment.studentId && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 text-xs px-4"
                              onClick={handleResumeCheckout}
                            >
                              Accept & Test Fund
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="rounded-[5px] border-border text-xs px-3"
                              onClick={handleCancelCheckout}
                            >
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}
        </article>

        {/* Right Sticky Column */}
        <aside className="min-w-0 lg:col-span-4">
          <div className="sticky top-20 space-y-4">
            {/* Student Proposal Submission Box */}
            {isStudent && project.status === "OPEN" && (
              <div className="rounded-[8px] bg-card border border-border p-6 space-y-5">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Project Budget</span>
                  <p className="text-3xl font-mono tabular-nums font-semibold text-foreground mt-1">{formatCurrency(project.budget)}</p>
                  <p className="text-[11px] text-muted-foreground mt-1">Advertised estimate. Your accepted offer sets the contract total.</p>
                </div>

                <Separator />

                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Submit Proposal</h3>
                  {hasAlreadyBid && !editingBid ? (
                    <div className="space-y-3 bg-secondary/30 p-4 rounded-[6px] text-left">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-foreground">Your Proposal</span>
                        <StatusBadge tone="info">{bids.find(b => (b.studentId?._id || b.studentId) === currentUser?._id)?.status || "Pending"}</StatusBadge>
                      </div>
                      <p className="text-lg font-mono tabular-nums font-semibold text-foreground">{formatCurrency(bidAmount)}</p>
                      <p className="text-xs text-muted-foreground">Estimated timeline: {bidTimeline}</p>
                      <p className="text-xs text-foreground/80 italic">"{bidProposal}"</p>
                      {bids.find(b => (b.studentId?._id || b.studentId) === currentUser?._id)?.status === "PENDING" && <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setEditingBid(true)}>Revise proposal</Button>
                        <Button variant="outline" onClick={async () => {
                          const mine = bids.find(b => (b.studentId?._id || b.studentId) === currentUser?._id);
                          try { const r = await fetch(`/api/bids/${mine._id}`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: "WITHDRAW" }) }); const d = await r.json(); if (!r.ok) throw new Error(d.message); await fetchProjectData(); } catch (e) { toast.error(e.message); }
                        }}>Withdraw proposal</Button>
                      </div>}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <label htmlFor="bid-price" className="text-xs font-medium text-muted-foreground">Proposed Price (₹)</label>
                        <Input
                          id="bid-price"
                          placeholder="₹40,000"
                          className="mt-1 rounded-[5px] bg-input-background border-input text-sm"
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="bid-timeline" className="text-xs font-medium text-muted-foreground">Timeline</label>
                        <Input
                          id="bid-timeline"
                          placeholder="3 weeks"
                          className="mt-1 rounded-[5px] bg-input-background border-input text-sm"
                          value={bidTimeline}
                          onChange={(e) => setBidTimeline(e.target.value)}
                        />
                      </div>
                      <div>
                        <label htmlFor="bid-proposal" className="text-xs font-medium text-muted-foreground">Proposal</label>
                        <Textarea
                          id="bid-proposal"
                          rows={4}
                          placeholder="State your approach, past project experience, and deliverable commitments."
                          className="mt-1 rounded-[5px] bg-input-background border-input text-sm"
                          value={bidProposal}
                          onChange={(e) => setBidProposal(e.target.value)}
                        />
                      </div>
                      <Button
                        onClick={handlePlaceBid}
                        disabled={submittingBid}
                        className="w-full rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 h-10 font-medium text-xs"
                      >
                        {submittingBid ? "Submitting…" : hasAlreadyBid ? "Save Proposal Revision" : "Submit Proposal"}
                      </Button>
                      <p className="text-xs text-muted-foreground">Your offer uses these checkpoints, proportionally allocated to your price. All evidence links are optional; deliver the described work with notes or attachments.</p>
                      <ul className="text-xs">{(() => { try { return allocateOffer(bidAmount, milestones).map((m, i) => <li key={i}>{m.title}: {formatCurrency(m.amountPaise / 100)}</li>); } catch { return <li>Enter a valid price to preview your schedule.</li>; } })()}</ul>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!currentUser && (
              <div className="rounded-[8px] bg-card border border-border p-6 text-center space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Interested in this project?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">Sign in to review requirements and submit your proposal.</p>
                <Button
                  onClick={() => setPage("auth")}
                  className="w-full rounded-[5px] bg-primary text-primary-foreground hover:bg-primary/90 text-xs h-9 font-medium"
                >
                  Sign in to Bid
                </Button>
              </div>
            )}

            {/* Client Context Card */}
            <div className="rounded-[8px] bg-card border border-border p-5 space-y-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Client Directory Record</span>
              <div className="flex items-center gap-3">
                <Avatar className="size-10 rounded-[4px] border border-border shrink-0">
                  {project.clientId?.avatarUrl ? (
                    <img src={project.clientId.avatarUrl} alt={project.clientId.name} className="size-full object-cover" />
                  ) : (
                    <AvatarFallback className="rounded-[4px] bg-secondary text-foreground text-xs font-medium">
                      {(project.clientId?.name || "C").split(" ").map(x => x[0]).join("")}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{project.clientId?.name || "Client"}</p>
                  <p className="text-xs text-muted-foreground truncate">{project.clientId?.college || "Client Organization"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2 text-center border-t border-border">
                <div className="p-2 min-w-0 rounded-[4px] bg-secondary/30">
                  <p className="text-base font-mono tabular-nums font-semibold text-foreground">{project.clientId?.completedProjects || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Completed</p>
                </div>
                <div className="p-2 min-w-0 rounded-[4px] bg-secondary/30">
                  <p className="text-sm font-mono tabular-nums font-semibold text-foreground break-words">
                    {typeof project.clientId?.rating === "number" && project.clientId.rating > 0 ? project.clientId.rating.toFixed(1) : "No reviews yet"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Rating</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <PaymentDisclaimerModal
        offer={bids.find(b => b._id === selectedBidId)}
        open={disclaimerOpen}
        onConfirm={confirmCheckout}
        onCancel={() => setDisclaimerOpen(false)}
      />
      {candidateId && <CandidateProfile userId={candidateId} onClose={()=>setCandidateId(null)} />}
      <PaymentSuccessModal
        open={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          fetchProjectData();
        }}
      />
      <MilestoneReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        milestoneId={reviewMilestoneId}
        milestoneTitle={reviewMilestoneTitle}
        token={token}
        onSuccess={() => {
          setReviewModalOpen(false);
          fetchProjectData();
        }}
      />
    </div>
  );
}
