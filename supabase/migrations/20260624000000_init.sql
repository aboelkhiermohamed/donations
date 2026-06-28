-- Supabase Database Schema for Donation Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Campaigns Table
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    description TEXT NOT NULL,
    description_ar TEXT NOT NULL,
    target_amount NUMERIC NOT NULL CHECK (target_amount > 0),
    collected_amount NUMERIC NOT NULL DEFAULT 0 CHECK (collected_amount >= 0),
    organizer TEXT NOT NULL,
    organizer_ar TEXT NOT NULL,
    cover_image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Donors Table
CREATE TABLE donors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Donations Table (Created first, linked to incoming_transactions later)
CREATE TABLE donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('vodafone_cash', 'instapay')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'auto_verified', 'manual_verified', 'rejected', 'refunded')) DEFAULT 'pending',
    transaction_ref TEXT,
    last_4_digits TEXT,
    notes TEXT,
    screenshot_url TEXT,
    verification_method TEXT CHECK (verification_method IN ('auto', 'manual')),
    verified_at TIMESTAMPTZ,
    matched_transaction_id UUID, -- Foreign key constraint added later
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Incoming Transactions Table
CREATE TABLE incoming_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('vodafone_cash', 'instapay')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    sender_phone TEXT,
    sender_name TEXT,
    transaction_ref TEXT,
    receiver_digits TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    matched_donation_id UUID REFERENCES donations(id) ON DELETE SET NULL,
    matching_confidence NUMERIC NOT NULL DEFAULT 0 CHECK (matching_confidence BETWEEN 0 AND 100),
    status TEXT NOT NULL CHECK (status IN ('unmatched', 'matched', 'manual_match')) DEFAULT 'unmatched',
    raw_sms TEXT NOT NULL,
    processing_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key constraint to donations for matched_transaction_id
ALTER TABLE donations 
ADD CONSTRAINT fk_matched_transaction 
FOREIGN KEY (matched_transaction_id) 
REFERENCES incoming_transactions(id) 
ON DELETE SET NULL;

-- 5. SMS Logs Table
CREATE TABLE sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender TEXT NOT NULL,
    message TEXT NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('success', 'duplicate', 'failed_parsing')),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Admins Table
CREATE TABLE admins (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL CHECK (role IN ('superadmin', 'admin')) DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Audit Logs Table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_table TEXT,
    target_id UUID,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Settings Table
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Notifications Table
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('new_donation', 'new_sms', 'verification_failed', 'large_donation')),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. Report Exports Table
CREATE TABLE report_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    report_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')) DEFAULT 'processing',
    file_url TEXT,
    criteria JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------
-- INDEXES
-- ----------------------------------------------------
CREATE INDEX idx_donations_donor_id ON donations(donor_id);
CREATE INDEX idx_donations_campaign_id ON donations(campaign_id);
CREATE INDEX idx_donations_status ON donations(status);
CREATE INDEX idx_incoming_transactions_processing_hash ON incoming_transactions(processing_hash);
CREATE INDEX idx_incoming_transactions_status ON incoming_transactions(status);
CREATE INDEX idx_incoming_transactions_matching_details ON incoming_transactions(amount, received_at);
CREATE INDEX idx_notifications_is_read ON notifications(is_read);

-- ----------------------------------------------------
-- TRIGGERS & FUNCTIONS
-- ----------------------------------------------------

-- Function to update campaigns.collected_amount based on donation status changes
CREATE OR REPLACE FUNCTION update_campaign_collected_amount()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('auto_verified', 'manual_verified') THEN
            UPDATE campaigns
            SET collected_amount = collected_amount + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.campaign_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        -- From non-verified to verified
        IF OLD.status NOT IN ('auto_verified', 'manual_verified') AND NEW.status IN ('auto_verified', 'manual_verified') THEN
            UPDATE campaigns
            SET collected_amount = collected_amount + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.campaign_id;
        -- From verified to non-verified
        ELSIF OLD.status IN ('auto_verified', 'manual_verified') AND NEW.status NOT IN ('auto_verified', 'manual_verified') THEN
            UPDATE campaigns
            SET collected_amount = collected_amount - OLD.amount,
                updated_at = NOW()
            WHERE id = OLD.campaign_id;
        -- Remaining verified but amount changed
        ELSIF OLD.status IN ('auto_verified', 'manual_verified') AND NEW.status IN ('auto_verified', 'manual_verified') AND OLD.amount <> NEW.amount THEN
            UPDATE campaigns
            SET collected_amount = collected_amount - OLD.amount + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.campaign_id;
        END IF;
    ELSIF TG_OP = 'DELETE' THEN
        IF OLD.status IN ('auto_verified', 'manual_verified') THEN
            UPDATE campaigns
            SET collected_amount = collected_amount - OLD.amount,
                updated_at = NOW()
            WHERE id = OLD.campaign_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_campaign_collected_amount
AFTER INSERT OR UPDATE OR DELETE ON donations
FOR EACH ROW EXECUTE FUNCTION update_campaign_collected_amount();


-- Function to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_donations_updated_at BEFORE UPDATE ON donations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ----------------------------------------------------
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ----------------------------------------------------

-- Enable RLS on tables
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;
ALTER TABLE incoming_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;

-- Campaigns: Public can read, Admins can do everything
CREATE POLICY "Public read access to campaigns" ON campaigns FOR SELECT USING (true);
CREATE POLICY "Admins full access to campaigns" ON campaigns FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

-- Donors: Public can insert, Admins can do everything
CREATE POLICY "Public can create donors" ON donors FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can select donors of verified donations" ON donors FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM donations 
        WHERE donations.donor_id = donors.id 
        AND donations.status IN ('auto_verified', 'manual_verified')
    )
);
CREATE POLICY "Admins full access to donors" ON donors FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

-- Donations: Public can insert and read verified, Admins can do everything
CREATE POLICY "Public can submit donations" ON donations FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can read verified donations" ON donations FOR SELECT USING (
    status IN ('auto_verified', 'manual_verified')
);
CREATE POLICY "Admins full access to donations" ON donations FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

-- Settings: Public can read, Admins can do everything
CREATE POLICY "Public can read settings" ON settings FOR SELECT USING (true);
CREATE POLICY "Admins full access to settings" ON settings FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

-- Admin tables: Restricted to Admins only
CREATE POLICY "Admins only access incoming_transactions" ON incoming_transactions FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

CREATE POLICY "Admins only access sms_logs" ON sms_logs FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

CREATE POLICY "Admins only access admins" ON admins FOR ALL USING (
    id = auth.uid()
);

CREATE POLICY "Admins only access audit_logs" ON audit_logs FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

CREATE POLICY "Admins only access notifications" ON notifications FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

CREATE POLICY "Admins only access report_exports" ON report_exports FOR ALL USING (
    EXISTS (SELECT 1 FROM admins WHERE id = auth.uid())
);

-- Enable Realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE donations;
ALTER PUBLICATION supabase_realtime ADD TABLE incoming_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE sms_logs;
