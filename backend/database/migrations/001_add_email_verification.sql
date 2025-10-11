-- Migration: Add email verification support to users table
-- Date: 2024

-- Add email_verified column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- Create email verification codes table
CREATE TABLE IF NOT EXISTS email_verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for email verification codes
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_email ON email_verification_codes(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_code ON email_verification_codes(code);
CREATE INDEX IF NOT EXISTS idx_email_verification_codes_expires_at ON email_verification_codes(expires_at);

-- Add trigger for email_verification_codes table
CREATE TRIGGER update_email_verification_codes_updated_at BEFORE UPDATE ON email_verification_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
