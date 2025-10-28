-- Migration: Add reservation system
-- Date: 2024
-- Description: Add support for slot reservations with expiry

-- Modify bookings table to support reservations
ALTER TABLE bookings 
  ALTER COLUMN status TYPE VARCHAR(20),
  DROP CONSTRAINT IF EXISTS bookings_status_check,
  ADD CONSTRAINT bookings_status_check 
    CHECK (status IN ('reserved', 'confirmed', 'cancelled')),
  ADD COLUMN reservation_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN reservation_token UUID DEFAULT gen_random_uuid();

-- Create index for fast reservation expiry checks
CREATE INDEX idx_bookings_reservation_expires 
  ON bookings(reservation_expires_at) 
  WHERE status = 'reserved';

-- Update existing bookings to have 'confirmed' status
UPDATE bookings 
  SET status = 'confirmed' 
  WHERE status = 'active' OR status IS NULL;