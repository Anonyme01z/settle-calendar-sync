-- MVP Phase 1 Database Migration
-- Add new columns for MVP Phase 1 booking types

-- Add new columns for MVP Phase 1
ALTER TABLE services 
ADD COLUMN IF NOT EXISTS location_type VARCHAR(10),
ADD COLUMN IF NOT EXISTS meeting_link TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS window_duration INTEGER,
ADD COLUMN IF NOT EXISTS starting_price DECIMAL(10,2);

-- Update existing booking_type values to new MVP Phase 1 types
-- Map old types to new types
UPDATE services 
SET booking_type = CASE 
  WHEN booking_type = 'fixed' THEN 'appointment'
  WHEN booking_type = 'flexible' THEN 'service-window'
  WHEN booking_type = 'quote' THEN 'on-demand'
  ELSE booking_type
END
WHERE booking_type IN ('fixed', 'flexible', 'quote');

-- Set default values for new columns based on booking type
UPDATE services 
SET 
  location_type = CASE 
    WHEN location ILIKE '%online%' OR location ILIKE '%zoom%' OR location ILIKE '%meet%' THEN 'online'
    ELSE 'onsite'
  END,
  customer_notes_enabled = COALESCE(customer_notes_enabled, false)
WHERE location_type IS NULL;

-- Add constraints for new columns
ALTER TABLE services 
ADD CONSTRAINT check_location_type CHECK (location_type IN ('online', 'onsite')),
ADD CONSTRAINT check_window_duration CHECK (window_duration IS NULL OR window_duration > 0),
ADD CONSTRAINT check_starting_price CHECK (starting_price IS NULL OR starting_price >= 0);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_services_booking_type ON services(booking_type);
CREATE INDEX IF NOT EXISTS idx_services_location_type ON services(location_type); 