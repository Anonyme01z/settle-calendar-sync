/**
 * Sentry error tracking — compatible with @sentry/node v8
 *
 * Setup:
 *  1. @sentry/node is already in package.json
 *  2. Add SENTRY_DSN to Render environment variables
 *  3. Get your DSN: https://sentry.io → Settings → Projects → Client Keys
 */

import * as Sentry from '@sentry/node';
import type { Application, Request, Response, NextFunction } from 'express';

export function initSentry(app: Application): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    console.warn('[Sentry] SENTRY_DSN not set — error tracking disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    sendDefaultPii: false,
    ignoreErrors: [
      'Route not found',
      'Access token required',
      'Invalid or expired token',
    ],
    beforeSend(event) {
      if (event.request?.headers) {
        delete (event.request.headers as Record<string, unknown>)['authorization'];
        delete (event.request.headers as Record<string, unknown>)['cookie'];
      }
      return event;
    },
  });

  console.log('[Sentry] Error tracking enabled ✓');
}

/**
 * Sentry error handler — register AFTER all routes, BEFORE your own error handler.
 * Uses the v8 API: setupExpressErrorHandler()
 */
export function sentryErrorHandler() {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    // Capture the error in Sentry if DSN is configured
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err);
    }
    next(err);
  };
}

export { Sentry };
