import React from "react";
const shapes = {
  "project-brief": <><path d="M7 3H3v18h4M17 3h4v18h-4M8 9h8M8 14h6"/></>,
  "project-index": <><path d="M7 3H3v18h4M17 3h4v18h-4M8 7h1m3 0h4M8 12h1m3 0h4M8 17h1m3 0h4"/></>,
  "proposal": <><path d="M7 3H3v18h4M17 3h4v7M8 8h7M8 12h4M13 20l1-4 5-5 3 3-5 5-4 1ZM17 13l3 3"/></>,
  "milestone": <><path d="M3 8h6v8H3ZM15 8h6v8h-6ZM9 12h6"/></>,
  "submission": <><path d="M14 3H4v18h16V9l-6-6ZM14 3v6h6M12 17V11m-3 3 3-3 3 3"/></>,
  "handover": <><path d="M7 3H3v18h4M17 3h4v18h-4M8 12h8m-3-3 3 3-3 3"/></>,
  "work-record": <><path d="M7 3H3v18h4M17 3h4v18h-4M8 8h8M8 12h5M8 17l2 2 5-5"/></>,
  "contract": <><path d="M7 3H3v18h4M17 3h4v18h-4M8 8h8M8 12h8M8 17h3m3 0h2"/></>,
};
export function BrandIcon({ name, size = 24, strokeWidth = 1.75, title, className, ...props }) {
  if (!shapes[name]) throw new Error(`Unknown Bid·Hub brand icon: ${name}`);
  return <svg {...props} className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="square" strokeLinejoin="miter" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true} focusable="false">{shapes[name]}</svg>;
}
