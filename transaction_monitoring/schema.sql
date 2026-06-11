-- Sprint 4: Transaction Monitoring Schema with RLS

-- Rules table (JSONB conditions)
CREATE TABLE IF NOT EXISTS rules (
    rule_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    conditions JSONB NOT NULL,
    base_severity TEXT NOT NULL CHECK (base_severity IN ('low','medium','high','critical')),
    window_days INT DEFAULT 1,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    onboarding_id TEXT NOT NULL,
    amount NUMERIC(18,2) NOT NULL,
    currency TEXT DEFAULT 'AUD',
    sender_account TEXT,
    receiver_account TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}',
    indexed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts table (with soft-delete + legal hold)
CREATE TABLE IF NOT EXISTS alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID REFERENCES rules(rule_id),
    onboarding_id TEXT NOT NULL,
    transaction_ids UUID[] DEFAULT '{}',
    base_severity TEXT NOT NULL,
    final_severity TEXT NOT NULL,
    document_risk_score NUMERIC(5,4),
    status TEXT DEFAULT 'open' CHECK (status IN ('open','assigned','resolved','dismissed')),
    assigned_to TEXT,
    notes TEXT,
    legal_hold BOOLEAN DEFAULT false,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-Level Security: compliance officers see all; client-facing staff see non-high-severity
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY compliance_officer_all ON alerts
    FOR ALL TO compliance_officer USING (true);

CREATE POLICY client_staff_limited ON alerts
    FOR SELECT TO client_staff USING (final_severity IN ('low','medium'));

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_onboarding ON transactions(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON transactions(timestamp);
CREATE INDEX IF NOT EXISTS idx_alerts_onboarding ON alerts(onboarding_id);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_final_severity ON alerts(final_severity);
CREATE INDEX IF NOT EXISTS idx_rules_enabled ON rules(enabled);

-- Sprint 6: Tipping-Off Prevention via RLS
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS smr_status TEXT DEFAULT NULL CHECK (smr_status IN ('draft','submitted','acknowledged'));

-- Role-based RLS for Tipping Off prevention
CREATE ROLE IF NOT EXISTS compliance_officer;
CREATE ROLE IF NOT EXISTS client_staff;
CREATE ROLE IF NOT EXISTS board_member;

-- Drop old policies if they exist (from sprint 4)
DROP POLICY IF EXISTS compliance_officer_all ON alerts;
DROP POLICY IF EXISTS client_staff_limited ON alerts;

-- Re-create with smr_status awareness
CREATE POLICY compliance_officer_all ON alerts
    FOR ALL TO compliance_officer USING (true);

CREATE POLICY client_staff_no_tipping ON alerts
    FOR SELECT TO client_staff USING (smr_status IS NULL);

CREATE POLICY board_member_readonly ON alerts
    FOR SELECT TO board_member USING (true);
