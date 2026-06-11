import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { ShieldCheck, Briefcase } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ChatDrawer } from "../ChatDrawer";
import { MilestoneReviewModal } from "../MilestoneReviewModal";

export function ClientDashboard({ setPage, onOpenEscrow, token, currentUser }) {
  const [stats, setStats] = useState({
    postedCount: 0,
    bidsReceivedCount: 0,
    activeGigsCount: 0,
    lockedEscrow: 0,
    releasedEscrow: 0,
  });

  const [pendingBids, setPendingBids] = useState([]);
  const [milestonesToApprove, setMilestonesToApprove] = useState([]);
  const [activeProjects, setActiveProjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  const [chatOpen, setChatOpen] = useState(false);
  const [chatProjectId, setChatProjectId] = useState(null);
  const [chatProjectTitle, setChatProjectTitle] = useState("");

  const openChat = (projectId, projectTitle) => {
    setChatProjectId(projectId);
    setChatProjectTitle(projectTitle);
    setChatOpen(true);
  };

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewMilestoneId, setReviewMilestoneId] = useState(null);
  const [reviewMilestoneTitle, setReviewMilestoneTitle] = useState("");

  const openReviewModal = (milestoneId, milestoneTitle) => {
    setReviewMilestoneId(milestoneId);
    setReviewMilestoneTitle(milestoneTitle);
    setReviewModalOpen(true);
  };

  const fetchDashboardData = async () => {
    if (!token || !currentUser) return;
    setLoading(true);
    try {
      // 1. Fetch Payment Stats
      const paymentsRes = await fetch("/api/payments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const paymentsData = await paymentsRes.json();
      const lockedEscrow = paymentsData.stats?.lockedAmount || 0;
      const releasedEscrow = paymentsData.stats?.releasedAmount || 0;

      // 2. Fetch Projects and calculate stats
      const projectsRes = await fetch("/api/projects");
      const projects = await projectsRes.json();

      // Filter projects posted by current client
      const myProjects = projects.filter((p) => p.clientId?._id === currentUser._id || p.clientId === currentUser._id);
      const postedCount = myProjects.length;

      let bidsReceivedCount = 0;
      let activeGigsCount = 0;
      const activeGigsList = [];
      const bidsReviewList = [];
      const pendingApprovalMilestones = [];

      for (const p of myProjects) {
        bidsReceivedCount += p.bidsCount || 0;
        if (p.status !== "OPEN" && p.status !== "CANCELLED") {
          activeGigsCount++;

          // Fetch milestones to calculate progress
          const detailsRes = await fetch(`/api/projects/${p._id}`);
          const detailsData = await detailsRes.json();
          const milestones = detailsData.milestones || [];
          
          const releasedCount = milestones.filter(m => m.status === "RELEASED").length;
          const progress = milestones.length > 0 ? Math.round((releasedCount / milestones.length) * 100) : 0;

          activeGigsList.push({
            id: p._id,
            title: p.title,
            statusText: p.status === "ASSIGNED" ? "Hired / Kickoff" : p.status === "IN_PROGRESS" ? "Development" : "Completed",
            budget: p.budget,
            progress,
            status: p.status, // Store actual backend status
          });

          // Extract SUBMITTED milestones
          milestones.forEach((m) => {
            if (m.status === "SUBMITTED") {
              pendingApprovalMilestones.push({
                id: m._id,
                title: `${p.title} · ${m.title}`,
                amount: m.amount,
              });
            }
          });
        }

        // Fetch bids to review for OPEN projects
        if (p.status === "OPEN") {
          const bidsRes = await fetch(`/api/projects/${p._id}/bids`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const bidsData = await bidsRes.json();
          bidsData.forEach((b) => {
            if (b.status === "PENDING") {
              bidsReviewList.push({
                id: b._id,
                projectId: p._id,
                studentName: b.studentId?.name || "Student",
                projectTitle: p.title,
                amount: b.amount,
                timeline: b.timeline,
              });
            }
          });
        }
      }

      setPendingBids(bidsReviewList.slice(0, 5));
      setMilestonesToApprove(pendingApprovalMilestones);
      setActiveProjects(activeGigsList);

      setStats({
        postedCount,
        bidsReceivedCount,
        activeGigsCount,
        lockedEscrow,
        releasedEscrow,
      });

      // 3. Fetch activities
      const actRes = await fetch("/api/activities");
      const actData = await actRes.json();
      if (actRes.ok) {
        setActivities(actData.slice(0, 8));
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token, currentUser]);

  useEffect(() => {
    if (!token) return;
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get("payment_status") || params.get("status");
    const sessionId = params.get("session_id");

    if (paymentStatus === "success" && sessionId) {
      // Clear URL query parameters immediately to prevent loop on refresh
      window.history.replaceState({}, document.title, window.location.pathname);

      const runSimulation = async () => {
        try {
          const res = await fetch("/api/payments/simulate-payment", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ sessionId }),
          });
          if (res.ok) {
            toast.success("Simulated Razorpay deposit completed! Escrow funds locked.");
          } else {
            console.log("Checkout synced or real webhook handled successfully.");
          }
          fetchDashboardData();
        } catch (err) {
          console.error("Simulated webhook trigger failed:", err);
        }
      };
      runSimulation();
    }
  }, [token]);

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

  const handleAcceptBid = async (bidId) => {
    if (!window.confirm("Are you sure you want to hire this student? You will proceed to secure checkout to deposit the contract budget in Escrow.")) return;
    try {
      const res = await fetch(`/api/payments/checkout-session`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ bidId }),
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
                toast.success("Payment verified! Student hired successfully.");
                fetchDashboardData();
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
              fetchDashboardData();
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

  const handleReleaseMilestone = async (milestoneId) => {
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/release`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to release milestone");
      toast.success("Milestone approved! ESCROW amount released to student.");
      fetchDashboardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 lg:px-8 py-20 text-center animate-pulse">
        <p className="font-serif text-xl">Syncing client workspace dashboard...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8 py-12 space-y-10">
      <header className="paper hairline rounded-3xl p-8 lg:p-10 relative overflow-hidden">
        <div className="absolute -bottom-20 -right-10 size-72 rounded-full bg-[var(--brand-sand)]/15 blur-3xl" />
        <span className="eyebrow">Client workspace · {currentUser?.college || "Verify organization"}</span>
        <h1 className="display text-4xl md:text-5xl mt-2 max-w-2xl">
          Welcome back, {currentUser?.name}.
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          You have {pendingBids.length} proposals waiting on a reply. {milestonesToApprove.length} milestone checkpoint releases are waiting for review.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => setPage("post")} className="rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90">
            <Briefcase className="size-4 mr-1.5" /> Post a new brief
          </Button>
          <Button onClick={onOpenEscrow} variant="outline" className="rounded-full">
            <ShieldCheck className="size-4 mr-1.5" /> Escrow summary
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { k: "Posted projects", v: stats.postedCount },
          { k: "Bids received", v: stats.bidsReceivedCount },
          { k: "Active gigs", v: stats.activeGigsCount },
          { k: "Locked in escrow", v: `₹${stats.lockedEscrow.toLocaleString()}` },
          { k: "Released stats", v: `₹${stats.releasedEscrow.toLocaleString()}` },
        ].map((s) => (
          <div key={s.k} className="paper hairline rounded-2xl p-5">
            <span className="eyebrow">{s.k}</span>
            <p className="font-serif text-3xl mt-2 num">{s.v}</p>
          </div>
        ))}
      </section>

      <section className="grid lg:grid-cols-3 gap-6">
        {/* Bids to review */}
        <div className="lg:col-span-2 paper hairline rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl">Bids to review</h2>
            <span className="text-xs text-muted-foreground">{pendingBids.length} waiting</span>
          </div>
          <div className="space-y-3">
            {pendingBids.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No active bids to review. Your briefs will receive applications shortly.
              </div>
            ) : (
              pendingBids.map((b) => (
                <div key={b.id} className="flex items-center gap-3 hairline rounded-xl p-3 bg-card/45">
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-[var(--brand-bronze)] text-[var(--brand-gold)] text-xs">
                      {b.studentName.split(" ").map((x) => x[0]).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{b.studentName}</p>
                    <p className="text-xs text-muted-foreground truncate">{b.projectTitle}</p>
                  </div>
                  <div className="text-right hidden sm:block">
                    <p className="font-serif num">{b.amount}</p>
                    <p className="text-[11px] text-muted-foreground">{b.timeline}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        localStorage.setItem("currentProjectId", b.projectId);
                        setPage("detail");
                      }}
                      className="rounded-full"
                    >
                      Review
                    </Button>
                    <Button
                      size="sm"
                      className="rounded-full bg-foreground text-background hover:bg-foreground/85"
                      onClick={() => handleAcceptBid(b.id)}
                    >
                      Accept
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Milestone approvals */}
        <div className="paper hairline rounded-2xl p-6">
          <h2 className="font-serif text-xl mb-4">Milestone approvals</h2>
          <div className="space-y-3">
            {milestonesToApprove.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No submissions waiting for approval.
              </div>
            ) : (
              milestonesToApprove.map((m) => (
                <div key={m.id} className="hairline rounded-xl p-3 space-y-3 bg-card/45">
                  <div>
                    <p className="text-sm font-semibold truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground num">{m.amount}</p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      className="rounded-full flex-1 bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90"
                      onClick={() => openReviewModal(m.id, m.title)}
                    >
                      Review & Release
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-3 gap-6">
        {/* Active projects list */}
        <div className="lg:col-span-2 paper hairline rounded-2xl p-6">
          <h2 className="font-serif text-xl mb-4">Active projects</h2>
          <div className="divide-y divide-border/60">
            {activeProjects.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No active contracts. Assign a student to get started.
              </div>
            ) : (
              activeProjects.map((p) => (
                <div key={p.id} className="py-3 grid grid-cols-[1fr_auto_auto_auto] items-center gap-4">
                  <div>
                    <p className="text-sm font-semibold hover:underline cursor-pointer" onClick={() => {
                      localStorage.setItem("currentProjectId", p.id);
                      setPage("detail");
                    }}>{p.title}</p>
                    <p className="text-xs text-muted-foreground">{p.statusText}</p>
                  </div>
                  <div className="hidden sm:block w-32 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-[var(--brand-gold)]" style={{ width: `${p.progress}%` }} />
                  </div>
                  {["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(p.status) && (
                    <Button size="xs" variant="outline" className="rounded-full px-3 text-xs" onClick={() => openChat(p.id, p.title)}>
                      Chat
                    </Button>
                  )}
                  <p className="font-serif num text-sm">{p.budget}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Activity feed */}
        <div className="paper hairline rounded-2xl p-6">
          <h2 className="font-serif text-xl mb-4">Activity feed</h2>
          <ol className="relative border-l border-border ml-2 space-y-4 pl-4 text-xs">
            {activities.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No recent system events.</div>
            ) : (
              activities.map((a) => (
                <li key={a._id} className="relative">
                  <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-[var(--brand-gold)] border-2 border-background" />
                  <p className="text-sm text-foreground leading-tight">{a.message}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {new Date(a.createdAt).toLocaleDateString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))
            )}
          </ol>
        </div>
      </section>

      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        projectId={chatProjectId}
        projectTitle={chatProjectTitle}
        token={token}
        currentUser={currentUser}
      />

      <MilestoneReviewModal
        open={reviewModalOpen}
        onClose={() => setReviewModalOpen(false)}
        milestoneId={reviewMilestoneId}
        milestoneTitle={reviewMilestoneTitle}
        token={token}
        onSuccess={fetchDashboardData}
      />
    </div>
  );
}
