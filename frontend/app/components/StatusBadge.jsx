import { cn } from "./ui/utils";

const tones = {
  // Semantic status pairs defined in design specification
  success: "bg-[var(--status-success-bg)] text-[var(--status-success)] border-[var(--status-success-border)]",
  released: "bg-[var(--status-success-bg)] text-[var(--status-success)] border-[var(--status-success-border)]",
  completed: "bg-[var(--status-success-bg)] text-[var(--status-success)] border-[var(--status-success-border)]",
  open: "bg-[var(--status-success-bg)] text-[var(--status-success)] border-[var(--status-success-border)]",

  info: "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[var(--status-info-border)]",
  review: "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[var(--status-info-border)]",
  submitted: "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[var(--status-info-border)]",

  warning: "bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning-border)]",
  action: "bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning-border)]",
  changes: "bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning-border)]",

  danger: "bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-[var(--status-danger-border)]",
  error: "bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-[var(--status-danger-border)]",
  rejected: "bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-[var(--status-danger-border)]",
  failed: "bg-[var(--status-danger-bg)] text-[var(--status-danger)] border-[var(--status-danger-border)]",

  muted: "bg-secondary text-muted-foreground border-border",
  draft: "bg-secondary text-muted-foreground border-border",
  inactive: "bg-secondary text-muted-foreground border-border",

  // Legacy tone aliases gracefully mapped to semantic tokens
  gold: "bg-[var(--status-info-bg)] text-[var(--status-info)] border-[var(--status-info-border)]",
  sand: "bg-[var(--status-warning-bg)] text-[var(--status-warning)] border-[var(--status-warning-border)]",
  bronze: "bg-secondary text-muted-foreground border-border",
};

export function StatusBadge({
  children, tone = "info", className,
}) {
  const resolvedTone = tones[tone] || tones.info;
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-xs font-medium tracking-normal select-none",
      resolvedTone, className
    )}>
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}
