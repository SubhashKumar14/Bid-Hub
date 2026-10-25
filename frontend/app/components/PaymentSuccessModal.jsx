import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Button } from "./ui/button";
import { CheckCircle2 } from "lucide-react";

export function PaymentSuccessModal({ open, onClose }) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-popover border-border max-w-sm p-6 text-foreground rounded-[12px] shadow-lg">
        <DialogHeader className="flex flex-col items-center text-center gap-2">
          <div className="size-12 rounded-[5px] bg-[var(--status-success-bg)] border border-[var(--status-success-border)] flex items-center justify-center text-[var(--status-success)] mb-1">
            <CheckCircle2 className="size-6" />
          </div>
          <DialogTitle className="text-xl font-medium tracking-tight text-foreground">
            Test Funding Confirmed
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-xs leading-relaxed text-center">
            Funding is confirmed and the student can start work. This was a test transaction. No real money was transferred.
          </DialogDescription>
        </DialogHeader>

        <div className="my-3 text-xs space-y-2 leading-relaxed text-muted-foreground text-center px-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[4px] bg-[var(--status-success-bg)] border border-[var(--status-success-border)] text-[var(--status-success)] font-medium text-xs">
            Ready to start
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Open the project to check the agreed milestones, share work and leave feedback.
          </p>
        </div>

        <DialogFooter className="mt-4">
          <Button
            variant="default"
            className="w-full rounded-[5px] text-xs font-medium"
            onClick={onClose}
          >
            Go to Project Workspace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
