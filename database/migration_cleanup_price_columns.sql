-- Migration to clean up the services table by removing redundant price-related columns.

ALTER TABLE services DROP COLUMN total_price;
ALTER TABLE services DROP COLUMN pricing;
