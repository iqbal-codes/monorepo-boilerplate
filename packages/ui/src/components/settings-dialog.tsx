"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { cn } from "cn";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon, XIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@monorepo-boilerplate/ui/components/breadcrumb";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@monorepo-boilerplate/ui/components/dialog";
import { Input } from "@monorepo-boilerplate/ui/components/input";
import { Kbd } from "@monorepo-boilerplate/ui/components/kbd";
import { useIsMobile } from "@monorepo-boilerplate/ui/hooks/use-mobile";

export type SettingsNavItem = {
  id: string;
  label: string;
  description?: string;
  icon?: React.ReactNode;
  keywords?: readonly string[];
  badge?: React.ReactNode;
};

export type SettingsNavGroup = {
  id: string;
  label?: string;
  items: readonly SettingsNavItem[];
};

export type SettingsMobileView = "menu" | "detail";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: readonly SettingsNavGroup[];
  activeId?: string;
  defaultActiveId?: string;
  onActiveIdChange?: (id: string) => void;
  defaultMobileView?: SettingsMobileView;
  title?: string;
  description?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  headerActions?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

function matchesSearch(item: SettingsNavItem, groupLabel: string | undefined, query: string) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [item.label, item.description, groupLabel, ...(item.keywords ?? [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Responsive two-pane settings dialog modeled on shadcn `sidebar-13` with
 * search filtering and a two-layer fullscreen drill-down flow on mobile.
 */
function SettingsDialog({
  open,
  onOpenChange,
  groups,
  activeId: controlledActiveId,
  defaultActiveId,
  onActiveIdChange,
  defaultMobileView = "menu",
  title = "Settings",
  description = "Configure application and account preferences.",
  searchable = true,
  searchPlaceholder = "Search",
  headerActions,
  sidebarFooter,
  className,
  children,
}: SettingsDialogProps) {
  const isMobile = useIsMobile();
  const firstItemId = groups[0]?.items[0]?.id ?? "";

  const [uncontrolledActiveId, setUncontrolledActiveId] = React.useState(
    () => defaultActiveId ?? firstItemId,
  );
  const activeId = controlledActiveId ?? uncontrolledActiveId;

  const [mobileView, setMobileView] = React.useState<SettingsMobileView>(defaultMobileView);
  const [query, setQuery] = React.useState("");

  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const backButtonRef = React.useRef<HTMLButtonElement>(null);
  const detailScrollRef = React.useRef<HTMLDivElement>(null);
  const navButtonRefs = React.useRef(new Map<string, HTMLButtonElement>());
  const prevOpenRef = React.useRef(open);

  const allItems = React.useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const activeItem = allItems.find((item) => item.id === activeId) ?? allItems[0] ?? undefined;

  const filteredGroups = React.useMemo(() => {
    if (!searchable || query.trim() === "") return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => matchesSearch(item, group.label, query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [groups, query, searchable]);

  React.useEffect(() => {
    if (open && !prevOpenRef.current) {
      setQuery("");
      setMobileView(defaultMobileView);
    }
    prevOpenRef.current = open;
  }, [open, defaultMobileView]);

  React.useEffect(() => {
    if (detailScrollRef.current) {
      detailScrollRef.current.scrollTop = 0;
    }
  }, [activeId]);

  function selectItem(id: string) {
    if (controlledActiveId === undefined) {
      setUncontrolledActiveId(id);
    }
    onActiveIdChange?.(id);
    setMobileView("detail");

    if (isMobile) {
      requestAnimationFrame(() => {
        backButtonRef.current?.focus();
      });
    }
  }

  function returnToMenu() {
    setMobileView("menu");
    if (isMobile && activeItem) {
      requestAnimationFrame(() => {
        navButtonRefs.current.get(activeItem.id)?.focus();
      });
    }
  }

  function handlePopupKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!searchable) return;
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditableElement(event.target)) return;
    if (isMobile && mobileView !== "menu") return;

    event.preventDefault();
    searchInputRef.current?.focus();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="overflow-hidden overscroll-contain" />
        <DialogPrimitive.Popup
          data-slot="settings-dialog"
          data-mobile-view={mobileView}
          onKeyDown={handlePopupKeyDown}
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden overscroll-contain rounded-none bg-popover text-sm text-popover-foreground transition-[opacity,scale] duration-150 ease-out outline-none data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none",
            "max-md:inset-0 max-md:h-dvh max-md:w-full max-md:max-w-none",
            "md:top-1/2 md:left-1/2 md:h-[min(85dvh,42rem)] md:max-h-[calc(100dvh-2rem)] md:w-[calc(100%-2rem)] md:max-w-3xl md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:shadow-lg md:ring-1 md:ring-foreground/10 md:data-ending-style:scale-95 md:data-starting-style:scale-95 lg:max-w-4xl",
            className,
          )}
        >
          <DialogTitle className="sr-only">{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>

          {/* Layer 1 on mobile (fullscreen menu list) / left navigation rail on desktop */}
          <aside
            data-slot="settings-dialog-sidebar"
            className={cn(
              "min-h-0 flex-col bg-sidebar text-sidebar-foreground md:flex md:w-60 md:shrink-0 md:border-e md:border-sidebar-border",
              mobileView === "menu" ? "flex flex-1 md:flex-none" : "max-md:hidden",
            )}
          >
            {/* Mobile Layer 1 header */}
            <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-sidebar-border px-4 pt-[env(safe-area-inset-top)] md:hidden">
              <span className="min-w-0 truncate font-heading text-base font-semibold tracking-wider uppercase">
                {title}
              </span>
              <DialogClose
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-10"
                    aria-label="Close settings"
                  />
                }
              >
                <XIcon aria-hidden />
              </DialogClose>
            </div>

            {searchable ? (
              <div className="shrink-0 border-b border-sidebar-border p-3 md:border-b-0 md:p-2.5 md:pb-1">
                <div className="relative flex items-center">
                  <SearchIcon
                    className="pointer-events-none absolute start-2.5 size-3.5 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    ref={searchInputRef}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onInput={(event) => setQuery(event.currentTarget.value)}
                    placeholder={searchPlaceholder}
                    aria-label="Search settings"
                    className="h-10 border border-sidebar-border bg-background/60 ps-8 pe-12 text-base md:h-8 md:pe-8 md:text-sm"
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        searchInputRef.current?.focus();
                      }}
                      aria-label="Clear search"
                      className="absolute end-1.5 inline-flex size-7 items-center justify-center text-muted-foreground hover:text-foreground md:size-6"
                    >
                      <XIcon className="size-3.5" aria-hidden />
                    </button>
                  ) : (
                    <Kbd className="pointer-events-none absolute end-2 hidden md:inline-flex">
                      /
                    </Kbd>
                  )}
                </div>
              </div>
            ) : null}

            <nav
              aria-label="Settings sections"
              className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-2"
            >
              {filteredGroups.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                  No settings match “{query.trim()}”.
                </p>
              ) : (
                filteredGroups.map((group) => (
                  <div key={group.id} className="flex flex-col gap-0.5">
                    {group.label ? (
                      <div className="px-3 py-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                        {group.label}
                      </div>
                    ) : null}
                    <ul className="flex flex-col gap-0.5">
                      {group.items.map((item) => {
                        const isActive = activeItem?.id === item.id;
                        return (
                          <li key={item.id}>
                            <button
                              ref={(node) => {
                                if (node) {
                                  navButtonRefs.current.set(item.id, node);
                                } else {
                                  navButtonRefs.current.delete(item.id);
                                }
                              }}
                              type="button"
                              data-slot="settings-nav-item"
                              data-active={isActive ? "true" : undefined}
                              aria-current={isActive ? "page" : undefined}
                              onClick={() => selectItem(item.id)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-none px-3 py-2.5 text-start text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring md:min-h-9 md:gap-2.5 md:py-1.5",
                                "min-h-11 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                                isActive
                                  ? "md:bg-sidebar-accent md:font-medium md:text-sidebar-accent-foreground"
                                  : "text-sidebar-foreground/85",
                              )}
                            >
                              {item.icon ? (
                                <span
                                  className="flex shrink-0 items-center text-muted-foreground [&>svg]:size-4"
                                  aria-hidden
                                >
                                  {item.icon}
                                </span>
                              ) : null}
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate font-medium md:font-normal">
                                  {item.label}
                                </span>
                                {item.description ? (
                                  <span className="truncate text-xs text-muted-foreground md:hidden">
                                    {item.description}
                                  </span>
                                ) : null}
                              </span>
                              {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
                              <ChevronRightIcon
                                className="ms-auto size-4 shrink-0 text-muted-foreground md:hidden rtl:rotate-180"
                                aria-hidden
                              />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))
              )}
            </nav>

            {sidebarFooter ? (
              <div className="shrink-0 border-t border-sidebar-border p-2 max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {sidebarFooter}
              </div>
            ) : null}
          </aside>

          {/* Layer 2 on mobile (fullscreen detail page) / right content pane on desktop */}
          <section
            data-slot="settings-dialog-panel"
            aria-label={activeItem ? `${activeItem.label} settings` : title}
            className={cn(
              "min-h-0 min-w-0 flex-1 flex-col bg-background",
              mobileView === "detail" ? "flex" : "max-md:hidden md:flex",
            )}
          >
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4 pt-[env(safe-area-inset-top)] md:pt-0">
              {/* Mobile Layer 2 back navigation */}
              <div className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
                <Button
                  ref={backButtonRef}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={returnToMenu}
                  className="-ms-2 min-h-10 gap-1 px-2 text-muted-foreground hover:text-foreground"
                  aria-label={`Back to ${title}`}
                >
                  <ChevronLeftIcon className="size-4 rtl:rotate-180" aria-hidden />
                  <span className="text-xs tracking-wide uppercase">{title}</span>
                </Button>
                <span className="text-muted-foreground/50" aria-hidden>
                  /
                </span>
                <span className="min-w-0 truncate text-sm font-medium">
                  {activeItem?.label ?? title}
                </span>
              </div>

              {/* Desktop breadcrumb */}
              <div className="hidden min-w-0 flex-1 items-center md:flex">
                <Breadcrumb>
                  <BreadcrumbList>
                    <BreadcrumbItem>
                      <span className="text-muted-foreground">{title}</span>
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                    <BreadcrumbItem>
                      <BreadcrumbPage>{activeItem?.label ?? title}</BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              </div>

              <div className="ms-auto flex shrink-0 items-center gap-1.5">
                {headerActions}
                <DialogClose
                  render={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="max-md:size-10"
                      aria-label="Close settings"
                    />
                  }
                >
                  <XIcon aria-hidden />
                </DialogClose>
              </div>
            </header>

            <div
              ref={detailScrollRef}
              data-slot="settings-dialog-body"
              className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4 sm:p-6 max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            >
              {children}
            </div>
          </section>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  );
}

function SettingsSection({
  title,
  description,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section data-slot="settings-section" className={cn("flex flex-col gap-3", className)}>
      <div className="space-y-1">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">{title}</h2>
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function SettingsGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="settings-group"
      className={cn("divide-y divide-border border bg-card text-card-foreground", className)}
      {...props}
    />
  );
}

function SettingsRow({
  title,
  description,
  htmlFor,
  inline = false,
  className,
  children,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const titleNode = htmlFor ? (
    <label htmlFor={htmlFor} className="cursor-pointer text-sm leading-snug font-medium">
      {title}
    </label>
  ) : (
    <div className="text-sm leading-snug font-medium">{title}</div>
  );

  return (
    <div
      data-slot="settings-row"
      className={cn(
        "flex gap-3 p-4",
        inline
          ? "flex-row items-center justify-between gap-4"
          : "flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-4",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        {titleNode}
        {description ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div
        className={cn("flex shrink-0 items-center gap-2", !inline && "self-start sm:self-center")}
      >
        {children}
      </div>
    </div>
  );
}

export { SettingsDialog, SettingsGroup, SettingsRow, SettingsSection };
