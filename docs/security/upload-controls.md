# OWASP File Upload Control Mapping

This document maps current Sprint 1 controls to common OWASP-style file upload risks.

## Control summary

| Risk | Current control | Evidence |
| --- | --- | --- |
| Dangerous file types | Block-list for executable extensions | `tests/test_upload_guards.py::test_analyze_rejects_blocked_file_extension` |
| Content-type abuse | Content-type allow-list | `tests/test_upload_guards.py::test_analyze_rejects_unsupported_content_type` |
| Path traversal filenames | Reject path separators and non-basename filenames | `tests/test_upload_guards.py::test_analyze_rejects_path_traversal_style_filename` |
| Resource exhaustion | `MAX_UPLOAD_BYTES` limit | `tests/test_upload_guards.py::test_analyze_rejects_oversized_upload` |
| Missing file handling | Explicit multipart validation | `tests/test_upload_guards.py::test_analyze_requires_file_upload` |
| Hidden payloads | Detector coverage for prompt injection and whitespace steganography | `tests/test_api.py`, `tests/test_detectors.py` |
| Forged document artefacts | Visual forgery detector | `tests/test_detectors.py::test_visual_forgery_detector_flags_metadata_mismatch` |
| Unsanitized persistence | Sanitized storage path only | `document_detection_engine/engine.py` |
| Weak storage controls | S3 SSE-KMS and pre-signed URL flow | `infra/terraform/main.tf`, `tests/test_storage.py` |
| Low-observability decisions | Audit-safe structured logging | `tests/test_engine.py::test_analyze_document_emits_audit_log_without_raw_payload` |

## Current limitations

- The service does not yet perform deep MIME sniffing beyond the declared content type.
- The service does not yet run malware scanning or CDR.
- The infrastructure templates are committed, but Terraform has not been applied from this environment.
- Lifecycle retention and deletion enforcement are documented but not yet executed in cloud state.

## Verification command

Run:

```bash
python3 scripts/verify_quality_gate.py
```

The script runs the core test suite and asserts at least 90% traced coverage for all three detector modules.
