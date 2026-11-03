# Teams, claiming and unclaimed-work alerts

Added 2026-11-03 at the owner's request. Research and options: `Claude outputs/reports/Team task queues and claiming.md` (not part of the repository). The canonical vault notes still need to be updated with these decisions.

## Decisions (owner, 2026-11-03)

- Workspaces have **teams** (departments). New signage workspaces start with **Production, Sales, Marketing and Office**. The admin department is called **Office**, so it is not confused with admin permissions.
- A task goes to **one person**, or to a **team with nobody yet** ("up for grabs"). Any member of that team can **claim** it. The team stays on the task after the claim.
- **Only your own team:** members see their own teams' tasks, including what teammates have claimed. They never see another team's tasks. People in two teams see both. Owners, managers and team leads (`work.assign` / `work.lead`) keep seeing everything.
- **Prices stay hidden.** Teams never grant permissions. Production still never receives prices.
- **Alerts:** when team work waits unclaimed, the team's leads are alerted after a wait set per team, from 1 to 23 business hours or 1 to 5 business days. Defaults: Sales 2 h, Production 4 h, Marketing and Office 1 business day. Only **business hours** count (time zone, working days, opening and closing time; default Mon–Fri 09:00–18:00, America/Mexico_City). A due date brings the first alert forward, after at least one business hour of grace. Then one reminder per business day, at most 5 alerts in all. Teams without a lead alert owners and managers.

## Data

- Kept in workspace settings, so no database migration: `Workspace.teams[]` (`id`, `name`, `memberIds`, `leadIds`, `alert`, `archived`) and `Workspace.businessHours`. Members are member contacts. Leads must be members.
- New optional fields on `Task`:
  - `teamId`
  - `queuedAt`: when the task last entered the queue
  - `claimedAt`
  - `alerts` and `lastAlertAt`
  - `completedBy` and `completedAt`, which satisfy BS-DEC-032 ("completion records the actor")
  - `history[]`: who held it, at most 50 entries
- Older tasks without these fields are unchanged.

## Commands

| Command | Who | Notes |
|---|---|---|
| `task.save` (+ `teamId`, `by`) | `chores.write`, with record scope (below) | Assignee must belong to the task's team. `pool` is rejected. |
| `task.claim` `{id, memberId}` | `chores.write`, team member, only for yourself | Refused with `ALREADY_CLAIMED` (HTTP 409): "Ana claimed this first at 10:31". |
| `task.unclaim` `{id, by}` | holder, lead or manager | Back to the queue; the unclaimed clock restarts. |
| `task.complete` (+ `by`) | as before, plus team scope | Records who completed it. |
| `team.defaults`, `team.save`, `team.archive`, `workspace.hours` | `workspace.manage` | A team with open tasks cannot be archived. |
| `task.alert` | scheduler only | Notifies leads or managers and counts the alert. |

`by` is checked on the server: it must be one of the caller's own member contacts.

## Record scope (security fix)

Before this change, `task.save` and task archiving checked only `chores.write`. A production worker could therefore edit, reassign or archive any task by ID, including tasks they could not see. Now:

- Every task command checks that the caller can see the task (`seesTask`). The same rule drives `projectForActor`.
- Production workers can edit and archive only tasks they hold.
- Only leads and managers can give a task to someone else.

## Offline

- `task.claim` and `task.unclaim` can be captured offline. They are sent without the workspace revision, so unrelated edits never block them.
- If a teammate claimed first, the server answers 409. The pending item becomes a visible **conflict** that the person reviews; it is never retried or overwritten automatically.

## Screens

- **My work:** second in the menu, so it is in the phone bottom bar. It shows my tasks and jobs, then each of my teams' up-for-grabs queue, sorted by due date and then by wait. Each item shows how long it has waited. A **Take next** button claims the first one. Below the queue: what teammates hold, and for leads and managers, a summary of every team queue.
- **Tasks:** a team filter, "Up for grabs" badges, and Claim / Give back buttons.
- **Settings → Teams and Business hours.**

## Not done yet

- Jobs do not have teams yet, and the `lead` role still sees all work rather than only its own team.
- Automations cannot target a team.
- There are no "everyone must do it" tasks (one task per member).
- Automatic assignment (round robin) is not implemented.
- Holidays are not counted as closed days.
- API tests for the 409 claim conflict ran only through the core rules, not against PostgreSQL.
