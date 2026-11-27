import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRightIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@monorepo-boilerplate/ui/components/command";
import { Spinner } from "@monorepo-boilerplate/ui/components/spinner";

import { isCommandCenterEnterKey, isCommandCenterKey } from "@/lib/command-shortcut";
import { navMain, navShortcuts, type NavRoute } from "@/lib/nav";
import { customerListSearch } from "@/lib/use-data-table-search-params";
import { useThemeToggle } from "@/lib/use-theme-toggle";
import { trpc } from "@/utils/trpc";

type CommandScreen = {
  title: string;
  to: NavRoute;
  icon: LucideIcon;
  keywords?: readonly string[];
};

/**
 * Screens shown by the Command Center. Derived from the same navigation config
 * as the sidebar, so deleting a route (or the demo screens) removes it from
 * both places at once.
 */
const COMMAND_SCREENS: readonly CommandScreen[] = [
  ...navMain.flatMap((item): CommandScreen[] =>
    item.items?.length
      ? item.items.map((subItem) => ({
          title: subItem.title,
          to: subItem.to,
          icon: item.icon,
          keywords: [item.title],
        }))
      : [{ title: item.title, to: item.to, icon: item.icon }],
  ),
  ...navShortcuts.map((shortcut): CommandScreen => ({
    title: shortcut.name,
    to: shortcut.to,
    icon: shortcut.icon,
    keywords: ["reference", "demo"],
  })),
];

const CUSTOMER_RESULT_LIMIT = 5;
const CUSTOMER_SEARCH_MIN_LENGTH = 2;
const CUSTOMER_SEARCH_DEBOUNCE_MS = 300;

/**
 * The App Shell command surface: one dialog opened by the desktop sidebar
 * trigger, the mobile top-bar trigger, `mod+K`, or the requested `mod+Enter`
 * alias (outside text-entry surfaces).
 *
 * A single instance lives in `AppShell` so every trigger and shortcut opens
 * the same overlay. It stays in `apps/web` rather than `packages/ui` because it
 * binds the shell's navigation config, the Customers query, and theme state;
 * blocks in the UI package stay domain- and router-free.
 */
export function CommandCenter({
  open,
  onOpenChange,
  onOpenSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: () => void;
}) {
  const navigate = useNavigate();
  const { isDark, toggleTheme } = useThemeToggle();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, CUSTOMER_SEARCH_DEBOUNCE_MS);

  const terms = query.trim();
  const customerSearchTerm = debouncedQuery.trim();
  const hasCustomerSearchTerm = terms.length >= CUSTOMER_SEARCH_MIN_LENGTH;
  const customerSearchSettled = customerSearchTerm === terms;
  const customerSearchPending = hasCustomerSearchTerm && !customerSearchSettled;

  const customers = useQuery({
    ...trpc.customers.list.queryOptions({
      pageIndex: 0,
      pageSize: CUSTOMER_RESULT_LIMIT,
      search: customerSearchTerm || undefined,
      status: "all",
      sortBy: "name",
      sortDir: "asc",
    }),
    enabled: open && hasCustomerSearchTerm && customerSearchSettled,
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      if (!isCommandCenterKey(event) && !isCommandCenterEnterKey(event)) return;

      event.preventDefault();
      onOpenChange(true);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange]);

  function close() {
    setQuery("");
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      onOpenChange(true);
    } else {
      close();
    }
  }

  function goTo(to: NavRoute) {
    close();
    void navigate({ to });
  }

  function openCustomer(customerId: string) {
    close();
    void navigate({ to: "/customers/$customerId", params: { customerId } });
  }

  function viewAllCustomers() {
    const search = customerListSearch({ q: terms, page: 0, status: "all" });
    close();
    void navigate({ href: `/customers${search}` });
  }

  function toggleThemeAndClose() {
    toggleTheme();
    close();
  }

  function openSettingsAndClose() {
    close();
    onOpenSettings?.();
  }

  const themeLabel = isDark ? "Switch to light theme" : "Switch to dark theme";
  const showThemeAction = matchesQuery(terms, themeLabel, "theme", "appearance", "dark", "light");
  const showSettingsAction =
    Boolean(onOpenSettings) &&
    matchesQuery(terms, "Open settings", "preferences", "appearance", "profile", "password");
  const ThemeIcon = isDark ? SunIcon : MoonIcon;

  const screens = COMMAND_SCREENS.filter((screen) =>
    matchesQuery(terms, screen.title, ...(screen.keywords ?? [])),
  );
  const hasStaticResults = screens.length > 0 || showThemeAction || showSettingsAction;

  const customerRows = customers.data?.rows ?? [];
  const visibleCustomerRows = customerSearchPending ? [] : customerRows;
  const customerCount = customers.data?.rowCount ?? 0;
  const showCustomerGroup = hasCustomerSearchTerm;
  const showNothing = terms.length > 0 && !hasStaticResults && !hasCustomerSearchTerm;
  const viewAllLabel =
    customerCount === 0
      ? "View all results"
      : customerCount === 1
        ? "View all 1 result"
        : `View all ${customerCount} results`;

  let customerStatus: ReactNode = null;
  if (visibleCustomerRows.length === 0) {
    if (customerSearchPending || customers.isFetching) {
      customerStatus = (
        <CommandItem value="customers-loading" disabled>
          <Spinner className="size-3" aria-hidden />
          Searching Customers…
        </CommandItem>
      );
    } else if (customers.isError) {
      customerStatus = (
        <CommandItem value="customers-error" disabled>
          Customer search failed. Try again.
        </CommandItem>
      );
    } else {
      customerStatus = (
        <CommandItem value="customers-empty" disabled>
          No Customers match “{terms}”.
        </CommandItem>
      );
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Command Center"
      description="Search screens and customers, or run an action."
    >
      <Command label="Command Center" shouldFilter={false} vimBindings={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search or jump to…"
          autoFocus
        />
        <CommandList
          label="Command Center results"
          aria-busy={customerSearchPending || customers.isFetching}
          style={{ maxHeight: "min(60vh, 24rem)" }}
        >
          {screens.length > 0 ? (
            <CommandGroup heading="Screens">
              {screens.map((screen) => (
                <CommandItem
                  key={`${screen.to}-${screen.title}`}
                  value={`screen-${screen.to}-${screen.title}`}
                  onSelect={() => goTo(screen.to)}
                >
                  <screen.icon />
                  <span className="truncate">{screen.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {showThemeAction || showSettingsAction ? (
            <CommandGroup heading="Actions">
              {showSettingsAction ? (
                <CommandItem value="action-open-settings" onSelect={openSettingsAndClose}>
                  <SettingsIcon />
                  <span>Open settings</span>
                </CommandItem>
              ) : null}
              {showThemeAction ? (
                <CommandItem value="action-toggle-theme" onSelect={toggleThemeAndClose}>
                  <ThemeIcon />
                  <span>{themeLabel}</span>
                </CommandItem>
              ) : null}
            </CommandGroup>
          ) : null}

          {showCustomerGroup ? (
            <CommandGroup
              heading={
                <span className="flex items-center gap-2">
                  Customers
                  {customerSearchPending || customers.isFetching ? (
                    <Spinner className="size-3" aria-hidden />
                  ) : null}
                </span>
              }
            >
              {visibleCustomerRows.map((customer) => (
                <CommandItem
                  key={customer.id}
                  value={`customer-${customer.id}`}
                  onSelect={() => openCustomer(customer.id)}
                >
                  <UsersIcon />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{customer.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {customer.company
                        ? `${customer.email} · ${customer.company}`
                        : customer.email}
                    </span>
                  </span>
                </CommandItem>
              ))}

              {customerStatus}

              {customerSearchPending ? null : (
                <CommandItem value="customers-view-all" onSelect={viewAllCustomers}>
                  <ArrowRightIcon />
                  <span>{viewAllLabel}</span>
                </CommandItem>
              )}
            </CommandGroup>
          ) : null}

          {showNothing ? (
            <CommandItem value="no-results" disabled>
              No results for “{terms}”.
            </CommandItem>
          ) : null}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}

function matchesQuery(query: string, ...values: (string | undefined)[]): boolean {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}
