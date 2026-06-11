import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { CheckCircle2 } from "lucide-react";

export function PaymentSuccessModal({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#0f0c0b] border-border/80 max-w-sm p-6 text-foreground rounded-2xl">
        <DialogHeader className="flex flex-col items-center text-center gap-3">
          <div className="size-14 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-1">
            <CheckCircle2 className="size-8" />
          </div>
          <DialogTitle className="font-serif text-2xl tracking-tight text-foreground">
            Payment Verified Successfully
          </DialogTitle>
          <DialogDescription className="text-[var(--brand-gold)] text-sm font-semibold tracking-wide uppercase select-none">
            Escrow Deposit Locked
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 text-xs space-y-3 leading-relaxed text-muted-foreground text-center px-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 font-semibold uppercase tracking-wider text-[10px]">
            Status: Verified
          </div>
          <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
            This transaction was processed using a payment testing environment.
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            No real funds were transferred.
          </p>
          <p className="text-muted-foreground text-[11px] leading-relaxed">
            The payment workflow, verification process, escrow locking, and project assignment were executed successfully.
          </p>
        </div>

        <DialogFooter className="mt-4">
          <Button
            className="w-full rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-2"
            onClick={onClose}
          >
            Go to Dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
