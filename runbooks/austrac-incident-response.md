# AUSTRAC Incident Response Playbook

## Severity Levels
- **P1** -- AUSTRAC API or mTLS failure; transmission halted
- **P2** -- Audit trail write failure or RLS bypass detected
- **P3** -- Governance dashboard or board approval system degradation

## P1: Transmission Halt
1. Confirm via `/healthz` and DLQ depth.
2. Notify AUSTRAC liaison officer via pre-shared contact.
3. Halt all automatic transmissions; switch to manual review queue.
4. Preserve all unacknowledged report payloads (immutable audit log).
5. Escalate to Engineering + Compliance leads within 30 minutes.

## P2: Audit Integrity Breach
1. Isolate affected database connection.
2. Run integrity check: verify all `audit_logs` rows are present (count + min/max timestamp).
3. If UPDATE/DELETE detected on audit_logs, treat as security incident immediately.
4. Preserve logs; engage InfoSec and AUSTRAC compliance officer.

## P3: Dashboard Degradation
1. Verify board API pod status.
2. Check role header enforcement (`X-User-Role`) logs.
3. Fallback to raw PostgreSQL queries for board metrics if API is down.

## Post-Incident
- Complete post-incident review within 48 hours.
- Update this playbook with lessons learned.
- Submit AUSTRAC incident notification if required by MOU.
