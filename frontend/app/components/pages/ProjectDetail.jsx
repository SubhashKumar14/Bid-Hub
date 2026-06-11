import { ShieldCheck, Calendar, Paperclip, Star, ArrowLeft, MapPin, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Separator } from "../ui/separator";
import { StatusBadge } from "../StatusBadge";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { PaymentDisclaimerModal } from "../PaymentDisclaimerModal";
import { PaymentSuccessModal } from "../PaymentSuccessModal";

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
  const projectId = localStorage.getItem("currentProjectId");
  const [project, setProject] = useState(null);
  const [milestones, setMilestones] = useState([]);
  const [bids, setBids] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [selectedBidId, setSelectedBidId] = useState(null);

  // Bid form state
  const [bidAmount, setBidAmount] = useState("");
  const [bidTimeline, setBidTimeline] = useState("");
  const [bidProposal, setBidProposal] = useState("");
  const [submittingBid, setSubmittingBid] = useState(false);
  const [hasAlreadyBid, setHasAlreadyBid] = useState(false);

  // Review states
  const [hasAlreadyReviewed, setHasAlreadyReviewed] = useState(false);
  const [existingReviewData, setExistingReviewData] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const fetchProjectData = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      // 1. Fetch project details
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const projectData = await projectRes.json();
      if (!projectRes.ok) throw new Error(projectData.message || "Failed to load project details");
      setProject(projectData.project);
      setMilestones(projectData.milestones || []);

      // 2. Fetch bids if user is logged in
      let bidsData = [];
      if (token) {
        const bidsRes = await fetch(`/api/projects/${projectId}/bids`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        bidsData = await bidsRes.json();
        if (bidsRes.ok) {
          setBids(bidsData);
          // Check if current user already placed a bid
          const myBid = bidsData.find(b => b.studentId?._id === currentUser?._id || b.studentId === currentUser?._id);
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
        const isClient = projectData.project.clientId?._id === currentUser._id || projectData.project.clientId === currentUser._id;
        const acceptedBid = bidsData.find(b => b.status === "ACCEPTED");
        const hiredStudentId = acceptedBid?.studentId?._id || acceptedBid?.studentId;
        const revieweeId = isClient ? hiredStudentId : projectData.project.clientId?._id || projectData.project.clientId;

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
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [projectId, token, currentUser]);

  const handlePlaceBid = async () => {
    if (!token) {
      toast.error("Please log in to place a bid");
      setPage("auth");
      return;
    }

    if (!bidAmount || !bidTimeline || !bidProposal) {
      toast.error("Please fill in all bid parameters");
      return;
    }

    setSubmittingBid(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/bids`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount: bidAmount,
          timeline: bidTimeline,
          proposal: bidProposal,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to place bid");
      toast.success("Your bid has been placed successfully!");
      setHasAlreadyBid(true);
      fetchProjectData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmittingBid(false);
    }
  };

const loadRazorpay = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

  const handleAcceptBid = (bidId) => {
    setSelectedBidId(bidId);
    setDisclaimerOpen(true);
  };

  const confirmCheckout = async () => {
    setDisclaimerOpen(false);
    if (!selectedBidId) return;
    try {
      const res = await fetch(`/api/payments/checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bidId: selectedBidId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to initiate escrow checkout");

      if (data.provider === "razorpay") {
        toast.info("Opening Razorpay payment portal...");
        await loadRazorpay();
        const options = {
          key: data.keyId,
          amount: data.amount,
          currency: data.currency,
          name: "Bid·Hub Escrow",
          description: data.description,
          order_id: data.orderId,
          handler: async function (response) {
            try {
              const verifyRes = await fetch("/api/payments/verify", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyRes.ok) {
                setSuccessOpen(true);
              } else {
                throw new Error(verifyData.message || "Verification failed");
              }
            } catch (vErr) {
              toast.error("Payment verification failed: " + vErr.message);
            }
          },
          modal: {
            ondismiss: async function () {
              toast.warn("Payment modal closed.");
              await fetch("/api/payments/cancel", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ sessionId: data.orderId }),
              });
              fetchProjectData();
            },
          },
          prefill: {
            name: currentUser ? currentUser.name : "",
            email: currentUser ? currentUser.email : "",
          },
          theme: { color: "#2C221E" },
        };
        const rzp = new window.Razorpay(options);
        rzp.open();
      } else {
        toast.success("Redirecting to payment checkout...");
        window.location.href = data.url;
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSubmitReview = async () => {
    if (!token) {
      toast.error("Please log in to leave a review");
      return;
    }

    if (!reviewComment.trim()) {
      toast.error("Please enter a review comment");
      return;
    }

    const isClient = currentUser && (project.clientId?._id === currentUser._id || project.clientId === currentUser._id);
    const acceptedBid = bids.find(b => b.status === "ACCEPTED");
    const hiredStudentId = acceptedBid?.studentId?._id || acceptedBid?.studentId;
    const revieweeId = isClient ? hiredStudentId : project.clientId?._id || project.clientId;

    if (!revieweeId) {
      toast.error("Reviewee not found");
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
      if (!res.ok) throw new Error(data.message || "Failed to submit review");
      toast.success("Feedback submitted successfully!");
      fetchProjectData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmittingReview(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 lg:px-8 py-20 text-center">
        <p className="font-serif text-xl animate-pulse">Loading brief details...</p>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-7xl px-5 lg:px-8 py-20 text-center">
        <h2 className="font-serif text-2xl">Brief not found</h2>
        <Button onClick={() => setPage("browse")} className="mt-4 rounded-full">
          Back to project wall
        </Button>
      </div>
    );
  }

  const isOwner = currentUser && project.clientId?._id === currentUser._id;
  const isStudent = currentUser && currentUser.role === "student";

  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8 py-10">
      <button onClick={() => setPage("browse")} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 mb-6">
        <ArrowLeft className="size-4" /> Back to wall
      </button>

      <div className="grid lg:grid-cols-12 gap-8">
        {/* Left */}
        <article className="lg:col-span-8 space-y-8">
          <header>
            <div className="flex items-center gap-2">
              <span className="eyebrow">{project.category} · #{project._id.substring(18)}</span>
              <StatusBadge tone={project.status === "OPEN" ? "gold" : "success"}>{project.status}</StatusBadge>
            </div>
            <h1 className="display text-4xl lg:text-5xl mt-3">
              {project.title}
            </h1>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Clock className="size-3.5" /> {project.deadline}</span>
              <span className="inline-flex items-center gap-1.5"><MapPin className="size-3.5" /> Remote</span>
              <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[var(--brand-gold)]" /> Escrow protected</span>
            </div>
          </header>

          <section className="paper hairline rounded-2xl p-6 lg:p-8">
            <h2 className="eyebrow">The brief</h2>
            <p className="mt-3 text-lg leading-relaxed whitespace-pre-line">
              {project.description}
            </p>

            <h3 className="mt-6 font-serif">Skills required</h3>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {project.skillsRequired.map(s => (
                <span key={s} className="text-xs px-2 py-1 rounded-full bg-secondary">{s}</span>
              ))}
            </div>

            {project.files && project.files.length > 0 && (
              <>
                <h3 className="mt-6 font-serif">Attachments</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {project.files.map(f => (
                    <a key={f.url} href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm hairline rounded-md bg-card px-3 py-1.5 hover:bg-secondary">
                      <Paperclip className="size-3.5" /> {f.name}
                    </a>
                  ))}
                </div>
              </>
            )}

            {project.fileManifest && project.fileManifest.length > 0 && (
              <>
                <h3 className="mt-6 font-serif">Imported File Manifest ({project.importSource})</h3>
                <div className="mt-2 paper hairline rounded-xl p-3 bg-secondary/20 max-h-60 overflow-y-auto space-y-1.5 text-xs text-muted-foreground">
                  {project.fileManifest.map((item, idx) => (
                    <div key={idx} className="flex justify-between font-mono">
                      <span>{item.path}</span>
                      <span>{(item.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </section>

          {/* Milestones */}
          <section>
            <h2 className="eyebrow mb-3">Milestone timeline</h2>
            <div className="paper hairline rounded-2xl p-2">
              {milestones.length === 0 ? (
                <div className="text-center p-4 text-sm text-muted-foreground">No milestones configured for this project.</div>
              ) : (
                milestones.map((m, i) => (
                  <div key={m._id} className="flex items-center justify-between px-4 py-3 border-b border-border/60 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className={`grid place-items-center size-7 rounded-full text-xs num
                        ${m.status === "RELEASED" ? "bg-[var(--brand-gold)] text-[var(--brand-deep)]" :
                          m.status === "SUBMITTED" ? "bg-[var(--brand-espresso)] text-[var(--brand-gold)]" : "bg-muted text-muted-foreground"}`}>
                        {i + 1}
                      </span>
                      <span className="text-sm">{m.title}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm num text-muted-foreground">{formatCurrency(m.amount)}</span>
                      <StatusBadge tone={m.status === "RELEASED" ? "success" : m.status === "SUBMITTED" ? "gold" : "muted"}>{m.status}</StatusBadge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* Project Review Section */}
          {project.status === "COMPLETED" && currentUser && (
            (() => {
              const isClient = project.clientId?._id === currentUser._id || project.clientId === currentUser._id;
              const acceptedBid = bids.find(b => b.status === "ACCEPTED");
              const hiredStudentId = acceptedBid?.studentId?._id || acceptedBid?.studentId;
              const isStudent = hiredStudentId === currentUser._id;

              if (!isClient && !isStudent) return null;

              return (
                <section className="space-y-4">
                  <h2 className="eyebrow">Project Feedback & Rating</h2>
                  <div className="paper hairline rounded-2xl p-6 lg:p-8 space-y-4">
                    {hasAlreadyReviewed ? (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-green-600 dark:text-green-400 inline-flex items-center gap-1.5">
                            ✓ You submitted feedback
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {existingReviewData?.createdAt && new Date(existingReviewData.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <Star
                              key={star}
                              className={`size-5 ${
                                star <= existingReviewData?.rating
                                  ? "fill-[var(--brand-gold)] text-[var(--brand-gold)]"
                                  : "text-muted-foreground/40"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="font-serif italic text-sm text-muted-foreground mt-2">
                          "{existingReviewData?.comment}"
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          {isClient
                            ? `This contract is complete. Leave a review for ${acceptedBid?.studentId?.name || "the student"} to build their campus reputation.`
                            : `This contract is complete. Leave a review for ${project.clientId?.name || "the client"} to help other students.`}
                        </p>

                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Select Rating</label>
                          <div className="flex gap-1.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className="text-[var(--brand-gold)] hover:scale-110 transition-transform"
                              >
                                <Star
                                  className={`size-6 ${
                                    star <= reviewRating
                                      ? "fill-[var(--brand-gold)] text-[var(--brand-gold)]"
                                      : "text-muted-foreground/50"
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs text-muted-foreground">Comment / Feedback</label>
                          <Textarea
                            rows={3}
                            placeholder="Write your honest experience working on this project..."
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                          />
                        </div>

                        <Button
                          onClick={handleSubmitReview}
                          disabled={submittingReview}
                          className="rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90 text-xs px-5 h-9"
                        >
                          {submittingReview ? "Submitting..." : "Submit Review"}
                        </Button>
                      </div>
                    )}
                  </div>
                </section>
              );
            })()
          )}

          {/* Bids List - Only visible to Owner of the project */}
          {isOwner && (
            <section>
              <h2 className="eyebrow mb-3">Current bids — {bids.length} total</h2>
              <div className="space-y-3">
                {bids.length === 0 ? (
                  <div className="text-center paper hairline rounded-2xl p-8 text-sm text-muted-foreground">
                    No bids received yet.
                  </div>
                ) : (
                  bids.map(b => (
                    <div key={b._id} className="paper hairline rounded-2xl p-5 flex items-start gap-4">
                      <Avatar className="size-10">
                        {b.studentId?.avatarUrl ? (
                          <img src={b.studentId.avatarUrl} alt={b.studentId.name} className="size-full rounded-full object-cover" />
                        ) : (
                          <AvatarFallback className="bg-[var(--brand-bronze)] text-[var(--brand-gold)] text-xs">
                            {(b.studentId?.name || "S").split(" ").map(n => n[0]).join("")}
                          </AvatarFallback>
                        )}
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm">{b.studentId?.name || "Student"} <span className="text-muted-foreground">· {b.studentId?.college || "College"}</span></p>
                            <p className="text-xs text-muted-foreground inline-flex items-center gap-1 mt-0.5">
                              <Star className="size-3 fill-[var(--brand-gold)] text-[var(--brand-gold)]" /> <span className="num">{b.studentId?.rating || 5.0}</span> · {b.studentId?.completedProjects || 0} completed
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-serif text-lg num">{formatCurrency(b.amount)}</p>
                            <p className="text-xs text-muted-foreground">{b.timeline}</p>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-3">{b.proposal}</p>
                        
                        {project.status === "OPEN" && b.status === "PENDING" && (
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              className="rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
                              onClick={() => handleAcceptBid(b._id)}
                            >
                              Accept bid
                            </Button>
                          </div>
                        )}

                        {b.status === "ACCEPTED" && (
                          <div className="mt-2">
                            <StatusBadge tone="success">Hired / Accepted</StatusBadge>
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

        {/* Right sticky panel */}
        <aside className="lg:col-span-4">
          <div className="sticky top-24 space-y-5">
            {/* Bid Form (For Students) */}
            {isStudent && project.status === "OPEN" && (
              <div className="paper hairline rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute -top-10 -right-10 size-32 rounded-full bg-[var(--brand-gold)]/15 blur-2xl" />
                <p className="eyebrow">Estimate</p>
                <p className="font-serif text-4xl mt-1 num">{formatCurrency(project.budget)}</p>
                <p className="text-xs text-muted-foreground mt-1">Funds released per milestone</p>

                <Separator className="my-5" />

                <p className="eyebrow mb-3">Place a bid</p>
                {hasAlreadyBid ? (
                  <div className="space-y-3 bg-secondary/20 p-4 rounded-xl text-center">
                    <p className="text-sm font-serif">Your bid of <span className="font-bold text-[var(--brand-gold)]">{formatCurrency(bidAmount)}</span> is active</p>
                    <p className="text-xs text-muted-foreground">Timeline: {bidTimeline}</p>
                    <p className="text-xs text-muted-foreground text-left italic">"{bidProposal}"</p>
                    <StatusBadge tone="gold" className="mt-2 mx-auto">Active Bid</StatusBadge>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-muted-foreground">Your price</label>
                      <Input
                        placeholder="₹40,000"
                        className="mt-1"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Timeline</label>
                      <Input
                        placeholder="3 weeks"
                        className="mt-1"
                        value={bidTimeline}
                        onChange={(e) => setBidTimeline(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">A short proposal</label>
                      <Textarea
                        rows={4}
                        placeholder="Why you, in five honest sentences."
                        className="mt-1"
                        value={bidProposal}
                        onChange={(e) => setBidProposal(e.target.value)}
                      />
                    </div>
                    <Button
                      onClick={handlePlaceBid}
                      disabled={submittingBid}
                      className="w-full rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
                    >
                      {submittingBid ? "Sending..." : "Send bid"}
                    </Button>
                    <p className="text-[11px] text-muted-foreground text-center">No fees until you're hired.</p>
                  </div>
                )}
              </div>
            )}

            {!currentUser && (
              <div className="paper hairline rounded-2xl p-6 text-center">
                <p className="font-serif text-lg">Interested in this brief?</p>
                <p className="text-xs text-muted-foreground mt-2">Log in with your college email to place a bid.</p>
                <Button onClick={() => setPage("auth")} className="w-full rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90 mt-4">
                  Log in / Sign up
                </Button>
              </div>
            )}

            {/* Client Info Card */}
            <div className="paper hairline rounded-2xl p-5">
              <p className="eyebrow mb-3">About the client</p>
              <div className="flex items-center gap-3">
                <Avatar className="size-10">
                  {project.clientId?.avatarUrl ? (
                    <img src={project.clientId.avatarUrl} alt={project.clientId.name} className="size-full rounded-full object-cover" />
                  ) : (
                    <AvatarFallback className="bg-[var(--brand-espresso)] text-[var(--brand-gold)] text-xs">
                      {(project.clientId?.name || "C").split(" ").map(x => x[0]).join("")}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{project.clientId?.name || "Client"}</p>
                  <p className="text-xs text-muted-foreground">{project.clientId?.college || "Institution"}</p>
                </div>
                <StatusBadge tone="success" className="ml-auto">Verified</StatusBadge>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 text-center">
                <div>
                  <p className="font-serif text-lg num">{project.clientId?.completedProjects || 0}</p>
                  <p className="text-[11px] text-muted-foreground">Projects</p>
                </div>
                <div>
                  <p className="font-serif text-lg num">{project.clientId?.rating || 5.0}</p>
                  <p className="text-[11px] text-muted-foreground">Reviews</p>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
      <PaymentDisclaimerModal
        open={disclaimerOpen}
        onConfirm={confirmCheckout}
        onCancel={() => setDisclaimerOpen(false)}
      />
      <PaymentSuccessModal
        open={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          setPage("client");
        }}
      />
    </div>
  );
}
