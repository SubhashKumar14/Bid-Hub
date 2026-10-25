import * as React from "react";

import { cn } from "./utils";

function Input({ className, type, ...props }) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-[5px] border border-input bg-card px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground selection:bg-secondary selection:text-foreground transition-colors duration-150 outline-none [color-scheme:light] dark:[color-scheme:dark] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus:border-[var(--brand-accent)] focus:ring-1 focus:ring-[var(--brand-accent)]",
        "aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
