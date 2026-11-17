---
tags: [business-suite, process, agents]
updated: 2026-11-17
---
# Business Suite change process

← [business-suite hub](<business-suite hub.md>) · [business-suite change requests](<business-suite change requests.md>) · [business-suite launch readiness](<business-suite launch readiness.md>) · Agent handbook (Obsidian reference)

**Adopted 2026-11-17 (H-PROC-20261117, NOTE-018 (Obsidian reference)).** Every change to the Business Suite repository follows the same path, whether a person or an agent makes it. The vault-wide Agent handbook (Obsidian reference) still governs task ownership and reports; this note adds the Suite-specific steps. Where they differ, the handbook and a direct human instruction win.

## The path, in order
| Step | What happens | Where it is recorded |
|---|---|---|
| 1. Capture | Write the request in the owner's words. One row per change | [business-suite change requests](<business-suite change requests.md>) (`CR-NNN`) |
| 2. Decide | If it changes a confirmed requirement or answers an open question, record the answer first | [business-suite open decisions](<business-suite open decisions.md>) under its `BS-DEC` ID, then [business-suite requirements](<business-suite requirements.md>) |
| 3. Specify | Update the one note that owns the behavior (table below) so it states the new current truth | Owning specification note |
| 4. Task | Create or extend a task with observable acceptance criteria. Several small requests may share one task | `_tasks/NOTE-NNN …`, Agent task board (Obsidian reference) |
| 5. Branch | `git switch -c note-NNN-short-name` from an up-to-date `main`. No direct commits to `main` | Repository |
| 6. Build | Change the layers in the fixed order below. Tests go in the same branch | Repository |
| 7. Verify | Run the checks that match the change type (matrix below). Record what ran and what did not | Task verification table |
| 8. Review | Open a pull request using the repository template. Fabiel approves the merge | GitHub |
| 9. Record | One row in [business-suite change log](<business-suite change log.md>), evidence in repository `docs/verification.md`, task report, board, re-export requirements | Vault and repository |
| 10. Release | Deploy only when the task authorizes it, with a fresh backup and the scoped procedure | [business-suite deployed backend](<business-suite deployed backend.md>) |

Small fixes (a typo, a one-line bug) skip steps 1–3 but still use a branch, the checks and a pull request.

## Which note owns what
| Change touches | Update this note |
|---|---|
| Vocabulary, pipeline stages, Orders/Jobs/Tasks, automations, teams | [business-suite CRM workflow and terminology](<business-suite CRM workflow and terminology.md>) |
| A screen, navigation, wording, empty or error state | [business-suite screens and flows](<business-suite screens and flows.md>) |
| Who can see or do something | [business-suite permissions](<business-suite permissions.md>) |
| Expenses, payments, balances, reimbursements | [business-suite money and reimbursements](<business-suite money and reimbursements.md>) |
| Tables, fields, constraints | [business-suite data model](<business-suite data model.md>) |
| Endpoints, commands, imports, webhooks, keys | [business-suite API and integrations](<business-suite API and integrations.md>) |
| Offline capture, sync, local storage | [business-suite offline and multiplatform](<business-suite offline and multiplatform.md>) |
| Desktop packaging, signing, updates | [business-suite desktop applications](<business-suite desktop applications.md>) |
| Hosting, backups, monitoring, sign-in, privacy | [business-suite security privacy and operations](<business-suite security privacy and operations.md>) and [business-suite deployed backend](<business-suite deployed backend.md>) |
| What must be tested and how | [business-suite quality and verification](<business-suite quality and verification.md>) |
| Order of work | [business-suite roadmap](<business-suite roadmap.md>) and [business-suite launch readiness](<business-suite launch readiness.md>) |

## Build order inside the repository
1. `packages/core`: types, validation, commands, permissions, calculations. Rules live here once.
2. `db/migrations`: a new numbered file. Never edit a migration that has been applied anywhere.
3. `apps/api`: collection mapping, authorization, grants for the runtime role.
4. `apps/web`: screens and client calls. Check 375 px and 1280 px, light and dark.
5. `apps/mobile` and `apps/desktop`: only when the change is in their scope.
6. Tests at the level of the rule: core unit test for a rule, API test for authorization, browser test for a flow.
7. `docs/source-map.md` when files or boundaries change; `docs/verification.md` for evidence.

## Checks by change type
| Change type | Required before a pull request |
|---|---|
| Any code | `npm run check`, `npm test`, `npm run format:check` |
| Screen or flow | Above, plus `npm run build`, the matching Playwright suite (`test:e2e`, `test:demo`, operations) and screenshots at phone and desktop width using fictional data |
| Money, permission or state rule | Above, plus a test for the denied or conflicting case, not only the success case |
| Schema or API authorization | Above, plus the real-PostgreSQL checks (`tests/postgres`) and, when a local backend exists, `ops/verify_local.py` |
| Offline or sync | Above, plus `npm run test:offline` |
| Desktop or mobile | Above, plus `npm run test:desktop` or `npm run build:mobile` |
| Deployment or operations | `python3 ops/test_deploy_shared.py -v`, a completed backup, and the deployed verifier afterwards |
| Documentation only | Links resolve and `npm run format:check` passes |

Hosted CI runs the first four rows on every pull request. Until the GitHub account issue in [business-suite launch readiness](<business-suite launch readiness.md>) (LR-01) is resolved, the same commands are run locally and their results pasted into the pull request.

## Naming
- Branch: `note-NNN-short-name`.
- Commit subject: imperative, under 72 characters. Body says why and names the task, for example `Refs NOTE-018, CR-004`.
- One purpose per pull request. Unrelated cleanup goes in its own branch.
- Change request IDs `CR-NNN` and task IDs `NOTE-NNN` are never reused.

## Definition of done
- [ ] Request, decision (if any) and owning specification note are updated.
- [ ] Acceptance criteria in the task are each verified, with the actual result written down.
- [ ] Required checks for the change type passed; skipped checks are named with the reason.
- [ ] No real customer data, credentials or receipts in source, fixtures, screenshots or notes.
- [ ] Pull request merged by Fabiel; branch deleted.
- [ ] Change log row, task report, board and updates index written; requirements re-exported to `docs/requirements`.

## How the notes are kept
- **Specification notes state what is true now.** When behavior changes, rewrite the relevant paragraph. Do not append another dated "NOTE-0NN result" section.
- **History goes in one place.** [business-suite change log](<business-suite change log.md>) gets one row per merged change; the detail lives in the task report under `_reports/`.
- **Status goes in one place.** [business-suite launch readiness](<business-suite launch readiness.md>) for launch work, the task record for everything else. The hub only links to them.
- Older dated sections already inside specification notes stay until that note is next edited for a real change; fold them into the body then.
- Filenames stay stable so links and the repository export keep working. Run `node scripts/export-requirements.mjs "<vault>/business-suite"` after any note change.
