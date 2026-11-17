# Data import

Bring existing lists into a workspace from files. Nothing here reads another application directly: export a CSV from wherever the data lives and import that.

| What | Where | Command | Needs |
| --- | --- | --- | --- |
| People and companies | People → Import | `contact.import` | `contacts.write` |
| Pipeline projects | Pipeline → Import | `deal.import` | `crm.write` and `contacts.write` |
| Orders | Production → Import | `project.import` | `work.write` and `contacts.write` |

Each panel has a **CSV template** button. Column names are matched in English or Spanish (`Deal Name`, `Amount`, `Pedido`, `Precio`, `Cliente`…) and can be corrected before importing. Spreadsheet files must be saved as CSV first.

## What happens

1. The file is read in the browser. Limits: 5 MB, 10,000 rows.
2. A preview shows each row as new, already here, repeated in the file, or left out with the reason.
3. One button states how many rows will be imported. Rows are sent in batches of 500; the server validates every row again and rejects a batch that contains a bad one, naming the row.
4. Importing the same file again adds nothing: a project or order with the same title for the same customer is skipped.

## Rules

- **Amounts** are stored as integer minor units in the workspace currency. `12500`, `12,500.50`, `$1,200` and `1200,5` are understood. `1.234` is refused because it could be one thousand or one and a bit.
- **Dates** are stored as `YYYY-MM-DD`. For `03/04/2026` choose day-first or month-first in the panel.
- **Customers** are matched by email, then phone, then exact name. One who is not found is added, as a lead for projects and a customer for orders, with the file name as source.
- A row with only a company name keeps `Company: <name>` in its notes, because projects and orders link to a person.
- **Projects** land in the pipeline stage named in the file, or the first stage. An unknown stage is an error.
- **Orders always start awaiting release.** An import never records a deposit, payment, approval, expense or release, never creates tasks, and never starts automations.

## Not available

Opening balances, orders imported as already completed, expenses, tasks, and reading `.xlsx` directly.

## Source

`packages/core/src/operations/intake.ts` (people, companies, CSV and vCard parsing), `recordImport.ts` (projects and orders), the `*.import` cases in `commands.ts`, `apps/web/src/operations/Import.tsx` and `RecordImport.tsx`. Tests: `packages/core/test/intake.test.ts`, `record-import.test.ts`.
