# Store upload paths provider-relative, resolve them at render

Uploads are served from the server app at `/uploads/<key>`, and the upload endpoint returns that relative path. Records store the path as-is.

The alternative — storing an absolute URL built from the request origin — fails two ways. A change of host or port invalidates every stored reference, and the absolute URL carries the deployment's configured host into API responses, which the environment validator treats as leaked configuration and rejects with a 500 before the response leaves the server.

## Consequences

Every place that renders an uploaded file calls `apps/web/src/lib/asset-url.ts:assetUrl()`, which joins the path to `VITE_SERVER_URL`. Moving to a CDN means changing that one function plus the storage adapter, not the data.
