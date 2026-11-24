import type { NavRoute } from "./nav";

type NavigateHandler = (to: NavRoute) => Promise<void> | void;

let registeredNavigate: NavigateHandler | null = null;

export function registerAssistantNavigate(handler: NavigateHandler): () => void {
  registeredNavigate = handler;
  return () => {
    if (registeredNavigate === handler) {
      registeredNavigate = null;
    }
  };
}

export async function navigateFromAssistant(to: NavRoute): Promise<{ navigatedTo: NavRoute }> {
  if (!registeredNavigate) {
    throw new Error("Navigation is unavailable outside the App Shell.");
  }
  await registeredNavigate(to);
  return { navigatedTo: to };
}
