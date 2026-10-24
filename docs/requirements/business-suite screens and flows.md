---
tags: [business-suite, product, ux]
updated: 2026-10-24
---
# Business Suite screens and flows

← [business-suite hub](<business-suite hub.md>) · [business-suite permissions](<business-suite permissions.md>) · [business-suite API and integrations](<business-suite API and integrations.md>)

The confirmed experience is one responsive app, with visible modules/features based on business configuration and user privileges. The original frontend contract uses React/Vite and local demo identities. NOTE-008 requires offline-first/native delivery, and NOTE-009 explicitly adds Windows/macOS desktop now alongside Android/iOS/browser; [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) defines the initial cross-client slice. The following screen IDs describe responsibilities; exact route filenames and observed screenshots are evidence to add after inspecting the completed implementation, not assumed existing routes.

## Initial screen contracts
| ID | Screen responsibility | Required behavior and first-slice boundary |
|---|---|---|
| BS-SCR-001 | App/workspace shell | Show current business, user, active module, explicit demo banner; route access follows backend grants |
| BS-SCR-002 | Job list/detail | Authorized jobs and state; authorized price only; assignments; no invented full calendar or order ledger |
| BS-SCR-003 | Create job | Authorized title/customer name/MXN agreed price/assignee capture; clear validation; preserve failed input |
| BS-SCR-004 | Close job | Explain selected job and action; matching version; authorized worker may close directly |
| BS-SCR-005 | Expenses | Worker sees permitted own records; reviewer sees permitted business records; distinguish submitted/approved/rejected |
| BS-SCR-006 | Submit missing-receipt expense | Declared business-only amount, optional accessible job, description, mandatory missing-receipt reason; payer is authenticated identity |
| BS-SCR-007 | Expense review | Reviewer decision with conflict/error handling; self-approval blocked in E1; approval does not imply reimbursement |
| BS-SCR-008 | Setup/denied/not found | Distinguish configuration required, unauthenticated/denied and inaccessible record without disclosing another business's data |

CRM and Resources are future modules, not working menu entries that imply implementation. If previews are shown, label them as planned and do not collect data into dead-end fake workflows.

## Worker flow
Open assigned work; see task, location or details when later supported, and permitted actions. Close work directly when authorized. Submit an expense with business-only amount, job reference if appropriate and missing-receipt reason. See that it is awaiting review and later approved or rejected. The first slice must not show an approved expense as paid, expose an unpermitted customer price or allow selecting another payer through client input.

A later complete worker flow adds real receipt capture, mixed-purchase split, timers/manual time, trips, vehicle/resource details, reimbursement remaining due and relevant notifications. These are confirmed scope areas whose detailed screens are still to be designed. Avoid a mandatory sales pipeline or a complete finance dashboard for someone simply completing assigned work.

## Manager flow
See permitted work and review queues; create a job using a deliberate agreed price; assign people; inspect expense reason and business portion; approve or reject within grants. A stale version should explain that the record changed and invite a fresh review without silently overriding another reviewer. Current review approval creates no outgoing payment.

The full product must later support direct expense posting for authorized users when receipt conditions permit, grouped partial reimbursement and separate approval/payment privileges. A proposed reimbursement review should show selected items, eligible amounts, payer/currency and resulting remaining balances before the money-recording action. Exact authorization and self-approval policies remain open.

## Future commercial and industry flows
`BS-SCR-009` covers optional CRM pipeline, lead/source, follow-ups, site visits and quotations. A won opportunity may represent provider onboarding rather than a purchase; show an explicit create/accept commitment action where relevant. Quote acceptance and signature/PDF/customer portal behavior remain `BS-DEC-004`.

`BS-SCR-010` covers work planning, staff/resource allocation, man-hours and trips. Trip capture supports driver, vehicle, origin/destination, distance, fuel and tolls without assuming continuous GPS. Scheduling conflicts, overtime, overlaps and approvals need explicit policy.

`BS-SCR-011` covers customer receipts, employee reimbursements and other money in/out. Display original amount, credits, receipts/payments and remaining due with evidence links. Selecting a method is distinct from confirming receipt. Operations users without finance access should still see permitted next actions without financial details.

`BS-SCR-012` is a proposed tiny food view: day's portions/orders, batch, packing/delivery and collection. Six people may mean one payer and six portions; do not create six customer accounts automatically. `BS-SCR-013` is a proposed physical-work view: site visit, quote, agreed work, fabrication/installation stages, materials and completion evidence. Professional services may use engagements, sessions and man-hours with fewer physical fulfillment steps. These are tailored views over shared records, not separate finance databases.

## Interaction and failure states
All initial screens need loading, empty, recoverable error, denied and successful states. Preserve user input after validation, network or conflict failure where safe. Show field-specific corrections without echoing secrets. Disable duplicate submission while pending and retain a stable idempotency key for the same retry; generate a new key only for a genuinely new intent. A command timeout means outcome unknown until a safe retry or status fetch resolves it, not automatic failure or success.

A 401 should request reauthentication without exposing stale protected data. A 403 should explain lack of permission without suggesting the UI can override it. A 404 for inaccessible objects must not reveal cross-business existence. A 409 should preserve the draft, fetch permitted current state and require reconciliation of the change. No unconditional last-write-wins behavior is approved.

Keyboard navigation, labeled fields, visible focus, text errors, sufficient contrast and non-color status cues are proposed quality requirements. Money entry must explain MXN and decimal-to-centavo conversion. Phone layouts need readable totals, practical touch targets and no horizontal overflow; desktop views may show more context without requiring separate business logic.

## Offline and draft safety
Offline-first is confirmed by NOTE-008, superseding the earlier unanswered need. Supported expense submission/job closure must persist locally before send and remain visible across normal client restart. Job creation and review/approval are online-only in this first slice; explain that limit before collecting unsupported work. First-time device preparation needs a successful authorized fetch. Cache age and unavailable records must be visible.

Native clients are current product scope and use the same authoritative HTTPS commands with device-specific storage. Live credential/local-data protection remains incomplete; demo is fictional only. A source bundle or mobile wrapper is not evidence of native device or offline correctness.

Add `BS-SCR-014` for synchronization status and pending work: show queued/conflict/rejected intent separately from confirmed jobs/expenses, last successful sync, retry and understandable recovery. “Saved on this device” follows durable local commit; “Synchronized” follows authoritative acknowledgement; “Approved” and “Paid” remain separate financial states. Do not show a locally queued close as a confirmed completed job.

Add `BS-SCR-015` for local lock/reset/recovery: authorization denial clears protected snapshot and stops replay; unresolved intents must not move to another identity. The demo reset must warn about unsynchronized fictional work. Do not offer discard for an uncertain queued command merely because the UI timed out; the server may have committed it. Exact current behavior is specified in [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>).

Cross-client flow: prepare online → lose connectivity → capture supported intent → confirm durable local save → reopen → inspect queued work → reconnect/revalidate → send same key → display acknowledgement or conflict/denial. Stale closure requires an explicit reviewed new intent, not automatic version replacement. Future receipt/time/trip flows must receive their own offline contracts.

## Evidence slots
Root should append actual screen routes/components, observed narrow/wide viewport checks, representative screenshot references and remaining UI defects in [business-suite roadmap](<business-suite roadmap.md>) or the NOTE-007 report. These conceptual IDs are stable; implementation route names may change. Test scenarios are in [business-suite quality and verification](<business-suite quality and verification.md>), with the current execution checklist only in NOTE-009 (Obsidian reference). NOTE-007 results below remain historical evidence.


### Verified screen inventory — 2026-10-23
The local web entry is `/`; Overview, Work and Money are in-app views managed by `apps/web/src/App.tsx`. Job and expense dialogs are actual connected command flows, not separate public routes. `api.ts` calls the local API; API failures never replace data with fixture success. Planned CRM/Resources labels do not navigate to fabricated tools.

Observed wide/narrow screenshots are preserved at [desktop](/Users/fabiel/Desktop/business-suite/docs/preview/desktop.png), [phone overview](/Users/fabiel/Desktop/business-suite/docs/preview/phone-overview.png) and [phone expense form](/Users/fabiel/Desktop/business-suite/docs/preview/phone-expense.png). The connected flow tests verify assigned work, absence of worker prices, review notes, retained failed drafts and explicit refresh after review conflict. This is a local Chromium check, not a complete accessibility or physical-device certification. NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference)

## Desktop interaction contract
Windows and macOS are current clients, not planned after web completion. Reuse existing work/expense and sync-status flows in a packaged React renderer while adapting window sizing, keyboard shortcuts/focus and platform conventions. Exact menus, routes and desktop components await implementation evidence; a screenshot of the responsive web UI is not desktop-runtime proof.

`BS-SCR-016` covers desktop startup/setup: bundled shell launches without a development web server; an unprepared profile explains why no work is cached; a prepared profile shows confirmed work and pending commands offline; live/default mode remains setup-only until real configuration exists. Explicit demo mode is visibly fictional and cannot activate because live authentication failed.

`BS-SCR-017` covers desktop lifecycle/recovery: show app version and synchronization state; make clear whether a package/update is unsigned or internal where relevant; warn before deliberate fictional-data reset; preserve pending work across normal quit/update. Installation/update/removal UX is a specification until its actual package/installer is inspected. Never portray uninstall or deleting a profile as a harmless sync repair.

Desktop flow: launch bundled shell → open isolated prepared profile → capture supported expense or close intent → confirm local save → quit/relaunch offline → inspect retained queue → reconnect to the same authoritative API generation → receive server acceptance/conflict/denial. Quit is not an instruction to discard pending work. Update, platform/architecture and signing checks are separate from this flow. [business-suite desktop applications](<business-suite desktop applications.md>) owns lifecycle detail.

## NOTE-009 observed desktop behavior
Three actual Electron runtime tests on macOS 27.0.1 arm64 cover bundled interface, isolated bridge, setup denial and two pending intents retained through app quit/relaunch and synchronized with the original IDs. A same-document skip-link hash issue was fixed and checked. A separate launch of the actual packaged Mac demo `.app`, without API/web server, shows the expected connect-once empty-offline state. This is not a macOS DMG installation walkthrough or any Windows runtime observation. The final 8 connected and 2 offline browser regressions also pass. [business-suite roadmap](<business-suite roadmap.md#note-009-desktop-foundation--2026-10-24>) keeps release/privacy and other unrun checks explicit.
