# Product

<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Insignia's signage sales/operations team, households sharing costs and chores, and people tracking job candidates and referrals. A food-business preset remains available. Small and medium businesses must be able to configure capabilities without adopting unrelated workflows.

## Product Purpose
Connect people, commitments, work and money in configurable workspaces. Preserve the distinction between a cost, an approval, an amount owed and a payment.

## Operating Context
The user confirmed shared accounts across devices are needed now. Referral email is drafts and copy/export first; no email delivery is requested. Connectivity is unreliable. The existing Mac mini deployment is preserved. The user authorized a fresh Docker backend on this Mac, with same-Wi-Fi shared access first. Owner activation is invitation-only; the user chooses their password in the app.

## Capabilities and Constraints
Household expenses and contributions explicitly supersede the former business-only scope for household workspaces. Workspace presets, enabled modules, authorization and subscription entitlements are separate. Paid billing and plan pricing have not been selected. The current architecture remains React/Vite, Fastify and PostgreSQL with shared TypeScript domain rules and Electron/mobile clients. Preserve the existing demo as a separate regression surface.

## Product Principles
- One common foundation with explicit scenario-specific rules.
- Settings and additive migrations preserve records and history.
- Shared server authorization governs access; local caches are not authority.
- Report saved, pending, approved and paid states accurately.
- Forms preserve user input when validation, storage or network requests fail.

## Evidence on Hand
Canonical Obsidian specifications and NOTE-013, existing source and regression tests. New example workspaces use only clearly labelled fictional records. No user testimonials, verified medium-business capacity, paid billing or sent-email claims.
