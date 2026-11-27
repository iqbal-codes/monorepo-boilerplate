import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { cn } from "cn";

type ScrollAreaProps = ScrollAreaPrimitive.Root.Props & {
  scrollbars?: "vertical" | "horizontal" | "both";
  viewportClassName?: string;
  viewportProps?: Omit<
    React.ComponentProps<typeof ScrollAreaPrimitive.Viewport>,
    "className" | "children"
  >;
};

function ScrollArea({
  className,
  children,
  scrollbars = "vertical",
  viewportClassName,
  viewportProps,
  ...props
}: ScrollAreaProps) {
  const showVertical = scrollbars === "vertical" || scrollbars === "both";
  const showHorizontal = scrollbars === "horizontal" || scrollbars === "both";

  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          "size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
          viewportClassName,
        )}
        {...viewportProps}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {showVertical && <ScrollBar orientation="vertical" />}
      {showHorizontal && <ScrollBar orientation="horizontal" />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollAreaContent({ className, ...props }: ScrollAreaPrimitive.Content.Props) {
  return (
    <ScrollAreaPrimitive.Content data-slot="scroll-area-content" className={className} {...props} />
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "flex touch-none p-px opacity-0 transition-[color,opacity] duration-200 select-none motion-reduce:transition-none data-hovering:opacity-100 data-scrolling:opacity-100 data-horizontal:h-2.5 data-horizontal:flex-col data-horizontal:border-t data-horizontal:border-t-transparent data-vertical:h-full data-vertical:w-2.5 data-vertical:border-l data-vertical:border-l-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-none bg-muted-foreground/60 transition-colors hover:bg-muted-foreground"
      />
    </ScrollAreaPrimitive.Scrollbar>
  );
}

export { ScrollArea, ScrollAreaContent, ScrollBar };
