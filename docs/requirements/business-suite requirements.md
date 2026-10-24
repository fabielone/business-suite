---
tags: [business-suite, requirements, product]
updated: 2026-10-23
---
# Business Suite requirements

← [business-suite hub](<business-suite hub.md>) · [business-suite open decisions](<business-suite open decisions.md>) · [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>)

## Status and provenance vocabulary
**Confirmed** means the current human request or interview explicitly supports the requirement. **Proposed** means a recommended design, not a user-selected policy. **Engineering default** means the bounded initial contract needs a choice to implement safely; it must not settle a wider open question. **Unanswered** means no answer should be inferred. **Deferred implementation** means the requirement remains in the product scope.

Sources: `H-OFF-20261023` is the later offline-first/native-app requirement recorded in NOTE-008; `H-PRIOR` is earlier direct human direction from this conversation; `H-20261023` is the earlier NOTE-007 human authorization; `I1` is the canonical discovery record; `I2` is its repository snapshot; `E1` is the initial implementation contract; `R1` is supporting architecture research. Exact links and precedence are in [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>). IDs below remain stable if wording evolves; retain superseded text in a dated decision rather than recycling an ID.

## Confirmed product requirements
| ID | Requirement | Evidence | Specification owner |
|---|---|---|---|
| BS-PROD-001 | Build one custom open-source modular business application | I1 `confirmed.product_direction`, `product_structure_decision` | [business-suite architecture](<business-suite architecture.md>) |
| BS-PROD-002 | Businesses enable needed modules; users see permitted screens and features within one app | I1 `confirmed.packaging`, `access_requirement` | [business-suite permissions](<business-suite permissions.md>) |
| BS-PROD-003 | Deliver multiplatform native applications alongside browser access; native delivery is part of current scope, not conditional on web-first completion | H-OFF-20261023 supersedes I1 delivery sequencing; Android/iOS/browser assumed, desktop native priority open | [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) |
| BS-PROD-004 | Current operation need not use sales; CRM must be optional | I1 `current_sales_requirement` | [business-suite modules and workflows](<business-suite modules and workflows.md>) |
| BS-PROD-005 | Eventually replace CRM and CocinaCostos and cover additional operations | H-20261023 / NOTE-007 authorization | [business-suite migration](<business-suite migration.md>) |
| BS-PROD-006 | Preserve all listed important areas; do not repeatedly ask the user to reduce them to three priorities | I1 `initial_scope`, `prioritization` | [business-suite roadmap](<business-suite roadmap.md>) |
| BS-PROD-007 | Limit finances to the business; household accounting is excluded | I1 `financial_separation`, `money.household_scope` | [business-suite money and reimbursements](<business-suite money and reimbursements.md>) |
| BS-PROD-008 | Serve small operators in Mexico first, then support international expansion | H-PRIOR; exact locales/currencies and legal adapters unresolved | [business-suite architecture](<business-suite architecture.md>) |
| BS-PROD-009 | Preserve a growth path toward larger businesses without forcing small operators into complex workflows | H-PRIOR; readiness criteria must be tested, not assumed | [business-suite roadmap](<business-suite roadmap.md>) |
| BS-PROD-010 | Make the application offline first because reliable connectivity cannot be assumed | H-OFF-20261023; full scope required, delivered in tested slices | [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) |

Open-source intent is confirmed, but no exact license is selected. Working name, commercial positioning, final branding, initial pilot, language policy and broader market promise remain in [business-suite open decisions](<business-suite open decisions.md>). Earlier six-person food examples are architecture fixtures, not evidence that the current five-person test group has a settled food workflow.

## Confirmed operational requirements
| ID | Requirement | Evidence |
|---|---|---|
| BS-WORK-001 | Track jobs, worker assignments and amounts due | I1 `initial_scope` |
| BS-WORK-002 | Authorized workers can close jobs directly | I1 `workflow.completion_authority` |
| BS-WORK-003 | Support both start/stop timers and manual time entry | I1 `workflow.time_capture` |
| BS-WORK-004 | Track trips with driver, vehicle, origin/destination, distance, fuel and toll expenses | I1 `workflow.trip_tracking` |
| BS-WORK-005 | Design for physical work and installation businesses and preserve food/restaurant variation | I1 `pilot_evidence`, H-PRIOR; exact initial pilot unresolved |
| BS-WORK-006 | Support worker/resource allocation and man-hours | H-PRIOR; exact resource conflicts, rate and approval policies unresolved |
| BS-SALES-001 | Provide a light CRM sales pipeline as an optional operational capability | H-PRIOR; I1 confirms current operation need not activate sales |
| BS-SALES-002 | Support quotations and site visits | H-PRIOR; acceptance channel, revision policy and scheduling details unresolved |
| BS-INTEGRATION-001 | Support future professional payroll, tax/fiscal and bookkeeping integrations | H-PRIOR; providers, posting authority and regulated behavior unresolved |
| BS-ACCESS-001 | User privileges control access to modules, screens and features including expense receipts and trips | I1 `access_requirement` |
| BS-MONEY-001 | Track receipts, expenses, income and amounts owed | I1 `initial_scope` |
| BS-MONEY-002 | Record who paid; exclude personal portions of mixed purchases from business finances | I1 `financial_separation` |
| BS-MONEY-003 | Ordinary submissions receive manager review; authorized users may post directly | I1 `workflow.expense_approval`, `round_two_interpretation` |
| BS-MONEY-004 | Missing receipts require a reason and manager approval, including for normally direct-posting users | I1 `money.missing_receipts`, `round_three_interpretation` |
| BS-MONEY-005 | Support expenses paid personally and later reimbursed | I1 `workflow.expense_funding` |
| BS-MONEY-006 | Select several expenses for one reimbursement payment; allow partial reimbursement and show remaining due | I1 `money.reimbursements` |
| BS-MONEY-007 | Use estimated costs to inform quotations but preserve the agreed selling price independently of actual costs | I1 `money.selling_price`, `round_three_interpretation` |
| BS-MONEY-008 | Support customer deposits, partial payments and remaining balances | I1 `money.customer_payments` |
| BS-MONEY-009 | Direct expense posting does not itself grant reimbursement approval or actual payment authority | I1 `round_two_interpretation.authority_limit` |

Confirmation does not imply full implementation. Timer, trips, real receipt uploads, direct-posting paths and actual reimbursements remain required later capabilities; their absence from E1 is explicitly recorded in [business-suite roadmap](<business-suite roadmap.md>).

## Proposed design requirements
| ID | Proposal | Basis and decision boundary |
|---|---|---|
| BS-DES-001 | Separate commercial agreement, work execution, obligations and cash/allocations | R1; avoids one universal job/sale/payment record |
| BS-DES-002 | Backend checks membership, enabled module, action, record scope and sensitive fields | E1/R1 implementation design for BS-ACCESS-001; exact grants pending |
| BS-DES-003 | Preserve revisions, actor/time/reason and source links for consequential changes | E1/R1; correction/retention policy still needs decisions |
| BS-DES-004 | One internal command implementation and local transaction for each consequential action | R1/E1; SQL constraints reinforce rules |
| BS-DES-005 | Use adapters and one external statutory authority rather than build an initial statutory engine | Proposed architecture for confirmed BS-INTEGRATION-001; providers and authority details pending |
| BS-DES-006 | Business packs configure trusted modules; no arbitrary tenant code | R1; not a prerequisite for the first slice |
| BS-DES-007 | Task views hide optional complexity without removing correct financial records | R1; names/navigation require usability verification |
| BS-DES-008 | Default one business/entity/site while retaining explicit ownership for growth | R1; shared-resource/multi-entity policies pending |

## Offline and native requirement supersession
H-OFF-20261023 changes delivery architecture, not the business/finance requirements above. Earlier web-first/native-later wording and an unanswered offline need are historical. Android, iOS and browser are the bounded platform assumption while native desktop priority is awaited. Full required workflows—including receipt capture, time, trips, assignments and money—need deliberate offline behavior; queuing two initial commands does not fulfill all of them.

The following are derived design requirements for the confirmed direction, not additional verbatim user policies:

| ID | Derived requirement | Boundary |
|---|---|---|
| BS-OFF-001 | Durably save supported work locally before network submission | Failed local storage is not successful save |
| BS-OFF-002 | Preserve identity/business/environment scope and stable command keys through retries/restart | Never replay under a different user or silently regenerate an uncertain command |
| BS-OFF-003 | Show cached, pending, synchronized, conflict and denial outcomes distinctly | Synchronized expense can still await approval; no payment implied |
| BS-OFF-004 | Revalidate current server authorization and expected versions at synchronization | Cached grants cannot authorize a server mutation |
| BS-OFF-005 | Preserve pending work across supported client/schema updates with explicit recovery | No automatic financial merge or queue deletion |
| BS-OFF-006 | Keep protected local data and credentials isolated with explicit retention/lock policy | Live auth/privacy implementation remains incomplete |
| BS-OFF-007 | Share command semantics across browser and native clients while using appropriate device storage | Initial proposal: web IndexedDB/shell cache, Expo SQLite, shared package |
| BS-OFF-008 | Test connectivity loss, restart, lost acknowledgements, conflicts and revocation per client | Source/build success does not certify a physical device or all offline workflows |

The exact current allowlist and state contract are in [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>). NOTE-008 queues missing-receipt expense submission and job closure; job creation and expense review remain online initially. This is an engineering slice, not a reduction of BS-PROD-010.

## Initial engineering defaults
`E1` currently specifies React/Vite, Fastify/TypeScript, PostgreSQL migration files and integer MXN centavos for settled money. It supports a small job and missing-receipt expense review flow. Self-approval is blocked conservatively. No real receipt upload, actual reimbursement payment, full CRM/Resources, time/trips or production sign-in experience is promised by that slice. These are implementation limits, not changes to BS-WORK/BS-MONEY requirements.

## Outcomes to measure
Measure owner/worker task completion without assistance, duplicate entry, unresolved expense review, unexplained amounts due, partial reimbursement correctness, and time to identify a job's next action. Define actual events and baselines in [business-suite quality and verification](<business-suite quality and verification.md>). No fabricated time-saved percentage, scale promise or delivery estimate is approved.

## Change procedure
Record a later human answer under its decision ID, date and provenance; update the related requirement and dependent specifications. Preserve historical sources. A research suggestion, implementer's shortcut or demo behavior cannot silently change a confirmed requirement.
