import { createAuthClient } from "better-auth/react";

import { serverUrl } from "./server-url";

export const authClient = createAuthClient({
  baseURL: new URL("/api/auth", serverUrl).toString(),
});
