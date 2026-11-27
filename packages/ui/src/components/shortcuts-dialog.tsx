"use client";

import * as React from "react";
import { cn } from "cn";
import { KeyboardIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@monorepo-boilerplate/ui/components/dialog";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@monorepo-boilerplate/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@monorepo-boilerplate/ui/components/input-group";
import { Kbd, KbdGroup } from "@monorepo-boilerplate/ui/components/kbd";

export type ShortcutKeyPart = string | { mac: string; other: string };

export type ShortcutItem = {
  id: string;
  label: string;
  description?: string;
  /** One or more key chords, e.g. `[["mod", "K"], ["mod", "Enter"]]`. */
  keys: readonly (readonly ShortcutKeyPart[])[];
  keywords?: readonly string[];
};

export type ShortcutGroup = {
  id: string;
  label: string;
  items: readonly ShortcutItem[];
};

export type ShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly ShortcutGroup[];
  title?: string;
  description?: string;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Platform override for `<Kbd>` chord labels; auto-detected when omitted. */
  platform?: "mac" | "other";
  /** Focus target override on close. */
  finalFocus?: React.ComponentProps<typeof DialogContent>["finalFocus"];
  className?: string;
};

function detectPlatform(): "mac" | "other" {
  if (typeof navigator === "undefined") return "other";
  return /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "mac" : "other";
}

function formatKeyPart(part: ShortcutKeyPart, platform: "mac" | "other"): string {
  if (typeof part !== "string") {
    return platform === "mac" ? part.mac : part.other;
  }
  const normalized = part.trim().toLowerCase();
  switch (normalized) {
    case "mod":
      return platform === "mac" ? "⌘" : "Ctrl";
    case "meta":
      return platform === "mac" ? "⌘" : "Super";
    case "ctrl":
    case "control":
      return platform === "mac" ? "⌃" : "Ctrl";
    case "alt":
    case "option":
      return platform === "mac" ? "⌥" : "Alt";
    case "shift":
      return platform === "mac" ? "⇧" : "Shift";
    case "enter":
      return platform === "mac" ? "↵" : "Enter";
    case "esc":
    case "escape":
      return "Esc";
    default:
      return part;
  }
}

function matchesShortcutQuery(
  item: ShortcutItem,
  groupLabel: string,
  query: string,
  platform: "mac" | "other",
): boolean {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const keyTokens = item.keys.flatMap((chord) =>
    chord.flatMap((part) => [
      typeof part === "string" ? part : `${part.mac} ${part.other}`,
      formatKeyPart(part, platform),
    ]),
  );

  const haystack = [
    item.label,
    item.description,
    groupLabel,
    ...(item.keywords ?? []),
    ...keyTokens,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return tokens.every((token) => haystack.includes(token));
}

/**
 * Controlled, router-free keyboard shortcuts reference dialog with search
 * filtering, grouped platform-aware `<Kbd>` chords, and focus restoration.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
  groups,
  title = "Keyboard shortcuts",
  description = "Navigate screens and trigger actions without leaving the keyboard.",
  searchPlaceholder = "Search shortcuts…",
  emptyTitle,
  emptyDescription = "Try a different keyword or clear the search filter.",
  platform: platformOverride,
  finalFocus,
  className,
}: ShortcutsDialogProps) {
  const platform = platformOverride ?? detectPlatform();
  const [query, setQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);
  const prevOpenRef = React.useRef(open);

  if (open && !prevOpenRef.current && typeof document !== "undefined") {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      setQuery("");
    } else if (!open && prevOpenRef.current && !finalFocus) {
      const target = previousFocusRef.current;
      previousFocusRef.current = null;
      if (target && target.isConnected) {
        target.focus();
      }
    }
    prevOpenRef.current = open;
  }, [open, finalFocus]);

  const filteredGroups = React.useMemo(() => {
    if (query.trim() === "") return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) =>
          matchesShortcutQuery(item, group.label, query, platform),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, platform, query]);

  const resolvedEmptyTitle =
    emptyTitle ??
    (query.trim() ? `No shortcuts match “${query.trim()}”` : "No shortcuts available");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-slot="shortcuts-dialog"
        initialFocus={searchInputRef}
        finalFocus={finalFocus ?? (() => previousFocusRef.current)}
        className={cn(
          "max-h-[min(85dvh,38rem)] grid-rows-[auto_auto_minmax(0,1fr)] gap-0 overflow-hidden overscroll-contain p-0 sm:max-w-lg",
          className,
        )}
      >
        <DialogHeader className="border-b border-border px-6 pt-5 pb-4">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="border-b border-border px-6 py-3">
          <InputGroup>
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchInputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label="Search keyboard shortcuts"
            />
            {query ? (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label="Clear search"
                  size="icon-xs"
                  onClick={() => {
                    setQuery("");
                    searchInputRef.current?.focus();
                  }}
                >
                  <XIcon aria-hidden="true" />
                </InputGroupButton>
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </div>

        <div
          data-slot="shortcuts-dialog-list"
          className="min-h-0 overflow-y-auto overscroll-contain px-6 py-4"
        >
          {filteredGroups.length === 0 ? (
            <Empty data-slot="shortcuts-dialog-empty" className="border-0 px-2 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <KeyboardIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{resolvedEmptyTitle}</EmptyTitle>
                <EmptyDescription>{emptyDescription}</EmptyDescription>
              </EmptyHeader>
              {query ? (
                <EmptyContent>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setQuery("");
                      searchInputRef.current?.focus();
                    }}
                  >
                    Clear search
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : (
            <div className="flex flex-col gap-5">
              {filteredGroups.map((group) => (
                <section key={group.id} data-slot="shortcut-group" className="flex flex-col gap-2">
                  <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    {group.label}
                  </h2>
                  <ul className="flex flex-col divide-y divide-border border border-border">
                    {group.items.map((item) => (
                      <li
                        key={item.id}
                        data-slot="shortcut-item"
                        className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-3 py-2.5 text-sm"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-foreground">{item.label}</div>
                          {item.description ? (
                            <div className="text-xs text-muted-foreground">{item.description}</div>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          {item.keys.map((chord, chordIndex) => (
                            <React.Fragment key={chordIndex}>
                              {chordIndex > 0 ? (
                                <span className="text-xs text-muted-foreground">or</span>
                              ) : null}
                              <KbdGroup>
                                {chord.map((part, partIndex) => (
                                  <Kbd key={partIndex}>{formatKeyPart(part, platform)}</Kbd>
                                ))}
                              </KbdGroup>
                            </React.Fragment>
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
