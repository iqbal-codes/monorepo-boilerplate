import type { Session } from "@monorepo-boilerplate/auth";
import type { Database } from "@monorepo-boilerplate/db";

export type Context = {
  session: Session | null;
  db: Database;
};
