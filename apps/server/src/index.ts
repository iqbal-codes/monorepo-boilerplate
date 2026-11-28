import { trpcServer } from "@hono/trpc-server";
import { appRouter } from "@monorepo-boilerplate/api/routers/index";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { createContext } from "./context";
import { ENV } from "./env.server";
import { importBodyLimit } from "./lib/import-body-limit";
import { assistant } from "./routes/assistant";
import { uploads } from "./routes/uploads";
import { auth } from "./services";

const app = new Hono();

app.use(logger());
app.use(
  "/*",
  cors({
    origin: ENV.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", async (c) => auth.handler(c.req.raw));

app.route("/api/chat", assistant);

app.route("/uploads", uploads);

// Before the tRPC handler: an oversized Customers import is rejected before
// the JSON body is decoded. Every other request passes through untouched.
app.use("/trpc/*", importBodyLimit());

const trpcHandlerOptions = {
  endpoint: "/trpc",
  router: appRouter,
  createContext: (_opts: unknown, context: Context) => createContext({ context }),
};

// Only these unbatched queries send filters in the body to keep request lines short.
const postCustomerQuery = trpcServer({ ...trpcHandlerOptions, allowMethodOverride: true });
app.post("/trpc/customers.list", postCustomerQuery);
app.post("/trpc/customers.export", postCustomerQuery);
app.use("/trpc/*", trpcServer(trpcHandlerOptions));

app.get("/", (c) => {
  return c.text("OK");
});

export default {
  fetch: app.fetch,
  idleTimeout: 120,
};
