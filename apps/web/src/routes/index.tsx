import { Button } from "@monorepo-boilerplate/ui/components/button";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="container mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">monorepo-boilerplate</h1>
        <p className="text-sm text-muted-foreground">
          React and TanStack Router on the web, Hono and tRPC on the server, Drizzle on Postgres.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <Button nativeButton={false} render={<Link to="/dashboard" />}>
          Dashboard
        </Button>
        <Button nativeButton={false} variant="outline" render={<Link to="/login" />}>
          Sign in
        </Button>
      </div>
    </div>
  );
}
