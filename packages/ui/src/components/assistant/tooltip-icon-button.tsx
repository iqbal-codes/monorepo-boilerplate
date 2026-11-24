"use client";

import type * as React from "react";
import { cn } from "cn";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@monorepo-boilerplate/ui/components/tooltip";

export type TooltipIconButtonProps = React.ComponentProps<typeof Button> & {
  tooltip: string;
  side?: "top" | "bottom" | "left" | "right";
};

/**
 * Compact square icon button with a Base UI tooltip and guaranteed accessible name.
 */
export function TooltipIconButton({
  children,
  tooltip,
  side = "top",
  className,
  size = "icon-xs",
  variant = "ghost",
  ...props
}: TooltipIconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant={variant}
            size={size}
            aria-label={tooltip}
            className={cn(
              "enabled:active:scale-[0.96] transition-[color,background-color,border-color,transform] duration-150 ease-out",
              className,
            )}
            {...props}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}
