# AGENTS.md — AML/CTF SaaS Platform (AUSTRAC, ap-southeast-2)

## Quick Commands

```bash
# Setup (Python ≥ 3.12)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt -r requirements-dev.txt

# Run all tests
.venv/bin/pytest

# Run single test file
.venv/bin/pytest tests/test_engine.py
.venv/bin/pytest tests/test_orchestration_api.py

# Lint + typecheck (run in order)
.venv/bin/ruff check .
.venv/bin/mypy document_detection_engine/ orchestration_layer/ ubo_graph/ compliance_agent/ governance/

# Run services locally (each on different port)
.venv/bin/uvicorn document_detection_engine.app:app --port 8000   # Sprint 1
.venv/bin/uvicorn orchestration_layer.app:app --port 8000         # Sprint 2
.venv/bin/uvicorn ubo_graph.app:app --port 8002                   # Sprint 3
.venv/bin/uvicorn compliance_agent.app:app --port 8006            # Sprint 7
```

## Service Entry Points

| Service | Framework | Port | Main Module |
|---------|-----------|------|-------------|
| Document Detection Engine | Starlette | 8000 | `document_detection_engine/app.py` |
| Orchestration Layer | FastAPI | 8000 | `orchestration_layer/app.py` |
| UBO Graph Service | FastAPI | 8002 | `ubo_graph/app.py` |
| Transaction Monitoring | FastAPI | 8004 | `transaction_monitoring/app.py` |
| AUSTRAC Reporting | FastAPI | 8005 | `austrac_reporting/app.py` |
| Governance | FastAPI | 8003 | `governance/app.py` |
| Compliance Agent | FastAPI | 8006 | `compliance_agent/app.py` |

## Key Architectural Patterns

- **Config**: All services use `@dataclass(slots=True)` settings reading `os.getenv()` at instantiation. See `config.py` in each service.
- **Workflow store**: Orchestration layer uses in-memory `_workflow_store` dict — **transient only**, replace with DynamoDB/RDS for production.
- **Adapters**: Created per-request, always wrapped in `try/finally: await adapter.aclose()`.
- **Detectors**: Pure functions (`detect_*(payload: bytes, filename: str) -> dict`), never mutate input. Only whitespace steganography returns `sanitized_content`.
- **Circuit breaker**: `@with_circuit_breaker(breaker)` decorator on adapter methods; breaker created in adapter factory in `orchestration_layer/app.py`.
- **Mypy strict mode** (`strict = true`): Every function needs typed signatures; explicit `-> None` on void methods.
- **Ruff**: line-length=120, target py312, lints E,F,I,UP,B,SIM,RUF.

## Service Communication

- Orchestration → Detection Engine: HTTP via `httpx.AsyncClient` (DETECTION_ENGINE_URL env var)
- Orchestration → UBO Service: HTTP (port 8002)
- Compliance Agent → All services: Via `ComplianceServiceClient` HTTP calls through gateway
- Transaction Monitoring → DB: asyncpg/aiosqlite
- UBO Graph → Neo4j: `neo4j.GraphDatabase.driver` (in-memory fallback for dev)

## Docker

```bash
docker build -t aml-platform .
docker run --rm -p 8000:8000 aml-platform  # Runs orchestration_layer by default
```

Dockerfile copies all services; default CMD runs orchestration layer.

## Tests

- `tests/conftest.py` — shared fixtures
- Integration test: `tests/test_integration.py::TestEndToEndPipeline::test_individual_pipeline_completes`
- Quality gate: `tests/test_quality_gate.py`

## Important Env Vars

| Service | Key Variables |
|---------|---------------|
| Detection Engine | `AWS_REGION`, `STORAGE_BACKEND` (local/s3/s3-fallback), `MAX_UPLOAD_BYTES` |
| Orchestration | `DETECTION_ENGINE_URL`, `KYC_PROVIDER`, `SANCTIONS_PROVIDER`, `KYB_PROVIDER`, `CIRCUIT_FAILURE_THRESHOLD`, `SECRETS_MANAGER_PREFIX` |
| UBO Graph | `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` |
| Compliance Agent | `AGENTMAIL_API_KEY`, `SUPERTOKENS_CONNECTION_URI`, `SUPERTOKENS_API_KEY` |

## Sprint 8 Auth (Compliance Agent)

- SuperTokens initialized in `compliance_agent/app.py:create_app()`
- `/agent/chat` & `/agent/ingestion/webhook` require `compliance_officer` role
- `/agent/tasks*` require any authenticated session

## Infra

- Terraform: `infra/terraform/` (EKS, ECR, VPC, IRSA, S3; `sprint3.tf`, `sprint4.tf`, `sprint5.tf`, `sprint7.tf`)
- CloudFormation: `infra/cloudformation/sprint1.yaml`
- K8s manifests: `k8s/` (kustomize structure)