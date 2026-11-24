import { defineRelations } from "drizzle-orm";

import * as schema from "./schema";

export const relations = {
  ...defineRelations(schema),
  ...schema.assistantRelations,
  ...schema.authRelations,
  ...schema.customerRelations,
};
