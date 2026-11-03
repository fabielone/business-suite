---
tags: [business-suite, requirements, crm, workflow, glossary]
updated: 2026-11-03
---
# Business Suite CRM workflow and terminology

← [business-suite hub](<business-suite hub.md>) · [business-suite modules and workflows](<business-suite modules and workflows.md>) · [business-suite open decisions](<business-suite open decisions.md>) · [business-suite permissions](<business-suite permissions.md>)

**Authority:** human direction in a planning conversation on 2026-11-03 (source `H-CRM-20261103`, recorded under NOTE-014 (Obsidian reference)). The human stated that decisions made in that conversation control. Where this note conflicts with older Business Suite notes or the NOTE-013 implementation, this note wins; older text remains as dated history. Items marked **Proposed** were offered in that conversation and not rejected, but were not explicitly confirmed. Nothing here is implemented until the code and tests show it.

## Purpose
The product (working name Zut CRM / Business Suite) combines CRM and ERP in one application. It serves the manager, sales, marketing and production. It has an opinionated workflow that can be shared across workspaces. Insignia (signage) is the first workflow being defined. Terms must be general enough to reuse for other businesses and workers.

## Confirmed decisions — H-CRM-20261103
| ID | Decision |
|---|---|
| CRM-T-01 | **Deal** (sales) and **Order** (production) are separate records, not one record that changes meaning. |
| CRM-T-02 | **Project** is the shared container. Each role sees it differently: sales/marketing see the **sales pipeline**; workers see the **project timeline**. |
| CRM-T-03 | A worker sees a Project only after it has an Order. |
| CRM-T-04 | A Task can be completed only by its assignee or that assignee's team lead. |
| CRM-T-05 | Workers never see the selling price (agreed price, quote amounts, estimated value). |
| CRM-T-06 | The worker view is a timeline (dated stages/jobs), not a sales board. |
| CRM-T-07 | Receiving the deposit is the normal way an Order is released into production, but it is not strictly required. Other documented means of release must exist, depending on the project. |
| CRM-T-08 | "Qualified" on a Person means whether that person is a **decision maker**. It is a Person attribute. |
| CRM-T-09 | Automations follow the shapes **When _ then _** and **When _ wait _ then _**. |
| CRM-T-10 | The workflow is opinionated and shareable across workspaces; Insignia is the first. |

## Glossary
English is the code/canonical term; Spanish is the proposed UI term for Insignia (UI language remains BS-DEC-024).

| Term | Spanish | Meaning | Not |
|---|---|---|---|
| Person | Persona | An individual the business deals with | Not a user account |
| Company | Empresa | An organization | — |
| Decision maker | Toma decisiones | Person attribute: Yes / No / Unknown (Proposed three values; Unknown is the default) | Not a deal stage |
| Project | Proyecto | Shared container: name, company, people, site address, files, activity | Not a task; not itself a sale or an order |
| Deal | Oportunidad | Sales-phase record inside a Project | Not an agreed commitment |
| Quote | Cotización | Formal priced offer with revisions | Not agreed until accepted |
| Order | Pedido | Accepted scope and agreed price | Not a payment; not a job |
| Job | Trabajo | Executable production work (survey, design, fabrication, installation) with dates and assignees | Not the order |
| Task | Tarea | To-do with one assignee, due date and status | — |
| Activity | Actividad | Append-only timeline entry: note, call, stage change, automation event | Notes are not overwritten |
| Stage | Etapa | A column/step on a board or timeline | — |
| Source | Origen | Where the contact/deal came from (marketing) | — |
| Estimated value | Valor estimado | Salesperson's expected deal size | Not a price |
| Agreed price | Precio acordado | Price on the Order, copied from the accepted quote revision | Never recalculated from costs |
| Deposit | Anticipo | Actual money received before production | Not inferred from a stage or method |
| Payment | Pago | Actual money received or paid | — |
| Workflow template | Plantilla de flujo | Shareable bundle of stages, stage checklists and automations | Not a generic workflow engine |

"Lead" is not a separate record type (Proposed): a lead is a Person or Deal in an early stage, so there is no "convert lead" step.

## Record structure
```
Project
 ├─ Deal (0..1, Proposed cardinality)     sales stages, estimated value, quotes
 └─ Order (0..n)                           agreed price, payment status, release basis
     └─ Job (1..n)                         dates, assignees, production stage
         └─ Task (0..n)                    assignee, due date
```
- A Deal can end Lost without an Order.
- An Order can exist without a Deal (repeat or walk-in customer).
- Creating an Order is an explicit human action ("Create order"), prefilled from the accepted quote. Winning a Deal never creates an Order automatically (consistent with [business-suite modules and workflows](<business-suite modules and workflows.md#quotes-and-customer-commitments>)).

## People
Confirmed fields: full name, phone (country code + number), email, company (select existing or create inline), position, decision maker, activity/notes history, linked Projects.
Proposed additions: first/last name for sorting, several labeled phones (mobile, office, WhatsApp) stored in a normalized international format, relationship status (Prospect / Customer / Supplier / Inactive), Source.

## Company
Confirmed fields: name, address, phone (own, or the contact's), email, contact person, notes history.
Proposed: contact person is a link to a primary Person, not copied text; if the company has no phone, show the primary person's phone without copying it. Companies show linked Projects and the same activity timeline.

## Role views
| Logged in as | Default view | Sees |
|---|---|---|
| Sales / marketing | Sales pipeline: Project cards by Deal stage | People, decision maker, source, estimated value, quotes, follow-ups |
| Worker | Project timeline: their Jobs and Tasks by date | Only Projects that have an Order; what/where/when, design files, checklist; no price |
| Team lead | Team's project timeline | Can complete their team's tasks; price visibility follows grants |
| Manager | Both views plus Money | Everything permitted, including price, deposit, cost and margin |

The role view only chooses the default screen. Visibility rules CRM-T-03 and CRM-T-05 must be enforced by the backend (record and field scope), per [business-suite permissions](<business-suite permissions.md>). Hiding a field in the UI is not enough.

## Insignia stages (Proposed initial template)
**Deal:** New → Contacted → Interested → Site visit → Quote sent → Negotiation → Won | Lost. Lost requires a lost reason. The stage is called "Interested", not "Qualified", because "qualified" now means decision maker (CRM-T-08). A Deal can warn when none of its people is a decision maker.

**Order / production:** Awaiting release → Design → Design approved → Fabrication → Installation → Delivered → Closed. Payment status (Unpaid / Deposit paid / Paid) is a separate badge, not a column; Delivered or Closed never means paid.

## Release into production
An Order moves from Awaiting release into production when it has a recorded **release basis** (CRM-T-07):
- **Deposit received:** a recorded payment, entered by an authorized person.
- **Other means (Proposed list):** manager release with a written reason (for example agreed credit terms, a trusted repeat customer, an internal job, or a deposit waived). Who may release without a deposit is a grant, not open to every user.

The release basis and actor are kept in the activity history. A release without a deposit does not create or imply a payment.

## Tasks
- Each Task has exactly one assignee (Proposed) and links to a Project, Job, Person or Company.
- Only the assignee or the assignee's team lead can complete it (CRM-T-04). Whether a manager can also complete or override is not yet decided.
- Stages can define a checklist of required tasks. When all are complete, the card suggests moving to the next stage; a workspace may switch this to an automatic move (Proposed).

## Automations
Structure: **When** (trigger) → optional **If** (condition) → optional **Wait** → **Then** (action). The When/then and When/wait/then shapes are confirmed; the If step and the lists below are Proposed.
- Triggers: stage changed, task completed, all stage tasks done, quote sent, date reached, no activity for N days.
- Actions: create task, notify someone, move stage, add activity note, prepare a message from a template (sending needs a person).
- Guardrails: automations never record a payment, approve an expense, change a price, create an Order or release an Order into production. Triggers and actions come from a fixed list, not a general workflow engine (repository AGENTS.md).

Insignia examples: when a quote is sent, wait 3 days, then if there is no reply create a follow-up task for the owner. When an Order reaches Fabrication, create shop tasks and notify the shop. When all Installation tasks are done, move to Delivered and notify the manager.

## Workflow templates
A workflow template bundles Deal stages, Order stages, stage checklists and automations. "Insignia – Signage" is the first. Other workspaces copy and adapt it. Core record types (Person, Company, Project, Deal, Quote, Order, Job, Task) stay the same in every workspace; only stage names, checklists and automations change (Proposed).

## Still open
- UI language default for Insignia (Spanish-first?) — BS-DEC-024.
- Can a manager complete or override any task? (BS-DEC-032)
- Exact list of non-deposit release reasons and who may use them. (BS-DEC-033)
- Worker timeline granularity: one row per Order with Job progress, or one row per Job. (BS-DEC-034)
- Can one Project hold more than one Deal?
- Price visibility for team leads.

## Relation to the NOTE-013 implementation
Checked 2026-11-03 in `packages/core/src/operations`. NOTE-013 code uses the word "project" for a different thing: `deal.convert` moves a deal to the won stage and creates a `projects` row (title, contact, `amountMinor` agreed value, status `planned|active|completed`, one `assigneeId`), labelled "Projects" or "Orders" depending on the workspace template. That row corresponds to this note's **Order/Job**, not to the Project container. The code also has an Insignia `qualified` deal stage, no container above Deal and Order, no release basis, no Job-per-stage records and no assignee/team-lead completion rule. These are implementation gaps against this note, not decisions; a migration must rename or map the existing `projects` rows deliberately.
