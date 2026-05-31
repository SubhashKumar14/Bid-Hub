import { cn } from "./ui/utils";

const tones = {
  gold: "bg-[color-mix(in_srgb,var(--brand-gold)_18%,transparent)] text-[var(--brand-gold)] border-[color-mix(in_srgb,var(--brand-gold)_35%,transparent)]",
  sand: "bg-[color-mix(in_srgb,var(--brand-sand)_18%,transparent)] text-[var(--brand-sand)] border-[color-mix(in_srgb,var(--brand-sand)_35%,transparent)]",
  bronze: "bg-[color-mix(in_srgb,var(--brand-bronze)_15%,transparent)] text-[var(--brand-bronze)] border-[color-mix(in_srgb,var(--brand-bronze)_35%,transparent)] dark:text-[#d6b86a]",
  muted: "bg-muted text-muted-foreground border-border",
  success: "bg-[rgba(70,120,40,0.12)] text-[#5a7a2a] border-[rgba(90,122,42,0.35)] dark:text-[#b9d488]",
  danger: "bg-[rgba(168,49,26,0.12)] text-[#a8311a] border-[rgba(168,49,26,0.35)] dark:text-[#e08769]",
};

export function StatusBadge({
  children, tone = "gold", className,
}) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs tracking-wide",
      tones[tone], className
    )}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}
