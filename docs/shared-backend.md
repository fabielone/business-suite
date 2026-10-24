# Shared Docker backend handoff

## Deployed boundary — 2026-10-24

`NOTE-010` implements the human's request to put Business Suite on the existing Docker server and publish its source to GitHub. The development deployment is on the Mac at `/Users/fabiel/Desktop/backend`, Compose project `lean-backend`. This operator workspace predates Business Suite and contains other apps. The Suite repository owns its [container](container.md), [generator adapter](../ops/lean-backend/README.md) and [scoped deployment script](../ops/deploy_shared.py); private configuration and backups stay on the operator host.

| Component | Current boundary |
| --- | --- |
| PostgreSQL | Existing shared `db` service; independent database `business_suite` |
| Schema owner | `business_suite_owner`; used only by explicit migration/provisioning work |
| API database login | `business_suite_runtime`; direct restricted grants, no owner/bypass rights or role memberships |
| Auth | Independent `business_suite-auth` GoTrue service and per-app signing secret |
| API | `business_suite-business`, Fastify real-mode entry point, local image `business-suite-api:dev` |
| REST | No Suite PostgREST container or gateway route |
| Gateway | Existing Caddy, host loopback `127.0.0.1:8000` |
| Public development access | Existing permanent tunnel and `https://api-dev.fabiel.org`; website and peer routes preserved |
| Clients | Explicit local demo or setup screen; real sign-in/sync not yet implemented |

The shared database container was not restarted during the Suite addition. All 21 prior containers retained their IDs and health; start times were unchanged except for the gateway restart needed to load its additional route. This is development infrastructure and depends on the Mac, Docker and existing tunnel staying available. No VPS move, legacy migration, client cutover or production launch is implied.

## Connection contract

| Use | URL |
| --- | --- |
| API base | `https://api-dev.fabiel.org/apps/business_suite/api/v1` |
| API liveness | `https://api-dev.fabiel.org/apps/business_suite/api/healthz` |
| Auth base / JWT issuer | `https://api-dev.fabiel.org/apps/business_suite/auth/v1` |
| Auth health | `https://api-dev.fabiel.org/apps/business_suite/auth/v1/health` |

API requests use the Suite Auth access token in `Authorization: Bearer …` and an authorized business UUID in `X-Business-Id`. Commands also require `Idempotency-Key`. JWT audience is `authenticated`. A valid auth identity needs a corresponding Suite user, active membership, enabled module and action grant before business access succeeds. Manager/worker demo headers have no effect here. Do not give database credentials or signing secrets to clients.

Configured browser origins are exactly `http://127.0.0.1:5178` and `http://localhost:5178`; redirects are their `/auth/callback` URLs. These are development configuration, not a working login screen or an authorized production frontend. Signup, Google and other external providers remain disabled; SMTP and onboarding are separate work. A phone or another Mac uses the HTTPS endpoint, never this host's localhost. Current clients must first gain real authentication and local-data security before connecting.

## Evidence and open work

Verified for this deployment: the public API health route returned HTTP 200 with `demo:false`; the Suite database/Auth/API were provisioned independently; existing shared PostgreSQL and peer services were preserved. Nine [real PostgreSQL test groups](../tests/postgres/README.md) passed in a separate disposable database, including parallel retries, job/review races, restricted privileges, business/assignment isolation and transaction-local context reset. The disposable database, login and private test environment were removed afterward. That test uses its own signing key and is distinct from a deployed GoTrue login test. Workspace typechecking and 38 unit/API tests also passed, as did five adapter tests and seven deployment-plan tests.

Eight deployed [verification groups](../ops/verify_deployed.py) also passed: real GoTrue password login with two fictional confirmed accounts, explicit memberships/grants, live API permissions and CORS, job/expense commands, replay protection, and persistence after restarting only the Suite API. Both accounts and their synthetic tenant were removed; the suite business tables and Auth users are empty. No email was sent. The verifier briefly restarts only this API and uses transaction-local trigger suppression exclusively for deleting its marked synthetic audit rows; it is an operator tool, never an application endpoint.

A full private post-deployment backup completed at `/Users/fabiel/Desktop/backend/backups/20261024T180224Z`. Its Suite archive restored successfully into a temporary database on the same PostgreSQL cluster; Auth/business table names, RLS flags, migration checksums, row counts and audit trigger matched. The temporary database was removed. This `--no-owner --no-privileges` drill does not prove role/credential recovery on a fresh host or meaningful business-data restoration, because the new Suite contains no real records. Scheduled encrypted off-site backup and full disaster recovery remain open.

See [verification](verification.md) and the canonical `NOTE-010` report for the full evidence. The private [GitHub repository](https://github.com/fabielone/business-suite) has been created; source upload, remote SHA verification and hosted CI results are pending. Public release and license selection remain open.

## Inspect and start existing Suite services

Run these commands on the Docker host, with Docker already running and the shared database healthy. The generated `.local/compose.json` contains secrets; never print or commit its contents.

```sh
docker compose -f /Users/fabiel/Desktop/backend/.local/compose.json ps db business_suite-auth business_suite-business gateway
docker compose -f /Users/fabiel/Desktop/backend/.local/compose.json up -d --wait --no-deps business_suite-auth business_suite-business
curl --fail --silent --show-error https://api-dev.fabiel.org/apps/business_suite/api/healthz
```

This starts the existing configured Suite services without starting/recreating dependencies. It does not repair a stopped database, change configuration or apply migrations. If the shared database is unavailable, inspect that host-wide issue separately. A normal restart using unchanged gateway routes needs no gateway restart.

## Back up before a configuration/schema update

From `/Users/fabiel/Desktop/backend`:

```sh
python3 scripts/backend.py backup
```

This is a backup operation, not a stack update. Record the returned directory and verify its `COMPLETE` marker. It contains configuration secrets, role definitions and per-app database archives; keep it private on the host and arrange encrypted off-site protection separately. The adapter installation's source backup under `.local/operator-backups/` is not a database backup.

The generic host `verify-backup` implementation brings up the shared database before verification. Do not run it casually during a scoped Suite deployment. Rehearse Suite restoration in a separately provisioned recovery database/instance with the required roles and document it. Full fresh-host recovery and scheduled off-site backups require their own procedure.

## Scoped update procedure

Inspect the live baseline and take the completed backup immediately before an update. Review adapter hashes and the image/schema changes; resolve concurrent operator changes before continuing. From this repository, use a unique image tag rather than overwriting the prior rollback image:

```sh
docker build --pull -t business-suite-api:RELEASE_TAG .
python3 ops/lean-backend/test_adapter.py --backend /Users/fabiel/Desktop/backend -v
python3 ops/test_deploy_shared.py -v
python3 ops/lean-backend/install.py --backend /Users/fabiel/Desktop/backend
```

`RELEASE_TAG` is an operator-selected tag. The installer invocation above is a dry-run. Its `--apply` form installs only a reviewed supported adapter revision; unchanged installation is a no-op. Do not bypass a changed-source/hash refusal. Preserve source backups before applying a new adapter revision.

Then pass the **same completed backup and image tag** through the three phases:

```sh
python3 ops/deploy_shared.py configure --backend /Users/fabiel/Desktop/backend --backup /absolute/private/completed-backup --image business-suite-api:RELEASE_TAG
python3 ops/deploy_shared.py database --backend /Users/fabiel/Desktop/backend --backup /absolute/private/completed-backup --image business-suite-api:RELEASE_TAG
python3 ops/deploy_shared.py start --backend /Users/fabiel/Desktop/backend --backup /absolute/private/completed-backup --image business-suite-api:RELEASE_TAG
```

Replace the placeholder backup path and tag. `configure` stages and validates generated files before publication, preserves existing peer/shared definitions and gateway routes, and refuses a changed baseline or concurrent operator edits. `database` provisions only Suite, starts its Auth service, runs checksum-tracked Suite migrations using a temporary private migration environment, and applies explicit runtime grants. It does not seed business accounts or rows. `start` validates Caddy with a fresh mount, starts only the Suite API with `--no-deps`, then restarts the shared gateway so the new route/configuration loads. Plan for that brief shared ingress interruption.

The named `.local/business-suite-before-migrations.dump` is retained from the first schema setup; it is not refreshed on each invocation. The freshly completed full backup supplied for each rollout is the current recovery baseline. Keep both out of Git and iCloud notes.

After deployment, verify health, real auth/API access, denied/cross-business requests, expected CORS, and peer container identities/health. Record the deployed image ID and source commit. Never use bare `backend.py up`, `down`, `add-app`, or `enable-api` as a Suite rollout shortcut. The generic host migration command is not a substitute for Suite's own migration runner.

## Stop or roll back only Suite

If its API is faulty, stop that service while preserving Auth, other applications and database data:

```sh
docker compose -f /Users/fabiel/Desktop/backend/.local/compose.json stop business_suite-business
```

For a code rollback compatible with the current schema, take a fresh baseline backup and repeat the scoped `configure`/`start` phases with the retained previous image tag. Do not run an old image's migrations against a newer schema as an automatic rollback. Schema recovery requires a tested restore into a separate fresh target and a coordinated cutover; do not overwrite the live database or remove volumes to force a restore.

Removing the integration is a separate configuration change: remove only Suite routes/services after reviewing current state. Do not replace the entire current peer configuration with an old snapshot, restore the old generator while leaving Suite configured, or recreate the permanent tunnel. Retain operator secrets and backups according to an agreed recovery policy.

## Repeat the deployed synthetic smoke check

Only an operator with the private backend state can run this. It creates and removes fictional accounts/data and briefly restarts the Suite API; use an appropriate maintenance window once users depend on it.

```sh
python3 ops/verify_deployed.py --backend /Users/fabiel/Desktop/backend --evidence /Users/fabiel/Desktop/backend/.local/business-suite-deployed-verification.json
```

This checks public health through HTTPS but sends authenticated fixture requests through the host's loopback gateway. It does not certify an external browser/mobile login or physical cellular connection. If interrupted, inspect its private evidence and marked synthetic IDs before cleanup; never perform an unscoped delete or disable audit triggers globally.
