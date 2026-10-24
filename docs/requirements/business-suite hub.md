---
tags: [hub, business-suite, requirements]
updated: 2026-10-23
---
# Business Suite

**Working name. One custom open-source business application, with modules and screens adapted to each business and each user's privileges.** It is intended eventually to replace CRM and CocinaCostos while adding operational capabilities. The existing applications remain intact until an explicit migration and cutover.

The current operation does not need a sales pipeline. CRM is optional. Jobs, receipts, expenses, income, amounts due, assignments and trips all remain important product requirements; the small initial implementation is sequencing, not cancellation of the rest. The first test group is approximately five people, not a product limit. The exact first operating workflow remains to be clarified. Earlier human direction also requires quotations, site visits, worker/resource allocation, man-hours and future professional payroll/tax/bookkeeping integrations, aimed at small operators in Mexico with international and larger-business growth later.

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
| Purpose and requirement IDs | [business-suite requirements](<business-suite requirements.md>) |
| Unresolved product policies | [business-suite open decisions](<business-suite open decisions.md>) |
| Work, CRM, resources, trips and time | [business-suite modules and workflows](<business-suite modules and workflows.md>) |
| Module/action/record/field access | [business-suite permissions](<business-suite permissions.md>) |
| Business expense, worker balances, customer payments | [business-suite money and reimbursements](<business-suite money and reimbursements.md>) |
| Proposed entities and constraints | [business-suite data model](<business-suite data model.md>) |
| Screens, role flows, errors, responsive and offline behavior | [business-suite screens and flows](<business-suite screens and flows.md>) |
| Initial HTTP contract and future integrations | [business-suite API and integrations](<business-suite API and integrations.md>) |
| Architecture decisions and engineering defaults | [business-suite architecture](<business-suite architecture.md>) |
| Security, personal data and operations | [business-suite security privacy and operations](<business-suite security privacy and operations.md>) |
| Meaningful tests and evidence levels | [business-suite quality and verification](<business-suite quality and verification.md>) |
| Legacy import and authority cutover | [business-suite migration](<business-suite migration.md>) |
| Current slice and future work | [business-suite roadmap](<business-suite roadmap.md>) |
| Source inventory and agent instructions | [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>) |

## Active task and repository
Canonical execution task: NOTE-007 (Obsidian reference). Its acceptance criteria and execution checklist are authoritative; these notes do not duplicate task checkboxes.

Repository: [Desktop business-suite](/Users/fabiel/Desktop/business-suite). Start with its [AGENTS.md](/Users/fabiel/Desktop/business-suite/AGENTS.md), [implementation contract](/Users/fabiel/Desktop/business-suite/docs/implementation-contract.md), and [interview snapshot](/Users/fabiel/Desktop/business-suite/docs/interview-snapshot.json).

**Verified local foundation — 2026-10-23:** 15 linked specification notes, a Desktop Git repository, connected responsive Work/Money demo and backend permissions/persistence foundation. Type checks and builds pass; 11 backend scenarios and 8 browser flows pass. Desktop and phone screenshots were inspected. NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference) records limits and handoff. Real login UX/provider provisioning, receipt storage, remaining modules, PostgreSQL server/concurrency checks and migration/cutover remain unfinished.

## Specification authority
Direct later human decisions supersede older notes. [business-suite requirements](<business-suite requirements.md>) distinguishes confirmed requirements from proposed design and bounded engineering defaults. The interview snapshot is historical evidence; its statement that implementation has not started must not overwrite later dated implementation reports. Research documents explain recommendations but are not blanket product approvals.

No deployment, purchases, remote publication, legacy deletion or data migration follows from a proposed architecture or backlog entry. The current authorized local work is recorded in NOTE-007.
