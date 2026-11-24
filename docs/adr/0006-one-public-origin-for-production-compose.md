# Use one public HTTPS origin for production Compose

The supported single-host Docker Compose deployment serves the web app, API, and uploads through one public HTTPS origin; the backend and Postgres are not exposed directly. This avoids making consumers configure and maintain cross-origin sessions for the supported deployment. Local development can keep separate web and API ports.
