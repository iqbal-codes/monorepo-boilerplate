import { afterAll, beforeAll, beforeEach } from "bun:test";
import { dirname, resolve } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { act } from "react";

const uiPkgPath = resolve(import.meta.dir, "../../../packages/ui/package.json");
const { Window } = (await import(
  Bun.resolveSync("happy-dom", uiPkgPath)
)) as typeof import("happy-dom");
const baseUiRoot = dirname(dirname(Bun.resolveSync("@base-ui/react/dialog", uiPkgPath)));

const { mock } = await import("bun:test");

mock.module(Bun.resolveSync("@base-ui/utils/useIsoLayoutEffect", baseUiRoot), () => ({
  useIsoLayoutEffect: React.useLayoutEffect,
}));

class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const DOM_KEYS = [
  "window",
  "document",
  "Document",
  "ShadowRoot",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "PointerEvent",
  "KeyboardEvent",
  "FocusEvent",
  "MutationObserver",
  "ResizeObserver",
  "navigator",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "IS_REACT_ACT_ENVIRONMENT",
] as const;

type HappyWindow = InstanceType<typeof Window>;

let currentWindow: HappyWindow | null = null;
let savedGlobals: Record<string, unknown> | null = null;

export function getTestWindow(): HappyWindow {
  return ensureDomGlobals();
}

export function ensureDomGlobals(): HappyWindow {
  if (currentWindow) {
    return currentWindow;
  }
  const win = new Window({ url: "http://localhost/customers" });
  win.HTMLElement.prototype.scrollIntoView ??= () => {};
  win.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;

  savedGlobals = Object.fromEntries(
    DOM_KEYS.map((key) => [key, (globalThis as Record<string, unknown>)[key]]),
  );

  Object.assign(globalThis, {
    window: win,
    document: win.document,
    Document: win.Document,
    ShadowRoot: win.ShadowRoot,
    HTMLElement: win.HTMLElement,
    HTMLInputElement: win.HTMLInputElement,
    HTMLTextAreaElement: win.HTMLTextAreaElement,
    Element: win.Element,
    Node: win.Node,
    Event: win.Event,
    MouseEvent: win.MouseEvent,
    PointerEvent: win.PointerEvent,
    KeyboardEvent: win.KeyboardEvent,
    FocusEvent: win.FocusEvent,
    MutationObserver: win.MutationObserver,
    ResizeObserver: MockResizeObserver,
    navigator: win.navigator,
    getComputedStyle: win.getComputedStyle.bind(win),
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
    cancelAnimationFrame: win.cancelAnimationFrame.bind(win),
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  currentWindow = win;
  return win;
}

function teardownDomGlobals() {
  if (!currentWindow) return;
  if (savedGlobals) {
    for (const key of DOM_KEYS) {
      (globalThis as Record<string, unknown>)[key] = savedGlobals[key];
    }
  }
  currentWindow.close();
  currentWindow = null;
  savedGlobals = null;
}

ensureDomGlobals();

export type SessionData = {
  user: { id: string; name: string; email: string; role?: string };
  session: { id: string; impersonatedBy?: string | null };
};

export type SessionHookState = {
  data: SessionData | null;
  error: { status?: number; message: string } | null;
  isPending: boolean;
  refetch: () => Promise<void>;
};

export type StopImpersonatingResult = {
  data?: SessionData | null;
  error?: { message?: string } | null;
};

export type BlockerState =
  | { status: "idle" }
  | { status: "blocked"; proceed: () => void; reset: () => void };

function defaultSessionState(): SessionHookState {
  return {
    data: {
      user: { id: "u-1", name: "Ada", email: "ada@example.com", role: "user" },
      session: { id: "s-1", impersonatedBy: null },
    },
    error: null,
    isPending: false,
    refetch: async () => {},
  };
}

export const chromeMocks = {
  sessionHookState: defaultSessionState(),
  stopImpersonatingImpl: (async () => ({ error: null })) as () => Promise<StopImpersonatingResult>,
  createCustomerImpl: (async () => ({ id: "c-1" })) as (input: unknown) => Promise<unknown>,
  updateCustomerImpl: (async () => ({ id: "c-1" })) as (input: unknown) => Promise<unknown>,
  customerByIdImpl: (async () => null) as (id: string) => Promise<unknown>,
  customerTagsImpl: (async () => ["vip", "enterprise"]) as () => Promise<string[]>,
  routerInvalidateCalls: 0,
  blockerImpl: (() => ({ status: "idle" })) as () => BlockerState,
  reset() {
    this.sessionHookState = defaultSessionState();
    this.stopImpersonatingImpl = async () => ({ error: null });
    this.createCustomerImpl = async () => ({ id: "c-1" });
    this.updateCustomerImpl = async () => ({ id: "c-1" });
    this.customerByIdImpl = async () => null;
    this.customerTagsImpl = async () => ["vip", "enterprise"];
    this.routerInvalidateCalls = 0;
    this.blockerImpl = () => ({ status: "idle" });
  },
};

mock.module("@/lib/server-url", () => ({
  serverUrl: "http://localhost:3000",
  getServerUrl: (url: string) => url,
}));

mock.module("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => chromeMocks.sessionHookState,
    admin: {
      stopImpersonating: () => chromeMocks.stopImpersonatingImpl(),
    },
  },
}));

mock.module("@/utils/trpc", () => ({
  trpc: {
    customers: {
      pathFilter: () => ({ queryKey: ["customers"] }),
      byId: {
        queryOptions: ({ id }: { id: string }) => ({
          queryKey: ["customers", "byId", id],
          queryFn: () => chromeMocks.customerByIdImpl(id),
        }),
      },
      tags: {
        queryOptions: () => ({
          queryKey: ["customers", "tags"],
          queryFn: () => chromeMocks.customerTagsImpl(),
        }),
      },
      list: {
        queryOptions: (input: unknown) => ({
          queryKey: ["customers", "list", input],
          queryFn: async () => ({ rows: [], rowCount: 0 }),
        }),
      },
      create: {
        mutationOptions: (opts: Record<string, unknown> = {}) => ({
          ...opts,
          mutationFn: (input: unknown) => chromeMocks.createCustomerImpl(input),
        }),
      },
      update: {
        mutationOptions: (opts: Record<string, unknown> = {}) => ({
          ...opts,
          mutationFn: (input: unknown) => chromeMocks.updateCustomerImpl(input),
        }),
      },
    },
  },
}));

const realRouterExports = { ...(await import("@tanstack/react-router")) };
const {
  Link: RealLink,
  useNavigate: realUseNavigate,
  useRouter: realUseRouter,
  useRouterState: realUseRouterState,
  useBlocker: realUseBlocker,
} = realRouterExports;
let activeSuites = 0;

mock.module("@tanstack/react-router", () => ({
  ...realRouterExports,
  Link: (props: React.ComponentProps<typeof RealLink>) => {
    if (activeSuites === 0) {
      return React.createElement(RealLink, props);
    }
    const { to, children, ...rest } = props as React.AnchorHTMLAttributes<HTMLAnchorElement> & {
      to?: string;
    };
    return (
      <a href={to ?? "#"} {...rest}>
        {children}
      </a>
    );
  },
  useNavigate: (...args: Parameters<typeof realUseNavigate>) =>
    activeSuites === 0 ? realUseNavigate(...args) : () => Promise.resolve(),
  useRouter: (...args: Parameters<typeof realUseRouter>) =>
    activeSuites === 0
      ? realUseRouter(...args)
      : {
          invalidate: async () => {
            chromeMocks.routerInvalidateCalls += 1;
          },
        },
  useRouterState: (opts?: Parameters<typeof realUseRouterState>[0]) => {
    if (activeSuites === 0) {
      return realUseRouterState(opts);
    }
    const state = {
      location: { pathname: "/customers" },
      matches: [{ staticData: { pageTitle: "Customers" } }],
    };
    const select = (opts as { select?: (s: unknown) => unknown } | undefined)?.select;
    return select ? select(state) : state;
  },
  useBlocker: (...args: Parameters<typeof realUseBlocker>) =>
    activeSuites === 0 ? realUseBlocker(...args) : chromeMocks.blockerImpl(),
}));

const { createRoot } = await import("react-dom/client");

export function useChromeDomHarness() {
  beforeAll(() => {
    activeSuites += 1;
    ensureDomGlobals();
  });

  beforeEach(() => {
    ensureDomGlobals();
    chromeMocks.reset();
  });

  afterAll(() => {
    activeSuites = Math.max(0, activeSuites - 1);
    if (activeSuites === 0) {
      teardownDomGlobals();
    }
  });
}

export async function renderWithQuery(node: React.ReactNode, queryClient?: QueryClient) {
  ensureDomGlobals();
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  });

  return {
    host,
    client,
    cleanup: async () => {
      await act(async () => {
        root.unmount();
        await Promise.resolve();
      });
      host.remove();
    },
  };
}

export function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const win = getTestWindow();
  const proto =
    input instanceof win.HTMLTextAreaElement
      ? win.HTMLTextAreaElement.prototype
      : win.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new win.Event("input", { bubbles: true }));
  input.dispatchEvent(new win.Event("change", { bubbles: true }));
}
