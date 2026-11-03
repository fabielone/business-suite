# Companies, lead intake and contact import

Added 2026-11-03. People and Companies can now come from website forms, sales channels and files.

## Company record

`Company` is its own record (`suite_companies`, migration 004): name, email, phone, address, website, notes, contact person (`primaryContactId`, a link to a Person) and source. A Person links to it with `companyId`. The Person's `company` text keeps the company's name, so older screens and exports still show it. When unlinked, it remains free text, such as a supplier's specialization. Renaming a company updates its people. Company names are unique per workspace, ignoring case, accents and punctuation. The Companies tab is hidden in household workspaces. Without its own phone or email, the list shows the contact person's, without copying them. Projects still link to a Person; a direct Project → Company link is not implemented.

Commands: `company.save`, and `record.archive` / `record.restore` with `collection: "companies"`. All of them need `contacts.write`.

## Lead capture: forms and sales channels

`POST /v2/intake/{workspaceId}/leads` accepts JSON or a plain HTML form post (`application/x-www-form-urlencoded`). Authenticate it with an **intake key**, sent as `Authorization: Bearer sik_…`, as `X-Intake-Key`, or in a `_key` form field.

```json
{
  "fields": {
    "firstName": "Ana", "lastName": "Ruiz", "email": "ana@example.com",
    "phone": "+52 55 0000 0000", "company": "Example SA", "message": "Quote please"
  },
  "projectTitle": "Storefront sign",
  "estimatedValueMinor": 250000
}
```

- Field names are matched loosely: `name`/`full_name`, `first_name`, `email`, `phone`, `company`, `position`/`title`, `website`, `message`, address parts, and Spanish equivalents (`nombre`, `correo`, `teléfono`, `empresa`…).
- A new Person gets type customer. The intake never creates team members. A known person, matched by email or else phone, is **never changed**: the message is only added to their notes with the date and source. The same applies to known companies.
- `projectTitle` (optional) opens a Project in the first open pipeline stage when CRM is enabled. `estimatedValueMinor` is in integer minor units.
- `Idempotency-Key` (8–100 letters, digits, `-` or `_`) makes retries safe: the same key and lead return 200 without a second record.
- `_gotcha` is a honeypot. If it is filled in, the response is 202 and nothing is stored. `_redirect` sends the browser to a thank-you page only when that page's origin is one of the key's websites. Requests are limited to 30 per minute per IP and workspace.
- Responses: 201 added, 200 retry, 303 redirect, 400 invalid field, 401 missing, wrong or revoked key, 403 website not allowed for the key, 429 rate limit.
- The command runs as `lead.capture` through the same domain rules and audit. The audit actor is the key's ID, and a new contact's source is the key's source name. "Person added" automations run for leads.

Keys are managed in **Settings → Lead intake** (owners and managers, `workspace.manage`), or through `GET/POST /v2/workspaces/{id}/intake-keys` and `POST …/intake-keys/{keyId}/revoke`. A key is shown once and stored only as a SHA-256 hash. A key placed in a web page is public. Listing the page's origins blocks it in browsers on other sites, but cannot stop server-side use, so the honeypot and rate limit still matter. Leave websites empty for server-to-server channels and keep that key secret. Members' cookie-authenticated routes still reject url-encoded bodies and unknown origins.

## Bulk import

People → Import reads:

- **CSV/TSV** from Excel, Google Sheets, HubSpot, Salesforce, Pipedrive, Zoho, Mailchimp, and Google or Outlook Contacts. The delimiter (comma, semicolon or tab) is detected automatically, and Windows-1252 files are detected too.
- **vCard (.vcf)** from phones, iCloud and Outlook.

Excel/Numbers files must be saved as CSV first. The import does not add an XLSX parser dependency. Columns are matched automatically in English or Spanish and can be changed. The preview counts new people, new companies, existing records and invalid rows before anything is saved. A CSV template is available.

`contact.import` (`contacts.write`, online only) takes up to 500 rows per command; the client sends larger files (up to 10,000 rows, 5 MB) in batches. Each batch is all-or-nothing, and an error names the file row. Existing people and companies are kept unchanged by default, or updated with the file's non-empty values. Repeated rows in one file are merged. Imports deliberately **do not run automations**, so old lists do not create a follow-up task per row.

## Checks run

- `npm run check` and `npm test`: all workspace suites pass, including `packages/core/test/intake.test.ts` (parsing, mapping, deduplication, member protection, company rules, projection) and `apps/api/test/intake.test.ts` (PGlite: keys, JSON and form posts, retries, redirects, origins, revocation, honeypot, scoped form parser).
- Example mode in the browser: imported a semicolon CSV containing a duplicate, an invalid email and a company-only row; checked the People and Companies tabs at desktop and 375 px widths.

Not run: real PostgreSQL with the `business_suite_runtime` grants (`ops/local_backend.py` now grants `suite_companies` and `suite_intake_keys`; the shared-host deploy script needs the same review), the Settings → Lead intake screen against a live server, and offline capture of companies.
