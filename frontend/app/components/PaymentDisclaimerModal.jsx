import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { ShieldAlert } from "lucide-react";

export function PaymentDisclaimerModal({ open, onConfirm, onCancel, offer }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="bg-popover border-border max-w-md p-6 text-foreground rounded-[12px] shadow-lg">
        <DialogHeader className="flex flex-col items-center text-center gap-2">
          <div className="size-11 rounded-[5px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] flex items-center justify-center text-[var(--status-warning)] mb-1">
            <ShieldAlert className="size-5" />
          </div>
          <DialogTitle className="text-xl font-medium tracking-tight text-foreground">
            Razorpay Test Checkout
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs leading-relaxed text-center">
            This workspace supports Razorpay sandbox funding or provider test orders only. Live payments and payouts are disabled.
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 text-xs space-y-3 leading-relaxed text-muted-foreground bg-secondary/50 border border-border rounded-[8px] p-4">
          <p className="font-medium text-foreground">Test mode only:</p>
          {offer && <div className="space-y-1 text-foreground">
            <p>Accept proposal version {offer.version || 1}: ₹{Number(offer.amount).toLocaleString("en-IN")} · {offer.timeline}</p>
            <p className="whitespace-pre-wrap">{offer.proposal}</p>
            <ul>{offer.schedule?.map((m, i) => <li key={i}>{m.title}: ₹{(m.amountPaise / 100).toLocaleString("en-IN")}</li>)}</ul>
          </div>}
          <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
            <li>No real money or bank accounts will be charged.</li>
            <li>No actual fund transfer or legal escrow settlement will occur.</li>
            <li>Accepting freezes this proposal's price, timeline and milestone schedule.</li>
          </ul>
          
          <div hidden className="mt-3 pt-3 text-[12px] space-y-1.5 bg-[var(--status-warning-bg)] p-3 rounded-[5px] border border-[var(--status-warning-border)] text-foreground">
            <p className="font-semibold text-[var(--status-warning)] text-[11px] uppercase tracking-wider">Test Card Details:</p>
            <p>• <span className="text-muted-foreground">Card:</span> <code className="bg-card px-1.5 py-0.5 rounded border border-border font-mono text-xs">4111 1111 1111 1111</code></p>
            <p>• <span className="text-muted-foreground">Expiry / CVV:</span> <code className="bg-card px-1.5 py-0.5 rounded border border-border font-mono text-xs">12/30</code> · <code className="bg-card px-1.5 py-0.5 rounded border border-border font-mono text-xs">111</code></p>
            <p>• <span className="text-muted-foreground">OTP:</span> <code className="bg-card px-1.5 py-0.5 rounded border border-border font-mono text-xs">123456</code></p>
          </div>
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2.5 mt-2">
          <Button
            variant="outline"
            className="flex-1 rounded-[5px] text-xs font-medium"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            variant="default"
            className="flex-1 rounded-[5px] text-xs font-medium"
            onClick={onConfirm}
          >
            Continue to Checkout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
