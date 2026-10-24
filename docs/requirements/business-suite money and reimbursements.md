---
tags: [business-suite, requirements, finance]
updated: 2026-10-23
---
# Business Suite money and reimbursements

← [business-suite hub](<business-suite hub.md>) · [business-suite requirements](<business-suite requirements.md>) · [business-suite permissions](<business-suite permissions.md>)

This note specifies business money. It is not a household ledger, payroll system or statutory accounting specification. The confirmed behavior comes from `I1` and the earlier human direction identified in [business-suite sources and agent handoff](<business-suite sources and agent handoff.md>). Entity names and allocation mechanisms below are proposed designs unless explicitly part of `E1`.

## Separate price cost obligation and payment
A customer's agreed price answers what they agreed to buy and pay. Estimated cost helps prepare a quote. Actual cost records business consumption or expenditure under a stated reporting basis. An obligation records money owed. A payment records money actually received or paid; an allocation says which obligation it settles. These records must not collapse into a single editable balance.

`BS-MONEY-007` requires actual cost changes to leave agreed selling price unchanged. A changed customer price requires a separate authorized commercial amendment and history. Order acceptance does not itself establish an accounting revenue-recognition event. Work completion is not proof of customer payment. Selecting transfer or cash is not proof that money moved.

Operational money reports should state their basis, period, currency and treatment of pending expenses. A cash report and a job-cost report answer different questions. External professional bookkeeping, fiscal and payroll services remain future requirements; exact systems, posting rules and the statutory authority are unresolved. See [business-suite API and integrations](<business-suite API and integrations.md>).

## Expense capture and business portion
The target capture records purchase date, description, business/entity, currency, gross receipt amount when available, business portion, personal portion, payer, payment method, evidence or missing-evidence reason, and optional job/trip allocation. `BS-MONEY-002` excludes the personal portion from business costs and reimbursement eligibility. Minimal arithmetic validation must reject negative components and mismatched totals.

For example, a worker pays MXN 1,000 for a mixed purchase with MXN 200 of personal items. Only MXN 800 is a candidate business expense and reimbursement. The app may retain the receipt total to explain the split; it must not present the MXN 200 as a business cost or worker balance. This hypothetical example specifies no tax treatment. Mixed company/worker funding, advances and unused returns are still `BS-DEC-011`; do not invent settlement rules.

The first slice is deliberately narrower: its `amountMinor` represents a declared business-only MXN amount; the authenticated user is the payer. It must not imply that mixed-purchase capture already exists. `E1` accepts only missing-receipt submissions, not pretend uploads or fabricated receipt verification.

## Evidence and approval
Ordinary submissions require review. Privileged users may eventually post qualifying expenses directly (`BS-MONEY-003`). Missing receipt always requires both a reason and manager approval (`BS-MONEY-004`), including when the submitter normally has direct-posting privileges. A receipt file is evidence, not automatic approval, fiscal validity or proof that an electronic payment settled.

The target reviewer sees the business portion, payer, job/trip, supporting evidence, missing-receipt reason and relevant history. Approval and rejection record actor, time and decision reason where policy requires it. Changes after approval must be versioned and reviewed if they alter financial meaning. Replacing a file must retain a traceable prior reference according to the eventual retention policy.

`E1` states are `submitted`, `approved`, `rejected`. All first-slice submissions enter `submitted`; self-approval is blocked conservatively. This is not a final self-approval policy and does not grant every manager every payment permission. The user has not selected whether all submitted expenses affect headline job figures; until resolved, expose submitted and approved totals separately and label them.

## Reimbursement without counting the expense twice
Personally funded, approved business expenses may establish amounts owed to the payer. The exact obligation-creation policy needs `BS-DEC-012`, but reimbursement must settle that balance rather than create a second copy of the original business expense. Company-funded spending does not create an employee reimbursement merely because an employee entered it.

`BS-MONEY-006` requires selecting several expenses for one reimbursement and partial payment. Proposed records are a reimbursement request or payment group, eligible expense balances, an outgoing payment, and explicit payment allocations. Group membership alone does not mark an expense paid. Allocation sums cannot exceed the available payment or eligible outstanding balances; concurrency protection is necessary.

Hypothetical business-only example: Ana has approved expenses of MXN 600 and MXN 400. A reimbursement payment of MXN 700 allocates MXN 600 to the first and MXN 100 to the second. The remaining amount owed is MXN 300. Job expense remains MXN 1,000, and cash paid toward reimbursement is MXN 700. A retry must not create another payment or erase the remaining MXN 300. These are different views of the same underlying records.

Direct expense posting, reimbursement approval and recording actual payment require separate grants (`BS-MONEY-009`). Self-approval, substitute reviewers and limits remain open. For electronic payments, confirmation must have a trustworthy provider/bank or reviewed reconciliation reference under the selected process. Cash receipts and cash reimbursements need a responsible operator and cash-count reconciliation. No transfer gateway is selected or implemented by `E1`.

## Customer money and outstanding amounts
Support deposits, partial payments and remaining due (`BS-MONEY-008`). A receipt may initially be unallocated and later applied to eligible obligations. One receipt can settle more than one obligation, and one obligation can receive several receipts. Currency/entity constraints and available balances apply in both directions. The UI should explain the remaining balance through original amounts, amendments, credits and allocations.

A commercial deposit is not automatically a fiscal anticipo. The eventual fiscal adapter and accountant determine legally appropriate treatment. This product note does not prescribe tax rates, invoice timing or statutory classifications.

Refunds, customer credits, supplier credits and cancelled work need explicit corrective records. Reopening work does not silently undo a receipt; cancelling a job does not delete an expense or employee balance. A refund of a previously reimbursed purchase may require a business/worker recovery balance, whose policy remains open. Never silently net these events against unrelated payments.

## Controls before handling real money
Amounts use exact integer minor units for the first MXN implementation. Check safe integer bounds in JavaScript and storage; never use floating-point arithmetic for monetary totals. Multi-currency, exchange rates and tax representation need later explicit contracts. Store original timestamps and local business dates where required; do not derive payroll or tax treatment from them.

Consequential commands need authorization, expected version, stable idempotency, transactional writes and audit evidence. Reports must not expose customer prices or other workers' reimbursement details to unauthorized users. Real money handling must wait for the relevant tested controls in [business-suite quality and verification](<business-suite quality and verification.md>); the local demo's approval button does not pay anyone.
