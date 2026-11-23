# Org onboarding import (DRAFT, additive, Kiorex → Kiorly Clinic)

Status: **draft**, not in the OpenAPI document and not published. The Clinic receiver is built (clinics-management, branch `kiorex`: `apps/api/src/marketplace/kiorex-import.*`). Source of truth for the Kiorex side: `kiorex-platform/Docs/ORG_ONBOARDING_IMPORT.md`.

HMAC-signed like every Kiorex → Kiorly call (KX-09 §02). The integration client additionally needs the **`ONBOARDING_IMPORT`** scope (403 `IMPORT_SCOPE_REQUIRED` otherwise); `MARKETPLACE` alone is not enough.

## POST /marketplace/v1/imports/{batchId}/records
```json
{ "orgId": "string (Kiorex-side organization reference)", "orgName": "string (required on the first call for an org)", "orgNameAr": "string?", "entity": "patients|appointments|visits|billing|documents",
  "items": [{ "idempotencyKey": "imp:<batchId>:<entity>:<sourceKey>", "sourceKey": "string",
              "data": { "...entity fields; child entities carry patientTargetId": "..." },
              "file": { "name": "string", "contentBase64": "string" } }] }
```
`200 { "results": [{ "sourceKey": "string", "targetId": "string" }] }`. Idempotent per `idempotencyKey` (replay returns the same targetId). Chunked by the caller (patients 100, appointments/visits/billing 200, documents 5). Failure of one item fails the chunk; the caller re-sends it.

Canonical `data`: patients `{ fullName, firstName, lastName, phone (+E.164), dob (YYYY-MM-DD)?, gender (MALE|FEMALE|null), email?, nationalId? }`; appointments `{ patientTargetId, startsAt, status?, doctor?, notes? }`; visits `{ patientTargetId, visitedAt, chiefComplaint?, diagnosis?, plan?, doctor? }`; billing `{ patientTargetId, issuedAt, amountMinor, paidMinor, currency }`; documents `{ patientTargetId, fileName, via }` + `file`.

## POST /marketplace/v1/imports/{batchId}/rollback
`{ "orgId": "string" }` → `{ "removed": number }`. Removes every row the batch created (tagged `importBatchId`), including stored files.

Clinic behaviour (as built):
- **Organization**: the first chunk for a (client, `orgId`) provisions a Clinic organization (tenant + one clinic + a locked, non-seat "Imported records" user that owns legacy appointments/visits). The receiver never writes into a tenant it did not provision, so a client cannot reach another organization's data through `orgId`.
- **Idempotency / atomicity**: items are keyed by `idempotencyKey` in a ledger; replay returns the stored `targetId`. A chunk is one transaction (plus the files it stored, deleted if it fails). A chunk after rollback answers 409 `BATCH_NOT_OPEN`.
- **Patients**: MRN allocated by the Clinic (`MRN-nnnnn`); de-duplicated against the org's existing patients by national id, else phone + first name (the existing id is returned and is never removed by a rollback).
- **Documents**: PDF/JPEG/PNG/GIF/WebP up to 15 MB, written through the Clinic upload storage adapter (`patients/` namespace, local or S3), listed on the patient's documents. Send at most 2 documents per chunk (request body limit 48 MB on this path).
- **Appointments / visits / billing**: appointments (status default COMPLETED if past), finalized encounters (`visitType: IMPORTED`) and invoices with one line; all point to patients of the same org (422 `PATIENT_NOT_IN_ORG` otherwise).
- **Rollback** deletes what the batch created (children first, then patients) and its stored files; the organization itself is kept. Replay returns `{ "removed": 0 }`.
- **Audit/logs**: `KIOREX_IMPORT_ORG_PROVISIONED`, `KIOREX_IMPORT_CHUNK`, `KIOREX_IMPORT_ROLLBACK` with counts only; no PHI in logs.
