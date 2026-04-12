-- Add customer_notes column to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_notes TEXT;
