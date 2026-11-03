---
tags: [business-suite, requirements, crm, workflow, glossary]
updated: 2026-11-03
---
# Business Suite CRM workflow and terminology

← [business-suite hub](<business-suite hub.md>) · [business-suite modules and workflows](<business-suite modules and workflows.md>) · [business-suite open decisions](<business-suite open decisions.md>) · [business-suite permissions](<business-suite permissions.md>)

**Authority:** human direction in a planning conversation on 2026-11-03 (source `H-CRM-20261103`, recorded under NOTE-014 (Obsidian reference)). The human stated that decisions made in that conversation control. Where this note conflicts with older Business Suite notes or the NOTE-013 implementation, this note wins; older text remains as dated history. Later answers in the same conversation replace earlier ones; the second round of answers replaced the earlier "Project is a container above Deal" model, a third round settled release reasons, several Orders per Project and assignment-based visibility, and a fourth answer settled that the card marker groups the pieces of one Order. Items marked **Proposed** were offered and not rejected, but were not explicitly confirmed. Nothing here is implemented until the code and tests show it.

## Purpose
The product (working name Zut CRM / Business Suite) combines CRM and ERP in one application. It serves the manager, sales, marketing and production. It has an opinionated workflow that can be shared across workspaces. Insignia (signage) is the first workflow being defined. Terms must be general enough to reuse for other businesses and workers.

## Confirmed decisions — H-CRM-20261103
| ID | Decision |
|---|---|
| CRM-T-01 | The sales record and the production record are separate: a **Project** (sales) and an **Order** (production). |
| CRM-T-02 | **Project and deal are the same thing.** A Project is the item on the sales pipeline. There is no extra container above it. |
| CRM-T-03 | One Person or Company can have many Projects. |
| CRM-T-04 | Sales/marketing see the sales pipeline of Projects. Production sees Order / Job cards on a timeline. |
| CRM-T-05 | Production (workers and team leads) sees work only once an Order exists. |
| CRM-T-06 | Production never sees prices: agreed price, quote amounts, estimated value, payments. |
| CRM-T-07 | A Task can be completed by its assignee, the assignee's team lead, or a manager. |
| CRM-T-08 | Receiving the deposit normally releases an Order into production. A manager can also release an Order without a deposit, and must give a reason. |
| CRM-T-09 | "Qualified" on a Person means whether that person is a **decision maker**. It is a Person attribute. |
| CRM-T-10 | Automations follow the shapes **When _ then _** and **When _ wait _ then _**. |
| CRM-T-11 | UI is English by default with a Spanish toggle. |
| CRM-T-12 | Production cards show the **Order / Job** together. |
| CRM-T-13 | The workflow is opinionated and shareable across workspaces; Insignia is the first. |
| CRM-T-14 | One Project can lead to several Orders. |
| CRM-T-15 | When an Order's work is split between team members, each piece is its own "Order / Job" card, and a shared visual marker shows the pieces belong to the same Order. Each team member sees only the pieces assigned to them. |
| CRM-T-16 | The manager assigns team members, and can set automations that decide what each team member sees (by assigning work to them). |

## Glossary
English is the default UI and code term; Spanish is the toggle label.

| Term | Spanish | Meaning | Not |
|---|---|---|---|
| Person | Persona | An individual the business deals with | Not a user account |
| Company | Empresa | An organization | — |
| Decision maker | Toma decisiones | Person attribute: Yes / No / Unknown (Proposed three values; Unknown is the default) | Not a pipeline stage |
| Project | Proyecto | The sales record on the pipeline (a deal). Belongs to a Company and/or Person | Not an agreed commitment; not production work |
| Quote | Cotización | Formal priced offer for a Project, with revisions | Not agreed until accepted |
| Order | Pedido | What the customer agreed to: scope, agreed price, payment status, release into production | Not a payment; not the work itself |
| Job | Trabajo | One piece of production work done to fulfil an Order (for example design, fabrication, installation), with dates and assignees | Not the commercial agreement |
| Task | Tarea | To-do with one assignee, due date and status | — |
| Activity | Actividad | Append-only timeline entry: note, call, stage change, automation event | Notes are not overwritten |
| Stage | Etapa | A column/step on the pipeline or the production timeline | — |
| Source | Origen | Where the contact/Project came from (marketing) | — |
| Estimated value | Valor estimado | Salesperson's expected Project size | Not a price |
| Agreed price | Precio acordado | Price on the Order, copied from the accepted quote revision | Never recalculated from costs |
| Deposit | Anticipo | Actual money received before production | Not inferred from a stage or method |
| Payment | Pago | Actual money received or paid | — |
| Workflow template | Plantilla de flujo | Shareable bundle of stages, stage checklists and automations | Not a generic workflow engine |

"Deal" and "opportunity" are aliases for Project in older notes and in code; the UI term is Project. "Lead" is not a separate record type (Proposed): a lead is a Person or Project in an early stage.

## Order versus Job
- **Order** answers *what did the customer agree to, for how much, and has it been released and paid?* It belongs to the manager and Money. One Order per accepted quote.
- **Job** answers *what work must be done, by whom, and when?* It belongs to production. One Order can need several Jobs (for example design, fabrication, installation by different people on different days); a simple Order may have only one.
- Keeping them apart lets production see and complete Jobs without seeing the price, and lets the Order stay correct when a Job is redone or rescheduled.

The production card shows both, e.g. **"Order 0123 / Fabrication"** (CRM-T-12). When an Order's work is split between team members, each piece (Job) is its own card, and all pieces of one Order carry the same marker, for example the same colour and the Order number (CRM-T-15). Example: the shop sees "Order 0123 / Fabrication" and the installers see "Order 0123 / Installation"; each sees only their own card, with the shared marker telling them it is part of Order 0123. The manager sees all pieces of the Order together. An Order that is not split shows as one card.

## Record structure
```
Company / Person
 └─ Project (0..n)        sales stages, estimated value, quotes
     └─ Order (0..n)      agreed price, payment status, release
         └─ Job (1..n)    production stage, dates, assignees
             └─ Task (0..n)
```
- A Project can end Lost without an Order.
- One Project can lead to several Orders (CRM-T-14), for example phases or separate signs ordered at different times.
- An Order can exist without a Project (repeat or walk-in customer) (Proposed, from the earlier round).
- Creating an Order is an explicit human action ("Create order"), prefilled from the accepted quote. Winning a Project never creates an Order automatically (consistent with [business-suite modules and workflows](<business-suite modules and workflows.md#quotes-and-customer-commitments>)).

## People
Confirmed fields: full name, phone (country code + number), email, company (select existing or create inline), position, decision maker, activity/notes history, linked Projects (many).
Proposed additions: first/last name for sorting, several labeled phones (mobile, office, WhatsApp) stored in a normalized international format, relationship status (Prospect / Customer / Supplier / Inactive), Source.

## Company
Confirmed fields: name, address, phone (own, or the contact's), email, contact person, notes history, linked Projects (many).
Proposed: contact person is a link to a primary Person, not copied text; if the company has no phone, show the primary person's phone without copying it.

## Role views
| Logged in as | Default view | Sees |
|---|---|---|
| Sales / marketing | Sales pipeline: Project cards by stage | People, decision maker, source, estimated value, quotes, follow-ups |
| Worker | Production timeline: Order / Job cards assigned to them, by date | Only work with an Order that is assigned to them; what/where/when, design files, checklist; no prices |
| Team lead | Team's production timeline | Work assigned to their team; can complete their team's tasks; no prices |
| Manager | Pipeline, production and Money | Everything permitted, including prices, deposits, costs and margin; assigns team members; sets assignment automations; can complete any task and release Orders without deposit (with a reason) |

The role view only chooses the default screen. Visibility rules CRM-T-05 and CRM-T-06 must be enforced by the backend (record and field scope), per [business-suite permissions](<business-suite permissions.md>). Hiding a field in the UI is not enough.

## Insignia stages (Proposed initial template)
**Project pipeline:** New → Contacted → Interested → Site visit → Quote sent → Negotiation → Won | Lost. Lost requires a lost reason. The stage is "Interested", not "Qualified", because "qualified" means decision maker (CRM-T-09). A Project can warn when none of its people is a decision maker.

**Production (Order / Job):** Awaiting release → Design → Design approved → Fabrication → Installation → Delivered → Closed. Payment status (Unpaid / Deposit paid / Paid) is a separate badge shown only to roles that may see money; Delivered or Closed never means paid.

## Release into production
An Order moves from Awaiting release into production by one of:
- **Deposit received:** a recorded payment, entered by an authorized person.
- **Manager release:** a manager releases it without a deposit and must enter a reason (CRM-T-08).

The release, its basis and the actor are kept in the activity history. A release without a deposit does not create or imply a payment.

## Tasks
- Each Task has one assignee (Proposed) and links to a Project, Order, Job, Person or Company.
- The assignee, the assignee's team lead, or a manager can complete it (CRM-T-07). Completion records who completed it.
- Stages can define a checklist of required tasks. When all are complete, the card suggests moving to the next stage; a workspace may switch this to an automatic move (Proposed).

## Automations
Structure: **When** (trigger) → optional **If** (condition) → optional **Wait** → **Then** (action). The When/then and When/wait/then shapes are confirmed; the If step and the lists below are Proposed.
- Triggers: stage changed, task completed, all stage tasks done, quote sent, date reached, no activity for N days.
- Actions: create task, assign a Job/Task to a team member or team, notify someone, move stage, add activity note, prepare a message from a template (sending needs a person).
- Visibility automations (CRM-T-16): the manager can set rules such as "when an Order reaches Fabrication, assign the Fabrication Job to the shop team". What a team member sees follows from what is assigned to them; an automation can never give production access to prices.
- Guardrails: automations never record a payment, approve an expense, change a price, create an Order or release an Order into production. Triggers and actions come from a fixed list, not a general workflow engine (repository AGENTS.md).

Insignia examples: when a quote is sent, wait 3 days, then if there is no reply create a follow-up task for the owner. When an Order / Job reaches Fabrication, create shop tasks and notify the shop. When all Installation tasks are done, move to Delivered and notify the manager.

## Workflow templates
A workflow template bundles pipeline stages, production stages, stage checklists and automations. "Insignia – Signage" is the first. Other workspaces copy and adapt it. Core record types (Person, Company, Project, Quote, Order, Job, Task) stay the same in every workspace; only stage names, checklists and automations change (Proposed).

## Still open
- Can one Order be created from part of a Project's accepted quote, or does each Order need its own quote?

## Implementation status — NOTE-015, 2026-11-03
A first slice is implemented locally (uncommitted at writing): Project terms in the pipeline, several numbered Orders per Project, release by deposit or manager with reason, Jobs split per team member with "Order / Job" cards and one colour per Order, `lead` and `production` roles with assigned-only visibility and no prices, the task completion rule, and decision maker/position on Person. Unit tests and a browser example-mode check pass; the real local backend was not exercised. Remaining gaps are listed in NOTE-015 (Obsidian reference).

## Implementation status — automations, 2026-11-03
Implemented locally (uncommitted at writing), with the human's choice of scope: When/If/Wait/Then rules, waits and time-based triggers included, and a small fixed If list.
- Triggers: project stage changed (also "quote sent", using the Quote sent stage), job production stage changed, task completed, all tasks of an Order done, a date reached (project follow-up, job or task due date, with days before/after), no project activity for N days, and a person or company added (any type, or only customers, suppliers, team members, candidates or employers; a Company is still a field on a Person).
- If: nobody worked on the record during the wait, project still at a stage, a job at a production stage, job unassigned.
- Then: create a task, assign the job, notify someone in the app, move a stage, add an activity note. Prepare-a-message is not implemented, because message templates belong to the referrals module.
- Guardrails: rules can only issue task, job, project-stage, notification and note changes, and those changes keep their own checks. Won and lost stay a person's decision; Awaiting release cannot be targeted, so an automation never releases an Order. Every run applies all of its actions or none and is logged as done, skipped, failed or cancelled. Automations that trigger each other stop after three steps. Each person's command still advances the workspace revision only once.
- Only owners and managers can see and manage rules and runs (`automations.manage`). Each person sees only the notifications addressed to them.
- Waits and timers run on the server (once a minute, under the workspace lock) and in the browser in example mode. Time-based triggers count from when a rule is turned on, so turning one on cannot flood the workspace. Dates use UTC until workspaces have a time zone.
- Gaps: Projects have no owner, so "the owner" cannot be a task assignee; teams now exist for Tasks (see `docs/teams.md`: team queues, claiming, business-hours alerts), but automations and Jobs still assign one member; notifications are in the app only. Migration 003 also allows the lead and production roles in the database. The shared-host runtime grants for the new tables and the API scheduler were not exercised against real PostgreSQL.

## Relation to the NOTE-013 implementation
Checked 2026-11-03 in `packages/core/src/operations`. The code's names map to these terms as follows:
- Code `deals` (UI "opportunity") = this note's **Project**.
- Code `projects` (created by `deal.convert`; title, contact, `amountMinor` agreed value, status `planned|active|completed`, one `assigneeId`; labelled "Projects" or "Orders" per workspace template) = this note's **Order**, with a single implied Job.

The code also has an Insignia `qualified` stage, one Order per deal (`deal.convert` refuses a second), no Order/Job split, no release basis or reason, no team-lead or manager completion rule, no assignment automations, and no production-side price hiding beyond existing grants. These are implementation gaps, not decisions; a migration must rename or map the existing rows deliberately so "project" does not mean two things.
