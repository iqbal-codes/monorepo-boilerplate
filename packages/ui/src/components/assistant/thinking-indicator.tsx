"use client";

import { useEffect, useState, type ComponentProps } from "react";
import { cn } from "cn";

import { mono, ShimmerLabel } from "./surfaces";

export { ShimmerLabel };

/**
 * Tracks elapsed whole seconds while `active` is true. Starts returning `"1s"`
 * once at least one second has elapsed; never reads the clock during SSR.
 */
export function useElapsedSeconds(active: boolean): string | undefined {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) {
      setSeconds(0);
      return;
    }

    const startedAt = Date.now();
    setSeconds(0);
    const interval = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [active]);

  return active && seconds >= 1 ? `${seconds}s` : undefined;
}

export type ThinkingIndicatorProps = Omit<ComponentProps<"div">, "children"> & {
  label: string;
  elapsed?: string;
  active?: boolean;
};

/**
 * Live status line modeled after assistant-ui's `elements-thinking-indicator`
 * with `tw-shimmer` text animation and optional elapsed time.
 */
export function ThinkingIndicator({
  label,
  elapsed,
  active = true,
  className,
  ...props
}: ThinkingIndicatorProps) {
  return (
    <div
      data-slot="thinking-indicator"
      role="status"
      aria-live="polite"
      className={cn("flex min-w-0 items-center gap-2.5 text-sm text-muted-foreground", className)}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          active
            ? "bg-blue-500 motion-safe:animate-pulse dark:bg-blue-400"
            : "bg-muted-foreground/60",
        )}
      />
      <ShimmerLabel
        key={label}
        active={active}
        className="relative inline-block min-w-0 truncate leading-tight motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300"
      >
        {label}
      </ShimmerLabel>
      {elapsed !== undefined && (
        <span className={cn(mono, "shrink-0 text-muted-foreground tabular-nums")}>{elapsed}</span>
      )}
    </div>
  );
}
