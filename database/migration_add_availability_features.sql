-- Add bookingWindowDays to services table
ALTER TABLE services
ADD COLUMN booking_window_days INTEGER DEFAULT 365;

-- Add status, cancellation_reason, cancelled_at to bookings table
ALTER TABLE bookings
ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'confirmed',
ADD COLUMN cancellation_reason TEXT,
ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;

-- Create pause_windows table
CREATE TABLE pause_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- Update businesses table to include has_set_working_hours and working_hours_history in settings JSONB
-- This requires a more complex update as JSONB columns cannot be directly altered with ADD COLUMN for nested structures.
-- We will handle this in the application logic by ensuring these fields are present when settings are retrieved/updated.
-- For existing businesses, these fields will be null/undefined until their settings are saved through the new API.
-- The 'has_set_working_hours' flag will be managed in the application layer.
-- The 'working_hours_history' will be an array of objects within the 'settings' JSONB.
