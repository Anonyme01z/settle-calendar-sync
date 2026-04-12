## What the screenshot suggests
- Start Command appears to be `node dist/server.js`, which skips the `prestart` migration step. This prevents the reservation columns from being created, causing the `reservation_expires_at` error.
- Build command looks like a default; ensure it compiles TypeScript before start.

## Changes to apply in Render Settings
- Build Command: `npm ci && npm run build`
- Start Command: `npm start` (this triggers `prestart`, which runs migrations before starting the server)
- Health Check Path: `/health` (keep), Port: `3001` (keep if already working)
- Environment Variables:
  - `DATABASE_URL` = your Render Postgres connection string
  - `NODE_ENV` = `production`
  - `PGSSL` = `true` (if your DB enforces SSL)
  - `FRONTEND_URL` = `https://settle-calendar-sync.onrender.com`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` = `https://settle-calendar-sync.onrender.com/api/auth/google/callback`
  - Any email provider keys (e.g., Brevo/SendGrid) and other secrets as required by your app

## Why this fixes the error
- `npm start` runs our `prestart` script (package.json:6–11), which executes `node dist/scripts/migrate.js`. That migration runner:
  - Creates `bookings` if missing using `database/schema.sql`
  - Applies `database/migrations/001_enable_pgcrypto.sql`, `003_add_customer_notes.sql`, `004_add_reservation_system.sql` idempotently to add `reservation_expires_at`, `reservation_token`, and `'reserved'` status.
- With columns present, cleanup in `src/services/calendarService.ts:514–522` succeeds.
- Startup cleanup is gated on table existence (`src/server.ts:79–92`), preventing noisy failures before migrations run.

## Validation after change
- Redeploy and watch logs:
  - Confirm migration runner logs or DB state reflect applied migrations
- Run DB checks (via psql or admin tool):
  - `SELECT column_name FROM information_schema.columns WHERE table_name='bookings' ORDER BY column_name;` → verify `reservation_expires_at`, `reservation_token` exist
  - `SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'bookings'::regclass;` → verify status check allows `'reserved'`
- Exercise flow:
  - Reserve a slot → verify a row appears with `status='reserved'`
  - Wait for expiry or confirm → ensure cleanup and confirmation paths work

## Optional hardening (if Start Command must remain `node dist/server.js`)
- Use: `node dist/scripts/migrate.js && node dist/server.js` as Start Command so migrations run explicitly.
- Clean build cache before redeploy to avoid stale `dist` artifacts.

## References
- Package lifecycle and migration hook: `package.json:6–11`
- Cleanup scheduling: `src/server.ts:79–92`
- Cleanup query: `src/services/calendarService.ts:514–522`