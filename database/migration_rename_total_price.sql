-- Migration to align the services table with the application code.
-- This script renames the 'total_price' column to 'price'.

ALTER TABLE services RENAME COLUMN total_price TO price;
