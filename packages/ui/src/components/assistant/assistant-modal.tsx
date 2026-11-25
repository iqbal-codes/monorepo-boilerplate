"use client";

import { forwardRef, useEffect, useId, useState, type ComponentPropsWithoutRef } from "react";
import {
  useAui,
  useAuiEvent,
  useAuiState,
  type ToolCallMessagePartComponent,
} from "@assistant-ui/react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "cn";
import {
  BotIcon,
  ChevronDownIcon,
  HistoryIcon,
  Maximize2Icon,
  Minimize2Icon,
  PlusIcon,
  XIcon,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@monorepo-boilerplate/ui/components/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@monorepo-boilerplate/ui/components/tooltip";

import { AssistantThread } from "./assistant-thread";
import { AssistantThreadList } from "./assistant-thread-list";
import { TooltipIconButton } from "./tooltip-icon-button";

export type AssistantModelOption = {
  id: string;
  name: string;
  description?: string | undefined;
};

export type AssistantModalProps = {
  models?: readonly AssistantModelOption[];
  defaultModelId?: string;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  openOnRunStart?: boolean;
  dismissOnInteractOutside?: boolean;
  defaultExpanded?: boolean;
  sideOffset?: number;
  toolFallback?: ToolCallMessagePartComponent;
};

function ModelSelector({
  models,
  selectedModelId,
  onSelectModel,
}: {
  models: readonly AssistantModelOption[];
  selectedModelId: string;
  onSelectModel: (id: string) => void;
}) {
  const aui = useAui();

  useEffect(() => {
    if (!selectedModelId) return;
    return aui.modelContext().register({
      getModelContext: () => ({
        config: {
          modelName: selectedModelId,
        },
      }),
    });
  }, [aui, selectedModelId]);

  if (models.length === 0) return null;

  const selectedModelName =
    models.find((model) => model.id === selectedModelId)?.name ?? selectedModelId;

  return (
    <Select
      value={selectedModelId}
      onValueChange={(value) => {
        if (value) onSelectModel(value);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Select Gemini model"
        className="h-7 max-w-48 border border-border/80 bg-background px-2 py-0 text-xs focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <SelectValue placeholder="Model">{selectedModelName}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start" side="top" sideOffset={6} className="min-w-52">
        {models.map((model) => (
          <SelectItem key={model.id} value={model.id} className="text-xs">
            <span className="truncate">{model.name}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type ModalTriggerButtonProps = ComponentPropsWithoutRef<"button"> & {
  open: boolean;
  isRunning?: boolean;
};

const AssistantModalTriggerButton = forwardRef<HTMLButtonElement, ModalTriggerButtonProps>(
  ({ open, isRunning = false, className, ...props }, ref) => {
    const label = open
      ? "Close assistant"
      : isRunning
        ? "Open assistant (generating reply)"
        : "Open assistant";

    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={ref}
              type="button"
              aria-label={label}
              {...props}
              className={cn(
                "relative flex size-11 items-center justify-center rounded-none border border-border bg-primary text-primary-foreground shadow-md outline-none transition-[background-color,border-color,transform] duration-150 ease-out hover:bg-primary/90 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 enabled:active:scale-[0.96]",
                className,
              )}
            >
              {isRunning && !open && (
                <span aria-hidden="true" className="absolute -top-1 -end-1 flex size-2.5">
                  <span className="absolute inline-flex size-full bg-blue-400 opacity-75 motion-safe:animate-ping" />
                  <span className="relative inline-flex size-2.5 border border-background bg-blue-500 dark:bg-blue-400" />
                </span>
              )}
              <BotIcon
                aria-hidden="true"
                data-state={open ? "open" : "closed"}
                className="absolute size-5 transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] data-[state=closed]:opacity-100 data-[state=open]:opacity-0 motion-safe:data-[state=closed]:scale-100 motion-safe:data-[state=closed]:blur-0 motion-safe:data-[state=open]:scale-25 motion-safe:data-[state=open]:blur-[4px] motion-reduce:transition-opacity"
              />
              <ChevronDownIcon
                aria-hidden="true"
                data-state={open ? "open" : "closed"}
                className="absolute size-5 transition-[opacity,transform,filter] duration-300 ease-[cubic-bezier(0.2,0,0,1)] data-[state=closed]:opacity-0 data-[state=open]:opacity-100 motion-safe:data-[state=closed]:scale-25 motion-safe:data-[state=closed]:blur-[4px] motion-safe:data-[state=open]:scale-100 motion-safe:data-[state=open]:blur-0 motion-reduce:transition-opacity"
              />
            </button>
          }
        />
        <TooltipContent side="left">{label}</TooltipContent>
      </Tooltip>
    );
  },
);

AssistantModalTriggerButton.displayName = "AssistantModalTriggerButton";

/**
 * Floating bottom-right Assistant Modal modeled after `AssistantModalPrimitive`
 * semantics (`openOnRunStart`, non-modal persistence on outside click, icon swap)
 * and built natively on `@base-ui/react/popover` in the `base-sera` style.
 */
export function AssistantModal({
  models = [],
  defaultModelId,
  title = "Assistant",
  emptyTitle,
  emptyDescription,
  openOnRunStart = true,
  dismissOnInteractOutside = false,
  defaultExpanded = false,
  sideOffset = 16,
  toolFallback,
}: AssistantModalProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [view, setView] = useState<"thread" | "list">("thread");
  const [selectedModelId, setSelectedModelId] = useState(
    () => defaultModelId ?? models[0]?.id ?? "",
  );
  const headingId = useId();
  const aui = useAui();
  const activeThreadTitle = useAuiState((s) => s.threadListItem.title);
  const isRunning = useAuiState((s) => s.thread.isRunning);

  useEffect(() => {
    if (!selectedModelId && (defaultModelId || models[0]?.id)) {
      setSelectedModelId(defaultModelId ?? models[0]!.id);
    }
  }, [defaultModelId, models, selectedModelId]);

  useAuiEvent("thread.runStart", () => {
    if (!openOnRunStart) return;
    setView("thread");
    setOpen(true);
  });

  const resolvedTitle = view === "list" ? "Threads" : activeThreadTitle?.trim() || title;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(nextOpen, eventDetails) => {
        if (
          !nextOpen &&
          !dismissOnInteractOutside &&
          (eventDetails.reason === "outside-press" || eventDetails.reason === "focus-out")
        ) {
          eventDetails.cancel();
          return;
        }
        if (nextOpen) setView("thread");
        setOpen(nextOpen);
      }}
    >
      <div className="fixed end-4 bottom-4 z-40 size-11">
        <PopoverPrimitive.Trigger
          render={(props, state) => (
            <AssistantModalTriggerButton {...props} open={state.open} isRunning={isRunning} />
          )}
        />
      </div>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          side="top"
          align="end"
          sideOffset={sideOffset}
          positionMethod="fixed"
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            aria-labelledby={headingId}
            className={cn(
              "z-50 flex max-h-(--available-height) max-w-[calc(100vw-2rem)] origin-(--transform-origin) flex-col overflow-hidden rounded-none border border-border bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 motion-safe:transition-[width,height] motion-safe:duration-200",
              expanded
                ? "h-[min(46rem,calc(100dvh-5rem))] w-[min(38rem,calc(100vw-2rem))]"
                : "h-[min(36rem,calc(100dvh-6rem))] w-[min(26rem,calc(100vw-2rem))]",
              "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 data-open:duration-200 data-closed:duration-150",
              "motion-safe:data-open:zoom-in-98 motion-safe:data-open:slide-in-from-bottom-2 motion-safe:data-closed:zoom-out-98 motion-safe:data-closed:slide-out-to-bottom-2",
            )}
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-popover px-3.5 py-2.5">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {isRunning && view === "thread" && (
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full bg-blue-500 motion-safe:animate-pulse dark:bg-blue-400"
                  />
                )}
                <h2
                  id={headingId}
                  className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wider uppercase"
                >
                  {resolvedTitle}
                </h2>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <TooltipIconButton
                  tooltip={view === "list" ? "Back to thread" : "Browse assistant threads"}
                  aria-pressed={view === "list"}
                  side="bottom"
                  onClick={() => setView((prev) => (prev === "list" ? "thread" : "list"))}
                >
                  <HistoryIcon aria-hidden="true" className="size-3.5" />
                </TooltipIconButton>

                <TooltipIconButton
                  tooltip="Start new thread"
                  side="bottom"
                  onClick={() => {
                    aui.threads.switchToNewThread();
                    setView("thread");
                  }}
                >
                  <PlusIcon aria-hidden="true" className="size-3.5" />
                </TooltipIconButton>

                <TooltipIconButton
                  tooltip={expanded ? "Restore compact size" : "Expand window"}
                  aria-pressed={expanded}
                  side="bottom"
                  onClick={() => setExpanded((prev) => !prev)}
                >
                  {expanded ? (
                    <Minimize2Icon aria-hidden="true" className="size-3.5" />
                  ) : (
                    <Maximize2Icon aria-hidden="true" className="size-3.5" />
                  )}
                </TooltipIconButton>

                <TooltipIconButton
                  tooltip="Close assistant"
                  side="bottom"
                  onClick={() => setOpen(false)}
                >
                  <XIcon aria-hidden="true" className="size-3.5" />
                </TooltipIconButton>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-hidden">
              {view === "list" ? (
                <AssistantThreadList onSelectThread={() => setView("thread")} />
              ) : (
                <AssistantThread
                  emptyTitle={emptyTitle}
                  emptyDescription={emptyDescription}
                  toolFallback={toolFallback}
                  composerAddon={
                    <ModelSelector
                      models={models}
                      selectedModelId={selectedModelId}
                      onSelectModel={setSelectedModelId}
                    />
                  }
                />
              )}
            </div>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
