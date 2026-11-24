# Ship one reference flow rather than a demo catalogue

The template's value is proving that a table, a form, a file upload, and pagination compose against a real API. A catalogue of isolated demo screens compiles while every seam between the pieces stays untested, so the first consumer that wires them discovers the gaps.

Decided: the app shell and blocks are permanent, one reference flow (Customers) is permanent and must keep working, and any screen that only exhibits a block is a deletable demo route.

## Consequences

A consumer deletes `apps/web/src/routes/_demo/` and keeps a working app. The reference flow costs database schema, seed data, and API surface that a library-only template would not carry.
