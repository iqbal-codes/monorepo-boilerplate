import { createAuth } from "@monorepo-boilerplate/auth";
import { createDb } from "@monorepo-boilerplate/db";

import { ENV } from "./env.server";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);
