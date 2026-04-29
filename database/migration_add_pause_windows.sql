-- Create pause_windows table
CREATE TABLE IF NOT EXISTS pause_windows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_pause_windows_user_id ON pause_windows(user_id);
CREATE INDEX IF NOT EXISTS idx_pause_windows_date_range ON pause_windows(start_date, end_date);