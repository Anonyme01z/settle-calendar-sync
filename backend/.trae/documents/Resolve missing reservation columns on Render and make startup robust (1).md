## Diagnosis

* The Postgres error `42P01: relation "bookings" does not exist` means your Render database doesn’t have the `bookings` table when the app starts.

* Your server schedules a periodic cleanup that deletes expired reservations from `bookings` (`src/services/calendarService.ts:516–518`), and that job is invoked from the server startup (`src/server.ts:73–82`). Since the table isn’t there, it throws repeatedly and can cause the deploy to time out.

* In local Docker, `database/schema.sql` is auto-applied via `docker-compose.yml`, and migrations are applied with `scripts/apply_migrations.sh`. On Render, those Docker-based steps don’t run, so the base schema and migrations were never applied to the production database.

## What to Change on Render

* Ensure the Render service is configured with a correct `DATABASE_URL` (or equivalent PG env vars) pointing to your managed Postgres instance.

* Apply the base schema and migrations to the Render database:

  * Base schema: `database/schema.sql` creates `bookings` and other tables (`database/schema.sql:58–71`).

  * Migrations: run `database/migrations/001_enable_pgcrypto.sql` (needed for `gen_random_uuid()`), `003_add_customer_notes.sql`, `004_add_reservation_system.sql` (adds `reserved` status and reservation columns).

## Automate Migrations for Deploys

* Add a migration step to your Render build or start command to run schema + migrations before the app starts.

* Implement a non-Docker migration runner (Node + `pg`) that:

  * Connects using `DATABASE_URL`.

  * Executes `schema.sql` once if tables are missing.

  * Applies each SQL file in `database/migrations/*.sql` in order, idempotently.

* Wire it into Render:

  * Build command example: `npm ci && npm run migrate && npm run build`.

  * Start command example: `npm run start` (app starts only after migrations succeed).

## Make Cleanup Job Safe

* Guard the scheduled cleanup so it doesn’t crash or spam logs if the table isn’t present yet:

  * Start the interval only after a successful DB readiness check.

  * Wrap with error handling that logs once and backs off, instead of running every minute on a missing table.

## Verify Runtime and Configuration

* Confirm Node version on Render matches your local (set `Node Version` in Render or via `engines` in `package.json`).

* Ensure `NODE_ENV=production` and all required env vars are set.

* Verify Postgres has `pgcrypto` enabled; if not, apply `001_enable_pgcrypto.sql`.

## Validation Steps

* Redeploy and watch logs; the migration step should create `bookings` and add reservation columns.

* Check that cleanup runs without errors and the server listens successfully.

* Run a quick API call that touches `bookings` to confirm reads/writes succeed.

