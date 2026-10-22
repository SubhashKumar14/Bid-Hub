import React from "react";

export function BrandState({
  name,
  title,
  description,
  action,
  width = 96,
  height = 72,
  className = "",
  compact = false,
}) {
  return (
    <div className={`text-center flex flex-col items-center justify-center ${compact ? "py-6 px-3 space-y-2" : "py-10 px-4 space-y-3"} ${className}`}>
      <div className="flex justify-center shrink-0">
        <img
          src={`/brand/bidhub/states/${name}-light.svg`}
          alt=""
          width={width}
          height={height}
          className="dark:hidden select-none pointer-events-none"
        />
        <img
          src={`/brand/bidhub/states/${name}-dark.svg`}
          alt=""
          width={width}
          height={height}
          className="hidden dark:block select-none pointer-events-none"
        />
      </div>
      {(title || description) && (
        <div className="space-y-1 max-w-sm mx-auto">
          {title && <h4 className="text-xs font-semibold text-foreground">{title}</h4>}
          {description && <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>}
        </div>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
