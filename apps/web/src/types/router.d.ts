import "@tanstack/react-router";

/**
 * Route metadata read by the App Shell.
 *
 * `staticData` is an empty interface that each app augments; declaring
 * `pageTitle` here lets a route name itself (`staticData: { pageTitle: "Customers" }`)
 * and the top bar read it without prop drilling or pathname parsing.
 */
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption {
    pageTitle?: string;
  }
}
