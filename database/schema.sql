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

-- Migration: Add wallet system and payment tracking
-- Date: 2024

-- Create wallets table for business accounts
CREATE TABLE IF NOT EXISTS wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE,
    balance DECIMAL(15,2) DEFAULT 0.00 CHECK (balance >= 0),
    currency VARCHAR(3) DEFAULT 'USD',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(business_id)
);

-- Create wallet_transactions table for all wallet activities
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES wallets(id) ON DELETE CASCADE,
    booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'payment_received', 'refund', 'fee', 'adjustment')),
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    description TEXT,
    reference VARCHAR(255), -- External payment reference (Paystack, etc.)
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    metadata JSONB DEFAULT '{}', -- Store additional payment data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create payment_intents table for tracking payment attempts
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID REFERENCES bookings(id) ON DELETE CASCADE,
    business_id UUID REFERENCES business_profiles(id) ON DELETE CASCADE,
    customer_email VARCHAR(255) NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    deposit_amount DECIMAL(15,2) NOT NULL,
    deposit_percentage INTEGER NOT NULL,
    paystack_reference VARCHAR(255),
    paystack_access_code VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'expired')),
    payment_method VARCHAR(50),
    customer_name VARCHAR(255),
    customer_phone VARCHAR(20),
    metadata JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_wallets_business_id ON wallets(business_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_booking_id ON wallet_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type ON wallet_transactions(type);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status ON wallet_transactions(status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_booking_id ON payment_intents(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_business_id ON payment_intents(business_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_paystack_reference ON payment_intents(paystack_reference);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_expires_at ON payment_intents(expires_at);

-- Add triggers for updated_at timestamps
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallet_transactions_updated_at BEFORE UPDATE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add wallet_id column to bookings table to track which wallet received payment
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_wallet_id ON bookings(wallet_id);

-- Function to create wallet for new business
CREATE OR REPLACE FUNCTION create_business_wallet()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO wallets (business_id, currency)
    VALUES (NEW.id, 'USD');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically create wallet for new business
CREATE TRIGGER create_wallet_on_business_creation
    AFTER INSERT ON business_profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_business_wallet();

-- Function to update wallet balance on transaction completion
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update balance when transaction status changes to completed
    IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
        IF NEW.type IN ('deposit', 'payment_received', 'adjustment') THEN
            -- Add to wallet balance
            UPDATE wallets 
            SET balance = balance + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.wallet_id;
        ELSIF NEW.type IN ('withdrawal', 'fee', 'refund') THEN
            -- Subtract from wallet balance
            UPDATE wallets 
            SET balance = balance - NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.wallet_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update wallet balance
CREATE TRIGGER update_balance_on_transaction_completion
    AFTER UPDATE ON wallet_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_balance();
