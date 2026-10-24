# Shared Docker generator adapter

This folder is the repository-owned integration for the existing lean-backend operator workspace. It adds **only `business_suite`** to that generator. It does not start Docker, read operator secrets, provision data, change client connections, publish a service or deploy peer applications.

The reviewed generator baseline is SHA-256 `136e8d675c64d768d263127699e0b498d7d78918b9d3c80860e2e3ab50296f2b`. Other revisions fail closed and need a reviewed adapter update. The original workspace is `/Users/fabiel/Desktop/backend`; the `--backend` argument makes the path explicit on another host.

## Review and installation

From the Business Suite repository:

```sh
python3 ops/lean-backend/test_adapter.py --backend /Users/fabiel/Desktop/backend -v
python3 ops/lean-backend/install.py --backend /Users/fabiel/Desktop/backend
python3 ops/lean-backend/install.py --backend /Users/fabiel/Desktop/backend --apply
```

The second command is a dry-run and only prints source hashes. The third backs up the original generator under the operator's private `.local/operator-backups/suite-generator-<timestamp>-<suffix>/`, installs `scripts/business_suite_config.py`, patches `scripts/backend.py`, and records hashes in `scripts/business_suite_adapter.json`. Reapplying the identical version is a no-op. Changed operator source/helper files cause refusal, not an overwrite. This source backup is **not a database backup**.

The five tests use synthetic config and temporary directories. They compare every preexisting service and gateway route exactly, both without Suite configured and after adding it; assert no Suite REST surface, matching Auth/API identity configuration, restricted service settings and fixed image names; inspect scoped startup calls; and exercise dry-run, backup, idempotent installation and changed-source refusal. They never inspect `.local/config.json` or contact Docker.

## Configuration contract

The operator adds a new app entry to its private config using its usual generated credentials and explicit origins/redirects, plus these fields:

| Field | Required value or purpose |
| --- | --- |
| App key | `business_suite` |
| `business_api` | `business_suite` |
| `runtime_password` | Private runtime credential, 32–256 characters; store only in operator secret state |
| `suite_image` | Tagged local image; default `business-suite-api:dev` |
| `public_url` | Reviewed permanent development origin, currently `https://api-dev.fabiel.org` |
| `auth` | Explicit per-app configuration; initially Google disabled |
| `signup_enabled` | Initially `false`; invitations/onboarding remain separate work |
| `origins` / `redirect_urls` | Exact reviewed web origins/redirects; no wildcard or invented production frontend |

The adapter deliberately accepts only `business-suite-api:<tag>` image names, a fixed service name/port, a fixed database/role and fixed route prefixes. It offers no arbitrary build context, shell command, mounted host path or privileged-service configuration.

Do not use the generic `add-app` / `enable-api` CLI to create Suite: those commands do not have Suite's complete provisioning contract. The scoped operator procedure supplies the explicit configuration before render. Existing apps retain their defaults and command behavior.

## Database and identity boundaries

The existing generator creates independent Suite GoTrue Auth and its database. The operator separately applies Suite migrations using a schema administrator, then creates/grants the restricted `business_suite_runtime` login following [database instructions](../../db/README.md). The runtime password is never given to clients. It must have no ownership, superuser status, `BYPASSRLS`, role memberships or peer database connection privileges.

The generated `business_suite-business` service uses that dedicated runtime login, not the legacy `business_suite_api` PostgREST authenticator. No `business_suite-rest` container or REST route is generated. Legacy provisioning may still create unused app REST roles; they receive no Suite table privileges and are not an alternative data API.

The API and GoTrue use the same per-app issuer, audience and private signing secret. Auth users still need separately provisioned Suite identities, memberships, enabled modules and action grants. This adapter does not enable client login, seed a real business or grant users access.

## Service and routing

The API image is built separately. Generated service settings: non-root UID/GID `1000:1000`, read-only root filesystem, bounded temporary directory, all capabilities dropped, `no-new-privileges`, memory/CPU/process limits, no published host ports, and private `database` plus `edge` networks. Health probes call internal port 4310 `/healthz`. This health route reports the process; deployed database/auth checks are separate evidence.

| Gateway path | API path |
| --- | --- |
| `/apps/business_suite/auth/v1/*` | Existing GoTrue adapter |
| `/apps/business_suite/api/healthz` | `/healthz` |
| `/apps/business_suite/api/v1/workspace` | `/v1/workspace` |
| `/apps/business_suite/api/v1/jobs` | `/v1/jobs` |
| `/apps/business_suite/rest/v1/*` | No route; 404 |

Caddy strips `/apps/business_suite/api` while preserving `/v1`. Gateway CORS includes `x-business-id` and `idempotency-key`. Upstream CORS headers are removed before the gateway writes its single exact-origin response; the API independently rejects disallowed `Origin` values. Public/local authenticated requests must verify this behavior after deployment.

## Operator sequencing and rollback

Use the coordinated deployment procedure: inspect/backup the live baseline; apply this reviewed adapter; add only Suite config; render and validate; provision/start Suite Auth; apply Suite migrations and runtime grants; start Suite API with `--no-deps`; validate the generated gateway using a fresh mount; restart the gateway; verify peer health/container identities and authenticated Suite behavior. `backend.py up business_suite` supports the scoped start after the required Suite database setup. **Do not use bare `backend.py up`**, which recreates peer Auth containers.

On failure, stop or fix only the new Suite service; retain data and the previous configuration backup. Restoring the old generator alone while Suite remains configured is invalid. To undo the integration, first coordinate removal of only Suite's gateway/service configuration, then restore the recorded source backup and remove the matching adapter helper/manifest. Do not replace current peer config from an old full snapshot, delete database volumes or restore into an occupied database. Backups, provisioning and live verification remain operator responsibilities, outside this installer.
