---
tags: [hub, business-suite, requirements]
updated: 2026-11-17
---
# Business Suite

**Working name. One custom open-source, offline-first business application with native multiplatform clients and browser access, and modules adapted to each business and user's privileges.** It is intended eventually to replace CRM and CocinaCostos while adding operational capabilities. The existing applications remain intact until an explicit migration and cutover.

The current operation does not need a sales pipeline. CRM is optional. Jobs, receipts, expenses, income, amounts due, assignments and trips all remain important product requirements; the small initial implementation is sequencing, not cancellation of the rest. The first test group is approximately five people, not a product limit. The exact first operating workflow remains to be clarified. Earlier human direction also requires quotations, site visits, worker/resource allocation, man-hours and future professional payroll/tax/bookkeeping integrations, aimed at small operators in Mexico with international and larger-business growth later.

## Where things stand — 2026-11-17
- **Works today:** the browser operations app with real sign-in on a local Docker backend (people, pipeline, orders, jobs, tasks, teams, automations, money review, time clock, encrypted offline capture), plus a browser-only showcase demo.
- **Not ready:** production hosting, email and password recovery, hosted CI, phone and desktop apps with real sign-in. The full list is [business-suite launch readiness](<business-suite launch readiness.md>).
- **Scope change 2026-11-17:** moving data out of the old CRM and CocinaCostos is no longer required; a general data import is wanted instead.
- **Current task:** NOTE-018 (Obsidian reference).

## How to change anything
1. Put the request in [business-suite change requests](<business-suite change requests.md>).
2. Follow [business-suite change process](<business-suite change process.md>): decision, specification note, task, branch, checks, pull request, record.
3. Look up what already happened in [business-suite change log](<business-suite change log.md>).

## Read in this order
1. [Confirmed requirements and their provenance](<business-suite requirements.md>).
2. [Questions that must remain unanswered until resolved](<business-suite open decisions.md>).
3. [Domain boundaries and state transitions](<business-suite modules and workflows.md>).
4. [Who can do and see what](<business-suite permissions.md>).
5. [Financial rules and reimbursement behavior](<business-suite money and reimbursements.md>).
6. [Delivery sequence and actual evidence status](<business-suite roadmap.md>).

## Specification map
| Area | Canonical note |
|---|---|
| What blocks a production launch | [business-suite launch readiness](<business-suite launch readiness.md>) |
| How to make a change | [business-suite change process](<business-suite change process.md>) |
| Requested interface and workflow changes | [business-suite change requests](<business-suite change requests.md>) |
| Dated history of what was built | [business-suite change log](<business-suite change log.md>) |
| Purpose and requirement IDs | [business-suite requirements](<business-suite requirements.md>) |
| Unresolved product policies | [business-suite open decisions](<business-suite open decisions.md>) |
| Work, CRM, resources, trips and time | [business-suite modules and workflows](<business-suite modules and workflows.md>) |
| CRM/ERP vocabulary, Insignia workflow, role views, automations | [business-suite CRM workflow and terminology](<business-suite CRM workflow and terminology.md>) |
| Module/action/record/field access | [business-suite permissions](<business-suite permissions.md>) |
| Business expense, worker balances, customer payments | [business-suite money and reimbursements](<business-suite money and reimbursements.md>) |
| Proposed entities and constraints | [business-suite data model](<business-suite data model.md>) |
| Screens, role flows and errors | [business-suite screens and flows](<business-suite screens and flows.md>) |
| Offline persistence, synchronization and native platforms | [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) |
| Windows/macOS packaging, local profile, updates and release evidence | [business-suite desktop applications](<business-suite desktop applications.md>) |
| Initial HTTP contract and future integrations | [business-suite API and integrations](<business-suite API and integrations.md>) |
| Deployed Docker backend and operator handoff | [business-suite deployed backend](<business-suite deployed backend.md>) |
| Architecture decisions and engineering defaults | [business-suite architecture](<business-suite architecture.md>) |
| Open-source license, ownership and contributions | [business-suite open source and contributions](<business-suite open source and contributions.md>) |
| Security, personal data and operations | [business-suite security privacy and operations](<business-suite security privacy and operations.md>) |
| Meaningful tests and evidence levels | [business-suite quality and verification](<business-suite quality and verification.md>) |
| Data import; legacy applications (migration not required) | [business-suite migration](<business-suite migration.md>) |
| Current slice and future work | [business-suite roadmap](<business-suite roadmap.md>) |
| Source inventory and agent instructions | [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>) |

## Repository
[Desktop business-suite](/Users/fabiel/Desktop/business-suite), public at [fabielone/business-suite](https://github.com/fabielone/business-suite). Start with its [AGENTS.md](/Users/fabiel/Desktop/business-suite/AGENTS.md), [implementation contract](/Users/fabiel/Desktop/business-suite/docs/implementation-contract.md) and [verification record](/Users/fabiel/Desktop/business-suite/docs/verification.md). `docs/requirements` in the repository is an export of this folder.

## Specification authority
Direct later human decisions supersede older notes. [business-suite requirements](<business-suite requirements.md>) distinguishes confirmed requirements from proposed design and bounded engineering defaults. The interview snapshot is historical evidence; its statement that implementation has not started must not overwrite later dated implementation reports. Research documents explain recommendations but are not blanket product approvals.

No deployment, purchases, remote publication, legacy deletion or data migration follows from a proposed architecture or backlog entry. NOTE-010 records the authorized development deployment and initial private upload; NOTE-011 separately authorizes public source release and licensing. NOTE-007/008/009 preserve historical foundation evidence.

