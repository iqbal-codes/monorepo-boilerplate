import type * as React from "react";
import { cn } from "cn";

type PageHeaderProps = {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Keep the subtitle visible on narrow/mobile viewports (e.g. when it shows identifying data like an email). */
  keepDescriptionOnMobile?: boolean;
  actions?: React.ReactNode;
  /** Keep preview or action controls on a separate row below `sm`. */
  stackActionsOnMobile?: boolean;
  /** Breadcrumb trail rendered above the title. */
  breadcrumbs?: React.ReactNode;
  className?: string;
};

/** Standard screen heading: breadcrumbs, title, description, and right-aligned actions. */
export function PageHeader({
  title,
  description,
  keepDescriptionOnMobile = false,
  actions,
  stackActionsOnMobile = false,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div data-slot="page-header" className={cn("flex min-w-0 flex-col gap-2 sm:gap-3", className)}>
      {breadcrumbs}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:items-start">
        <div
          className={cn(
            "flex min-w-0 flex-1 flex-col gap-1",
            stackActionsOnMobile && "basis-full sm:basis-0",
          )}
        >
          <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">{title}</h1>
          {description ? (
            <p
              className={cn(
                "text-sm text-pretty text-muted-foreground",
                !keepDescriptionOnMobile && "hidden sm:block",
              )}
            >
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex max-w-full min-w-0 shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
