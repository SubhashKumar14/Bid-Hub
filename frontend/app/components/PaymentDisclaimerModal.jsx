import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { ShieldAlert } from "lucide-react";

export function PaymentDisclaimerModal({ open, onConfirm, onCancel }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="bg-[#0f0c0b] border-border/80 max-w-md p-6 text-foreground rounded-2xl">
        <DialogHeader className="flex flex-col items-center text-center gap-3">
          <div className="size-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500 mb-1">
            <ShieldAlert className="size-6" />
          </div>
          <DialogTitle className="font-serif text-2xl tracking-tight text-foreground">
            Payment Demonstration
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs leading-relaxed text-center px-2">
            This application uses Razorpay's official Test Mode environment for demonstration and evaluation purposes.
          </DialogDescription>
        </DialogHeader>

        <div className="my-4 text-xs space-y-3 leading-relaxed text-muted-foreground bg-secondary/25 border border-border/30 rounded-xl p-4">
          <p className="font-semibold text-foreground">Please Note:</p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li>No real money will be charged.</li>
            <li>No actual fund transfer will occur.</li>
            <li>No debit card, credit card, UPI account, or bank account will be charged.</li>
          </ul>
          
          <div className="mt-3 pt-3 border-t border-border/20 text-[11px] space-y-1.5 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
            <p className="font-semibold text-amber-500">Official Razorpay Test Credentials:</p>
            <p>• <span className="font-medium text-foreground">Card Number:</span> <code className="bg-background px-1 py-0.5 rounded text-[var(--brand-gold)] font-mono">4111 1111 1111 1111</code></p>
            <p>• <span className="font-medium text-foreground">Expiry Date:</span> <code className="bg-background px-1 py-0.5 rounded text-[var(--brand-gold)] font-mono">12/30</code> (any future date)</p>
            <p>• <span className="font-medium text-foreground">CVV:</span> <code className="bg-background px-1 py-0.5 rounded text-[var(--brand-gold)] font-mono">111</code> (any 3 digits)</p>
            <p>• <span className="font-medium text-foreground">OTP:</span> <code className="bg-background px-1 py-0.5 rounded text-[var(--brand-gold)] font-mono">123456</code></p>
          </div>

          <p className="mt-2 text-[11px]">
            This checkout demonstrates how escrow funding, payment verification, project assignment, and milestone workflows operate in a production payment system.
          </p>
        </div>

        <DialogFooter className="flex flex-row justify-end gap-2.5 mt-2">
          <Button
            variant="outline"
            className="flex-1 rounded-full text-xs font-medium border-border/60 hover:bg-secondary/40 text-muted-foreground hover:text-foreground"
            onClick={onCancel}
          >
            Cancel
          </Button>
          <Button
            className="flex-1 rounded-full bg-[var(--brand-gold)] text-[var(--brand-deep)] hover:bg-[var(--brand-gold)]/95 text-xs font-semibold"
            onClick={onConfirm}
          >
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
