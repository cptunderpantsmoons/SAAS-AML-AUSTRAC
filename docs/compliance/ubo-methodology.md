# UBO Determination Methodology

## Purpose

This document describes the methodology used by the UBO Graph Service to
determine beneficial owners of Tranche 2 entities, satisfying AUSTRAC's
"reasonable steps" requirement under AML/CTF Rules Instrument 2023.

## Regulatory Basis

Under the **Anti-Money Laundering and Counter-Terrorism Financing Rules
Instrument 2023**, reporting entities must take reasonable steps to identify
individuals who:

- **Own 25% or more** of a customer entity (directly or indirectly)
- **Exercise significant influence** over the entity (e.g., as a trustee,
  director, or via a control relationship)

## Graph Model

### Node Types

| Label    | Description                              | Key Properties                        |
|----------|------------------------------------------|---------------------------------------|
| Person   | Natural person (potential UBO)           | `node_id`, `name`, `country_code`     |
| Company  | Registered company / corporation         | `node_id`, `name`, `registration_id`  |
| Trust    | Trust entity                             | `node_id`, `name`                     |

### Edge Types

| Relationship      | Direction           | Semantics                                       |
|-------------------|---------------------|-------------------------------------------------|
| OWNS_SHARES       | Source → Target     | Source owns `ownership_percentage`% of Target   |
| IS_TRUSTEE_OF     | Person → Trust      | Person is trustee of the Trust                  |
| CONTROLS          | Source → Target     | Source exercises control over Target            |

## Calculation Algorithm

### 1. Recursive Path Traversal

Starting from the target entity, the algorithm walks **upstream** through
ownership edges (`OWNS_SHARES`, `IS_TRUSTEE_OF`, `CONTROLS`) to a maximum
depth of **5 layers**, as recommended by AUSTRAC guidance.

```
FOR each path from target_entity to Person:
    effective_ownership = product of ownership_percentage along path
    normalised by 100^(depth - 1)
```

### 2. Multi-Path Aggregation

When a Person is reachable via multiple ownership paths, their **total
effective ownership** is the **sum** of effective ownership percentages
from all distinct paths.

Example:
- Path A: Alice → Company X (60%) → Target → effective = 60%
- Path B: Alice → Company Y (40%) → Company X (50%) → Target → effective = 20%
- **Alice's total effective ownership = 80%**

### 3. Trust-Specific Rules

When a Person is a **trustee** of a Trust that owns shares, the trustee
is **deemed** to control the trust's ownership percentage for UBO purposes,
unless a different beneficial owner is explicitly declared.

This is consistent with AUSTRAC's position that trustees have effective
control over trust assets.

### 4. Control Relationships

A `CONTROLS` edge represents non-shareholding control (e.g., veto rights,
management authority). The `ownership_percentage` on a CONTROLS edge
represents the **degree of effective control**, which is treated
equivalently to share ownership for threshold determination.

### 5. Threshold Determination

| Ownership %    | Classification         | Action                                  |
|----------------|------------------------|-----------------------------------------|
| > 25%          | Above threshold        | Identified as beneficial owner          |
| = 25%          | At threshold           | Identified as beneficial owner          |
| < 25%          | Below threshold        | Not a beneficial owner (but recorded)   |

### 6. Confidence Scoring

Each UBO result includes a **confidence score** (0.0–1.0) reflecting:

- **Depth**: Ownership chains deeper than 3 layers reduce confidence
- **Data quality**: Missing registration IDs or country codes reduce confidence
- **Reconciliation**: Discrepancies with KYB provider data reduce confidence

Formula: `confidence = max(0.0, 1.0 - (max_depth × 0.05))`

## Reconciliation with KYB Data

The UBO calculation is reconciled against third-party KYB provider data
(e.g., Kyckr, Creditsafe):

1. **Match**: Person appears in both graph and KYB data → compare percentages
2. **Graph-only**: Person found in graph but not KYB → flag for review
3. **KYB-only**: Person found in KYB but not graph → flag for graph update

**Discrepancy threshold**: If ownership percentages differ by more than 5%,
the entry is flagged for manual review.

## Audit Trail

Every UBO calculation produces an immutable audit entry containing:

- Entity ID and query parameters
- Result hash (SHA-256) for integrity verification
- Number of beneficial owners identified
- Maximum depth traversed
- Threshold percentage applied
- Calculation time
- Whether the result was served from cache

Audit entries are streamed to CloudWatch Logs and Splunk via the
monitoring handlers established in Sprint 2.

## Data Residency

All graph data and UBO calculation results are stored within the
**ap-southeast-2 (Sydney)** region. Neo4j runs on EKS within the
private VPC, with encryption at rest (KMS) and in transit (TLS).
Redis (ElastiCache) also operates within the private VPC with
encryption at rest and in transit enabled.

## Reasonable Steps Declaration

This methodology constitutes "reasonable steps" as required by
AML/CTF Rules Instrument 2023 because it:

1. Traverses ownership to a depth of 5 layers
2. Aggregates multi-path ownership correctly
3. Applies trust-specific deemed ownership rules
4. Reconciles results against independent KYB data sources
5. Flags discrepancies for manual review
6. Maintains a complete audit trail
7. Stores all data within Australian jurisdiction
