import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./ui/sheet";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";
import { StatusBadge } from "./StatusBadge";
import { ShieldCheck, ArrowUpFromLine, Copy, ExternalLink } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { BrandState } from "../brand/BrandState";

export function EscrowDrawer({ open, onClose, token, currentUser }) {
  const [page, setResultPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  const targetRef = useRef("");
  useEffect(() => () => { targetRef.current = ""; }, []);
  targetRef.current = open ? `${token}:${page}` : "";
  const [stats, setStats] = useState({
    lockedAmount: 0,
    pendingAmount: 0,
    releasedAmount: 0,
  });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchEscrowDetails = async () => {
    if (!token || !open) return;
    const target = targetRef.current;
    setError(""); setLoading(true);
    try {
      const res = await fetch(`/api/payments?page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (target !== targetRef.current) return;
      if (!res.ok) throw new Error(data.message || "Failed to load escrow details");
      setStats(data.stats);
      setPages(data.pagination?.pages || 1);
      setTransactions(data.transactions || []);
    } catch (err) {
      if (target === targetRef.current) setError(err.message);
    } finally {
      if (target === targetRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscrowDetails();
  }, [open, token, page]);
  useEffect(() => { setResultPage(1); setTransactions([]); }, [open, token]);

  const copyRef = async (ref) => {
    const target=targetRef.current;setError("");
    try { await navigator.clipboard.writeText(ref); if(target===targetRef.current)toast.success(`Copied internal test receipt: ${ref}`); }
    catch { if(target===targetRef.current)setError("Clipboard access failed. Select and copy the receipt reference manually."); }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-card border-l border-border overflow-y-auto p-6 space-y-6">
        <SheetHeader className="text-left space-y-1">
          <div className="flex items-center gap-1.5 text-brand-accent">
            <ShieldCheck className="size-4" />
            <span className="text-xs uppercase tracking-wider font-mono">Funding and approvals</span>
          </div>
          <SheetTitle className="text-xl font-semibold tracking-tight text-foreground">Test Funding Ledger</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
            Razorpay sandbox funding records appear here. Internal receipt references are not payout receipts. Work approval never transfers money.
          </SheetDescription>
        </SheetHeader>

        {error && <p role="alert">{error} <Button onClick={fetchEscrowDetails}>Retry</Button></p>}
        <div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => setResultPage(n => n - 1)}>Previous records</Button><Button variant="outline" disabled={page >= pages || loading} onClick={() => setResultPage(n => n + 1)}>Next records</Button></div>
        {loading ? (
          <div className="py-20 text-center text-xs text-muted-foreground animate-pulse">
            Opening escrow ledger…
          </div>
        ) : (
          <div className="space-y-6">
            {/* Vault Summary Card */}
            <div className="rounded-[8px] bg-secondary/30 border border-border p-5 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Test funds allocated</p>
                <p className="text-3xl font-mono tabular-nums font-semibold text-foreground mt-1">₹{stats.lockedAmount.toLocaleString()}</p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border text-xs">
                <div>
                  <p className="text-muted-foreground text-[11px]">Historical release records (not payouts)</p>
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
                  <div className="rounded-[6px] border border-border bg-background">
                    <BrandState
                      name="no-payments"
                      title="No active escrow deposits"
                      description="Active milestones and contract funds will appear here once proposals are funded."
                      compact
                    />
                  </div>
                ) : (
                  transactions.map((tx, idx) => (
                    <div key={tx._id} className="flex items-center justify-between rounded-[6px] border border-border px-3.5 py-2.5 bg-background">
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
                  transactions.map((tx) => (
                    <div key={tx._id} data-receipt-id={tx._id} className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-medium text-foreground truncate max-w-[180px]">{tx.projectId?.title}</p>
                        <button
                          type="button"
                          aria-label={`Copy transaction reference ${tx.receiptRef || `TEST-RECEIPT-${tx._id}`}`}
                          onClick={() => copyRef(tx.receiptRef || `TEST-RECEIPT-${tx._id}`)}
                          className="min-h-11 text-[10px] text-muted-foreground inline-flex items-center gap-1 hover:text-foreground font-mono"
                        >
                          {tx.receiptRef || `TEST-RECEIPT-${tx._id}`} <Copy className="size-2.5 opacity-60" />
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
              <p>All transactions are TEST ONLY. Approval records work acceptance. Live payments, refunds and payouts are disabled; no transfer is made on approval.</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
