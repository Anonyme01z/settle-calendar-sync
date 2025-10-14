-- Add customer_notes column to bookings table
ALTER TABLE bookings
ADD COLUMN customer_notes TEXT;