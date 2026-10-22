import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { StatusBadge } from "./StatusBadge";
import { ShieldCheck, ArrowUpFromLine, Copy, ExternalLink } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

export function EscrowDrawer({ open, onClose, token, currentUser }) {
  const [stats, setStats] = useState({
    lockedAmount: 0,
    pendingAmount: 0,
    releasedAmount: 0,
  });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchEscrowDetails = async () => {
    if (!token || !open) return;
    setLoading(true);
    try {
      const res = await fetch("/api/payments", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to load escrow details");
      setStats(data.stats);
      setTransactions(data.transactions || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrowDetails();
  }, [open, token]);

  const copyRef = (ref) => {
    navigator.clipboard.writeText(ref);
    toast.success(`Copied transaction reference: ${ref}`);
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-card border-l border-border overflow-y-auto p-6 space-y-6">
        <SheetHeader className="text-left space-y-1">
          <div className="flex items-center gap-1.5 text-brand-accent">
            <ShieldCheck className="size-4" />
            <span className="text-xs uppercase tracking-wider font-mono">Milestone Escrow Vault</span>
          </div>
          <SheetTitle className="text-xl font-semibold tracking-tight text-foreground">Funds Held in Trust</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
            Client deposits remain locked in contract escrow until each deliverable milestone is reviewed and signed off.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-20 text-center text-xs text-muted-foreground animate-pulse">
            Opening escrow ledger…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Vault Summary Card */}
            <div className="rounded-[8px] bg-secondary/30 border border-border p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Currently Locked in Escrow</p>
                <p className="text-3xl font-mono tabular-nums font-semibold text-foreground mt-1">₹{stats.lockedAmount.toLocaleString()}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-xs">
                <div>
                  <p className="text-muted-foreground text-[11px]">Released to Date</p>
                  <p className="font-mono tabular-nums font-semibold text-[var(--status-success-fg)] mt-0.5">
                    ₹{stats.releasedAmount.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[11px]">Awaiting Signoff</p>
                  <p className="font-mono tabular-nums font-semibold text-[var(--status-warning-fg)] mt-0.5">
                    ₹{stats.pendingAmount.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Active Milestone Contracts */}
            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Active Milestone Contracts</h3>
              <div className="space-y-2">
                {transactions.length === 0 ? (
                  <div className="text-center py-6 text-xs text-muted-foreground italic rounded-[6px] border border-border p-4">
                    No active escrow milestones.
                  </div>
                ) : (
                  transactions.map((tx, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-[6px] border border-border px-3.5 py-2.5 bg-background">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-medium text-foreground truncate max-w-[200px]">{tx.projectId?.title || "Contract"}</p>
                        <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
                          ₹{tx.amount.toLocaleString()} · {tx.milestoneId?.title || "Milestone"}
                        </p>
                      </div>
                      <StatusBadge
                        tone={
                          tx.status === "RELEASED" ? "success" : tx.status === "PENDING" ? "warning" : "muted"
                        }
                      >
                        {tx.status.toLowerCase()}
                      </StatusBadge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Ledger Audit History */}
            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Ledger Transactions</h3>
              <div className="space-y-1 text-xs">
                {transactions.length === 0 ? (
                  <div className="text-center py-4 text-xs text-muted-foreground italic">No transaction records.</div>
                ) : (
                  transactions.slice(0, 5).map((tx) => (
                    <div key={tx.transactionRef} className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-medium text-foreground truncate max-w-[180px]">{tx.projectId?.title}</p>
                        <button
                          type="button"
                          aria-label={`Copy transaction reference ${tx.transactionRef}`}
                          onClick={() => copyRef(tx.transactionRef)}
                          className="min-h-11 text-[10px] text-muted-foreground inline-flex items-center gap-1 hover:text-foreground font-mono"
                        >
                          {tx.transactionRef} <Copy className="size-2.5 opacity-60" />
                        </button>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono tabular-nums text-xs font-medium text-foreground">
                          {tx.status === "RELEASED" ? "+" : "−"}₹{tx.amount.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {tx.releasedAt ? new Date(tx.releasedAt).toLocaleDateString() : "Escrow Locked"}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Separator />

            {/* Practical Payout Information */}
            <div className="rounded-[6px] bg-secondary/20 border border-border p-4 text-xs space-y-1 text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground">Disbursement Policy</p>
              <p>Escrow balances are transferred immediately upon client checkpoint approval. Payout receipts are logged in the project audit trail.</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
