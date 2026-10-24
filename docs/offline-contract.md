# Offline contract — NOTE-008

This is the developer handoff for the current local prototype. The product direction is offline first with web and native clients. The implemented offline slice supports missing-receipt expense capture and job completion; it does not make the whole suite work offline or provide real sign-in yet.

## Files and ownership boundaries

| File | Responsibility |
|---|---|
| [Shared engine](../packages/offline/src/index.ts) | Local command validation, capture, refresh, retry, conflict and lock behavior |
| [Engine tests](../packages/offline/test/offline.test.ts) | Durable serialization, uncertain delivery, account isolation, version conflicts and concurrent updates |
| [Web adapter](../apps/web/src/offline.ts) | IndexedDB transactions and per-identity storage namespace |
| [Web transport](../apps/web/src/api.ts) | HTTP requests and typed error status/code; demo session header |
| [Web UI](../apps/web/src/App.tsx) | Cached workspace, pending entries, explicit sync/reset and local-save wording |
| [Offline shell generator](../apps/web/offline-shell.ts) | Build-specific static-asset cache; no business-response cache |
| [Native adapter](../apps/mobile/src/sqliteStore.ts) | SQLite transaction and durability boundary |
| [Native client](../apps/mobile/src/client.ts) | Explicit simulator/emulator mode, loopback API and identity namespace |
| [Native UI](../apps/mobile/src/App.tsx) | Work, Money and Sync views; foreground/network/manual synchronization |
| [API](../apps/api/src/app.ts) | Authentication mode, demo epoch, server authorization and command dispatch |

The engine has no browser or React Native storage dependency. Both clients implement the same LocalStore and Transport interfaces. Shared TypeScript DTOs are in [core](../packages/core/src/index.ts); server rules remain authoritative.

## State that is persisted

LocalState has schemaVersion 1, owner, snapshot, commands, blockedReason and lastSyncAt.

- **owner:** businessId and userId. It survives removal of cached records, so retained financial entries cannot become another account's queue. Empty state starts with no owner. The engine can infer an older state's owner from its snapshot, but refuses ownerless pending work.
- **snapshot:** the last downloaded workspace, permitted jobs, permitted expenses and fetchedAt. This is confirmed server information. Pending work is never inserted into it as if the server had accepted it.
- **commands:** local intent records with stable ID, kind, path, body, creation time, status and optional error message. The ID is the API idempotency key; no new key is generated just because a response was lost.
- **blockedReason:** prevents further capture/replay after access denial or a changed ephemeral demo session. Locking clears the snapshot while retaining the original owner and queued work.
- **lastSyncAt:** records successful command acknowledgement persistence; fetchedAt records the snapshot download separately.

Unsupported schema versions are rejected without overwriting the saved state. Local ownership and schema checks also run inside capture, discard, snapshot replacement and acknowledgement transactions. There is no general local-schema migration runner yet. Add an explicit versioned migration before changing persisted data incompatibly; do not treat a cast to a TypeScript interface as validation.

Persisted queue data is validated again before replay: command UUIDs must be unique; kind, route, status, timestamp and body must match the supported intent. An expense can target only /expenses with allowed expense fields; completion can target only /jobs/:UUID/close with an integer version. Unsupported endpoints, spoofed payer fields, malformed amounts and invalid versions receive LOCAL_FORMAT locally before transport. The engine preserves malformed storage for repair instead of silently dropping or rewriting it. A local database is not a trusted authorization source: valid-looking tampering still encounters server authorization, validation and the idempotency payload check.

## What can be done offline

| Intent | Local capture requirements | Server confirmation |
|---|---|---|
| expense.submit | Cached matching identity; Money enabled; submission privilege; positive integer MXN minor units; description and missing-receipt reason. A linked job must already exist in the permitted snapshot. | POST /v1/expenses; payer comes from authenticated identity; result is submitted for review, never approved or paid automatically |
| job.close | Cached matching identity; Work enabled; completion privilege; known unfinished job and its cached version | POST /v1/jobs/:id/close with the captured version; server rechecks assignment/scope, permission and transition |

Capture first commits the command to local storage. Only after that commit may the UI say it is saved on the device. Synchronization is a separate action. A duplicate local completion intent for the same job reuses the pending entry.

Job creation and expense approval/rejection remain online-only web actions. The native starter exposes the two supported capture intents and permitted records; it does not add an offline approval path. Real receipts, attachments, payments, reimbursements, quotes, time, trips, Resources and CRM are not implemented by this queue.

For a linked expense, cached job visibility is only an early usability check. It does not prove the actor still has access when the command reaches the server. Server membership, enabled module, privilege, scope and version checks apply on every request.

## Storage adapter contract

LocalStore.read returns the persisted state. LocalStore.update receives a synchronous transformation of the latest state and resolves only after its atomic commit. The callback must do no network work. Concurrent writers must serialize even if they are separate client instances.

The web adapter opens IndexedDB business-suite-demo-v1, version 1, and the workspaces object store. Its key includes browser origin, explicit demo mode, business and demo identity. Each update reads, transforms and writes in one readwrite transaction and resolves on transaction completion. It must not read first in one transaction and overwrite later in a second transaction. Storage failures keep the form open; no in-memory success substitute is permitted.

The native adapter uses a separate SQLite file per loopback endpoint/business/user namespace. It enables WAL, synchronous FULL and a busy timeout. It serializes operations in its JavaScript instance and uses an exclusive SQLite transaction, taking a writer lock before reading the row being changed. The row stores the serialized LocalState. The promise resolves after SQLite commits. Invalid JSON or an unsupported schema produces an explicit error instead of a fresh empty database.

These adapters are durable local storage, not encrypted record vaults. Browser clearing/eviction, app removal, device access, device loss, production retention and secure local-data handling need their own operational design. Never put real business data into this fictional demo.

## Synchronization and uncertain delivery

1. Read and validate the saved state and owner.
2. Fetch /workspace and verify the expected business/user and explicit demo mode/session. Download only the collections allowed by the returned module/action grants.
3. Replace the confirmed snapshot in an atomic update while preserving queued entries.
4. Replay queued entries with their original body, version and idempotency key, plus the demo epoch.
5. Commit the returned server projection and removal of that queue entry in one local transaction.

Within one OfflineClient, concurrent sync calls share the same running promise. Separate tabs or clients may still send the same command concurrently; server idempotency is the duplicate-write protection. A queue item is removed by its ID from the latest stored state, so acknowledging one item does not replace the entire command array or erase work captured during the request.

The engine rereads and validates current state before each send, using the current queued entry by ID. It validates again inside acknowledgement/error updates. A late acknowledgement is ignored if the entry was already removed, the snapshot was cleared or the local state was blocked; an epoch mismatch blocks replay instead of inserting a response into a different demo session. Reset cannot cancel a request already committed or in flight at the server: a later normal refresh can show that server record.

| Outcome | Required treatment |
|---|---|
| Network failure, timeout, 408, 429 or server 5xx | Keep the command queued with its original key. Delivery may already have succeeded. Retry later. |
| Server success but local acknowledgement commit fails | Keep the durable command and retry the same key; the API returns its existing result. |
| 409 version/state conflict | Retain original intent as conflict. Do not replace its version and automatically resend. Review the current record and deliberately create a corrected action if appropriate. |
| Other nonretryable client rejection, such as 400 or 404 | Retain a rejected entry and explanation; independent queued work can continue. |
| 401 or 403 | Clear cached records, retain owner/queue, and block further capture/replay. Current demo recovery is explicit reset, not invented authentication. |
| Demo session changed | Block replay and retain pending entries for inspection; an old queue must not apply to newly seeded records with reused fixture IDs. |

discard removes only conflict/rejected entries. It does not remove queued entries because their delivery is uncertain. The UI asks before discarding an unsuccessful attempt. A separate reset is explicitly for fictional demo data and warns that unsynced entries will be lost. This is not a production sign-out, migration or conflict-resolution policy.

## API epoch and authorization boundary

GET /v1/workspace includes demoSessionId only in demo mode. It is a random UUID created once per buildApp instance, stable across requests and both fictional identities. A new API instance gets a new epoch; restarting the explicit demo also resets its PGlite database.

The queue sends X-Demo-Session-Id on every command. A supplied mismatched epoch receives 409 DEMO_SESSION_CHANGED before command execution or idempotency receipt creation. This guards the interval between checking the workspace and posting a command. Direct web demo commands also supply the epoch. Requests omitting the header remain compatible with the initial direct demo API, so every new offline transport must send it.

The demo is bound to 127.0.0.1:4310 and still validates loopback peers, allowed Host values and browser origins. x-demo-user selects only manager or worker in this explicit process. The native starter additionally requires EXPO_PUBLIC_SUITE_MODE=demo and a simulator/emulator; physical devices show setup required. An Android emulator needs a documented local port-reversal setup to reach the host loopback API. Do not enable LAN demo access to make device testing easier.

Real API mode ignores demo identity/session headers, omits demoSessionId, verifies JWT signature/issuer/audience/expiry, and loads permissions from the database. The current shared offline client deliberately refuses a non-demo workspace. Production identity persistence, token renewal, offline access duration, revocation recovery, local encryption and physical-device authenticated development remain separate work. No credentials or bearer tokens are persisted in this prototype's LocalState.

## Browser shell and updates

The production build generates sw.js with a content-derived cache name and a list of static build assets. It precaches those assets, falls back to cached index.html when navigation fails, and serves known assets from its static cache. It ignores non-GET requests, other origins and /api/ requests. Business records live only in the identity-scoped IndexedDB snapshot/outbox, not the service worker cache.

The service worker does not execute queue commands or provide background sync. The app synchronizes while open, including explicit sync and applicable online/focus/foreground events. A browser must complete an online visit and service-worker installation before a built app can reopen offline. Vite development mode is not proof that the built offline shell works.

The worker does not force skipWaiting. A newly installed worker follows the normal activation lifecycle; activation removes older suite-shell caches. Do not add forced client reloads or destructive local migrations without protecting pending work. Test updates with unsynced entries as well as clean installations.

## Evidence and next checks

As of this NOTE-008 handoff, 16 shared-engine tests and 12 API tests pass. The engine tests use JSON round trips and a serialized memory adapter to exercise restart/retry/commit behavior; they do not certify IndexedDB, SQLite or device durability. They cover concurrent captures by two clients, capture during an in-flight acknowledgement, malformed stored routes/bodies, corruption during replay and late responses after a second client resets local state. API tests use PGlite, including restricted-role execution; they do not certify real PostgreSQL concurrent sessions.

The coordinating agent also reported eight connected Chromium flows passing. Built-shell offline browser scenarios are maintained in [tests/offline](../tests/offline/offline.spec.ts); record their actual run separately. Native TypeScript/bundle checks, simulator execution, physical devices, OS termination, SQLite recovery, signing and store delivery are distinct evidence levels. This document does not claim those checks ran.

Targeted commands from repository root after dependency installation:

    npm run build -w @suite/core
    npm run build -w @suite/offline
    npm test -w @suite/offline
    npm test -w @suite/api

Before real-data use, complete authenticated client provisioning, secure local storage and lifecycle policy, a repair/export flow for malformed local data, real database concurrency checks, native persistence checks, and local-schema/update recovery. Keep the exact command allowlist narrow when adding features; online authority does not automatically authorize an offline intent.
