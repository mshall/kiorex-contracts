# Org onboarding import (DRAFT, additive, Kiorex → Kiorly Clinic)

Status: **draft**, not in the OpenAPI document and not published; the Clinic receiver is not built. Source of truth for the Kiorex side: `kiorex-platform/Docs/ORG_ONBOARDING_IMPORT.md`.

HMAC-signed like every Kiorex → Kiorly call (KX-09 §02).

## POST /marketplace/v1/imports/{batchId}/records
```json
{ "orgId": "string (Clinic organization id)", "entity": "patients|appointments|visits|billing|documents",
  "items": [{ "idempotencyKey": "imp:<batchId>:<entity>:<sourceKey>", "sourceKey": "string",
              "data": { "...entity fields; child entities carry patientTargetId": "..." },
              "file": { "name": "string", "contentBase64": "string" } }] }
```
`200 { "results": [{ "sourceKey": "string", "targetId": "string" }] }`. Idempotent per `idempotencyKey` (replay returns the same targetId). Chunked by the caller (patients 100, appointments/visits/billing 200, documents 5). Failure of one item fails the chunk; the caller re-sends it.

Canonical `data`: patients `{ fullName, firstName, lastName, phone (+E.164), dob (YYYY-MM-DD)?, gender (MALE|FEMALE|null), email?, nationalId? }`; appointments `{ patientTargetId, startsAt, status?, doctor?, notes? }`; visits `{ patientTargetId, visitedAt, chiefComplaint?, diagnosis?, plan?, doctor? }`; billing `{ patientTargetId, issuedAt, amountMinor, paidMinor, currency }`; documents `{ patientTargetId, fileName, via }` + `file`.

## POST /marketplace/v1/imports/{batchId}/rollback
`{ "orgId": "string" }` → `{ "removed": number }`. Removes every row the batch created (tagged `importBatchId`), including stored files.

Clinic obligations: tenant isolation by `orgId`; MRN allocation and de-duplication against existing patients on the Clinic side; audit entry per chunk; no PHI in logs.
