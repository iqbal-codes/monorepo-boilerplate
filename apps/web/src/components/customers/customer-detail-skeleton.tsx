import { ActivityTimeline } from "@monorepo-boilerplate/ui/components/activity-timeline";
import { Card, CardContent, CardHeader } from "@monorepo-boilerplate/ui/components/card";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";

export function CustomerDetailSkeleton() {
  return (
    <div data-slot="customer-detail-skeleton" className="flex flex-col gap-6" aria-busy="true">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-6">
        <div className="flex min-w-0 items-center gap-4">
          <Skeleton className="size-12 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-44" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-56" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="size-8" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="flex flex-col gap-6 md:col-span-2">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-20" />
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex flex-col gap-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-36" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
            </CardHeader>
            <CardContent>
              <ActivityTimeline items={[]} isLoading />
            </CardContent>
          </Card>
        </div>

        <Card className="md:col-span-1">
          <CardHeader>
            <Skeleton className="h-5 w-16" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
