# Runtime configuration

Copy `.env.example` to `.env` for local use. All settings are optional: without
database or email credentials, the app serves live notices with history and email
sending disabled. Set secrets in your hosting provider's environment settings.
Never put credentials in source code, commit `.env`, or prefix secrets with
`VITE_` (that prefix is exposed to browser code).

`runtime-config.ts` loads `.env` without overriding existing process variables,
then creates one immutable `config` object using the pure schema in `config.ts`.
The server, database, email sender and Vite configuration consume that object.
Validation happens before requests are served or a database connection is opened;
errors identify variable names and expected formats without printing their values.
Configuration is a startup snapshot: restart or redeploy after changing it.
Additional dotenv variants such as `.env.local` are not loaded by this server;
use `.env` or process variables. Vite's normal browser environment handling is
separate, and this project does not require custom `VITE_*` settings.
See [Vite's environment-variable documentation](https://vite.dev/guide/env-and-mode)
for its browser-exposure and build-mode rules.

See `.env.example` for every supported variable, its units, default and bounds.
The refactor preserves all previous operational defaults. Important precedence:

- `DATABASE_URL` wins over `POSTGRES_URL`. Empty values are treated as absent.
- `DIGEST_SITE_URL` wins over `https://VERCEL_PROJECT_PRODUCTION_URL`, which
  wins over `http://localhost:PORT`. This URL also receives the poll's feed-warming
  request, so set it explicitly when hosting outside Vercel.
- Missing `CRON_SECRET` disables scheduled endpoints. A configured secret permits
  scheduled checks and digest dry runs even when email is not set up. Sending also
  requires `RESEND_API_KEY` and a nonempty, valid comma-separated `DIGEST_TO`.
- `DIGEST_FROM` defaults to Resend's test sender. Real delivery may require a
  verified sender domain and recipients allowed by your Resend account.
- `DISABLE_HMR` and `VERCEL` accept `true`, `false`, `1` and `0`.
- Leave `NODE_ENV` blank in `.env` so Vite selects production for builds; the
  local server defaults to development. A standalone production host should set
  `NODE_ENV=production` in its process environment.

The hardcoded-settings audit moved deployment-specific values into configuration:
server host/port/mode, HMR, database connection/pool settings, feed request timeouts
and caches, rate-limit backoff, scheduled-check budgets, archive loading limits,
visitor refresh limits, email settings/timeouts and CDN cache policies.

Some constants deliberately remain code or platform configuration:

- Regulator URLs, required user agents, FINRA's request spacing and source IDs are
  part of source-specific adapters; changing an address alone can invalidate its
  parser. Resend's API URL is part of that provider integration.
- Singapore/Hong Kong publication-day semantics, taxonomy/scoring rules, query
  validation limits, frontend display/polling behavior and browser storage caps
  describe product behavior rather than deployment credentials or infrastructure.
- Region, function duration, schedules, routing and security headers are consumed
  by Vercel from `vercel.json`, before application runtime. Changing a runtime
  environment variable cannot rewrite those settings.
- The existing 15 MiB PDF check and four-page OCR limit are unchanged. Additional
  PDF/OCR hardening, package upgrades, lockfile consolidation, toolchain version
  pinning and CI/update automation remain deferred under Request 50.

For a configuration change, run type checking, tests and the production build.
Use a preview before changing production credentials or operational limits. Never
expose the full `config` object through an API response or import the runtime
module into `src/`.
