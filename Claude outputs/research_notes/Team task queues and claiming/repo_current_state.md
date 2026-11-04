# Business Suite repository: current state for Teams, assignment, claiming and routing

All paths are relative to `/Users/fabiel/Desktop/business-suite`. "Code" means it is implemented in source. "Docs" means it is only written in requirements. "Absent" means it is in neither. The working tree has uncommitted user changes (git diff --stat: 12 files, about 115+/27-). Those changes add the `lead` contact kind and adjust intake/import. None of them touch tasks, jobs, assignment or permissions.

## Q1. Task and Job types; how they are created, updated, completed and repeated

### Takeaway
Tasks and Jobs each have exactly one `assigneeId` string, which points at a Contact with `kind: 'member'` or is empty. There is no team, queue, claim, `completedBy` or `completedAt` field. Jobs are embedded in an Order (`projects[].jobs[]`) and are not top-level rows. Only Tasks repeat, and the next occurrence is created when the current one is completed.

### Cited Findings
- `Task = Row & { title, assigneeId, projectId, due, notes, done: boolean, recurrence: 'none'|'daily'|'weekly'|'monthly', nextTaskId }`. There is no completer, completion time, team or status beyond `done`. Source: packages/core/src/operations/types.ts:145-154
- `Job = { id, name, assigneeId, stage: ProductionStage, due, notes }`. Its doc comment says a Job is "assigned to one team member". It has no `version`, `workspaceId` or archived flag of its own, because it lives inside `Project.jobs?: Job[]`. Source: types.ts:72-80, 90-103
- `Project` (an Order in the product vocabulary) also has a single `assigneeId`. Source: types.ts:98
- `Row` provides `id, workspaceId, version, createdAt, updatedAt, archived`. Source: types.ts:25-32
- Production stages are a fixed list from `Awaiting release` to `Closed`. Source: types.ts:104-113
- `SuiteData` collections are workspaces, contacts, companies, deals, projects, expenses, payments, tasks, referrals, templates, drafts, automations, automationRuns, notifications, audit and commands. There is no `teams` collection. Source: types.ts:264-283
- The shared `member()` helper accepts an empty value (when optional), the literal `'pool'`, or a Contact with `kind === 'member'`. Source: packages/core/src/operations/commands.ts:139-144
  - Validation accepts the same values. Source: validation.ts:130-136
  - `'pool'` is the Money module's shared-funds sentinel. The UI renders it as "Shared funds" or "Business funds". Source: apps/web/src/operations/pages.tsx:86-88
  - `job.save` rejects `'pool'`. Source: commands.ts:781
  - `task.save` does not reject `'pool'`. Source: commands.ts:1049
- `task.save` creates a task or overwrites title, assigneeId, projectId, due, notes and recurrence. A recurring task needs a due date. New tasks start with `done:false, nextTaskId:''`. Source: commands.ts:1044-1074
- `task.complete` refuses a task that is already done and sets `done = true`. For a recurring task it creates the next one with id `command.id + '-next'` and a new due date (+1 day, +7 days, or the same day next month, clamped to month end). The new task copies every field, including `assigneeId`. Source: commands.ts:1075-1101
- `job.save` creates a Job (at most 20 per Order) or edits an existing one, using name, assigneeId, due and notes. New Jobs start in `Design` if the Order is released, otherwise in `Awaiting release`. Source: commands.ts:771-804, 327-341
- `job.move` changes the stage. A Job cannot return to `Awaiting release` after release. The Order becomes `completed` once every Job is `Closed`. Source: commands.ts:805-826
- `deal.convert` creates an Order with a single unassigned `Production` Job. Source: commands.ts:740-743
- `project.save` creates one Job assigned to the Order's assignee. Source: commands.ts:863
- `orderJobs()` turns a legacy Order that has no `jobs` into one implied Job. Source: packages/core/src/operations/production.ts:9-25
- Concurrency:
  - Every command may carry `expectedRevision`, which is checked against one revision number for the whole workspace. On mismatch it returns `CONFLICT` with the message "This workspace changed in another tab…". Source: commands.ts:282-287
  - `touch()` increments the row's `version`. Source: commands.ts:309-312
  - Command ids are idempotency keys with fingerprints. Source: commands.ts:268-281
  - Each person's command advances the revision exactly once. Source: commands.ts:1311-1313
- The audit entry is `{id, workspaceId, at, action, recordId, summary, automationId?}`. The core audit type has no actor. Source: types.ts:177-186
  - The API stores `actor_id` alongside each audit entry. Source: apps/api/src/operations.ts:392-395 (member update path) and the `save()` receipt path, operations.ts:118-134

### Inferences
- "Up for grabs" is already expressible as an empty `assigneeId`. However, workers with `production`/`work.read.assigned` cannot see unassigned items (see Q2), so there is currently no pool that anyone can browse.
- A team assignment needs a new field, for example `teamId` alongside `assigneeId`, or a reserved value. Reusing `'pool'` would collide with Money semantics.
- A `completedBy` field is required by the docs (BS-DEC-032 says "Record who completed each task"), but it is missing from `Task`.
- Because a recurring task copies `assigneeId`, a claimed team task would stay assigned to the claimer on its next occurrence. Whether the next occurrence should go back to the team queue is undecided.

### Gaps
- No task status beyond `done`, such as claimed, in progress or blocked, exists in code. The docs mention `pause/block` only for jobs (see Q5).

## Q2. Roles, permissions and how record scope is enforced in core and API

### Takeaway
There are seven roles in `ROLE_GRANTS`, and each account has exactly one. Assignment scope applies only to the `production` role, through `work.read.assigned`. It is enforced server-side by `projectForActor` (for reads) and `authorizeCommand` (for `job.move` and `task.complete`), which the API calls on every request. The `lead` role is not limited to a team: in code it sees and completes all work. There are also write-scope holes, for example on `task.save`.

### Cited Findings
- The permission list includes `work.read`, `work.read.assigned`, `work.write`, `work.lead`, `work.assign`, `chores.read`, `chores.write`, `members.manage` and `automations.manage`, among others. Source: packages/core/src/operations/permissions.ts:1-24
- `ROLE_GRANTS` by role. Source: permissions.ts:26-56
  - owner: all permissions.
  - manager: all except `members.manage`.
  - collaborator: contacts, crm, `work.read`/`work.write`, `prices.read`, chores and referrals.
  - finance: money permissions, `work.read`, `prices.read` and `backup.export`.
  - viewer: read permissions only.
  - lead: `contacts.read`, `work.read`, `work.lead`, `chores.read`, `chores.write`.
  - production: `contacts.read`, `work.read.assigned`, `chores.read`, `chores.write`.
  - The source comment reads "Production never receives prices. Team leads see all production work; workers only theirs." (permissions.ts:53)
- `commandAccess` mapping. Source: permissions.ts:57-86
  - `job.save` requires `work.assign`.
  - `order.release` and `project.*` require `work.write`.
  - Every `task.*` command requires `chores.write`.
  - `automation.*` requires `automations.manage`.
- Account-to-member link: `actorMemberIds()` returns the active member Contacts whose email matches the signed-in email. Source: packages/core/src/operations/production.ts:35-48
- `authorizeCommand`. Source: production.ts:53-90
  - `job.move`: anyone with `work.assign` or `work.lead` passes. Otherwise the actor needs `work.read.assigned` and must be the job's assignee. Denial message: "Only the assigned team member, their team lead or a manager can move this job." (production.ts:60-70)
  - `task.complete`: needs `chores.write`. Leads and managers pass. Otherwise, if the task has an assignee, the actor must be that assignee. An unassigned task can be completed by any holder of `chores.write`. (production.ts:71-78)
  - `notification.read`: only the recipient. (production.ts:79-86)
  - Every other command checks only the action permission and has no record scope. (production.ts:87-89)
- `projectForActor` read filtering. Source: production.ts:93-161
  - "assignedOnly" means `!work.read && work.read.assigned`. Such an actor sees only Orders that have one of their Jobs, with the Jobs filtered to theirs, plus only tasks assigned to them, contacts linked to those Orders, all member contacts, and companies of the visible contacts. (production.ts:119-138)
  - Prices are zeroed without `prices.read`. (production.ts:139-150)
  - Automations are hidden without `automations.manage`. (production.ts:151-154)
  - Notifications are filtered to the recipient. (production.ts:155-157)
  - Audit is hidden without `workspace.manage`. (production.ts:158)
- The API applies both functions on every command:
  - It calls `authorizeCommand(before, command, { grants, email: member.email })`, then `executeCommand`, then `save`, and returns `project(after…)`. Source: apps/api/src/operations.ts:346-349
  - Reads are projected the same way. Source: operations.ts:116-117, 283-286
  - Before each command it locks the membership (`FOR SHARE`) and the workspace row (`read(..., lock=true)` → `SELECT … FOR UPDATE`). Source: operations.ts:73-86, 89-93, 313
  - Grants come from `ROLE_GRANTS[membership.role]`. Source: operations.ts:86
- Database roles: `suite_space_members.role` started as owner/manager/collaborator/finance/viewer. Source: db/migrations/002_operations.sql:9-18
  - Migration 003 adds `lead` and `production`. Its comment: "Team lead and production roles were added … automations assign work to them." Source: db/migrations/003_automations.sql:21-28
- Older v1 API (E1), which is separate:
  - `membership_grants(permission, scope IN ('business','assigned','own'))`. Source: db/migrations/001_work_money.sql:23-34
  - A many-to-many `job_assignments` table for v1 `jobs`. Source: 001_work_money.sql:54-61
  - `createJob` accepts up to 50 `assignedUserIds`, which must be active memberships. Source: apps/api/src/jobs.ts:117-141
  - `requireBusinessAction` and `scope()` helpers. Source: apps/api/src/context.ts:54-74
- Tests:
  - "tasks are completed by the assignee, their team lead or a manager". Source: packages/core/test/crm-workflow.test.ts:161-175
  - "team lead sees all production work". Source: crm-workflow.test.ts:193

### Inferences
- Write-scope hole: `task.save` checks only `chores.write`, and `production` has `chores.write`. A production worker can therefore edit or reassign any task by id, including ones they cannot see, and take it for themselves. A claim command needs its own record-scope rule in `authorizeCommand`, and `task.save` reassignment needs restricting.
- Docs say a team lead's scope is their team (see Q5). In code a lead has full `work.read` and completes any task. Teams would make "their team" checkable for the first time.
- Server enforcement is real. Both rules live in shared core, so Team rules added to `authorizeCommand`/`projectForActor` would automatically apply in example mode and the API.
- Roles are per account (one role per space member), while team membership would naturally attach to the member Contact or the account. There are two identity concepts (see Q4), and the link between them is an email match.

### Gaps
- Whether a person can belong to several teams, or be lead of one team and a worker in another, is not addressed anywhere.

## Q3. How automations create and update tasks and choose assignees

### Takeaway
Automation actions name an assignee as one specific member Contact id, the literal `'assignee'` (the triggering record's assignee), or empty (nobody). There is no round-robin, load balancing or team target. The CRM note lists "teams do not exist, so assignments go to one member" as a known gap.

### Cited Findings
- The comment on `AutomationAction` reads "`memberId` is a member contact, `assignee` (the record's assignee) or empty for nobody". Source: packages/core/src/operations/types.ts:202-230
- Actions are `task.create` (with optional notes, recurrence and link), `tasks.create` (several items), `tasks.update` (`change: 'complete'|'reassign'`, `titleContains`), `job.assign`, `notify`, `stage.move` and `note.add`. Source: types.ts:203-230
- The `job.unassigned` condition exists. Source: types.ts:197-201; automations.ts:556-557
- Parsing: `member()` accepts empty, `'assignee'` (only when the trigger subject is a job or task, otherwise "This trigger has no assignee; choose a team member…"), or an existing member Contact (unarchived while live). Source: packages/core/src/operations/automations.ts:206-222
- `job.assign` requires a specific member, not `'assignee'`. Source: automations.ts:311-313
- At run time `recipient()` resolves `'assignee'` to `assigneeOf(subject)`, the job's or task's assigneeId. Source: automations.ts:634-635, 399-401
- `task.create` and `tasks.create` issue `task.save` with the resolved assignee. Source: automations.ts:637-666
- `tasks.update` reassigns or completes the open tasks linked to the record's Order(s), optionally filtered by title. Source: automations.ts:667-708
- `job.assign` issues `job.save`. Source: automations.ts:709-721
- `notify` with an empty recipient is skipped ("Nobody to notify"). Source: automations.ts:722-731
- Automations can only issue commands in `AUTOMATION_COMMANDS`. Source: automations.ts:626
- Automation depth is capped. Source: commands.ts:1306-1310
- Triggers and conditions come from a fixed list: "Fixed lists only: automations are not a general workflow engine." Source: types.ts:187-201
- Docs list "assign a Job/Task to a team member or team" as a Proposed action. Source: docs/requirements/business-suite CRM workflow and terminology.md:116
  - The example is "assign the Fabrication Job to the shop team". Source: same file, line 117
- Gap noted in the CRM note: "Projects have no owner… teams do not exist, so assignments go to one member". Source: CRM workflow and terminology.md:139

### Inferences
- A team target would extend `memberId` (for example `team:<id>`) or add a `teamId` field. It would also need parse validation (the team exists and is active) and the same re-check in `automation.enable`. Source for the re-check: commands.ts:1192-1203
- "Notify the team" would have to fan out to individual notifications, because `Notification.recipientId` is a single member. Source: types.ts:257-263

### Gaps
- No documented rule exists for round-robin or load-based distribution. The docs mention only "assign to a team".

## Q4. How members are represented; implementation-contract on `members` and `x-demo-user`

### Takeaway
There are two parallel "member" concepts:
- **Accounts:** `suite_space_members(user_id, email, name, role, active)`, with exactly one role each.
- **Member contacts:** `Contact.kind === 'member'`, which are the targets of every assignment.

They are linked only by a matching email. The v1 contract's `members` list and `x-demo-user` belong to the older E1 job API.

### Cited Findings
- Contact kinds are `'lead'|'customer'|'supplier'|'member'|'candidate'|'employer'`. `'lead'` is an uncommitted user change. Source: packages/core/src/operations/types.ts:36
- Assignee pickers list active member Contacts. Source: apps/web/src/operations/pages.tsx:90-91
  - They are labelled "Assigned to" for Orders, "Team member" for Jobs and "Responsible person" for Tasks. Source: pages.tsx:539, 559, 1262
- The account-to-contact link is the email match in `actorMemberIds`. Source: production.ts:35-48
- The v2 members endpoints `GET/POST /v2/workspaces/:id/members` need `members.manage`. They can change role and active, cannot change the owner, and are audited as `member.update`. Source: apps/api/src/operations.ts:353-398
- Invitations fix the email and role. Source: operations.ts:399-424; apps/api/src/operations-auth.ts:224-270
- `lead.capture` "never create team members". Source: commands.ts:599-600
- Example mode offers a "View as" switch with Owner, Manager, Sales (collaborator), "Team lead (Sam)" (sam@example.com) and "Production (Alex)" (alex@example.com). Source: apps/web/src/operations/OperationsApp.tsx:83-90
  - The matching sample member contacts are created in packages/core/src/operations/samples.ts:32-34
- implementation-contract.md (historical NOTE-007): `GET /v1/workspace` returns `members?:{id,name}[]` "only for a business-scoped job creator; it contains active member IDs/names for assignment". `x-demo-user` is `manager` or `worker` and "has NO effect in real server". Source: docs/implementation-contract.md:13
  - The contract also requires "assignments for worker scope". Source: implementation-contract.md:25
- The demo API rejects any `x-demo-user` other than manager or worker. Source: apps/api/src/app.ts:161-164
- permissions.md says `x-demo-user` "is not a production login or privileged header". Source: docs/requirements/business-suite permissions.md:33

### Inferences
- Teams most naturally hold member Contact ids, consistent with every existing assignee field.
- Scope checks, however, run through account email to contact. A Team-lead check would have to be: actor email → member contact ids → teams where that contact is lead.

### Gaps
- No doc says whether team membership belongs to the account (`suite_space_members`) or to the member Contact.

## Q5. What the requirements docs say about teams, roles, assignment, claiming, queues, offline conflicts and pending versus confirmed state

### Takeaway
The docs name the audiences "manager, sales, marketing and production" and repeatedly refer to a team lead's "team". However, they never define a Team record, departments, an unassigned queue or claiming. Offline rules are strict: no automatic merging, and a 409 is kept as a conflict for human review. A claim race is a version/state conflict under these rules.

### Cited Findings
**Audiences and team language**
- "It serves the manager, sales, marketing and production." Source: docs/requirements/business-suite CRM workflow and terminology.md:12
- Role views: a Worker sees "Only work … assigned to them". A Team lead sees the "Team's production timeline … Work assigned to their team; can complete their team's tasks; no prices". A Manager "assigns team members; sets assignment automations; can complete any task". Source: CRM workflow and terminology.md:86-92
- "The role view only chooses the default screen… must be enforced by the backend". Source: CRM workflow and terminology.md:94
- CRM-T-07: "A Task can be completed by its assignee, the assignee's team lead, or a manager." Source: CRM workflow and terminology.md:23
- CRM-T-15: "each piece is its own 'Order / Job' card… Each team member sees only the pieces assigned to them." Source: CRM workflow and terminology.md:31
- CRM-T-16: "The manager assigns team members, and can set automations that decide what each team member sees". Source: CRM workflow and terminology.md:32
- "Each Task has one assignee (Proposed)… Completion records who completed it." Source: CRM workflow and terminology.md:109-110
- In the glossary, a Task is a "To-do with one assignee, due date and status". Source: CRM workflow and terminology.md:46
- Permissions note: "a team member reads only the Orders/Jobs/Tasks assigned to them, a team lead those assigned to their team… Team lead is a new actor template." Source: docs/requirements/business-suite permissions.md:72
- Evaluation order "identity → membership → capability → action → record/entity/site scope → field". Source: permissions.md:12
- "Record assignment does not imply permission to inspect all job prices". Source: permissions.md:12
- The role templates are proposals, not approved; BS-DEC-013 is still open. Source: permissions.md:9, 35-46; open decisions.md:25
- BS-DEC-032 is resolved: "a manager can complete other people's tasks, as can the assignee and their team lead", with the safe position "Record who completed each task". Source: docs/requirements/business-suite open decisions.md:44
- BS-DEC-034 is resolved: "Jobs are real records assigned to members". Source: open decisions.md:46
- BS-DEC-007 (scheduling conflicts) is open. Its safe position: "Record assignments; do not claim conflict prevention". Source: open decisions.md:19
- BS-DEC-006 (recurrence) is open: "Do not generate future jobs automatically". This is about Jobs; Tasks already repeat in code. Source: open decisions.md:18
- The data model has "a role workspace is a navigation view, not an access boundary". Source: docs/requirements/business-suite data model.md:12
- Conceptual "Assignment/time/trip" and "Work allocation" entities appear only as a target dictionary. Source: data model.md:34-36
- The proposed job lifecycle includes "Scheduled → start → in progress | Assigned authorized worker" and "pause/block … does not erase assignment". Source: docs/requirements/business-suite modules and workflows.md:30-32
- A manager can "See permitted work and review queues… assign people". This refers to review queues, not work queues. Source: docs/requirements/business-suite screens and flows.md:31

**Offline and conflicts**
- Offline authorization: "cached module/grant information is only a local eligibility snapshot. Server replay checks current membership/action/record/field scope". Source: permissions.md:64
- A queued close "includes the job version… Another device may edit, reassign or close the job… A conflict must not be auto-resolved by replacing the expected version". Source: docs/requirements/business-suite offline and multiplatform.md:58-59
- Financial values never use last-write-wins. Source: offline and multiplatform.md:61
- 409 handling: "Retain original intent as conflict. Do not replace its version and automatically resend." Source: docs/offline-contract.md:78
- The snapshot is confirmed server data, and "Pending work is never inserted into it as if the server had accepted it." Source: offline-contract.md:28
- Only expense submit and job close are queued in the v1 engine. Source: offline-contract.md:37-46
- UI states must "distinguish pending, synchronized, conflict, denial". Source: offline and multiplatform.md:47; requirements.md:77 (BS-OFF-003)
- BS-DEC-028 (full offline workflow and conflict policy, including "assignment" workflows) is open: "no automatic financial merge or silent server-version rebase". Source: open decisions.md:40
- The operations web app's `OFFLINE_COMMANDS` set includes `task.save` and `task.complete` (with contact, deal, project, expense and referral saves). Source: apps/web/src/operations/OperationsApp.tsx:57-68

### Inferences
- A claim made offline must stay pending ("Claim requested") until the server confirms it. If someone else claimed first, the result is a conflict to show, not something to overwrite. This follows offline-contract.md:28 and :78.
- Because the API serializes commands with a workspace row lock (operations.ts:313), a server-side precondition such as "still unclaimed" or matching `version` makes the first claim win deterministically.
- "Teams (Production, Sales, Marketing, Admin)" is a new human direction. The docs name manager, sales, marketing and production as audiences but never "Admin" as a team or "departments".

### Gaps
- Searches of docs/requirements, docs/*.md and README found no mention of "claim", "up for grabs", an unassigned queue, round-robin or departments.

## Q6. Constraints from decisions and rejected designs

### Takeaway
Several constraints apply:
- Keep a modular monolith with no microservices, generic workflow engine or universal entity tables.
- Use fixed automation lists.
- Enforce everything on the backend.
- Production must never see prices.
- Automations must never widen access.

A Team record is a specific new record type, so it fits these rules, provided it is not built as a generic "group" or "queue" abstraction.

### Cited Findings
- From AGENTS.md (working rules): "Keep modules internally separated in one application; avoid microservices, generic workflow engines or universal entity tables without evidence."
- From AGENTS.md (working rules): "Enforce business membership, enabled module, action privilege and record scope on the backend. UI hiding is not security."
- "Avoid microservices, Kafka, Kubernetes, event sourcing, a full workflow builder, arbitrary plugins…" Source: docs/requirements/business-suite architecture.md:88; also :32
- BS-ADR-010 says there is "No general plugin marketplace or workflow engine in first slice". Source: architecture.md:71
- BS-DES-001 "avoids one universal job/sale/payment record". Source: docs/requirements/business-suite requirements.md:59
- "Workflow template … Not a generic workflow engine". Source: CRM workflow and terminology.md:54
- Triggers and actions come from a fixed list. Source: CRM workflow and terminology.md:118
- "An automation can never give production access to prices." Source: CRM workflow and terminology.md:117
- Automations never record a payment, approve, change a price, create an Order or release an Order. Source: CRM workflow and terminology.md:118
- Production never sees prices (CRM-T-06). Source: CRM workflow and terminology.md:22
- The field scope is enforced by `projectForActor` zeroing amounts. Source: production.ts:139-150

### Inferences
- If a Sales or Marketing team includes production-role people, team visibility must still not expose deal amounts. The price rule depends on `prices.read`, not on team, so it holds as long as team membership grants no permissions.
- To respect "no universal entity tables", keep `teamId` on Task and Job rather than introducing a generic "work item queue".

### Gaps
- The docs neither approve nor reject team-based permissions, for example whether being on the Sales team grants CRM access. Roles stay per account (BS-DEC-013 is open).

## Q7. UI navigation: where a Teams tab and a "My work" view would fit

### Takeaway
Navigation is a flat list built from grants and enabled modules: Overview, People, Companies, Pipeline, Jobs, Money, Tasks, Referrals, Automations, Device sync, Activity and Settings. The first four entries go in the phone bottom bar and the rest in "More". There is no My work or Teams page. Settings is the existing home for workspace configuration.

### Cited Findings
- Page names: overview "Overview", crm "Pipeline", contacts "People", companies "Companies", work "Jobs", money "Money", chores "Tasks", referrals "Referrals", automations "Automations", settings "Settings", activity "Activity", sync "Device sync". Source: apps/web/src/operations/OperationsApp.tsx:69-82
- How the nav list is built. Source: OperationsApp.tsx:819-833
  - It starts with `overview`.
  - `contacts` and `companies` need `contacts.read`; companies are not shown in household workspaces.
  - Module pages need the module enabled plus `<module>.read`, or `work.read.assigned` for the work page.
  - `automations` needs `automations.manage`.
  - `sync` always appears, `activity` needs `workspace.manage`, and `settings` always appears.
- Phone layout: `primaryNav` is the first four entries, excluding sync, activity and settings. `moreNav` holds the rest. Source: OperationsApp.tsx:982-983
- Phone bottom navigation is rendered at OperationsApp.tsx:1217-1238. Sidebar navigation is at :1050-1067.
- The Tasks page lists every visible task in a table with the columns Task, Responsible, "Due / repeat" and Actions. The "Add task" button appears when the user has `chores.write`. There is no "mine" or unassigned filter. Source: apps/web/src/operations/pages.tsx:1280-1307
- The Jobs (Work) page shows "Unassigned" for Jobs with no assignee. Source: pages.tsx:598, 645
- Overview shows a "Members" count and a task list with the assignee name. Source: pages.tsx:1708-1732, 1796
- Settings is its own component (apps/web/src/operations/Settings.tsx), with a members and roles area backed by `/v2/.../members`.

### Inferences
- "My work" fits as a new first or second nav entry, visible to everyone with `chores.read` or work read access, so it would land in the phone bottom bar.
- A team queue ("Up for grabs") could be a section of My work, or a filter on Tasks and Jobs.
- Team management (create teams, set members and lead) fits either under Settings next to members and roles, or as a "Teams" entry gated by `members.manage`/`workspace.manage`. It would land in "More" on phones because of the four-item limit.

### Gaps
- I did not read Settings.tsx in full to confirm its exact member-management UI.
- I did not check the screens for the narrow-viewport layout.
