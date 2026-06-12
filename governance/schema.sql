-- Sprint 6: Immutable Audit Trail
-- Append-only audit_logs: UPDATE and DELETE are rejected by trigger

CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    payload_hash TEXT NOT NULL DEFAULT '',
    receipt_id TEXT NOT NULL DEFAULT '',
    user_role TEXT NOT NULL DEFAULT 'system',
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

-- Reject all UPDATE and DELETE attempts on audit_logs
CREATE OR REPLACE FUNCTION reject_audit_modification() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is immutable: UPDATE and DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_logs;
CREATE TRIGGER audit_log_no_update
    BEFORE UPDATE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION reject_audit_modification();

DROP TRIGGER IF EXISTS audit_log_no_delete ON audit_logs;
CREATE TRIGGER audit_log_no_delete
    BEFORE DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION reject_audit_modification();
