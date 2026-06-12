# Sprint 6 Production Deployment Checklist

## Security
- [ ] RLS policies validated: `client_staff` cannot query alerts with `smr_status IS NOT NULL`
- [ ] Audit log UPDATE/DELETE trigger tested and confirmed aborting
- [ ] Board routes reject requests without `X-User-Role: board_member`
- [ ] Cryptographic signing uses KMS in production (HMAC fallback disabled)
- [ ] mTLS certs loaded from Secrets Manager (not env vars)

## Tests
- [ ] All governance tests pass: `pytest tests/test_governance.py -v`
- [ ] Full regression suite: `pytest -x` (254+ tests)
- [ ] Ruff clean: `ruff check governance/ tests/test_governance.py`
- [ ] Mypy clean: `mypy governance/`

## Infrastructure
- [ ] Terraform applied: `sprint5.tf` + new governance resources
- [ ] K8s manifests applied and pods healthy
- [ ] SQS DLQ monitoring alarm configured
- [ ] CloudWatch dashboard updated with governance metrics

## Compliance
- [ ] AUSTRAC registration readiness assessment completed
- [ ] Immutable audit trail documented for examiner review
- [ ] RLS policy documentation signed by Compliance lead
- [ ] Board sign-off on risk appetite metrics methodology

## Signatures
- __________ Security Lead
- __________ Compliance Lead
- __________ Engineering Lead
