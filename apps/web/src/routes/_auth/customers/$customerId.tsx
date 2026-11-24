import { Badge } from "@monorepo-boilerplate/ui/components/badge";
import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@monorepo-boilerplate/ui/components/card";
import { PageHeader } from "@monorepo-boilerplate/ui/components/page-header";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";
import { formatDate, formatDateTime, formatMoney } from "@monorepo-boilerplate/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";

import { CustomerFormDrawer } from "@/components/customers/customer-form-drawer";
import { usePageTitle } from "@/components/page-title";
import { assetUrl } from "@/lib/asset-url";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/customers/$customerId")({
  component: CustomerDetailScreen,
  // Replaced with the customer's name once the record loads.
  staticData: { pageTitle: "Customer" },
});

function CustomerDetailScreen() {
  const { customerId } = Route.useParams();
  const [editOpen, setEditOpen] = useState(false);
  const query = useQuery(trpc.customers.byId.queryOptions({ id: customerId }));

  // The breadcrumb names the record, not the route.
  usePageTitle(query.data?.name);

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!query.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <PageHeader title="Customer not found" description="It may have been deleted." />
        <Button variant="outline" render={<Link to="/customers" />} nativeButton={false}>
          <ArrowLeftIcon aria-hidden />
          Back to customers
        </Button>
      </div>
    );
  }

  const customer = query.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={customer.name}
        description={customer.email}
        actions={
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            Edit
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <Detail label="Company" value={customer.company ?? "—"} />
              <Detail label="Phone" value={customer.phone ?? "—"} />
              <Detail
                label="Status"
                value={
                  <Badge variant={customer.status === "active" ? "default" : "secondary"}>
                    {customer.status}
                  </Badge>
                }
              />
              <Detail
                label="Balance"
                value={
                  <span className="tabular-nums">
                    {formatMoney({ minor: customer.balanceMinor, currency: customer.currency })}
                  </span>
                }
              />
              <Detail label="Created" value={formatDate(customer.createdAt)} />
              <Detail label="Updated" value={formatDateTime(customer.updatedAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm whitespace-pre-wrap text-muted-foreground">
              {customer.notes ?? "No notes."}
            </p>
            {customer.avatarUrl ? (
              <img
                src={assetUrl(customer.avatarUrl) ?? ""}
                alt={`${customer.name} avatar`}
                className="size-24 rounded-md border object-cover"
              />
            ) : null}
          </CardContent>
        </Card>
      </div>

      <CustomerFormDrawer open={editOpen} onOpenChange={setEditOpen} customerId={customerId} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs tracking-wide text-muted-foreground uppercase">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
