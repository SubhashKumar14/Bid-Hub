import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { ShieldAlert } from "lucide-react";
import { OfferSchedule } from "./MilestoneAllocationEditor";

export function PaymentDisclaimerModal({ open, onConfirm, onCancel, offer, contract }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="bg-popover border-border max-w-md max-h-[90dvh] overflow-y-auto p-6 text-foreground rounded-[12px] shadow-lg">
        <DialogHeader className="flex flex-col items-center text-center gap-2">
          <div className="size-11 rounded-[5px] bg-[var(--status-warning-bg)] border border-[var(--status-warning-border)] flex items-center justify-center text-[var(--status-warning)] mb-1">
            <ShieldAlert className="size-5" />
          </div>
          <DialogTitle className="text-xl font-medium tracking-tight text-foreground">
            {contract ? "Add test funding" : "Review the agreement"}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs leading-relaxed text-center">
            Checkout uses Razorpay test mode. Use test payment details only. No real money moves, and payouts are disabled.
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 text-xs space-y-3 leading-relaxed text-muted-foreground bg-secondary/50 border border-border rounded-[8px] p-4">
          <p className="font-medium text-foreground">Test mode only:</p>
          {offer && <div className="space-y-1 text-foreground">
            <p>{contract ? "Agreed" : "Accept proposal version " + (offer.version || 1)}: ₹{Number(offer.amount).toLocaleString("en-IN")} · {offer.timeline}</p>
            <p className="whitespace-pre-wrap">{offer.proposal}</p>
            <OfferSchedule schedule={offer.schedule} />
          </div>}
          <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
            <li>{contract ? "Both sides have agreed to these terms. Checkout does not change them." : "Continuing saves this price, work description, timeline and milestone breakdown as your agreement."}</li>
            <li>The student can start after test funding is confirmed.</li>
            <li>Closing checkout keeps the agreement and saved order available for retry.</li>
          </ul>
          
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
