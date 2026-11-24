import { publicProcedure, router } from "../index";

export const appRouter = router({
  ping: publicProcedure.query(() => "pong"),
});

export type AppRouter = typeof appRouter;
