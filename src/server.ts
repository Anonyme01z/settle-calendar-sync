/**
 * server.ts — Entrypoint only.
 * Validates required env vars, then starts the HTTP server.
 * Import `app` from './app' in tests — never this file.
 */
import dotenv from 'dotenv';
dotenv.config();

// ── Fail fast: required secrets must be present before anything loads ─────────
const REQUIRED_ENV = [
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'DATABASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}
// ─────────────────────────────────────────────────────────────────────────────

import app, { allowedOrigins } from './app';
import { CalendarService } from './services/calendarService';
import pool from './config/database';

const PORT = process.env.PORT || 3001;

async function startCleanupJob() {
  try {
    const result = await pool.query(
      'SELECT to_regclass($1) AS exists',
      ['public.bookings']
    );
    if (!result.rows[0] || result.rows[0].exists === null) return;
    setInterval(async () => {
      try {
        await CalendarService.cleanupExpiredReservations();
      } catch (error) {
        console.error('Reservation cleanup failed:', error);
      }
    }, 60 * 1000);
  } catch (_) {
    // Table not yet created — migration will handle it
  }
}

app.listen(PORT, () => {
  console.log(`🚀 Settle API running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📅 Google Calendar integration enabled`);
  console.log(
    `🔒 CORS origins: ${allowedOrigins.join(', ') || '(none — set FRONTEND_URL)'}`
  );
  console.log(`🧹 Starting reservation cleanup job`);
  void startCleanupJob();
});
