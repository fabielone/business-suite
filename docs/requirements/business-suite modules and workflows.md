---
tags: [business-suite, workflows, modules]
updated: 2026-10-23
---
# Business Suite modules and workflows

← [business-suite hub](<business-suite hub.md>) · [business-suite requirements](<business-suite requirements.md>) · [business-suite money and reimbursements](<business-suite money and reimbursements.md>)

## One product with domain ownership
The working product modules are CRM, Work, Resources and Money inside one application. A module can be enabled for a business and still unavailable to a particular user. Internal ownership is more precise than navigation: a Commercial/Orders boundary owns agreed quote/order terms even if its screens appear within Work; Work owns execution; Money owns obligations and payments. An optional CRM pipeline owns engagement, not every accepted job. This internal split is proposed architecture, not four independent apps.

| Capability | Responsibility | Full-scope behavior and current limit |
|---|---|---|
| Shared identity and parties | Business membership, people/organizations, customer/supplier roles | Initial customerName is a prototype field, not final party identity |
| CRM | Contacts, leads, source, follow-ups, optional pipeline | Current operation can work without it; planned menu must not imply functioning CRM |
| Commercial agreements | Quotes, acceptance, agreed price, order revisions | Exact acceptance/hierarchy open; initial job price is a bounded implementation field |
| Work | Jobs, tasks/visits, assignments, evidence, completion and time | Initial flat jobs/closure; full tasks/visits/timers remain required |
| Resources | Workers, skills, availability, vehicles, equipment, materials | Detailed reservation/stock policy open; not initial functional module |
| Trips | Driver, vehicle, stops/route, distance, fuel/toll costs | Confirmed full scope; manual log first is a proposal, not rejection of later options |
| Money | Receipts, expenses, review, costs, balances, collections and reimbursements | Initial missing-receipt review only; actual payments not implemented by E1 |

## Initial contract states versus proposed lifecycle
E1 job state values are `draft`, `scheduled`, `in_progress`, `completed`. The documented initial API creates and closes jobs; it does not establish endpoints for every state transition. Do not infer a drag-and-drop board or scheduling flow exists. Exact allowed source states for close must be inspected in code and tested; it requires an authorized worker/manager, record scope and a matching version. Completed is work status, not payment status.

E1 expense values are `submitted`, `approved`, `rejected`. Every initial submission lacks a receipt and must supply a reason. Review requires reviewer privilege and scope; self-approval is blocked provisionally. Approval creates no cash movement. Rejection reason is optional in E1's request shape; whether to require it in the full product remains an explicit design improvement, not a falsely documented current validator.

## Full work lifecycle proposal
| From → event → to | Actor and conditions | Effects and recovery |
|---|---|---|
| Draft → schedule → scheduled | Authorized planner; valid assigned resources and dates | Save planned window; conflicts follow BS-DEC-007 |
| Scheduled → start → in progress | Assigned authorized worker | Record actual start; timer is a separate time record |
| In progress → pause/block → work remains open | Assigned worker with reason | Flag blocker/next action; does not erase assignment or billing |
| Eligible open state → close → completed | Authorized worker; required evidence policy satisfied | Completion actor/time/version; no forced manager sign-off because BS-WORK-002 permits direct closure |
| Completed → correction/reopen → explicit corrected history | Privilege and policy still to define | Preserve original completion and reason; never silently reverse received cash |
| Open → cancel remainder → canceled/closed remainder | Authorized commercial/operations actor | Preserve finished work, costs and obligations; refunds/credits separate |

These are proposed transitions beyond E1. Closure requirements, partial quantity acceptance and parent/project roll-up must be resolved with BS-DEC-005/016 before final implementation.

## Time and trip workflows
BS-WORK-003 requires timer and manual entry. Proposed time record: worker, job/task link when relevant, start/end or duration, break, source (`timer` or `manual`), note, edit reason and version. Starting/stopping must be idempotent. Multiple open timers, overnight entries, time zones, supervisor approval and billable hours are pending policies. Recorded labor does not automatically become payroll or an extra wage expense.

BS-WORK-004 requires driver/vehicle, origin/destination, distance, fuel and toll expenses. Proposed trip lifecycle: planned → underway → finished, with correction/cancellation retaining history. A trip can serve several jobs; assigning its complete cost to each would duplicate it. Preserve the source cost and an explicit allocation method. Continuous GPS, route optimization and automatic mileage inference are not confirmed. Fuel/tolls use the same expense/receipt/reimbursement rules as other business spending.

## Quotes and customer commitments
Estimated cost informs a proposed quote; agreed customer price is independent of later actual cost. Keep quote revisions and acceptance evidence distinct from execution. A direct job can be entered without a sales opportunity. An internal maintenance job need not have a customer receivable. Customer acceptance method and whether every customer job requires a formal order remain BS-DEC-004/016.

Later changes create an approved revised commitment or changed remainder. Preserve completed work at its agreed terms. CRM wins may mean provider onboarding rather than purchase; use explicit outcome types, not automatic won-to-order creation.

## Physical work and food share relationships not identical stages
For installation: one commitment can require several visits/sites, with survey, approved artwork, material use and completion evidence. For food: one payer can buy six portions, or six payers can share one cooking batch. Recipe/yield/packing are typed extensions; neither food cases nor five-person test data settle the pilot choice.

A narrow work-unit header can share owner, time, status and site while industry-specific records hold recipe or installation rules. Work allocations, fulfillment and financial allocation are different. Sequential design/fabricate/install stages can each refer to three signs; their planned quantities must not be globally summed against the three ordered units. Fulfillment alone determines delivered quantity. Rework adds cost and work, not automatic extra charges/delivery.

## Recurrence and capability retirement
Recurring contracts/generation are unanswered. Do not implement a recurring invoice as if it specified the work to perform. Any future recurrence needs schedule, date/time zone, pause/skip/cancel, generation identity and billing policy.

Disabling new use must leave open jobs, expense reviews, balances, reimbursements, refunds and historic statements usable. Hiding a menu cannot disable backend obligations. Capability retirement/activation semantics are proposed in [business-suite architecture](<business-suite architecture.md>); no arbitrary uninstall is promised.
