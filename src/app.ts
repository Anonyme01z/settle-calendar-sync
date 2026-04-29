/**
 * app.ts — Express app setup (no server.listen here)
 * Kept separate from server.ts so tests can import the app without binding a port.
 */
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import morgan from 'morgan';
import { initSentry, sentryErrorHandler } from './config/sentry';

import authRoutes from './routes/auth';
import businessRoutes from './routes/business';
import serviceRoutes from './routes/services';
import calendarRoutes from './routes/calendar';
import adminRoutes from './routes/admin';
import passwordResetRoutes from './routes/password-reset';
import paymentRoutes from './routes/payments';
import apiRoutes from './routes';

const app = express();

// Sentry must be initialised before routes
initSentry(app);

// Trust Render/proxy headers (required for rate limiting behind a reverse proxy)
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());

export const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow no-origin (curl, mobile, health checks)
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
  })
);

// Rate limiting — 100 req / 15 min per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
});
app.use(limiter);

// Request logging (combined in prod, dev format locally)
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.get('/api/version', (_req, res) => {
  res.json({ version: 'NEW_BOOKING_MODEL' });
});

app.use('/api/auth', authRoutes);
app.use('/api/auth', passwordResetRoutes);
app.use('/api/business', businessRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/calendar', calendarRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api', apiRoutes);

// 404
app.use('*', (_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Sentry error handler (before custom handler)
app.use(sentryErrorHandler());

// Global error handler — never expose internals to clients
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status: number = err.status || err.statusCode || 500;
  console.error(`[${new Date().toISOString()}] ${req.method} ${req.path} → ${status}`, err);
  if (status < 500) {
    res.status(status).json({ error: err.message || 'Bad request' });
  } else {
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
});

export default app;
