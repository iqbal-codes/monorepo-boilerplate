import type * as React from "react";
import { cn } from "cn";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Breadcrumb trail rendered above the title. */
  breadcrumbs?: React.ReactNode;
  className?: string;
};

/** Standard screen heading: breadcrumbs, title, description, and right-aligned actions. */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div data-slot="page-header" className={cn("flex flex-col gap-3", className)}>
      {breadcrumbs}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-[min(100%,14rem)] flex-1 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {description ? (
            <p className="text-sm text-pretty text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex w-full min-w-0 max-w-full flex-wrap items-center gap-2 sm:w-auto">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
