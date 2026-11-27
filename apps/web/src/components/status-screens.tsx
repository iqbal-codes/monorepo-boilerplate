import { Button, buttonVariants } from "@monorepo-boilerplate/ui/components/button";
import { StatusScreen } from "@monorepo-boilerplate/ui/components/status-screen";
import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { ArrowLeftIcon, HomeIcon, RefreshCwIcon } from "lucide-react";
import type * as React from "react";

type LinkRenderer = (props: { className: string; children: React.ReactNode }) => React.ReactElement;

function formatErrorDetails(error: unknown): string | undefined {
  if (error === null || error === undefined) {
    return undefined;
  }
  if (error instanceof Error) {
    return error.stack || `${error.name}: ${error.message}`;
  }
  if (typeof error === "string") {
    return error.trim() || undefined;
  }
  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export type NotFoundScreenProps = {
  title?: string;
  description?: string;
  layout?: "page" | "embedded";
  headingLevel?: "h1" | "h2";
  renderHomeLink?: LinkRenderer;
};

/**
 * Route-level 404 status screen with home navigation and browser back recovery.
 */
export function NotFoundScreen({
  title,
  description,
  layout = "page",
  headingLevel = "h1",
  renderHomeLink,
}: NotFoundScreenProps) {
  const homeClassName = buttonVariants({ variant: "default" });
  const homeChildren = (
    <>
      <HomeIcon aria-hidden="true" data-icon="inline-start" />
      Go home
    </>
  );

  return (
    <StatusScreen
      status="404"
      title={title}
      description={description}
      layout={layout}
      headingLevel={headingLevel}
      primaryAction={
        renderHomeLink ? (
          renderHomeLink({ className: homeClassName, children: homeChildren })
        ) : (
          <Link to="/" className={homeClassName}>
            {homeChildren}
          </Link>
        )
      }
      secondaryAction={
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.history.back();
            }
          }}
        >
          <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
          Go back
        </Button>
      }
    />
  );
}

export type ForbiddenScreenProps = {
  title?: string;
  description?: string;
  layout?: "page" | "embedded";
  headingLevel?: "h1" | "h2";
  fallbackLabel?: string;
  renderFallbackLink?: LinkRenderer;
  secondaryAction?: React.ReactNode;
};

/**
 * Reusable 403 forbidden screen helper for `_auth` routes and role-gated views.
 */
export function ForbiddenScreen({
  title,
  description,
  layout = "embedded",
  headingLevel = "h1",
  fallbackLabel = "Back to dashboard",
  renderFallbackLink,
  secondaryAction,
}: ForbiddenScreenProps) {
  const fallbackClassName = buttonVariants({ variant: "default" });
  const fallbackChildren = (
    <>
      <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
      {fallbackLabel}
    </>
  );

  return (
    <StatusScreen
      status="403"
      title={title}
      description={description}
      layout={layout}
      headingLevel={headingLevel}
      primaryAction={
        renderFallbackLink ? (
          renderFallbackLink({ className: fallbackClassName, children: fallbackChildren })
        ) : (
          <Link to="/dashboard" className={fallbackClassName}>
            {fallbackChildren}
          </Link>
        )
      }
      secondaryAction={secondaryAction}
    />
  );
}

export type ErrorScreenProps = Partial<ErrorComponentProps> & {
  title?: string;
  description?: string;
  layout?: "page" | "embedded";
  headingLevel?: "h1" | "h2";
  showDetails?: boolean;
  onRetry?: () => void;
  renderHomeLink?: LinkRenderer;
};

/**
 * Route error boundary 500 status screen with retry, home recovery, and
 * dev-only collapsible technical details.
 */
export function ErrorScreen({
  error,
  reset,
  title,
  description,
  layout = "page",
  headingLevel = "h1",
  showDetails = import.meta.env.DEV,
  onRetry,
  renderHomeLink,
}: ErrorScreenProps) {
  const details = showDetails ? formatErrorDetails(error) : undefined;
  const homeClassName = buttonVariants({ variant: "outline" });
  const homeChildren = (
    <>
      <HomeIcon aria-hidden="true" data-icon="inline-start" />
      Go home
    </>
  );

  function handleRetry() {
    if (onRetry) {
      onRetry();
      return;
    }
    if (reset) {
      reset();
      return;
    }
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }

  return (
    <StatusScreen
      status="500"
      title={title}
      description={description}
      layout={layout}
      headingLevel={headingLevel}
      details={details}
      primaryAction={
        <Button type="button" onClick={handleRetry}>
          <RefreshCwIcon aria-hidden="true" data-icon="inline-start" />
          Try again
        </Button>
      }
      secondaryAction={
        renderHomeLink ? (
          renderHomeLink({ className: homeClassName, children: homeChildren })
        ) : (
          <Link to="/" className={homeClassName}>
            {homeChildren}
          </Link>
        )
      }
    />
  );
}
