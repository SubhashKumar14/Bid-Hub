import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { ShieldCheck, Briefcase } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ChatDrawer } from "../ChatDrawer";
import { MilestoneReviewModal } from "../MilestoneReviewModal";
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
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [selectedBidId, setSelectedBidId] = useState(null);

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

      // 2. Fetch Projects and calculate stats using optimized dashboard endpoint
      const dashRes = await fetch("/api/projects/client/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dashData = await dashRes.json();
      if (!dashRes.ok) throw new Error(dashData.message || "Failed to load dashboard data");

      setPendingBids(dashData.pendingBids || []);
      setMilestonesToApprove(dashData.milestonesToApprove || []);
      setActiveProjects(dashData.activeProjects || []);

      setStats({
        postedCount: dashData.postedCount || 0,
        bidsReceivedCount: dashData.bidsReceivedCount || 0,
        activeGigsCount: dashData.activeGigsCount || 0,
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
        if (data.keyId === "rzp_test_placeholder") {
          toast.info("Simulating Razorpay Test Mode checkout (using placeholder credentials)...");
          setTimeout(async () => {
            try {
              const verifyRes = await fetch("/api/payments/verify", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  razorpay_order_id: data.orderId,
                  razorpay_payment_id: "pay_simulated_" + Math.random().toString(36).substring(2, 10),
                  razorpay_signature: "signature_simulated",
                }),
              });
              const verifyData = await verifyRes.json();
              if (verifyRes.ok) {
                setSuccessOpen(true);
                fetchDashboardData();
              } else {
                throw new Error(verifyData.message || "Verification failed");
              }
            } catch (vErr) {
              toast.error("Payment verification failed: " + vErr.message);
            }
          }, 1500);
          return;
        }

        toast.info("Opening Razorpay test portal. Test Card: 4111 1111 1111 1111 | Expiry: 12/30 | CVV: 111", { duration: 10000 });
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
              toast.info("Payment modal closed.");
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
                    <p className="font-serif num">{formatCurrency(b.amount)}</p>
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
                    <p className="text-xs text-muted-foreground num">{formatCurrency(m.amount)}</p>
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
                  <p className="font-serif num text-sm">{formatCurrency(p.budget)}</p>
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
      <PaymentDisclaimerModal
        open={disclaimerOpen}
        onConfirm={confirmCheckout}
        onCancel={() => setDisclaimerOpen(false)}
      />
      <PaymentSuccessModal
        open={successOpen}
        onClose={() => setSuccessOpen(false)}
      />
    </div>
  );
}
