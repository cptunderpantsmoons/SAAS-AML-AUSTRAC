# Document Threat Model

## Scope

This threat model covers the Sprint 1 Document Detection Engine and its immediate storage path for uploaded customer documents.

## Assets

- Uploaded source documents containing customer and transaction data
- Sanitized document artefacts written to object storage
- Detection findings used by downstream AML/CTF workflows
- KMS keys protecting sanitized storage objects
- Pre-signed URLs granting temporary access to sanitized output

## Trust boundaries

1. Client to API boundary at `/api/v1/documents/analyze`
2. API process memory during document parsing and detector execution
3. API to storage boundary when sanitized artefacts are persisted
4. Storage access boundary where temporary URLs are issued

## Primary attack classes

### Visual forgery

- Manipulated metadata intended to disguise edited or composited documents
- Font inconsistencies suggesting copy-paste assembly
- Pixel artefact patterns indicating altered raster segments

Current control:
- `visual_forgery` detector evaluates metadata mismatch, font inconsistency, editing markers, and pixel artefact signatures.

Residual risk:
- Legitimate rescans or OCR re-exports may produce false positives.
- Mitigation is threshold-based detection with audit visibility and configurable thresholds.

### Prompt injection in documents

- Hidden instructions embedded in HTML, SVG, comments, or invisible layers
- Zero-width character obfuscation to bypass plain-text scanning
- Known LLM-targeted phrases such as instruction override text

Current control:
- `prompt_injection` detector scans for zero-width characters, hidden layers, and known prompt-injection phrases.

Residual risk:
- Novel obfuscation patterns may evade static signatures.
- Mitigation is continued threat-model iteration and pattern expansion.

### Whitespace steganography

- Trailing spaces or tab patterns carrying hidden binary payloads
- Payloads that survive naive sanitization and influence downstream systems

Current control:
- `whitespace_steganography` detector reconstructs binary from whitespace patterns and emits sanitized content with trailing whitespace removed.

Residual risk:
- Non-trailing whitespace encodings may require broader normalization strategies.

## Abuse cases

1. Upload a document with a double-purpose business payload and hidden LLM instructions.
2. Upload a forged identity document with inconsistent producer metadata and suspicious raster signatures.
3. Upload a whitespace-encoded payload designed to survive ingestion and activate in a downstream parser.
4. Attempt path-traversal or executable-style filenames to escape expected file handling.
5. Attempt oversized uploads to exhaust memory or processing limits.

## Defensive decisions in Sprint 1

- Allow-list content types and block high-risk executable extensions.
- Reject path-traversal style filenames.
- Enforce max upload size.
- Process raw payloads in-memory only.
- Persist sanitized output separately from runtime logs.
- Require SSE-KMS for the AWS storage path.
- Use configurable thresholds before a module becomes a positive detection.
- Emit audit-safe logs containing identifiers and decisions, not raw payload bodies.

## Next review items

- Confirm downstream consumers of sanitized artefacts and their parsing behavior.
- Add format-aware validation for PDF and image structure.
- Extend detector patterns with red-team samples from the finalised threat model.
- Add retention and deletion controls to infrastructure execution, not just documentation.
