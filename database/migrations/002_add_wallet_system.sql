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
    reference VARCHAR(255),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    metadata JSONB DEFAULT '{}',
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

-- Create indexes
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

-- Triggers for updated_at (drop first to make idempotent)
DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wallet_transactions_updated_at ON wallet_transactions;
CREATE TRIGGER update_wallet_transactions_updated_at BEFORE UPDATE ON wallet_transactions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_intents_updated_at ON payment_intents;
CREATE TRIGGER update_payment_intents_updated_at BEFORE UPDATE ON payment_intents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add wallet_id to bookings
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

DROP TRIGGER IF EXISTS create_wallet_on_business_creation ON business_profiles;
CREATE TRIGGER create_wallet_on_business_creation
    AFTER INSERT ON business_profiles
    FOR EACH ROW
    EXECUTE FUNCTION create_business_wallet();

-- Function to update wallet balance on transaction completion
CREATE OR REPLACE FUNCTION update_wallet_balance()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status != 'completed' AND NEW.status = 'completed' THEN
        IF NEW.type IN ('deposit', 'payment_received', 'adjustment') THEN
            UPDATE wallets SET balance = balance + NEW.amount, updated_at = NOW() WHERE id = NEW.wallet_id;
        ELSIF NEW.type IN ('withdrawal', 'fee', 'refund') THEN
            UPDATE wallets SET balance = balance - NEW.amount, updated_at = NOW() WHERE id = NEW.wallet_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_balance_on_transaction_completion ON wallet_transactions;
CREATE TRIGGER update_balance_on_transaction_completion
    AFTER UPDATE ON wallet_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_wallet_balance();
