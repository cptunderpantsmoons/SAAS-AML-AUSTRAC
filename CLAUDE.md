# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AML/CTF SaaS platform for AUSTRAC regulatory compliance, deployed in `ap-southeast-2`. Three main deliverables:

- **Document Detection Engine** (`document_detection_engine/`) — Sprint 1; Starlette ASGI app that analyses uploaded documents for visual forgery, prompt injection, and whitespace steganography.
- **Orchestration Layer** (`orchestration_layer/`) — Sprint 2; FastAPI app that runs the full onboarding pipeline (document analysis → KYC → sanctions screening → KYB → UBO → risk aggregation).
- **UBO Graph Service** (`ubo_graph/`) — Sprint 3; Neo4j-backed beneficial-ownership calculator implementing AUSTRAC's 25% threshold methodology.

## Running Tests

Install dependencies first (Python ≥ 3.12 required):

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt -r requirements-dev.txt
```

Run the full suite:

```bash
.venv/bin/pytest
```

Run a single test file:

```bash
.venv/bin/pytest tests/test_engine.py
.venv/bin/pytest tests/test_orchestration_api.py
```

Run a specific test:

```bash
.venv/bin/pytest tests/test_integration.py::TestEndToEndPipeline::test_individual_pipeline_completes -v
```

## Lint & Type Check

```bash
.venv/bin/ruff check .
.venv/bin/mypy document_detection_engine/ orchestration_layer/ ubo_graph/
```

## Running Services Locally

Document Detection Engine (Sprint 1):

```bash
.venv/bin/uvicorn document_detection_engine.app:app --host 0.0.0.0 --port 8000
```

Orchestration Layer (Sprint 2; calls the detection engine and UBO service):

```bash
.venv/bin/uvicorn orchestration_layer.app:app --host 0.0.0.0 --port 8000
```

UBO Graph Service (Sprint 3):

```bash
.venv/bin/uvicorn ubo_graph.app:app --host 0.0.0.0 --port 8002
```

## Build Container

```bash
docker build -t aml-platform .
docker run --rm -p 8000:8000 aml-platform
```

The Dockerfile defaults to running the orchestration layer.

## Architecture

### Document Detection Engine (`document_detection_engine/`)

- `app.py` — Starlette app with `/healthz`, `/readyz`, and `POST /api/v1/documents/analyze`.  File upload validated in `_validate_upload` (size, content-type, extension, path-traversal guard).
- `engine.py` — `analyze_document(...)` orchestrates three detectors and returns a unified risk score.  Runs whitespace sanitisation and stores the cleaned payload via `StorageClient`.
- `storage.py` — Abstract `StorageClient`; three concrete backends: `local`, `s3` (SSE-KMS), and `s3-fallback` (local disk with signed-URL-style access).
- `detectors/` — Each detector is a pure function `detect_*(payload: bytes, filename: str) -> dict[str, Any]` with keys `detected`, `confidence`, `signals`, `details`.
  - `visual_forgery.py` — Regex-based PDF metadata / font / pixel-artifact detection.
  - `prompt_injection.py` — Zero-width character, hidden-layer, and known-phrase detection.
  - `whitespace_steganography.py` — Trailing whitespace binary extraction; returns `sanitized_content` which the engine uses as the stored payload.

Risk score formula in `engine._derive_risk_score`: average confidence of active modules × 100, capped at 100, bucketed into low / medium / high / critical.

### Orchestration Layer (`orchestration_layer/`)

- `app.py` — FastAPI app.  `_workflow_store` is an in-memory dict of `WorkflowState` (replace with DynamoDB/RDS in production).  Three main routes: `POST /onboarding/initiate`, `GET /onboarding/status/{id}`, `POST /kyc/verify`.
- `state_machine.py` — Wraps `transitions.Machine` around a `WorkflowState`.  Two conditional transitions after sanctions screening send individuals straight to risk aggregation and organisations through KYB → UBO first.
- `models.py` — Pydantic models.  `WorkflowState` is the mutable accumulator carried through the pipeline.  `RiskScoreResult` ( Sprint 3) holds four weighted components (kyc=0.35, sanctions=0.30, document=0.20, ubo=0.15).
- `adapters/` — Abstract base classes in `base.py`; concrete adapters (Veriff, OpenSanctions, Kyckr) implement `Base*Adapter`.  Every adapter is constructed with a `CircuitBreaker`.
- `adapters/circuit_breaker.py` — Async-safe circuit breaker (CLOSED → OPEN → HALF_OPEN → CLOSED) plus `exponential_backoff` helper.  The `with_circuit_breaker` decorator combines both.
- `secrets_manager.py` — `SecretsManagerClient`; tries AWS Secrets Manager first, falls back to `<PROVIDER>_SECRET` env vars for local development.
- `monitoring/` — `CloudWatchLogHandler` and `SplunkHECHandler` attached to the root logger at startup; `AlertDispatcher` wired to circuit breakers for error-rate/latency alerting.

Pipeline execution (`_run_pipeline` in `app.py`):

1. State → DOCUMENT_ANALYSIS
2. Call detection engine via HTTP (async, `httpx.AsyncClient`)
3. Create KYC adapter → `initiate_verification`
4. Create sanctions adapter → `screen_individual` or `screen_organisation`
5. If organisation → create KYB adapter → `lookup_entity`
6. If organisation → UBO calculation via HTTP to UBO service
7. `_aggregate_risk_score` → state → COMPLETED
8. Any exception → `sm.fail(...)` → state FAILED

### UBO Graph Service (`ubo_graph/`)

- `ubo_service.py` — `UBOService.calculate(...)` walks upstream ownership from a given entity ID using a Neo4j graph client, aggregates effective ownership percentages per person, applies the AUSTRAC 25% threshold, handles trustee-deemed ownership for trusts, and returns a `UBOCalculationResult` with a SHA-256 result hash for audit integrity.
- `db_client.py` — `Neo4jClient`; wraps `neo4j.GraphDatabase.driver` with query methods `entity_exists`, `ubo_paths`, and `trustee_deemed_ownership`.  Falls back to an in-memory graph for local dev / tests.
- `graph_schema.py` — Cypher constraints and index creation for the ownership graph.

### Infrastructure

- `infra/terraform/` — EKS, ECR, VPC, IRSA, S3; `sprint3.tf` adds UBO service infra.
- `infra/cloudformation/` — `sprint1.yaml` CloudFormation alternative.
- `k8s/` — Kubernetes manifests for EKS deployment.
- `scripts/` — `deploy_sprint1.py`, `render_sprint1_k8s.py`, `verify_quality_gate.py`.

## Important Patterns

- **Configuration is env-var based** — both engines use `dataclasses.dataclass(slots=True)` settings objects that read `os.getenv(...)` at instantiation time.  See `config.py` files for every variable and default.
- **In-memory workflow store** — the orchestration layer currently stores workflow state in a module-level dict (`_workflow_store`).  Treat it as transient; production should swap this for DynamoDB or RDS.
- **Adapter close pattern** — every adapter in the pipeline is created per-request and wrapped in `try / finally: await adapter.aclose()`.
- **Detector interface** — detectors are pure functions; they must never mutate the input payload.  Only whitespace steganography returns `sanitized_content`, which the engine passes to `storage_client.store_sanitized(...)`.
- **Circuit breaker decorator** — internal adapter methods are decorated with `@with_circuit_breaker(breaker)`; the breaker instance is created in the adapter factory inside `app.py`.
- **Mypy strict mode** — `strict = true` in `pyproject.toml`; every function needs typed signatures and explicit `-> None` on methods that return nothing.
- **Ruff config** — `line-length = 120`, target Python 3.12, lints `E`, `F`, `I`, `UP`, `B`, `SIM`, `RUF`.
