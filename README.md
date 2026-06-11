# AML/CTF SaaS Platform

Sprint 1 + Sprint 2 foundation for an AML/CTF compliance SaaS platform targeting AUSTRAC regulatory requirements in `ap-southeast-2` (Sydney).

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                   Orchestration Layer (FastAPI)              │
│  /onboarding/initiate  /onboarding/status/{id}  /kyc/verify │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Veriff KYC  │  │ OpenSanctions│  │  Kyckr KYB   │       │
│  │  Adapter    │  │   Adapter    │  │   Adapter    │       │
│  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                │                  │               │
│  ┌──────┴────────────────┴──────────────────┴──────┐       │
│  │       Circuit Breaker + Exponential Backoff     │       │
│  └─────────────────────────────────────────────────┘       │
│                                                              │
│  ┌─────────────────────────────────────────────────┐       │
│  │          State Machine (transitions lib)         │       │
│  │  initiated → document_analysis → kyc →          │       │
│  │  sanctions → [kyb] → risk_aggregation → done    │       │
│  └─────────────────────────────────────────────────┘       │
└──────────────────────┬───────────────────────────────────────┘
                       │
┌──────────────────────┴───────────────────────────────────────┐
│            Document Detection Engine (Starlette)             │
│  /healthz  /readyz  /api/v1/documents/analyze               │
│                                                              │
│  ┌────────────┐ ┌────────────────┐ ┌─────────────────────┐  │
│  │ Visual     │ │ Prompt         │ │ Whitespace          │  │
│  │ Forgery    │ │ Injection      │ │ Steganography       │  │
│  └────────────┘ └────────────────┘ └─────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Services

### Document Detection Engine (Sprint 1)
- **Framework**: Starlette (ASGI)
- **Port**: 8000
- **Endpoints**: `GET /healthz`, `GET /readyz`, `POST /api/v1/documents/analyze`
- Detects visual forgery, prompt injection, and whitespace steganography
- Stores sanitized output via local/S3/S3-fallback backends

### Orchestration Layer (Sprint 2)
- **Framework**: FastAPI
- **Port**: 8000 (default)
- **Endpoints**:
  - `POST /onboarding/initiate` — Start a new onboarding workflow
  - `GET /onboarding/status/{id}` — Check workflow state and results
  - `POST /kyc/verify` — Trigger KYC verification for an onboarding
- State machine: initiated → document_analysis → kyc_verification → sanctions_screening → [kyb_lookup] → risk_aggregation → completed
- Adapters: Veriff (KYC), OpenSanctions (Sanctions/PEP), Kyckr (KYB)
- Circuit breaker + exponential backoff on all external calls
- AWS Secrets Manager for API credentials (env-var fallback for local dev)

## Quick start

```bash
# Install dependencies
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt

# Run all tests
.venv/bin/pytest

# Lint + typecheck
.venv/bin/ruff check .
.venv/bin/mypy document_detection_engine/ orchestration_layer/
```

## Runtime configuration

### Document Detection Engine
| Variable | Default | Description |
|---|---|---|
| `AWS_REGION` | `ap-southeast-2` | AWS region |
| `STORAGE_BACKEND` | `local` | `local`, `s3`, or `s3-fallback` |
| `MAX_UPLOAD_BYTES` | `10485760` | Max upload size (10 MB) |

### Orchestration Layer
| Variable | Default | Description |
|---|---|---|
| `DETECTION_ENGINE_URL` | `http://localhost:8000` | Detection engine base URL |
| `KYC_PROVIDER` | `veriff` | KYC adapter: `veriff`, `idenfy`, `au10tix` |
| `SANCTIONS_PROVIDER` | `open_sanctions` | Sanctions adapter: `open_sanctions`, `complyadvantage` |
| `KYB_PROVIDER` | `kyckr` | KYB adapter: `kyckr`, `creditsafe` |
| `CIRCUIT_FAILURE_THRESHOLD` | `5` | Failures before circuit opens |
| `CIRCUIT_RECOVERY_TIMEOUT_SECONDS` | `30` | Seconds before half-open probe |
| `SECRETS_MANAGER_PREFIX` | `aml-au/orchestration` | AWS Secrets Manager path prefix |

## Container

```bash
docker build -t aml-platform .
docker run --rm -p 8000:8000 aml-platform
```

## Infrastructure

- `infra/terraform/` — AWS infrastructure (EKS, ECR, VPC, IRSA, S3)
- `infra/cloudformation/` — CloudFormation alternative
- `k8s/` — Kubernetes manifests for EKS deployment

## Docs

- `docs/compliance/pii-handling.md` — PII handling and Privacy Act controls
- `docs/security/document-threat-model.md` — Threat model for document uploads
- `docs/security/upload-controls.md` — OWASP upload control mapping
- `docs/deployment/aws-sprint1-runbook.md` — AWS deployment runbook
