import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { Sparkles, TrendingUp, Wallet, Eye, ArrowRight, MessageSquare } from "lucide-react";
import { BrandIcon } from "../../brand/BrandIcon";
import { BrandState } from "../../brand/BrandState";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ChatDrawer } from "../ChatDrawer";
import { MilestoneSubmitModal } from "../MilestoneSubmitModal";

const formatCurrency = (val) => {
  if (val === undefined || val === null) return "";
  if (typeof val === "number") {
    return `₹${val.toLocaleString("en-IN")}`;
  }
  if (val.toString().includes("₹")) return val;
  const num = parseFloat(val.toString().replace(/[₹$,\s]/g, ""));
  return isNaN(num) ? val : `₹${num.toLocaleString("en-IN")}`;
};

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

  const [chatOpen, setChatOpen] = useState(false);
  const [chatProjectId, setChatProjectId] = useState(null);
  const [chatProjectTitle, setChatProjectTitle] = useState("");

  const openChat = (projectId, projectTitle) => {
    setChatProjectId(projectId);
    setChatProjectTitle(projectTitle);
    setChatOpen(true);
  };

  const [submitModalOpen, setSubmitModalOpen] = useState(false);
  const [submitMilestoneId, setSubmitMilestoneId] = useState(null);
  const [submitMilestoneTitle, setSubmitMilestoneTitle] = useState("");

  const openSubmitModal = (milestoneId, milestoneTitle) => {
    setSubmitMilestoneId(milestoneId);
    setSubmitMilestoneTitle(milestoneTitle);
    setSubmitModalOpen(true);
  };

  const fetchDashboardData = async () => {
    if (!token || !currentUser) return;
    setLoading(true);
    try {
      const paymentsRes = await fetch("/api/payments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const paymentsData = await paymentsRes.json();
      const releasedAmount = paymentsData.stats?.releasedAmount || 0;

      const profileRes = await fetch(`/api/users/${currentUser._id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const profileData = await profileRes.json();
      const views = profileData.user?.profileViews || 0;
      setReviews(profileData.reviews || []);

      const dashRes = await fetch("/api/projects/student/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dashData = await dashRes.json();
      if (!dashRes.ok) throw new Error(dashData.message || "Failed to load dashboard data");

      setContracts(dashData.contracts || []);
      setBids(dashData.bids || []);

      const openBidsCount = (dashData.bids || []).filter((b) => b.status === "pending" || b.status === "PENDING").length;

      setStats({
        earnings: releasedAmount,
        activeContractsCount: (dashData.contracts || []).length,
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

  // Derive items requiring immediate student attention (Revisions requested or Pending deliverables)
  const attentionItems = [];
  contracts.forEach((c) => {
    (c.milestones || []).forEach((m) => {
      if (m.status === "CHANGES_REQUESTED") {
        attentionItems.push({
          type: "revision",
          projectTitle: c.title,
          milestoneId: m._id,
          milestoneTitle: m.title,
          amount: m.amount,
        });
      } else if (m.status === "PENDING" && ["ASSIGNED", "IN_PROGRESS"].includes(c.projectStatus)) {
        attentionItems.push({
          type: "pending",
          projectTitle: c.title,
          milestoneId: m._id,
          milestoneTitle: m.title,
          amount: m.amount,
        });
      }
    });
  });

  if (loading) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-20 text-center animate-pulse">
        <p className="text-sm text-muted-foreground">Syncing student workspace…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Workspace Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <span className="eyebrow text-xs text-muted-foreground">
            Student Freelance Workspace · {currentUser?.college || "Verified Student"}
          </span>
          <h1 className="text-3xl font-medium tracking-tight text-foreground mt-1">
            Workspace: {currentUser?.name}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track active milestone submissions, pending client feedback, and verified escrow payouts.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            onClick={() => setPage("browse")}
            variant="default"
            className="rounded-[5px] text-xs h-9 px-4 font-medium"
          >
            Find a project <ArrowRight className="ml-1 size-3.5" />
          </Button>
          <Button
            onClick={onOpenEscrow}
            variant="outline"
            className="rounded-[5px] text-xs h-9 px-4 font-medium"
          >
            Escrow ledger
          </Button>
        </div>
      </header>

      {/* Priority: Needs Your Attention Banner */}
      {attentionItems.length > 0 && (
        <section className="bg-card border-l-4 border-l-[var(--brand-accent)] border border-border rounded-[8px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrandIcon name="submission" size={18} className="text-[var(--brand-accent)]" />
              <h2 className="text-sm font-medium text-foreground">
                Needs Your Attention ({attentionItems.length})
              </h2>
            </div>
            <span className="text-[11px] text-muted-foreground">Pending Checkpoints</span>
          </div>

          <div className="space-y-2 pt-1">
            {attentionItems.slice(0, 4).map((item, idx) => (
              <div
                key={idx}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-[5px] bg-secondary/40 border border-border/60"
              >
                <div className="text-xs min-w-0">
                  <div className="flex items-center gap-2">
                    {item.type === "revision" ? (
                      <StatusBadge tone="danger" className="text-[10px] py-0">Changes Requested</StatusBadge>
                    ) : (
                      <StatusBadge tone="warning" className="text-[10px] py-0">Ready to Submit</StatusBadge>
                    )}
                    <span className="font-medium text-foreground truncate">{item.milestoneTitle}</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] mt-0.5 truncate">
                    {item.projectTitle} · <span className="num font-mono">{formatCurrency(item.amount)}</span>
                  </p>
                </div>

                <Button
                  size="sm"
                  variant={item.type === "revision" ? "destructive" : "default"}
                  onClick={() => openSubmitModal(item.milestoneId, item.milestoneTitle)}
                  className="rounded-[5px] text-xs h-8 px-3 shrink-0"
                >
                  {item.type === "revision" ? "Resubmit Deliverable" : "Submit Deliverable"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Compact Financial & Stats Summary */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { k: "Released Earnings", v: formatCurrency(stats.earnings), d: "Direct escrow payout", icon: <Wallet className="size-4" /> },
          { k: "Active Contracts", v: stats.activeContractsCount, d: "In delivery pipeline", icon: <Sparkles className="size-4" /> },
          { k: "Proposals Pending", v: stats.openBidsCount, d: "Under client review", icon: <TrendingUp className="size-4" /> },
          { k: "Profile Views", v: stats.profileViews, d: "Direct directory discovery", icon: <Eye className="size-4" /> },
        ].map((s) => (
          <div key={s.k} className="bg-card border border-border rounded-[8px] p-4 space-y-1">
            <div className="flex items-center justify-between text-muted-foreground text-xs">
              <span className="uppercase tracking-wider text-[10px] font-medium">{s.k}</span>
              {s.icon}
            </div>
            <p className="text-2xl font-medium num text-foreground pt-1">{s.v}</p>
            <p className="text-[11px] text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </section>

      {/* Workspaces Grid: Contracts and Proposals */}
      <section className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Active Contracts Column */}
        <div className="lg:col-span-8 bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <BrandIcon name="contract" size={18} className="text-[var(--brand-accent)]" />
              <h2 className="text-base font-medium text-foreground">Active Contracts</h2>
            </div>
            <span className="text-xs text-muted-foreground">{contracts.length} active</span>
          </div>

          <div className="space-y-4">
            {contracts.length === 0 ? (
              <BrandState
                name="no-contracts"
                title="No active contracts"
                description="Explore open project briefs and submit proposals to get started."
                action={
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-[5px] text-xs h-8 px-4"
                    onClick={() => setPage("browse")}
                  >
                    Browse Project Directory
                  </Button>
                }
              />
            ) : (
              contracts.map((c, i) => (
                <div key={i} className="border border-border/80 rounded-[6px] p-4 space-y-3 bg-secondary/15">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">{c.title}</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{c.statusText}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {["ASSIGNED", "IN_PROGRESS", "COMPLETED"].includes(c.projectStatus) && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-[4px] h-8 px-2.5 text-xs"
                          onClick={() => openChat(c.id, c.title)}
                        >
                          <MessageSquare className="size-3.5 mr-1" /> Discussion
                        </Button>
                      )}
                      <div className="text-right">
                        <p className="text-sm font-medium num text-foreground">{formatCurrency(c.amount)}</p>
                        <StatusBadge
                          tone={c.status === "in-review" ? "info" : c.status === "completed" ? "success" : "warning"}
                          className="text-[10px] py-0"
                        >
                          {c.status}
                        </StatusBadge>
                      </div>
                    </div>
                  </div>

                  {/* Progress Line */}
                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-accent)] transition-all duration-300"
                      style={{ width: `${c.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{c.progress}% escrow released</span>
                    <span>{c.milestones?.filter((m) => m.status === "RELEASED").length || 0} of {c.milestones?.length || 0} milestones approved</span>
                  </div>

                  {/* Checkpoints List */}
                  <div className="pt-2 space-y-1.5 border-t border-border/60">
                    {c.milestones.map((m) => (
                      <div
                        key={m._id}
                        className="flex items-center justify-between p-2.5 rounded-[4px] bg-card border border-border/60 text-xs"
                      >
                        <span className="font-medium text-foreground truncate pr-2">
                          {m.title} <span className="text-muted-foreground font-mono">({formatCurrency(m.amount)})</span>
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {m.status === "PENDING" && (
                            <Button
                              size="xs"
                              variant="default"
                              className="rounded-[4px] text-[11px] h-7 px-2.5"
                              onClick={() => openSubmitModal(m._id, m.title)}
                            >
                              Submit Checkpoint
                            </Button>
                          )}
                          {m.status === "CHANGES_REQUESTED" && (
                            <div className="flex items-center gap-1.5">
                              <StatusBadge tone="danger" className="text-[10px] py-0">Revisions</StatusBadge>
                              <Button
                                size="xs"
                                variant="destructive"
                                className="rounded-[4px] text-[11px] h-7 px-2.5"
                                onClick={() => openSubmitModal(m._id, m.title)}
                              >
                                Resubmit
                              </Button>
                            </div>
                          )}
                          {m.status === "SUBMITTED" && (
                            <StatusBadge tone="info" className="text-[10px] py-0">In Review</StatusBadge>
                          )}
                          {m.status === "RELEASED" && (
                            <StatusBadge tone="success" className="text-[10px] py-0">Released</StatusBadge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Proposals Sent Column */}
        <div className="lg:col-span-4 bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <BrandIcon name="proposal" size={18} className="text-[var(--brand-accent)]" />
              <h2 className="text-base font-medium text-foreground">Proposals Sent</h2>
            </div>
            <span className="text-xs text-muted-foreground">{bids.length} total</span>
          </div>

          <div className="space-y-3">
            {bids.length === 0 ? (
              <BrandState
                name="no-proposals"
                title="No proposals submitted yet"
                description="Check the project directory to submit proposals on open briefs."
                compact
              />
            ) : (
              bids.map((b) => (
                <div
                  key={b.id}
                  className="p-3 rounded-[6px] border border-border hover:bg-secondary/40 transition-colors cursor-pointer space-y-1.5"
                  onClick={() => {
                    localStorage.setItem("currentProjectId", b.projectId);
                    setPage("detail");
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-foreground line-clamp-1 hover:text-[var(--brand-accent)]">
                      {b.title}
                    </p>
                    <StatusBadge
                      tone={b.status === "accepted" ? "success" : b.status === "rejected" ? "danger" : "info"}
                      className="text-[10px] py-0 shrink-0"
                    >
                      {b.status}
                    </StatusBadge>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="num font-mono font-medium text-foreground">{formatCurrency(b.amount)}</span>
                    <span>{b.timeline || "Proposed deadline"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Review Evidence Section */}
      {reviews.length > 0 && (
        <section className="bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-border/60">
            <BrandIcon name="work-record" size={18} className="text-[var(--brand-accent)]" />
            <h2 className="text-base font-medium text-foreground">Client Feedback & Ratings</h2>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviews.map((r, i) => (
              <div key={i} className="p-4 rounded-[6px] border border-border bg-secondary/20 space-y-2">
                <div className="flex items-center gap-2">
                  <Avatar className="size-7 rounded-[4px] border border-border">
                    <AvatarFallback className="text-[10px] bg-secondary text-foreground font-medium rounded-[4px]">
                      {(r.reviewerId?.name || "C").split(" ").map((x) => x[0]).slice(0, 2).join("")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="text-xs leading-tight">
                    <p className="font-medium text-foreground">{r.reviewerId?.name || "Client"}</p>
                    <p className="text-[11px] text-[var(--brand-accent)]">{"★".repeat(r.rating || 5)}</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed italic line-clamp-3">
                  "{r.comment}"
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Overlay Drawers & Modals */}
      <ChatDrawer
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        projectId={chatProjectId}
        projectTitle={chatProjectTitle}
        token={token}
        currentUser={currentUser}
      />

      <MilestoneSubmitModal
        open={submitModalOpen}
        onClose={() => setSubmitModalOpen(false)}
        milestoneId={submitMilestoneId}
        milestoneTitle={submitMilestoneTitle}
        token={token}
        onSuccess={fetchDashboardData}
      />
    </div>
  );
}
