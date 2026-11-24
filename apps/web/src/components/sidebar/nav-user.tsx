import { Link, useNavigate } from "@tanstack/react-router";
import { BadgeCheckIcon, ChevronsUpDownIcon, LogOutIcon, SettingsIcon } from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@monorepo-boilerplate/ui/components/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@monorepo-boilerplate/ui/components/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@monorepo-boilerplate/ui/components/sidebar";
import { Skeleton } from "@monorepo-boilerplate/ui/components/skeleton";

import { authClient } from "@/lib/auth-client";

/**
 * Footer user menu from shadcn's `sidebar-07`, wired to the real session instead
 * of sample data. The block's "Upgrade to Pro"/"Billing" items are dropped: this
 * is an internal tool with no billing surface.
 */
export function NavUser() {
  const { isMobile } = useSidebar();
  const navigate = useNavigate();
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <Skeleton className="h-12 w-full" />
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  if (!session) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton render={<Link to="/login" />}>Sign in</SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    );
  }

  const { user } = session;
  const initials = user.name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />}
          >
            <Avatar>
              {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </div>
            <ChevronsUpDownIcon className="ml-auto size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/settings" />}>
                <SettingsIcon />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  const role = user.role ?? "user";
                  toast.info(`Signed in as ${role}`, {
                    description:
                      role === "admin"
                        ? "Administrator: gated procedures are available."
                        : "Ordinary user: admin procedures return 403.",
                  });
                }}
              >
                <BadgeCheckIcon />
                Account ({user.role ?? "user"})
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onClick={() => {
                void authClient.signOut({
                  fetchOptions: {
                    onSuccess: () => {
                      void navigate({ to: "/login" });
                    },
                  },
                });
              }}
            >
              <LogOutIcon />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
