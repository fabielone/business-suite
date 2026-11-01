# Local shared Business Suite — 2026-10-30

This profile uses the private `fabielone/backend` generator and the Suite API/client from this repository. It creates only four containers: PostgreSQL, Suite GoTrue Auth, Suite API with its bundled browser app, and Caddy. It does not connect to or change the Mac mini deployment. The new client uses `/v2`; existing `/v1` data and demo/native clients remain separate.

## Start and stop

With both checkouts beside one another and Docker Desktop running:

```sh
docker build -t business-suite-api:local-operations-20261030 .
python3 -B ops/local_backend.py init --backend ../backend --port 8002 --lan-ip YOUR_PRIVATE_LAN_IPV4
python3 -B ops/local_backend.py up --backend ../backend
python3 -B ops/local_backend.py status --backend ../backend
```

For loopback-only development, omit `--lan-ip`. Initialization never overwrites existing credentials or attaches an unidentified database volume. Only the explicitly private IPv4 address is published for Wi-Fi HTTPS on 8443. The HTTP endpoint is loopback-only on 8002. The selected Docker endpoint must be local; remote daemons are rejected.

Private state is under `backend/.local/suite/` and the path-derived Docker project is `suite-local-<hash>`. Keep this directory and its Docker volumes together on this Mac. Moving Git source does not move accounts, certificates or records. Do not copy the mini’s configuration or start its permanent tunnel on this Mac.

```sh
python3 -B ops/local_backend.py stop --backend ../backend
python3 -B ops/local_backend.py backup --backend ../backend
```

`stop` retains volumes. `up` backs up an existing Suite database before provisioning/migration; private backups include config, role definitions and a database dump. Keep Docker running and the host awake for other devices. No off-site backup or fresh-host disaster recovery is claimed.

## Activate the owner

```sh
python3 -B ops/local_backend.py owner --backend ../backend --email YOUR_EMAIL
python3 -B ops/local_backend.py activate --backend ../backend
```

The first command makes a seven-day one-use invitation and stores its link privately in `.local/suite/owner-activation.json`. It does not send email or choose a password. The second opens that link. Enter a name and a password of at least 12 characters in the browser. Activation creates empty Insignia, Household and Referrals workspaces in MXN, with their corresponding default modules. Household monthly budget starts at zero; set your own amount and participant weights. No fictional financial records are seeded into the account.

Open `http://localhost:8002/apps/business_suite/api/app/` on the host. Other devices use `https://HOST_LAN_IP:8443/apps/business_suite/api/app/`, after trusting the development certificate. Sign in with the same account for the same personal access, or use Settings → Invite member for separate accounts and roles. Share each invitation privately. With the Wi-Fi profile, member invitations use the configured HTTPS Wi-Fi address even when the owner creates them on localhost.

The LAN IP must remain stable (a router DHCP reservation is suitable). If it changes, deliberately update the local profile’s LAN IP and matching origins/redirects, rerender and restart. Never alter the mini profile. Password reset/email delivery is not configured; this is a development/pilot installation.

## HTTPS on Wi-Fi devices

```sh
python3 -B ops/local_backend.py certificate --backend ../backend --certificate-output ./suite-local-root.crt
```

Only the public CA certificate is exported; its private key stays in the local Caddy volume. Transfer this certificate to each intended device and trust it for this installation. Do not distribute the private `.local` directory. Trusting a CA allows certificates signed by that CA; remove it from devices when this local installation is retired.

Follow Apple’s [Mac certificate trust instructions](https://support.apple.com/en-ca/guide/keychain-access/kyca11871/mac) or [iPhone/iPad profile trust instructions](https://support.apple.com/en-gb/102390). Caddy’s [internal TLS documentation](https://caddyserver.com/docs/caddyfile/directives/tls#internal) explains why Docker’s local trust does not automatically extend to other devices. No router port forwarding, public tunnel or internet access is configured.

## Implemented browser workflows

- Insignia: people, configurable opportunity stages, conversion to jobs, agreed values, linked costs, expense review, partial collections, grouped/partial reimbursement records and financial corrections.
- Household: participants/weights, fixed equal or weighted expense shares, monthly contribution targets versus actual contributions, shared-fund and individual balances, settlements, assigned recurring chores. CRM is disabled by default.
- Referrals: candidates, jobs/links, stages, follow-ups, reusable message templates, saved drafts, clipboard, `.eml` download and email-app drafts. No email is sent by Suite.
- Settings: module/plan entitlements, members/roles, invitations/revocation, history, record archiving/restoration, CSV export, validated workspace backups restored as new independent workspaces.
- Browser offline: opt-in encrypted per-email vault, one workspace at a time, separate device passphrase, persisted pending intent, explicit sync/conflict handling. Approval/payment recording requires the server. Protected local state is locked at sign-out; offline grants are last-known and the server rechecks them.

Business expenses cannot be approved by their submitter. Invite a finance/manager reviewer. Financial buttons record money already moved; they do not transfer funds. The budget, receipts, balance views and contribution rules are operational bookkeeping, not payroll/tax filing or a certified accounting ledger.

## Evidence and remaining scope

46 core/offline/API/desktop/mobile unit scenarios and all workspace type checks passed. Nine real local PostgreSQL/GoTrue/API verification groups passed: activation, independent sessions, memberships/isolation, role revocation, financial invariants/replays, household rules, drafts, separate restoration, restart persistence and logout. Two new browser tests passed for the three examples and real account activation/encrypted offline capture/reopen/reconnection. Desktop and phone browser layouts were inspected. HTTPS was verified using the exported CA from this host. A second physical Wi-Fi device still needs its certificate installed and a login test.

The broader release is still in progress: the new flows are browser-delivered; mobile/Electron clients retain their prior demo/setup behavior. Paid subscription collection, SMTP/password recovery, inventory/resource scheduling, richer quotations, visits, hours/trips, payroll/tax integrations and legacy migration are not completed by this local setup. Entitlement configuration does not charge subscriptions. New source is local and uncommitted/unpushed at this checkpoint.

Re-run supported checks deliberately against this local profile only:

```sh
npm test
npm run check
python3 -B ops/verify_local.py --backend ../backend
SUITE_LOCAL_E2E=1 npx playwright test --config playwright.operations.config.ts
```

Integration checks create unique fictional accounts and remove only their records. The operator verifier briefly restarts only Suite API. Avoid running it during active user work. Neither check sends email.
