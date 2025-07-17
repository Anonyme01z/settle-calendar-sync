-- Settle Booking Application Database Schema
-- PostgreSQL

-- Create database (run this separately)
-- CREATE DATABASE settle_booking;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_token_expiry TIMESTAMP,
    google_calendar_id VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create business_profiles table
CREATE TABLE IF NOT EXISTS business_profiles (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    handle VARCHAR(50) UNIQUE NOT NULL,
    rating DECIMAL(3,2) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    phone VARCHAR(20),
    address TEXT,
    settings JSONB NOT NULL,
    social_links JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create services table
CREATE TABLE IF NOT EXISTS services (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    location VARCHAR(255) NOT NULL,
    deposit_percentage INTEGER NOT NULL CHECK (deposit_percentage >= 0 AND deposit_percentage <= 100),
    description TEXT NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    -- New fields for booking models
    booking_type VARCHAR(16) NOT NULL DEFAULT 'fixed',
    estimated_duration INTEGER,
    requires_approval BOOLEAN DEFAULT false,
    customer_notes_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    service_id UUID REFERENCES services(id) ON DELETE CASCADE,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    customer_name VARCHAR(255),
    customer_email VARCHAR(255),
    google_calendar_event_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_business_profiles_handle ON business_profiles(handle);
CREATE INDEX IF NOT EXISTS idx_services_user_id ON services(user_id);
CREATE INDEX IF NOT EXISTS idx_services_active ON services(is_active);
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_service_id ON bookings(service_id);
CREATE INDEX IF NOT EXISTS idx_bookings_start_time ON bookings(start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_business_profiles_updated_at BEFORE UPDATE ON business_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data (optional, for testing)
-- You can uncomment these if you want sample data

/*
-- Sample user
INSERT INTO users (id, email, password_hash) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'demo@settle.com', '$2a$10$example.hash.here');

-- Sample business profile
INSERT INTO business_profiles (id, user_id, name, email, handle, settings, social_links) VALUES (
    '550e8400-e29b-41d4-a716-446655440001',
    '550e8400-e29b-41d4-a716-446655440000',
    'Demo Beauty Studio',
    'demo@settle.com',
    'demobeauty',
    '{"workingHours":[{"day":"monday","startTime":"09:00","endTime":"17:00","isWorkingDay":true},{"day":"tuesday","startTime":"09:00","endTime":"17:00","isWorkingDay":true},{"day":"wednesday","startTime":"09:00","endTime":"17:00","isWorkingDay":true},{"day":"thursday","startTime":"09:00","endTime":"17:00","isWorkingDay":true},{"day":"friday","startTime":"09:00","endTime":"17:00","isWorkingDay":true},{"day":"saturday","startTime":"09:00","endTime":"17:00","isWorkingDay":false},{"day":"sunday","startTime":"09:00","endTime":"17:00","isWorkingDay":false}],"bufferTimeMinutes":15,"minBookingNoticeHours":24,"bookingWindowDays":30,"calendarConnected":false,"timeZone":"America/New_York"}',
    '{"instagram":"@demobeauty","website":"https://demobeauty.settle.com"}'
);

-- Sample service
INSERT INTO services (id, user_id, title, duration_minutes, location, total_price, deposit_percentage, description, currency) VALUES (
    '550e8400-e29b-41d4-a716-446655440002',
    '550e8400-e29b-41d4-a716-446655440000',
    'Makeup Consultation',
    60,
    'Studio or Client Location',
    150.00,
    30,
    'Professional makeup consultation including color analysis and technique training.',
    'USD'
);
*/

-- Remove legacy price fields and add a single price field
ALTER TABLE services DROP COLUMN IF EXISTS total_price;
ALTER TABLE services DROP COLUMN IF EXISTS starting_price;
ALTER TABLE services DROP COLUMN IF EXISTS pricing;
ALTER TABLE services ADD COLUMN IF NOT EXISTS price DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS booking_type VARCHAR(16) NOT NULL DEFAULT 'fixed';

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS estimated_duration INTEGER;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT false;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS customer_notes_enabled BOOLEAN DEFAULT false;

ALTER TABLE services
  ADD COLUMN IF NOT EXISTS location_type VARCHAR(16);
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS meeting_link TEXT;
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS address TEXT;

-- Migration for new booking types and capacity
ALTER TABLE services
  ALTER COLUMN booking_type TYPE VARCHAR(16);
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS capacity INTEGER;
-- Optionally, update existing rows to set capacity to 1 for fixed bookings
UPDATE services SET capacity = 1 WHERE booking_type = 'fixed' AND capacity IS NULL;
