import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { serverUrl } from "./server-url";

/**
 * The `admin` plugin is enabled server-side (docs/adr/0003), so the client needs
 * its counterpart: without it the session user type omits `role`, `banned`, and
 * the admin endpoints are missing from the client API.
 */
export const authClient = createAuthClient({
  baseURL: new URL("/api/auth", serverUrl).toString(),
  plugins: [adminClient()],
});
