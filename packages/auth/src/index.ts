import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@monorepo-boilerplate/db";
import * as schema from "@monorepo-boilerplate/db/schema/auth";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins/admin";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
};

export function createAuth(env: AuthConfig, database: Database) {
  // `SameSite=None` requires `Secure`, and browsers (WebKit, Firefox) drop such a
  // cookie over plain http://localhost, which silently breaks local sign-in.
  // Cross-site cookies are only needed once the app is served over https.
  const isHttps = env.BETTER_AUTH_URL.startsWith("https://");

  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: { enabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      defaultCookieAttributes: {
        sameSite: isHttps ? "none" : "lax",
        secure: isHttps,
        httpOnly: true,
      },
    },
    plugins: [admin({ defaultRole: "user", adminRoles: ["admin"] })],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
