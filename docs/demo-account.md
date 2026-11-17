# Demo account (showcase)

A browser-only demo of one fictional signage company, **Brightline Signs**, with every role. All
records are fictional, use reserved `example.com` addresses and stay in this browser's storage.
No server, credentials or real data are involved. Production builds never fall back to it.

## Start

```bash
npm run build --workspace @suite/core --workspace @suite/offline
npm run dev --workspace @suite/web -- --mode operations --port 5181
```

Open `http://localhost:5181/?demo=1`, or open `http://localhost:5181` and choose **Open the demo
account** on the sign-in screen. On a Mac, double-click `Run Zut CRM demo.command`.

**Reset demo** (top bar) replaces everything with fresh data dated today. Do this before each
showcase: the running shifts in the samples start a couple of hours before the data is created.
Saved demos from older app versions are replaced automatically (`SAMPLE_VERSION`).

## People (top bar → Signed in as)

| Person | Role                   | What they see                                            |
| ------ | ---------------------- | -------------------------------------------------------- |
| Morgan | Owner                  | Everything, including members and Activity               |
| Casey  | Operations manager     | Everything except members; leads the Sales team          |
| Priya  | Sales (collaborator)   | People, pipeline, orders and prices; no money            |
| Rosa   | Bookkeeper (finance)   | Money review and payments; everyone's hours              |
| Sam    | Production lead        | All production work and hours, no prices                 |
| Alex   | Installer (production) | Only their own jobs, tasks and hours; no prices or money |
| Jordan | Designer (production)  | Same as Alex                                             |

## Data

- Pipeline: at least one deal in every stage (New → Lost), eight linked companies.
- Orders: #1 Reception signage (deposit received, in Fabrication), #2 its phase 2 (awaiting
  release), #3 Classroom door signs (released by a manager without deposit, in Design).
- Money: one approved expense and two missing-receipt expenses awaiting review; a deposit.
- Teams: Production (lead Sam) and Sales (lead Casey) with up-for-grabs tasks.
- Automations: quote follow-up, Fabrication hand-off, delivered on install, welcome a new lead.
- Time clock: last week's shifts for five people; Alex and Jordan are on the clock now.

## Suggested script

1. **Priya**: People → Add contact (type Lead) → My work shows the automation's call-back task.
   Pipeline → New project → Edit / move to Quote sent → Create order.
2. **Casey**: Production → Release (manager approval with a reason) → Move to Design approved →
   Move to Fabrication. The automation assigns Sam and notifies them.
3. **Sam**: My work → notification and the prepared task; **Take next** claims queue work.
4. **Alex**: no Money, no prices. Time clock → Clock out, choose a job → Clock in. The running
   timer also shows in the top bar.
5. **Rosa**: Money → Review the vinyl expense. Time clock → who is on the clock, hours by person,
   **Correct** a shift (a reason is required and kept in Activity).
6. **Morgan**: Activity shows every change, including corrections; Automations lists the rules.

`npm run test:demo` runs this whole script in a fresh browser (`tests/demo/showcase.spec.ts`).

## Time clock rules

- `time.track` clocks yourself in and out; `time.review` (owner, manager, finance, lead) sees
  everyone's hours, clocks others in or out and corrects entries with a required reason.
- One running shift per person. Production workers can log time only on jobs assigned to them.
- Punches are offline commands that keep their device time if they sync within 24 hours, may
  not be ahead of the server clock and may not overlap hours already recorded.
- Hours only: the clock never sets pay, prices or payments.
- Server table `suite_time_entries` (migration `005_time_entries.sql`); the runtime role needs
  `SELECT, INSERT, UPDATE` on it (`ops/local_backend.py` grants it locally).
