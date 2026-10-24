---
tags: [business-suite, migration, integrations]
updated: 2026-10-24
---
# Business Suite migration

← [business-suite hub](<business-suite hub.md>) · [business-suite architecture](<business-suite architecture.md>) · [business-suite API and integrations](<business-suite API and integrations.md>)

The user wants Business Suite eventually to replace standalone CRM and CocinaCostos. This direction does not mean their records, databases, users or integrations have already moved. The current authorization covers requirements and a new local foundation; no old application is deleted, no live endpoint is retargeted and no migration/cutover is claimed.

## Inventory and evidence limits
| Source | What is known | What is not established |
|---|---|---|
| CRM notes (Obsidian reference) | Existing lead/pipeline/workspace concepts and portfolio recruitment/intake relationships are documented | This pass did not audit CRM code or live records; historical `~/Desktop/xcrm` is absent on this host |
| CocinaCostos notes (Obsidian reference) | Expense, kitchen/costing, recipe/purchase/trip concepts and intended Salad integration are documented | `/Users/fabiel/Desktop/projs/cocinacostos` was reported to exist as a directory only; Git identity, schema, data and implementation remain unaudited |
| salad.mx notes (Obsidian reference) | Separate customer order/status authority and development backend evidence are documented | This documentation pass did not reverify the deployment or connect a new receiver |
| Integration register (Obsidian reference) | Cross-app ownership and verification gaps are recorded | A recorded contract is not a working successor connection |

Do not search unrelated personal data or run legacy migrations just to fill these gaps. A future authorized inspection should record exact repository/commit, schema, source IDs, environment, data authority and backup/restore status before extraction.

## Preserve the Salad kitchen contract
CocinaCostos and salad.mx integration (Obsidian reference) is the canonical existing contract and dated history. It documents own-channel orders, a kitchen API, signed order events, menu-to-recipe mapping, store scope and status/ETA updates. Marketplace orders are outside that documented own-channel flow. The later Docker backend notes supersede older Firebase-only mechanics where explicitly stated; do not combine old and new retry descriptions into an invented runtime.

The documented development kitchen base is `https://api-dev.fabiel.org/apps/salad/kitchen/v1`. Existing notes report the receiver URL unset and no receiver-side integration success. Preserve Salad's order/status authority until an explicit tested transfer; the new suite may eventually act as an authorized kitchen consumer. No new Business Suite consumer, secret, callback or endpoint connection exists because this note has been written.

A successor must durably deduplicate signed event IDs, map source order/item/store identities, reconcile versions and out-of-order events, and validate status/ETA write authority. Payment method in an incoming order is not proof of collection. Delivery status is not by itself statutory revenue recognition or customer receipt. Do not automatically convert every webhook into a new sale, expense or payment.

Future proof must follow one synthetic authorized order through signed event, mapped work/recipe, kitchen update and customer-visible status, including duplicate and stale-event rejection. Inspect current provider/server code and the canonical contract before implementation; historical note payloads are compatibility evidence, not permission to deploy.

## Proposed migration sequence
1. **Inventory and map.** Obtain approved source access, identify authoritative records and versions, distinguish tenant/workspace/business/entity/site meanings, document source retention and export restrictions. Reconcile CRM `workspace_id` and CocinaCostos `business_id` explicitly.
2. **Model and rehearse.** Map contacts, quotes, work, expenses, payments, evidence and integration IDs into typed suite records. Use isolated fixtures or approved sanitized exports. Record unmapped fields and ambiguous states rather than guessing.
3. **Reconcile.** Compare record counts, source hashes where suitable, amounts by entity/currency/payer, open obligations, payment allocations and evidence links. Match both totals and explainable individual balances; matching one grand total is insufficient.
4. **Test repeated import and recovery.** Stable import/source keys must make replay safe. Test restore and reversal/forward-repair of a failed import in isolation. Preserve original references and rejected-record reports.
5. **Prepare explicit cutover.** Choose scope and date, owner, write freeze or supported delta procedure, user communication, rollback conditions and support window. Decide which system owns new writes for each record type.
6. **Switch and verify.** Only after authorization, direct the selected workflows/integrations to the new authority and reconcile again. Keep read-only legacy history available under appropriate permissions and retention.
7. **Retire deliberately.** Remove obsolete write access and endpoints only when outstanding work, collections, refunds, reimbursements, recovery and contracts have a supported home. No default history deletion.

These steps are a proposal, not an execution checklist or migration authorization. The current authorized local task is NOTE-009 (Obsidian reference); NOTE-007/008 preserve foundation history. None performs a legacy cutover.

## Domain-specific mapping cautions
A won CRM opportunity may be provider recruitment/onboarding, not a customer purchase. Preserve its original outcome and explicit destination handoff; create an accepted order only when commercial evidence supports one. Agency inquiry source attribution and destination product provider accounts retain their separate ownership until their successor contract is tested.

A historical CocinaCostos purchase may represent stock acquired, ingredients consumed, an expense paid personally, or several of these related facts. Avoid importing the same amount as both job cost and a second reimbursement expense. Do not infer receipt existence, review approval, who paid, personal portion or repayment from an unstructured note. Flag unknowns for human reconciliation.

Opening customer and employee balances need provenance, currency/entity and an approved cutoff. A synthetic opening balance must not pretend to be a fully reconstructed historical invoice or payment. Historical files need access-controlled transfer and retention decisions. Existing users cannot automatically gain cross-business access because email addresses match.

## Authority after migration
Within the adopted suite, Commercial owns agreed terms, Work owns execution/fulfillment and Money owns operational obligations/payments. External statutory books retain their selected authority. Unrelated portfolio apps retain independent data/auth boundaries. A connector may mirror a projection with source IDs, but must not create a second independently editable authoritative order or balance and rely on bidirectional sync to resolve conflicts.

**Current migration state:** direction documented; no import, source-data audit, opening-balance approval, new kitchen consumer, live retargeting or cutover performed by this documentation task.

## Offline migration implication
Native/browser local stores add another migration boundary. Before eventual cutover or API-origin/account changes, inventory pending client intents, supported schema versions and identity mappings; do not silently redirect unsent work to a new business or server authority. The initial demo epoch guard protects fictional resets, not production migration. Offline-first does not change the requirement to preserve old CRM/Cocina/Salad authority until an explicitly tested cutover.

## Desktop profile migration
Windows/macOS app profiles add a local migration surface, not a new legacy data authority. Keep application identity/profile paths stable across branding and package updates or perform an explicit recoverable migration. Preserve queued command keys, business/actor scope and schema metadata; do not move an old demo/profile queue to another API generation or live account. Installation/removal must follow the local-data contract in [business-suite desktop applications](<business-suite desktop applications.md>).
