---
tags: [business-suite, security, privacy, operations]
updated: 2026-10-23
---
# Business Suite security privacy and operations

← [business-suite hub](<business-suite hub.md>) · [business-suite permissions](<business-suite permissions.md>) · [business-suite quality and verification](<business-suite quality and verification.md>)

This note proposes operational safeguards and records E1 security boundaries. It is not a security audit, legal opinion or evidence of a deployed system. Detailed retention, employee tracking, customer privacy and self-approval policy remain human decisions in [business-suite open decisions](<business-suite open decisions.md>).

## Trust and business isolation
Verify authentication before using the subject. Load active membership and grants from server-controlled data, then enforce business module, action, record and field scopes. A requested business ID is a selector to validate, not authority. The first real API requires explicit context; demo fixture defaults are not a production tenancy policy.

A tenant/business account defines isolation. Legal entity and site add ownership and operational boundaries. A role workspace is only a view. Test list and detail queries, guessed IDs, command relationships, assignments, background jobs, file access, exports and aggregate counts. A denied request must not disclose another business's customer, balance or record existence.

Use restricted runtime database roles and transaction-local scope, and test row-level security where adopted. Owners/superusers and bypass-capable roles can undermine RLS; a written policy is not sufficient. Migration/maintenance credentials must not be exposed to browser code or ordinary workers. No shared portfolio service changes are authorized by this specification.

## Identity sessions and privilege changes
Real mode follows E1 issuer/audience/expiry verification and DB membership/grants. Signing secrets stay server-side. Future invite, account recovery, session revocation, deactivation and multi-business switching require explicit flows and tests. Define how quickly a revoked grant becomes effective and how ongoing jobs or queued commands are handled; do not claim immediate revocation without implementation evidence.

User-supplied role or demo headers cannot grant real privileges. Initial frontend demo mode lacks a production sign-in experience, which must remain visible as a limitation. Avoid embedding access tokens in URLs, logs, analytics, exports or screenshots. Future native tokens belong in platform secure storage, with deliberate local data retention and device-loss handling.

## Sensitive business and personal information
Customer contacts, site addresses, receipts, worker reimbursements, time entries and travel records may contain personal or sensitive operational information. Collect only fields needed for the approved workflow. Proposed field policies protect selling prices, other workers' claims, wages/rates, supplier terms and employee contact details separately from basic job access.

Trip origin/destination and distance are confirmed fields. Continuous GPS, location history, background tracking, biometric attendance and employee surveillance are not authorized requirements. Decide purpose, notice, access and retention before adding them. A note about future payroll integration is not permission to collect national identifiers or bank details in an unprotected prototype.

Use fixtures for development and screenshots. Do not copy production contacts, receipt images or credentials into these notes, source control or demo databases. A future privacy review should identify controller/service roles, notices, processor contracts, access/correction requests and country-specific obligations with qualified support; this note does not assert a legally sufficient policy.

## Receipts files and exports
Real receipt upload is outside E1. Before it launches, define private object storage, allowed types/sizes, scanning/handling, metadata minimization, upload authorization, download authorization, expiry and deletion/retention. Bind evidence to business and parent record; a secret-looking file URL is not an authorization model. Review thumbnails/OCR and temporary upload failure cleanup without exposing another employee's evidence.

Exports need the same record/field checks as screens. Restrict bulk extraction where appropriate, audit actor/scope, and avoid public storage. Include generation time, business and reporting basis so an old file is not mistaken for a current balance. Retention and data-subject requests must account for legal record-preservation obligations; policy requires professional input rather than automatic destructive deletion.

## Runtime and recovery
The initial local demo is loopback-only and ephemeral. It is not a backup, staging environment or durable operational system. PostgreSQL server behavior, concurrent commands, network timeouts, workers and restore procedures need their own verification before a real pilot.

For future deployment, separate development/test/production settings and credentials; configure HTTPS, supported runtimes, dependency maintenance, controlled migration execution, bounded connection pools, request limits and structured logs. Health checks should distinguish API/database/worker availability without exposing secrets. The existing `api-dev.fabiel.org` and unrelated app boundaries remain unchanged unless separately authorized.

Backups need an owner, frequency, retention, off-host protection and measured recovery objectives. A backup job reporting success is not proof of restoration. Restore into an isolated environment; verify memberships, financial allocations, evidence references and pending integration work. Define lost-device/local-disk and VPS failure recovery before storing real business records.

Audit records need actor, business, command/source ID, timestamp and consequential change context. Avoid writing raw tokens, full receipts or unnecessary personal data to logs. Decide retention and access to audit trails; auditability does not justify unlimited employee monitoring.

## Financial and operational abuse cases
Test self-approval denial under E1; unauthorized direct posting; changing payer through request fields; accessing another worker's expense; hiding a personal portion; duplicate reimbursement; reusing an idempotency key with altered amount; stale approval; tenant-crossing job association; price exposure in hidden UI/JSON/export; and demo headers in real mode. When payments later exist, include repeated webhooks, forged confirmation, cash reconciliation and refund allocation.

The chosen legal license, hosted service terms, privacy policy and open-source dependency obligations are unresolved. Do not present this local foundation as compliant, production-ready or independently audited without corresponding evidence.
