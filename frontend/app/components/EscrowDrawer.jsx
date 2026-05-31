import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { StatusBadge } from "./StatusBadge";
import { ShieldCheck, ArrowDownToLine, ArrowUpFromLine, Copy } from "lucide-react";
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
      <SheetContent side="right" className="w-full sm:max-w-md bg-background overflow-y-auto">
        <SheetHeader className="px-1">
          <div className="flex items-center gap-2 text-[var(--brand-gold)]">
            <ShieldCheck className="size-4" />
            <span className="eyebrow">Escrow vault</span>
          </div>
          <SheetTitle className="font-serif text-2xl">Funds held in trust</SheetTitle>
          <SheetDescription>Every milestone is locked until both sides sign off. No surprises.</SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="py-20 text-center text-sm text-muted-foreground animate-pulse font-serif">
            Opening escrow vault...
          </div>
        ) : (
          <div className="mt-6 px-1 space-y-5">
            <div className="paper hairline rounded-2xl p-5">
              <p className="eyebrow">Locked amount</p>
              <p className="font-serif text-4xl mt-1 num">₹{stats.lockedAmount.toLocaleString()}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground text-xs">Released to Date</p>
                  <p className="num font-semibold text-green-600 dark:text-green-400">₹{stats.releasedAmount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Pending Review</p>
                  <p className="num font-semibold text-yellow-600 dark:text-yellow-400">₹{stats.pendingAmount.toLocaleString()}</p>
                </div>
              </div>
            </div>

            <div>
              <p className="eyebrow mb-2">Milestone Contracts Escrow</p>
              <div className="space-y-2">
                {transactions.length === 0 ? (
                  <div className="text-center py-4 text-xs text-muted-foreground italic">
                    No active escrow milestones.
                  </div>
                ) : (
                  transactions.map((tx, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded-xl hairline px-3 py-2.5 bg-card/15">
                      <div>
                        <p className="text-xs font-semibold truncate max-w-[200px]">{tx.projectId?.title || "Contract"}</p>
                        <p className="text-[11px] text-muted-foreground num">₹{tx.amount.toLocaleString()} · {tx.milestoneId?.title || "Milestone"}</p>
                      </div>
                      <StatusBadge
                        tone={
                          tx.status === "RELEASED" ? "success" : tx.status === "PENDING" ? "gold" : "muted"
                        }
                      >
                        {tx.status.toLowerCase()}
                      </StatusBadge>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div>
              <p className="eyebrow mb-2">Simulated Ledger Ledger</p>
              <div className="space-y-1 text-sm">
                {transactions.length === 0 ? (
                  <div className="text-center py-4 text-xs text-muted-foreground italic">No transaction history.</div>
                ) : (
                  transactions.slice(0, 5).map((tx) => (
                    <div key={tx.transactionRef} className="flex items-center justify-between py-2 border-b border-border/60 last:border-0">
                      <div>
                        <p className="text-xs truncate max-w-[180px]">{tx.projectId?.title}</p>
                        <button
                          onClick={() => copyRef(tx.transactionRef)}
                          className="text-[10px] text-muted-foreground flex items-center gap-1 hover:underline"
                        >
                          {tx.transactionRef} <Copy className="size-2.5 opacity-60" />
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="num text-xs font-bold">
                          {tx.status === "RELEASED" ? "+" : "−"}₹{tx.amount.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {tx.releasedAt ? new Date(tx.releasedAt).toLocaleDateString() : "Locked"}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Separator />

            <div className="flex gap-2">
              <Button
                className="flex-1 bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/90 text-xs"
                onClick={() => toast.info("Milestones are approved and released via the Dashboard.")}
              >
                <ArrowUpFromLine className="size-4 mr-1.5" /> Release next
              </Button>
              <Button variant="outline" className="flex-1 text-xs" onClick={() => toast.success("Funds withdrawn to simulated bank account!")}>
                <ArrowDownToLine className="size-4 mr-1.5" /> Withdraw
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Powered by Razorpay X (Simulated) · Settlements typically arrive within 2 banking hours.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
