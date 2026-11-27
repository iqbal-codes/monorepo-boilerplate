import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { CustomerDetailView } from "@/components/customers/customer-detail";
import { CustomerFormDrawer } from "@/components/customers/customer-form-drawer";
import { usePageTitle } from "@/components/page-title";
import { authClient } from "@/lib/auth-client";
import { trpc } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/customers/$customerId")({
  component: CustomerDetailScreen,
  // Replaced with the customer's name once the record loads.
  staticData: { pageTitle: "Customer" },
});

function CustomerDetailScreen() {
  const { customerId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);

  const { data: session } = authClient.useSession();
  const canDelete = session?.user?.role === "admin";

  const customerQuery = useQuery(trpc.customers.byId.queryOptions({ id: customerId }));
  const eventsQuery = useQuery({
    ...trpc.customers.events.list.queryOptions({ customerId }),
    enabled: Boolean(customerQuery.data),
  });

  // The breadcrumb names the record, not the route.
  usePageTitle(customerQuery.data?.name);

  const invalidateCustomer = async () => {
    await queryClient.invalidateQueries(trpc.customers.pathFilter());
  };

  const addNote = useMutation(
    trpc.customers.events.addNote.mutationOptions({
      onSuccess: async () => {
        toast.success("Note added");
        await queryClient.invalidateQueries(
          trpc.customers.events.list.queryOptions({ customerId }),
        );
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const archive = useMutation(
    trpc.customers.archiveMany.mutationOptions({
      onSuccess: async () => {
        toast.success("Customer archived");
        await invalidateCustomer();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const restore = useMutation(
    trpc.customers.update.mutationOptions({
      onSuccess: async (updated) => {
        toast.success(`Customer restored as ${updated.status}`);
        await invalidateCustomer();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const remove = useMutation(
    trpc.customers.remove.mutationOptions({
      onSuccess: async () => {
        toast.success("Customer deleted");
        await invalidateCustomer();
        await navigate({ to: "/customers" });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <>
      <CustomerDetailView
        customer={customerQuery.data}
        isLoading={customerQuery.isPending}
        error={customerQuery.isError ? customerQuery.error.message : null}
        onRetryCustomer={() => void customerQuery.refetch()}
        events={eventsQuery.data ?? []}
        eventsLoading={Boolean(customerQuery.data) && eventsQuery.isPending}
        eventsError={eventsQuery.isError ? eventsQuery.error.message : null}
        onRetryEvents={() => void eventsQuery.refetch()}
        onAddNote={async (body) => {
          await addNote.mutateAsync({ customerId, body });
        }}
        addingNote={addNote.isPending}
        onEdit={() => setEditOpen(true)}
        onArchive={async () => {
          await archive.mutateAsync({ ids: [customerId] });
        }}
        archiving={archive.isPending}
        onRestore={async (status) => {
          await restore.mutateAsync({ id: customerId, status });
        }}
        restoring={restore.isPending}
        canDelete={canDelete}
        onDelete={async () => {
          await remove.mutateAsync({ id: customerId });
        }}
        deleting={remove.isPending}
        renderBackLink={({ className, children }) => (
          <Link to="/customers" className={className}>
            {children}
          </Link>
        )}
      />

      <CustomerFormDrawer open={editOpen} onOpenChange={setEditOpen} customerId={customerId} />
    </>
  );
}
