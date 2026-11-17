# Integrations, webhooks and AI suggestions

**Proposed 2026-11-04. Nothing in this note is implemented.** It records the direction for connecting the Suite to outside tools and for adding AI help, so that later slices do not each invent their own approach. The canonical vault notes still need to be updated once the owner accepts or changes these proposals.

## Decision summary (Proposed)

| ID | Proposal |
|---|---|
| INT-P-01 | Business automations stay **in the application** ([automations.ts](../packages/core/src/operations/automations.ts)). No external workflow engine runs Suite rules. |
| INT-P-02 | Outside tools (n8n, Zapier, Make, custom scripts) connect only **at the edge**: signed outbound webhooks, plus scoped inbound keys that issue ordinary commands. |
| INT-P-03 | The Suite does **not host, bundle or embed n8n**. A workspace may connect its own instance like any other webhook consumer. |
| INT-P-04 | AI never changes records by itself. It creates **proposals** that a member accepts, and accepting runs a normal command with that member's own permissions. |
| INT-P-05 | AI calls go through the model provider's SDK directly (tool calling), not through LangChain or another agent framework. |
| INT-P-06 | Webhooks, inbound keys and AI are all **off by default**. Turning any of them on sends workspace data to a third party, so it needs an owner's explicit opt-in. |

## Why in-app automations

The present engine already has the properties an external engine would have to recreate:

- Rules can only issue commands from `AUTOMATION_COMMANDS`, and those commands keep their own validation. An automation cannot record a payment, approve an expense, change a price, create an Order or release one (CRM workflow note, Automations guardrails).
- Rules, runs and notifications are scoped per workspace with RLS in the database (migration 003). The backend authorizes every command.
- Retries and duplicates are already handled. Each command has a receipt in `suite_space_commands`, and a run `key` stops one trigger firing twice for the same record. The scheduler ticks under the workspace row lock, and a run leaves `waiting` in the same transaction that applies it, so it runs at most once.
- Every change an automation makes is audited, and managers can see it under Automations → Recent runs.
- Offline clients can reason about the same rules, because they live in the shared domain package.

An external engine would sit outside the workspace context, the permission checks and the audit trail, and it would split business logic between two places. The repository rules also ask us to avoid generic workflow engines.

**Licensing.** n8n uses the Sustainable Use License, which is fair-code, not OSI open source. Its FAQ allows n8n as a backend engine only when end users never see or configure workflows. A product where customers build their own automations needs an Enterprise/Embed licence ([n8n licence FAQ](https://docs.n8n.io/n8n-community-license/community-license/license-faq)). Bundling it next to AGPL-3.0 Suite source would cause the same conflict. A workspace connecting its *own* n8n instance to our webhooks raises neither problem.

## Outbound events (webhooks)

### Transactional outbox

`save()` in [operations.ts](../apps/api/src/operations.ts) already writes each new audit entry in the transaction that applies the change, including entries for the automations that change set off. In that same transaction it would also insert one row per matching subscription into a new `suite_outbox` table:

```
suite_outbox(space_id, id, subscription_id, event_type, payload jsonb,
             created_at, attempts, next_attempt_at, delivered_at, last_error)
```

So an event exists if and only if its change committed. A failure to deliver can never undo or block a business command.

### Event types (first set)

Each type comes from an audited action, never from a client's claim:

`contact.created`, `company.created`, `lead.captured`, `project.stage_changed`, `project.won`, `project.lost`, `order.created`, `order.released`, `job.stage_changed`, `job.assigned`, `task.created`, `task.completed`.

Money events (`expense.*`, payments) are left out of the first set until the Money slice has obligations and settlements (source-map "Next technical integration boundary").

### Payload and scope

- Each event carries `id`, `type`, `workspaceId`, `occurredAt`, `recordId`, the record `version`, and a **projected** snapshot of the record.
- The snapshot goes through the same `project()` used for members, using the **subscription's grant set**. A subscription without money grants never receives prices, deposits, costs or margins, just as production members don't (CRM-T-05/06).
- No receipt files, credentials or intake keys are ever included.

### Subscriptions

- Owners and managers (`workspace.manage`) manage them in Settings → Integrations, or through `GET/POST /v2/workspaces/{id}/webhooks` and `POST …/webhooks/{hookId}/disable`.
- Fields: HTTPS URL, event types, grant set, description and enabled flag. The UI shows the signing secret once; the server keeps only an encrypted copy, because unlike an intake key it must be able to sign.
- Demo mode may allow `http://localhost`. Production allows only `https`. To guard against SSRF, the delivery worker resolves the host itself and refuses private, loopback and link-local addresses.

### Delivery

- A worker like the automation scheduler claims due rows with `FOR UPDATE SKIP LOCKED` and posts them one at a time.
- Signing follows the [Standard Webhooks](https://www.standardwebhooks.com/) headers (`webhook-id`, `webhook-timestamp`, `webhook-signature` = HMAC-SHA256), so n8n, Zapier and ordinary libraries can verify them.
- Delivery is **at least once**. Consumers drop duplicates by `webhook-id`, and `version` lets them ignore out-of-order updates.
- Any 2xx counts as delivered. Other responses and timeouts (10 s) are retried with exponential backoff for about 24 hours, then the subscription is disabled and its managers get an in-app notification. The delivery log keeps status, attempt count and the last error (never the response body) for 30 days.

## Inbound: integration keys

[Lead intake](lead-intake.md) already covers forms and sales channels. For other tools that need to write data, an **integration key** (`sk_int_…`) would work like an intake key but carry:

- an explicit **command allowlist**: to start with `contact.save`, `company.save`, `task.save`, `task.complete` and `deal.save`. It could never include anything under `expense.*`, `order.release`, workspace or membership commands, or any payment command.
- a grant set, checked with `authorizeCommand` exactly as for members.

Requests use the existing `POST /v2/workspaces/{id}/commands` path and its idempotency receipts. The audit actor is the key's ID. Keys are hashed (SHA-256), shown once, revocable and rate-limited. Commands from keys run automations like any other command, except `contact.import`, which never does.

## AI suggestions

### Shape

```
suite_proposals(space_id, id, kind, subject, command jsonb, rationale,
                status: pending|accepted|rejected|expired, created_by, decided_by, decided_at)
```

- A proposal holds a **draft command** plus a short reason, for example: "Create follow-up task for Ana: the quote for Storefront sign has had no reply for 4 days."
- **Accept** runs `command` through the normal route **as the accepting member**. Their grants, record scope and the domain validation all apply, and the AI's own permissions never do. **Reject** or **expire** (after 7 days) leaves the records untouched.
- Proposals can only contain commands from the integration allowlist above. They can never touch money, prices or Order release.
- Planned first uses:
  1. draft follow-up messages, where a person still sends them (CRM workflow: "prepare a message from a template")
  2. turn free-text lead notes into contact or company fields
  3. suggest an assignee or team for unclaimed tasks
  4. a daily "what needs attention" summary

### Template messages come before AI

The automation action `message.prepare` ("prepare a message from a template", Proposed in the CRM note) should ship first with plain templates and no model. AI drafting can improve it later, and the Suite still works without any AI provider.

### Provider integration

- Use the provider SDK's tool calling directly. Tools are generated from the command allowlist's input schemas, and the model's only way to act is to return proposals. One request ends with one set of proposals, and nothing waits or runs in the background.
- Model choice is configuration, not code (default `claude-sonnet-5-5`). The API key comes from an operator secret. It is never stored in source, fixtures or workspace settings.
- **No LangChain.** These are short, single-step requests, and the Suite already provides the state, retries, permissions and audit around them. A framework would add dependencies and hide the boundary we most need to review. If a real multi-step agent with human checkpoints is ever needed, reconsider LangGraph then, with evidence.

### Privacy

- AI is off by default. An owner turns it on per workspace and must confirm that workspace data will be sent to the named provider.
- Only data the requesting member could already see is sent, after projection. Production members' requests never include prices.
- Prompts and responses are not stored. A proposal keeps only its draft command, its reason and the model ID.
- AI is never on in demo mode with real data, and the AI tests use fictional fixtures only.
- AI is online-only. A pending proposal syncs to offline clients for display, but accepting it needs a connection, like other server-checked approvals.

## Phasing

1. `message.prepare` with templates (no AI).
2. Outbox, webhook subscriptions, delivery worker and Settings → Integrations.
3. Integration keys.
4. Proposals table, accept/reject flow and the first AI use (follow-up drafts).

Each phase needs real sign-in and authorized sync before it is used with real client data (repository AGENTS.md).

## Tests to add with each phase

- The outbox row exists exactly when the command commits; a rolled-back command produces no event.
- Payloads without money grants never contain price, deposit, cost or margin fields, including for events set off by automations.
- Signatures check out against the Standard Webhooks reference implementation; a replayed or stale timestamp is rejected by the sample verifier.
- Private and loopback targets are refused in production mode.
- Retries, backoff, auto-disable and the manager notification work.
- An integration key cannot run a command outside its allowlist or grants, including money commands and `order.release`.
- Accepting a proposal uses the accepting member's grants: a production member cannot accept a proposal that a manager could.
- Rejecting or expiring a proposal changes no records.

## Still open

- Is a per-workspace AI opt-in enough, or does each member also opt in?
- Which AI provider(s) to support, and whether a self-hosted model is a requirement for any workspace.
- Should webhook consumers be able to receive money events once Money settlements exist, and under which grant?
- Should a published n8n community node (our own code, under our licence) wrap the webhooks and commands later?
