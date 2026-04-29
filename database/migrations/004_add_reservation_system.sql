-- Migration: Add reservation system
-- Date: 2024

-- Add missing reservation columns safely
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS reservation_token UUID DEFAULT gen_random_uuid();

-- Drop any existing status check constraint on bookings dynamically
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

-- Re-add constraint with 'reserved' included
ALTER TABLE bookings
  ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('reserved', 'confirmed', 'cancelled'));

-- Index for fast reservation expiry checks
CREATE INDEX IF NOT EXISTS idx_bookings_reservation_expires
  ON bookings(reservation_expires_at)
  WHERE status = 'reserved';

-- Migrate any legacy status values
UPDATE bookings SET status = 'confirmed' WHERE status NOT IN ('reserved', 'confirmed', 'cancelled');
