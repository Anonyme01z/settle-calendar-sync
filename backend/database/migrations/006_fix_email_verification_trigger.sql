-- Migration 006: Drop invalid trigger on email_verification_codes
-- The update_updated_at_column trigger fires on UPDATE but the table
-- has no updated_at column, causing a crash on email verification.

DROP TRIGGER IF EXISTS update_email_verification_codes_updated_at ON email_verification_codes;
