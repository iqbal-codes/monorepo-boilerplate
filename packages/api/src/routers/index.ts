import { publicProcedure, router } from "../index";
import { customersRouter } from "./customers";

export const appRouter = router({
  ping: publicProcedure.query(() => "pong"),
  customers: customersRouter,
});

export type AppRouter = typeof appRouter;
