import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";

import { cn } from "./utils";

const buttonVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-[5px] text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] cursor-pointer select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-[var(--primary-hover)] active:bg-[var(--primary-pressed)] shadow-none",
        destructive:
          "bg-destructive text-destructive-foreground hover:opacity-90 active:opacity-95 shadow-none",
        outline:
          "border border-border bg-card text-foreground hover:bg-secondary hover:text-foreground active:bg-muted shadow-none",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-muted active:bg-border shadow-none",
        ghost:
          "text-foreground hover:bg-secondary hover:text-foreground active:bg-muted",
        link: "text-[var(--brand-accent)] underline-offset-4 hover:underline p-0 h-auto min-h-0",
      },
      size: {
        default: "h-11 px-4 py-2 has-[>svg]:px-3.5",
        sm: "h-9 min-h-[36px] text-xs rounded-[4px] px-3 has-[>svg]:px-2.5",
        xs: "h-8 min-h-[32px] text-xs rounded-[4px] px-2.5 has-[>svg]:px-2",
        lg: "h-12 min-h-[48px] text-base rounded-[6px] px-6 has-[>svg]:px-4",
        icon: "size-11 min-h-[44px] min-w-[44px] rounded-[5px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

const Button = React.forwardRef(({
  className,
  variant,
  size,
  asChild = false,
  ...props
}, ref) => {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
