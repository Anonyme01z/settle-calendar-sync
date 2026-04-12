-- Migration: Safely add reservation columns that 004 may have missed
-- Uses IF NOT EXISTS so it is safe to run multiple times

-- Add missing reservation columns
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reservation_token UUID DEFAULT gen_random_uuid();

-- Drop any existing status check constraint (named or auto-named by Postgres)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'bookings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE bookings DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

-- Re-add constraint that includes 'reserved' status
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('reserved', 'confirmed', 'cancelled'));

-- Create index for fast reservation expiry checks (IF NOT EXISTS requires Postgres 9.5+)
CREATE INDEX IF NOT EXISTS idx_bookings_reservation_expires
  ON bookings(reservation_expires_at)
  WHERE status = 'reserved';

-- Migrate any legacy status values
UPDATE bookings SET status = 'confirmed' WHERE status NOT IN ('reserved', 'confirmed', 'cancelled');
