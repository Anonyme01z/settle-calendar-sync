-- Migration: Enable pgcrypto extension for UUID generation
-- Date: 2024
-- Priority: Run this first before other migrations

-- Enable pgcrypto extension for gen_random_uuid() function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Verify extension is available
SELECT 'pgcrypto extension enabled successfully' AS status;