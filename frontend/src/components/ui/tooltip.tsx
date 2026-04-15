import * as React from "react";
import { cn } from "../../lib/utils";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ content, children, className }) => {
  return (
    <span className={cn("relative group inline-block", className)}>
      {children}
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50",
          "rounded bg-slate-800 border border-slate-600 px-2 py-1 text-xs text-slate-100 whitespace-nowrap",
          "opacity-0 group-hover:opacity-100 transition-opacity duration-150",
        )}
      >
        {content}
      </span>
    </span>
  );
};

export { Tooltip };
