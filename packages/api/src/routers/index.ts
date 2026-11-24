import { publicProcedure, router } from "../index";
import { assistantRouter } from "./assistant";
import { customersRouter } from "./customers";

export const appRouter = router({
  ping: publicProcedure.query(() => "pong"),
  assistant: assistantRouter,
  customers: customersRouter,
});

export type AppRouter = typeof appRouter;
