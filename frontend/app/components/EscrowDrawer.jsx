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
  const [copyError, setCopyError] = useState("");
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
  useEffect(() => { setResultPage(1); setTransactions([]); setCopyError(""); }, [open, token]);

  const copyRef = async (ref) => {
    const target=targetRef.current;setCopyError("");
    try { await navigator.clipboard.writeText(ref); if(target===targetRef.current)toast.success(`Reference copied: ${ref}`); }
    catch { if(target===targetRef.current)setCopyError(ref); }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md bg-card border-l border-border overflow-y-auto p-6 space-y-6">
        <SheetHeader className="text-left space-y-1">
          <div className="flex items-center gap-1.5 text-brand-accent">
            <ShieldCheck className="size-4" />
            <span className="text-xs uppercase tracking-wider font-mono">Test transactions</span>
          </div>
          <SheetTitle className="text-xl font-semibold tracking-tight text-foreground">Test payment history</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
            Check test payments and how they are split across milestones. References identify records in Bid·Hub. They are not payout receipts.
          </SheetDescription>
        </SheetHeader>

        {error && <p role="alert">{error} <Button onClick={fetchEscrowDetails}>Retry</Button></p>}
        {copyError && <div role="alert" className="text-sm space-y-2"><p>Could not copy the reference. Select it below and copy it manually.</p><input aria-label="Reference to copy" className="w-full min-h-11 bg-input-background border border-input rounded px-2 text-sm" readOnly value={copyError} onFocus={event => event.target.select()} /><Button variant="outline" onClick={() => copyRef(copyError)}>Try copying again</Button></div>}
        <div className="flex gap-2"><Button variant="outline" disabled={page <= 1 || loading} onClick={() => setResultPage(n => n - 1)}>Previous records</Button><Button variant="outline" disabled={page >= pages || loading} onClick={() => setResultPage(n => n + 1)}>Next records</Button></div>
        {loading ? (
          <div className="py-20 text-center text-xs text-muted-foreground animate-pulse">
            Loading test payments…
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
                  <p className="text-muted-foreground text-xs">Real payouts</p>
                  <p className="font-mono tabular-nums font-semibold text-[var(--status-success-fg)] mt-0.5">
                    Disabled
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Refunds</p>
                  <p className="font-mono tabular-nums font-semibold text-[var(--status-warning-fg)] mt-0.5">
                    Disabled
                  </p>
                </div>
              </div>
            </div>

            {/* Ledger Audit History */}
            <div className="space-y-3">
              <h3 className="text-xs uppercase tracking-wider font-mono text-muted-foreground">Payment records</h3>
              <p className="text-xs text-muted-foreground">A payment and its milestone allocations have separate records. The total above counts each allocation once.</p>
              <div className="space-y-1 text-xs">
                {transactions.length === 0 ? (
                  <BrandState name="no-payments" title="No test payments yet" description="Your payment records will appear here after you start test checkout for an agreed project." compact />
                ) : (
                  transactions.map((tx) => (
                    <div key={tx._id} data-receipt-id={tx._id} className="flex items-center justify-between py-2.5 border-b border-border/60 last:border-0">
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-medium text-foreground truncate max-w-[180px]">{tx.projectId?.title}</p>
                        <p className="text-xs text-muted-foreground">{tx.milestoneId?.title || "Project funding"}</p>
                        <button
                          type="button"
                          aria-label={`Copy transaction reference ${tx.receiptRef || `TEST-RECEIPT-${tx._id}`}`}
                          onClick={() => copyRef(tx.receiptRef || `TEST-RECEIPT-${tx._id}`)}
                          className="min-h-11 text-xs text-muted-foreground inline-flex items-center gap-1 hover:text-foreground font-mono"
                        >
                          {tx.receiptRef || `TEST-RECEIPT-${tx._id}`} <Copy className="size-2.5 opacity-60" />
                        </button>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-mono tabular-nums text-xs font-medium text-foreground">
                          ₹{tx.amount.toLocaleString("en-IN")}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("en-IN") : "Date unavailable"}
                        </p>
                        <StatusBadge tone={tx.status === "LOCKED" ? "info" : "muted"}>{tx.status}</StatusBadge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <Separator />

            {/* Practical Payout Information */}
            <div className="rounded-[6px] bg-secondary/20 border border-border p-4 text-xs space-y-1 text-muted-foreground leading-relaxed">
              <p className="font-medium text-foreground">About test payments</p>
              <p>No real money is charged or paid out. Approving a milestone records that you accepted the work. It does not transfer money.</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
