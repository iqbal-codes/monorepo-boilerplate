import { ActivityTimeline } from "@monorepo-boilerplate/ui/components/activity-timeline";
import { Card, CardContent, CardHeader } from "@monorepo-boilerplate/ui/components/card";
import {
  DetailAside,
  DetailGrid,
  DetailMain,
  DetailScreen,
} from "@monorepo-boilerplate/ui/components/detail-layout";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";

export function CustomerDetailSkeleton() {
  return (
    <DetailScreen data-slot="customer-detail-skeleton" aria-busy="true">
      <div className="flex min-w-0 flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between sm:pb-6">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className="h-7 w-40 sm:w-44" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-48 sm:w-56" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Skeleton className="h-8 flex-1 sm:w-16 sm:flex-initial" />
          <Skeleton className="size-8 shrink-0" />
        </div>
      </div>

      <DetailGrid>
        <DetailAside>
          <Card size="sm">
            <CardHeader>
              <Skeleton className="h-5 w-20" />
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <Skeleton className="h-5 w-16" />
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </DetailAside>

        <DetailMain>
          <div className="grid grid-cols-1 gap-px border border-border/80 bg-border/70 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2 bg-card px-4 py-3.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>

          <Card size="sm">
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent>
              <ActivityTimeline items={[]} isLoading />
            </CardContent>
          </Card>
        </DetailMain>
      </DetailGrid>
    </DetailScreen>
  );
}
