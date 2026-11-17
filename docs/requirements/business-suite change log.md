---
tags: [business-suite, history, status]
updated: 2026-11-17
---
# Business Suite change log

← [business-suite hub](<business-suite hub.md>) · [business-suite change process](<business-suite change process.md>) · [business-suite roadmap](<business-suite roadmap.md>)

One row per merged or recorded change, newest first. Detail lives in the linked task and its report under `_reports/`. Specification notes state current truth; this note is where dated history goes.

| Date | Task | What changed | State |
|---|---|---|---|
| 2026-11-17 | NOTE-019 (Obsidian reference) | Import of pipeline projects and orders from CSV, with preview; phone-width fix for panels | Branch `note-019-data-import`, uncommitted |
| 2026-11-17 | NOTE-018 (Obsidian reference) | Launch readiness list, change process, change-request intake, slimmer hub; legacy migration dropped from launch scope; high dependency advisories cleared | Branch `note-018-launch-readiness`, uncommitted |
| 2026-11-13 | NOTE-017 (Obsidian reference) | Browser demo account (Brightline Signs) and time clock | Committed `a9749db` on `main` |
| 2026-11-04 | NOTE-016 (Obsidian reference) | Teams, claimable task queues, business-hours alerts | Merged `1c21cb5` |
| 2026-11-03 | NOTE-015 (Obsidian reference) | Orders, release, jobs, roles; automations; companies; lead intake; contact import | Committed through `8c6671b` |
| 2026-11-03 | NOTE-014 (Obsidian reference) | Shared vocabulary and Insignia workflow | Documentation |
| 2026-10-30 | NOTE-013 (Obsidian reference) | Local shared Docker backend and authenticated browser workflows | Local profile |
| 2026-10-30 | NOTE-012 (Obsidian reference) | Clone and local runtime on this Mac | Done |
| 2026-10-24 | NOTE-011 (Obsidian reference) | Public repository under AGPL-3.0-only | Done |
| 2026-10-24 | NOTE-010 (Obsidian reference) | Development Auth/database/API on the shared Docker host | Done |
| 2026-10-24 | NOTE-009 (Obsidian reference) | Electron desktop foundation | Done (local) |
| 2026-10-23 | NOTE-008 (Obsidian reference) | Offline engine, browser shell, Android/iOS source | Done (local) |
| 2026-10-23 | NOTE-007 (Obsidian reference) | Requirements and local Work/Money foundation | Done (local) |

## Earlier hub history
Moved here unchanged from [business-suite hub](<business-suite hub.md>) on 2026-11-17 so the hub can stay short. These paragraphs are dated evidence, not current instructions.

**Current delivery — NOTE-009, 2026-10-24:** offline-first Android/iOS, Windows/macOS desktop applications and browser access are in scope. The human explicitly included both desktop platforms now. Electron is the desktop engineering choice; React Native/SQLite remains mobile. NOTE-008 verified a bounded two-command offline foundation, not the full product. Desktop runtime/package evidence and live auth/storage privacy remain separate. [business-suite desktop applications](<business-suite desktop applications.md>) and [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) define the contracts.

**Current backend result — NOTE-010, 2026-10-24:** independent Suite Auth/database/API are running, and source is uploaded to private [GitHub](https://github.com/fabielone/business-suite). Real Auth/API and PostgreSQL checks pass; hosted CI cannot start yet. Real client login remains unfinished. [business-suite deployed backend](<business-suite deployed backend.md>) and NOTE-010 Deploy Business Suite backend and publish repository (Obsidian reference) hold the current deployment boundaries and evidence. Earlier local-only restrictions remain historical.

**Public-source release — NOTE-011, 2026-10-24:** the human now authorizes making [fabielone/business-suite](https://github.com/fabielone/business-suite) public, with attribution and contributions under AGPL-3.0-only for original project work. Fabiel (@fabielone) remains the official maintainer. Source/history review and license installation are complete; GitHub public visibility and AGPLv3 recognition are verified in NOTE-011 License and publicly release Business Suite (Obsidian reference); the earlier private-repository checkpoint above is historical. [business-suite open source and contributions](<business-suite open source and contributions.md>) records the policy and remaining release boundaries.

**Verified local foundation — 2026-10-23:** 15 linked specification notes, a Desktop Git repository, connected responsive Work/Money demo and backend permissions/persistence foundation. Type checks and builds pass; 11 backend scenarios and 8 browser flows pass. Desktop and phone screenshots were inspected. NOTE-007 2026-10-23 Business Suite foundation report (Obsidian reference) records limits and handoff. Real login UX/provider provisioning, receipt storage, remaining modules, PostgreSQL server/concurrency checks and migration/cutover remain unfinished.

**NOTE-008 local result:** 30 shared/API/native unit scenarios and10 browser flows pass; Android/iOS exports pass. Actual native-device/runtime tests, real authentication and5 high Expo toolchain audit entries remain before release. NOTE-008 2026-10-23 Offline and native foundation report (Obsidian reference).

## Verified desktop foundation — 2026-10-24
NOTE-009 now has a packaged Electron desktop foundation: 38 aggregate unit/API tests, 3 actual macOS Electron runtime tests, all-workspace type checks and 10 browser regressions pass. On macOS 27.0.1 arm64, two queued intents survive app quit/relaunch and sync with their original IDs; the packaged demo shell also launches without a web/API server. Unsigned Mac DMG/ZIP and Windows x64 ZIP are built and integrity-checked.

Windows NSIS installer creation failed on the ARM build host; no Windows runtime or CI run is claimed. Signing/notarization, real auth/local privacy, upgrades/uninstall/recovery and full business workflows remain unfinished. Exact evidence, failure cause and artifact links: [business-suite roadmap](<business-suite roadmap.md#note-009-desktop-foundation--2026-10-24>).

Final desktop report: NOTE-009 2026-10-24 Desktop application foundation report (Obsidian reference). NOTE-009 edit claims are released; further work needs its own authorized scope.

## NOTE-012 local setup — 2026-10-30
Cloned current public main (`6404e9d`) to `/Users/fabiel/Desktop/business-suite` on this Mac. Installed locked dependencies; 38 unit/API, 10 browser/offline and 3 macOS runtime tests pass. Browser demo at `http://127.0.0.1:5178` and macOS desktop demo were left running; source unchanged. Live API health is reachable, but real client login remains unfinished. NOTE-012 2026-10-30 Desktop clone and local runtime report (Obsidian reference) records startup commands, dependency findings and evidence limits.

## NOTE-013 local shared browser checkpoint — 2026-10-30
Fresh isolated Docker backend and authenticated browser workflows for Insignia, Household and Referrals are implemented on this Mac. 46 unit scenarios, 9 real backend verification groups and 2 new browser flows pass, including encrypted offline reopen/sync. Owner activation and a physical second Wi-Fi device test are pending; native expansion, billing/email activation and broader ERP work remain unfinished. Source changes are local, unpushed. The mini deployment is unchanged. Checkpoint report (Obsidian reference) · NOTE-013 Configurable CRM money household and referrals (Obsidian reference).

## CRM workflow and terminology — 2026-11-03
The human defined the shared vocabulary and the Insignia workflow (H-CRM-20261103); decisions from that conversation control over older notes. A Project is the sales deal on the pipeline; an accepted Project leads to an Order, whose Jobs appear as "Order / Job" cards on the production timeline without prices. This is a documentation decision only; the NOTE-013 code still differs. [business-suite CRM workflow and terminology](<business-suite CRM workflow and terminology.md>) · NOTE-014 (Obsidian reference).

## Automations, companies, lead intake and teams — 2026-11-03
Committed on `main`: the first CRM workflow slice (`f67bf14`), automations (When/If/Wait/Then), Company records, a lead intake API and contact import (through `8c6671b`). Teams with claimable task queues and business-hours alerts followed in `1c21cb5`, merged into `main` 2026-11-04. Unit tests and browser example mode pass; the real local backend was not exercised. [business-suite CRM workflow and terminology](<business-suite CRM workflow and terminology.md>) · NOTE-015 (Obsidian reference) · NOTE-016 (Obsidian reference).

## Showcase demo account and time clock — 2026-11-13
Uncommitted on `main`: a browser-only demo account (fictional *Brightline Signs*, seven people across every role, a deal in every pipeline stage, orders, money review, teams, automations; `?demo=1`, **Reset demo**) and a time clock (clock in/out with live timer, one running shift per person, reviewer corrections with a reason, offline punches within 24 h; table `suite_time_entries`, migration 005). Presenter script: repository `docs/demo-account.md`; `npm run test:demo` walks it end to end. Real backend not exercised. NOTE-017 (Obsidian reference).
