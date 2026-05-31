import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { Sparkles, TrendingUp, Wallet, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function StudentDashboard({ setPage, onOpenEscrow, token, currentUser }) {
  const [stats, setStats] = useState({
    earnings: 0,
    activeContractsCount: 0,
    openBidsCount: 0,
    profileViews: 0,
  });
  const [contracts, setContracts] = useState([]);
  const [bids, setBids] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboardData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      // 1. Fetch Payment Ledger & Stats
      const paymentsRes = await fetch("/api/payments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const paymentsData = await paymentsRes.json();
      
      // Calculate earnings from payments statistics
      const releasedAmount = paymentsData.stats?.releasedAmount || 0;

      // 2. Fetch User Profile & Views & Reviews
      const profileRes = await fetch(`/api/users/${currentUser._id}`);
      const profileData = await profileRes.json();
      const views = profileData.user?.profileViews || 0;
      setReviews(profileData.reviews || []);

      // 3. Fetch Contracts & Bids
      // We can fetch projects from backend and filter locally
      const projectsRes = await fetch("/api/projects");
      const projects = await projectsRes.json();

      const activeGigs = [];
      let activeContractsCount = 0;

      // Find contracts where student is assigned
      for (const p of projects) {
        if (p.acceptedBidId && p.status !== "OPEN") {
          // Fetch bids for this project to check if we are the student
          const bidsRes = await fetch(`/api/projects/${p._id}/bids`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const bidsData = await bidsRes.json();
          const myBid = bidsData.find(b => b.studentId?._id === currentUser._id || b.studentId === currentUser._id);
          
          if (myBid && myBid.status === "ACCEPTED") {
            // Find milestones to check completion
            const detailsRes = await fetch(`/api/projects/${p._id}`);
            const detailsData = await detailsRes.json();
            const milestones = detailsData.milestones || [];
            
            const releasedCount = milestones.filter(m => m.status === "RELEASED").length;
            const progress = milestones.length > 0 ? Math.round((releasedCount / milestones.length) * 100) : 0;
            const inReview = milestones.some(m => m.status === "SUBMITTED");

            activeGigs.push({
              id: p._id,
              title: `${p.clientId?.name || "Client"} · ${p.title}`,
              statusText: inReview ? "Hi-fi / milestone in review" : "Sprint active",
              amount: p.budget,
              progress,
              status: inReview ? "in-review" : "active",
              milestones, // Store milestones list for submission trigger
            });
            activeContractsCount++;
          }
        }
      }
      setContracts(activeGigs);

      // Find bids placed by student
      let openBidsCount = 0;
      const studentBids = [];
      for (const p of projects) {
        if (p.status === "OPEN") {
          const bidsRes = await fetch(`/api/projects/${p._id}/bids`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const bidsData = await bidsRes.json();
          const myBid = bidsData.find(b => b.studentId?._id === currentUser._id || b.studentId === currentUser._id);
          if (myBid) {
            studentBids.push({
              id: myBid._id,
              projectId: p._id,
              title: p.title,
              amount: myBid.amount,
              status: myBid.status.toLowerCase(),
            });
            openBidsCount++;
          }
        }
      }
      setBids(studentBids);

      setStats({
        earnings: releasedAmount,
        activeContractsCount,
        openBidsCount,
        profileViews: views,
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token, currentUser]);

  const handleSubmitMilestone = async (milestoneId) => {
    try {
      const res = await fetch(`/api/milestones/${milestoneId}/submit`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to submit milestone");
      toast.success("Milestone submitted for client review!");
      fetchDashboardData();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-5 lg:px-8 py-20 text-center animate-pulse">
        <p className="font-serif text-xl">Syncing student workspace dashboard...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-5 lg:px-8 py-12 space-y-10">
      {/* Hero */}
      <header className="paper hairline rounded-3xl p-8 lg:p-10 relative overflow-hidden">
        <div className="absolute -bottom-20 -right-10 size-72 rounded-full bg-[var(--brand-gold)]/15 blur-3xl" />
        <span className="eyebrow">Student workspace · verified profile</span>
        <h1 className="display text-4xl md:text-5xl mt-2 max-w-2xl">
          Good morning, {currentUser?.name}. <span className="italic text-[var(--brand-gold)]">Build trust</span> and track escrow.
        </h1>
        <p className="mt-3 text-muted-foreground max-w-xl">
          You have {stats.activeContractsCount} active freelance contracts and {stats.openBidsCount} open proposals on the project wall.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Button onClick={() => setPage("browse")} className="rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90">Find work</Button>
          <Button onClick={onOpenEscrow} variant="outline" className="rounded-full">Open escrow</Button>
        </div>
      </header>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { k: "Earnings · this term", v: `₹${stats.earnings.toLocaleString()}`, d: "Direct payout to bank", icon: <Wallet className="size-4" /> },
          { k: "Active contracts", v: stats.activeContractsCount, d: "Milestone-tracked briefs", icon: <Sparkles className="size-4" /> },
          { k: "Open bids", v: stats.openBidsCount, d: "Proposals sent", icon: <TrendingUp className="size-4" /> },
          { k: "Profile views", v: stats.profileViews, d: "Quiet background searches", icon: <Eye className="size-4" /> },
        ].map((s) => (
          <div key={s.k} className="paper hairline rounded-2xl p-5">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="eyebrow">{s.k}</span>{s.icon}
            </div>
            <p className="font-serif text-3xl mt-3 num">{s.v}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.d}</p>
          </div>
        ))}
      </section>

      <section className="grid lg:grid-cols-3 gap-6">
        {/* Active contracts */}
        <div className="lg:col-span-2 paper hairline rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-xl">Ongoing contracts</h2>
          </div>
          <div className="space-y-4">
            {contracts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">
                No active contracts. Place bids to get hired!
              </div>
            ) : (
              contracts.map((c, i) => (
                <div key={i} className="hairline rounded-xl p-4 space-y-3 bg-card/45">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{c.title}</p>
                      <p className="text-xs text-muted-foreground">{c.statusText}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-serif num">{c.amount}</p>
                      <StatusBadge tone={c.status === "in-review" ? "gold" : "sand"}>{c.status}</StatusBadge>
                    </div>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-[var(--brand-gold)]" style={{ width: `${c.progress}%` }} />
                  </div>
                  <div className="flex justify-between mt-1.5 text-[11px] text-muted-foreground">
                    <span>{c.progress}% milestone released</span>
                    <span>Next milestone pending submission</span>
                  </div>

                  {/* Submission buttons for pending milestones */}
                  <div className="pt-2 flex flex-wrap gap-2 border-t border-border/40">
                    {c.milestones.map((m) => (
                      <div key={m._id} className="w-full flex items-center justify-between bg-background/50 p-2.5 rounded-lg text-xs">
                        <span>{m.title} ({m.amount})</span>
                        {m.status === "PENDING" && (
                          <Button size="xs" className="rounded-full py-1 px-3 bg-[var(--brand-gold)] text-[var(--brand-deep)]" onClick={() => handleSubmitMilestone(m._id)}>
                            Submit Work
                          </Button>
                        )}
                        {m.status === "SUBMITTED" && (
                          <StatusBadge tone="gold" className="text-[10px]">Under Review</StatusBadge>
                        )}
                        {m.status === "RELEASED" && (
                          <StatusBadge tone="success" className="text-[10px]">Released</StatusBadge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Bids sent */}
        <div className="paper hairline rounded-2xl p-6">
          <h2 className="font-serif text-xl mb-4">Bids sent</h2>
          <div className="space-y-3">
            {bids.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No bids sent yet.</div>
            ) : (
              bids.map((b) => (
                <div
                  key={b.id}
                  className="flex justify-between items-center text-sm py-3 border-b border-border/60 last:border-0 cursor-pointer"
                  onClick={() => {
                    localStorage.setItem("currentProjectId", b.projectId);
                    setPage("detail");
                  }}
                >
                  <div>
                    <p className="hover:underline font-serif">{b.title}</p>
                    <p className="text-xs text-muted-foreground num">{b.amount}</p>
                  </div>
                  <StatusBadge tone={b.status === "accepted" ? "success" : b.status === "rejected" ? "danger" : "gold"}>
                    {b.status}
                  </StatusBadge>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-2 gap-6">
        {/* Recent reviews */}
        <div className="paper hairline rounded-2xl p-6">
          <h2 className="font-serif text-xl mb-4">Recent client reviews</h2>
          <div className="space-y-4">
            {reviews.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground text-sm">No reviews received yet. Reviews appear on project completion.</div>
            ) : (
              reviews.map((r, i) => (
                <div key={i} className="border-b border-border/40 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-7">
                      {r.reviewerId?.avatarUrl ? (
                        <img src={r.reviewerId.avatarUrl} alt={r.reviewerId.name} className="size-full rounded-full object-cover" />
                      ) : (
                        <AvatarFallback className="text-[10px] bg-[var(--brand-bronze)] text-[var(--brand-gold)]">
                          {(r.reviewerId?.name || "C").split(" ").map((x) => x[0]).join("")}
                        </AvatarFallback>
                      )}
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">{r.reviewerId?.name || "Client"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {r.projectId?.title} · {"★".repeat(r.rating)}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground italic font-serif mt-2">"{r.comment}"</p>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
