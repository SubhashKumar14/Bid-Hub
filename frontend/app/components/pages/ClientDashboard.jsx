import { checkout } from "../../../api/checkout";
import { Button } from "../ui/button";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { StatusBadge } from "../StatusBadge";
import { ShieldCheck, Plus, ArrowRight, MessageSquare, Check, Eye } from "lucide-react";
import { BrandIcon } from "../../brand/BrandIcon";
import { BrandState } from "../../brand/BrandState";
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
  const [error, setError] = useState("");
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
  const [awaitingFunding, setAwaitingFunding] = useState([]);
  const [completedProjects, setCompletedProjects] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disclaimerOpen, setDisclaimerOpen] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);
  const [selectedBidId, setSelectedBidId] = useState(null);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

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
    setError("");
    setLoading(true);
    try {
      const paymentsRes = await fetch("/api/payments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const paymentsData = await paymentsRes.json();
      if (!paymentsRes.ok) throw new Error("Financial data unavailable. Retry to refresh.");
      const lockedEscrow = paymentsData.stats?.lockedAmount || 0;
      const releasedEscrow = paymentsData.stats?.releasedAmount || 0;

      const dashRes = await fetch("/api/projects/client/dashboard", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dashData = await dashRes.json();
      if (!dashRes.ok) throw new Error(dashData.message || "Failed to load dashboard data");

      setPendingBids(dashData.pendingBids || []);
      setMilestonesToApprove(dashData.milestonesToApprove || []);
      setActiveProjects(dashData.activeProjects || []);
      setAwaitingFunding(dashData.awaitingFunding || []);
      setCompletedProjects(dashData.completedProjects || []);

      setStats({
        postedCount: dashData.postedCount || 0,
        bidsReceivedCount: dashData.bidsReceivedCount || 0,
        activeGigsCount: dashData.activeGigsCount || 0,
        lockedEscrow,
        releasedEscrow,
      });

      const actRes = await fetch("/api/activities");
      const actData = await actRes.json();
      if (actRes.ok) {
        setActivities(Array.isArray(actData) ? actData.slice(0, 8) : []);
      }
    } catch (err) {
      setError(err.message);
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [token, currentUser]);

  const handleAcceptBid = (bidId) => {
    setSelectedBidId(bidId);
    setSelectedProjectId(pendingBids.find(b => b.id === bidId)?.projectId);
    setDisclaimerOpen(true);
  };

  const executeCheckout = async () => {
    setDisclaimerOpen(false);
    if (!selectedBidId) return;
    try { await checkout(selectedBidId, token, currentUser, pendingBids.find(b => b.id === selectedBidId)?.version || 1); if (localStorage.getItem("token") !== token) return; setSuccessOpen(true); fetchDashboardData(); }
    catch (error) { if (localStorage.getItem("token") !== token) return; setError(error.message); toast.error(error.message); }
  };

  if (error && !loading) return <div role="alert" className="max-w-xl mx-auto p-8 space-y-4"><h1 className="text-xl">Workspace data unavailable</h1><p>{error}</p><Button onClick={fetchDashboardData}>Retry</Button></div>;

  if (loading) {
    return (
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-20 text-center animate-pulse">
      {error && <div role="alert" className="border border-destructive rounded p-4 text-sm">{error} <Button variant="outline" onClick={() => window.location.reload()}>Retry</Button></div>}
        <p className="text-sm text-muted-foreground">Syncing client workspace…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Workspace Header */}
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-border">
        <div>
          <span className="eyebrow text-xs text-muted-foreground">
            Client Workspace · {currentUser?.college || "Project Client"}
          </span>
          <h1 className="text-3xl font-medium tracking-tight text-foreground mt-1">
            Client Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your project briefs, agree proposals, and approve completed work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button
            onClick={() => setPage("post")}
            variant="default"
            className="rounded-[5px] text-xs h-9 px-4 font-medium"
          >
            <Plus className="size-3.5 mr-1" /> Post a project
          </Button>
          <Button
            onClick={onOpenEscrow}
            variant="outline"
            className="rounded-[5px] text-xs h-9 px-4 font-medium"
          >
            <ShieldCheck className="size-3.5 mr-1" /> Funding ledger
          </Button>
        </div>
      </header>

      {/* Priority 1: Milestones Awaiting Review & Release */}
      {milestonesToApprove.length > 0 && (
        <section className="bg-card border-l-4 border-l-[var(--brand-accent)] border border-border rounded-[8px] p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrandIcon name="milestone" size={18} className="text-[var(--brand-accent)]" />
              <h2 className="text-sm font-medium text-foreground">
                Milestones Awaiting Your Review ({milestonesToApprove.length})
              </h2>
            </div>
            <span className="text-xs text-muted-foreground">Action Required</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Students have submitted completed deliverables for these checkpoints. Review files, test demos, and approve completed work or request revisions.
          </p>

          <div className="space-y-2 pt-1">
            {milestonesToApprove.map((m) => (
              <div
                key={m.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-[5px] bg-secondary/50 border border-border"
              >
                <div className="text-xs min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge tone="review" className="text-[10px] py-0">Submitted</StatusBadge>
                    <span className="font-medium text-foreground truncate">{m.title}</span>
                  </div>
                  <p className="text-muted-foreground text-[11px] mt-0.5">
                    Checkpoint Escrow: <span className="num font-mono font-medium text-foreground">{formatCurrency(m.amount)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => openReviewModal(m.id, m.title)}
                    className="rounded-[4px] text-xs h-8 px-3"
                  >
                    Review Deliverables
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Financial & Statistics Summary */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        {[
          { k: "Briefs Published", v: stats.postedCount },
          { k: "Proposals Received", v: stats.bidsReceivedCount },
          { k: "Active Deliveries", v: stats.activeGigsCount },
          { k: "Test funds allocated", v: formatCurrency(stats.lockedEscrow) },
          { k: "Funds Released", v: formatCurrency(stats.releasedEscrow) },
        ].map((s) => (
          <div key={s.k} className="bg-card border border-border rounded-[8px] p-3.5 space-y-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">{s.k}</span>
            <p className="text-xl font-medium num text-foreground pt-0.5">{s.v}</p>
          </div>
        ))}
      </section>

      {/* Main Sections: Proposals to Review & Active Projects */}
      <section className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Proposals Awaiting Response */}
        <div className="lg:col-span-7 bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <BrandIcon name="proposal" size={18} className="text-[var(--brand-accent)]" />
              <h2 className="text-base font-medium text-foreground">Proposals to Review</h2>
            </div>
            <span className="text-xs text-muted-foreground">{pendingBids.length} awaiting response</span>
          </div>

          <div className="space-y-3">
            {pendingBids.length === 0 ? (
              <BrandState
                name="no-proposals"
                title="No proposals awaiting review"
                description="Post a new brief or check back as student applications arrive."
                compact
              />
            ) : (
              pendingBids.map((b) => (
                <div
                  key={b.id}
                  className="p-4 rounded-[6px] border border-border bg-secondary/15 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <Avatar className="size-8 rounded-[4px] border border-border shrink-0">
                        <AvatarFallback className="text-xs bg-secondary text-foreground font-medium rounded-[4px]">
                          {b.studentName ? b.studentName.split(" ").map((x) => x[0]).slice(0, 2).join("") : "S"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="text-xs">
                        <p className="font-medium text-foreground leading-tight">{b.studentName}</p>
                        <p className="text-muted-foreground text-[11px] mt-0.5 truncate max-w-[200px] sm:max-w-xs">
                          {b.projectTitle}
                        </p>
                      </div>
                    </div>

                    {/* Proposal Amount Prominently Displayed on Both Mobile & Desktop */}
                    <div className="text-right shrink-0">
                      <p className="text-base font-medium num text-foreground leading-tight">
                        {formatCurrency(b.amount)}
                      </p>
                      <p className="text-[10px] text-muted-foreground">{b.timeline || "Proposed deadline"}</p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-[4px] text-xs h-8 px-3"
                      onClick={() => {
                        localStorage.setItem("currentProjectId", b.projectId);
                        setPage("detail");
                      }}
                    >
                      <Eye className="size-3 mr-1" /> View Brief & Full Proposal
                    </Button>
                    <Button
                      size="sm"
                      variant="default"
                      className="rounded-[4px] text-xs h-8 px-3"
                      onClick={() => handleAcceptBid(b.id)}
                    >
                      Accept & Resume Test Funding
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Active Projects Column */}
        <div className="lg:col-span-5 bg-card border border-border rounded-[8px] p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <div className="flex items-center gap-2">
              <BrandIcon name="project-brief" size={18} className="text-[var(--brand-accent)]" />
              <h2 className="text-base font-medium text-foreground">Active Projects</h2>
            </div>
            <span className="text-xs text-muted-foreground">{activeProjects.length} in progress</span>
          </div>

          <div className="space-y-3">
            {activeProjects.length === 0 ? (
              <BrandState
                name="no-contracts"
                title="No active projects in progress"
                description="Once you accept a proposal and fund escrow, projects appear here."
                compact
              />
            ) : (
              activeProjects.map((p) => (
                <div key={p.id} className="p-3.5 rounded-[6px] border border-border bg-secondary/10 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3
                        className="text-xs font-medium text-foreground truncate hover:text-[var(--brand-accent)] cursor-pointer"
                        onClick={() => {
                          localStorage.setItem("currentProjectId", p.id);
                          setPage("detail");
                        }}
                      >
                        {p.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{p.statusText}</p>
                    </div>
                    <span className="text-xs font-medium num text-foreground shrink-0">
                      {formatCurrency(p.budget)}
                    </span>
                  </div>

                  <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--brand-accent)] transition-all duration-300"
                      style={{ width: `${p.progress}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
                    <span>{p.progress}% completed</span>
                    <Button
                      size="xs"
                      variant="outline"
                      className="rounded-[4px] text-[11px] h-6 px-2"
                      onClick={() => openChat(p.id, p.title)}
                    >
                      <MessageSquare className="size-3 mr-1" /> Discussion
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Activity Log Feed */}
          {activities.length > 0 && (
            <div className="pt-4 border-t border-border/60 space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Recent Workspace Activity
              </h3>
              <div className="space-y-2">
                {activities.slice(0, 5).map((a) => (
                  <div key={a._id} className="text-xs text-muted-foreground flex items-baseline gap-2">
                    <span className="size-1.5 rounded-full bg-[var(--brand-accent)] shrink-0 self-center" />
                    <span className="text-foreground font-medium">{a.text || a.title}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0 ml-auto">
                      {new Date(a.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Dialogs and Drawers */}
      {[{ title: "Awaiting test funding", projects: awaitingFunding }, { title: "Completed history", projects: completedProjects }].map(group => <section key={group.title} className="space-y-3 py-5 border-t border-border">
        <h2 className="text-lg font-medium">{group.title} ({group.projects.length})</h2>
        {group.projects.map(p => <Button key={p._id} variant="outline" onClick={() => { localStorage.setItem("currentProjectId", p._id); setPage("detail"); }}>{p.title} · Open workspace</Button>)}
      </section>)}
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
        offer={pendingBids.find(b => b.id === selectedBidId)}
        open={disclaimerOpen}
        onCancel={() => {
          setDisclaimerOpen(false);
          setSelectedBidId(null);
        }}
        onConfirm={executeCheckout}
      />

      <PaymentSuccessModal
        open={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          setSelectedBidId(null);
          if (selectedProjectId) { localStorage.setItem("currentProjectId", selectedProjectId); setPage("detail"); }
        }}
      />
    </div>
  );
}
