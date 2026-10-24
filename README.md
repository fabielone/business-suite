# Business Suite — working name

One modular application for small business operations: optional CRM, Work, Resources and Money. A business enables what it needs; each person sees and can act on only what their permissions allow. The intended product replaces the separate CRM and CocinaCostos projects. **This repository is the first local foundation, not yet a replacement ready for business data.**

## Requirements and agent entry point

Read [AGENTS.md](AGENTS.md), [initial implementation contract](docs/implementation-contract.md), and the [interview evidence snapshot](docs/interview-snapshot.json).

Canonical product specifications are in the iCloud Obsidian vault:

`/Users/fabiel/Library/Mobile Documents/iCloud~md~obsidian/Documents/obnotes/business-suite/business-suite hub.md`

Current work is recorded as `NOTE-007 Start Business Suite requirements and foundation`. Requirements distinguish user-confirmed behavior, engineering defaults and open decisions. Snapshot status describes the interview at capture time, not current implementation progress. For handoff from another computer, read the [portable requirements snapshot](docs/requirements/README.md), [implemented source map](docs/source-map.md) and [verification record](docs/verification.md).

## Local demo

Node 22.12+ and npm are required. Node 22 LTS is the recommended project baseline; the current development computer uses Node 25.5.

```sh
npm ci
npm run demo
```

Open `http://127.0.0.1:5178`. This command deliberately starts an isolated demo API on `127.0.0.1:4310` with ephemeral embedded PostgreSQL and fictional users. It requires neither Docker nor real account credentials. Data resets when the API stops. Switch Manager/Worker to inspect permissions. Never enter real customer, receipt or financial data in the demo.

Production builds do not silently enable this identity switch. The real API requires authentication configuration and PostgreSQL; live sign-in, account provisioning and receipt storage are still separate implementation work.

## Check the foundation

```sh
npm run check
npm test
npm run build
npm run build:demo
npx playwright install chromium
npm run test:e2e
```

Actual results: **11 backend scenarios and 8 connected browser flows passed**, along with type checks and builds. See [verification](docs/verification.md) for exact scope and remaining work. Embedded PostgreSQL tests are not proof of deployment or multi-connection PostgreSQL concurrency. No remote repository, production deployment or old-data migration is part of this initial task.

## Code map

- `apps/web`: responsive React + Vite web application.
- `apps/api`: Fastify command/query API, authentication, demo bootstrap and tests.
- `packages/core`: shared domain and permissions.
- `db/migrations`: PostgreSQL schema.
- `docs`: implementation contracts, interview provenance, operational instructions and handoff.
- `tests/e2e`: browser checks for the connected local demo.

This is a modular monolith: one product, one business database boundary, internal module ownership. Clients call authorized APIs; they never receive database credentials. Future native clients can use the same APIs.

## Preview

These screenshots contain fictional local-demo data.

![Desktop local demo](docs/preview/desktop.png)

[Phone overview](docs/preview/phone-overview.png) · [Phone expense form](docs/preview/phone-expense.png)

## Scope still to build

The full product includes receipts, customer deposits/partial payments and balances, grouped/partial worker reimbursements, quotes, job/visit management, timer/manual hours, trips, allocations, lightweight CRM, private attachments and professional-service integrations. Early slices do not remove any of those requirements. See the requirements and development queue for dependencies, open questions and migration gates.

User intent is open source. The exact software license and public product name have not been selected; this private local repository is not yet a licensed public release. `private: true` prevents accidental npm publication.
