# n8n-nodes-inkbox

An independent community integration for [Inkbox](https://inkbox.ai/), not built or endorsed by Inkbox. It provides an Inkbox node for email and SMS, including use as an AI Agent tool, and an Inkbox Trigger for inbound messages.

## Installation

For self-hosted n8n, open **Settings > Community Nodes > Install** and enter `n8n-nodes-inkbox` once published, or install a local package according to [n8n's community node documentation](https://docs.n8n.io/integrations/community-nodes/installation/). This repository has not been published yet. To use community nodes as agent tools you may need `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true`.

## Credentials

Create an Inkbox API key in your Inkbox console, then create an **Inkbox API** credential in n8n. It is sent as `X-API-Key`; credential testing calls `GET /api/v1/mail/mailboxes`. Key scope affects the visible identities and channels. No key is included with this package.

## Operations

- **Identity: Get Many** ([docs](https://inkbox.ai/docs/api/identities/manage#list-identities)).
- **Mailbox: Get Many** ([docs](https://inkbox.ai/docs/api/mail/mailboxes#list-mailboxes)).
- **Phone Number: Get Many** ([docs](https://inkbox.ai/docs/api/phone/numbers#list-phone-numbers)).
- **Mail: Get Many, Get, Send** ([docs](https://inkbox.ai/docs/api/mail/messages)). Use the mailbox email address and, for Get, the Inkbox message record ID. Send accepts comma-separated To, CC and BCC; an optional reply ID is the RFC Message-ID.
- **SMS: Get Many, Send** ([docs](https://inkbox.ai/docs/api/phone/texts)). Supply a phone number ID and, for sending, an E.164 destination. SMS is subject to Inkbox's recipient consent and sender readiness rules.

Mail lists use cursor pagination and SMS lists use offset pagination. Limit and Return All control the total. Sending is immediate and may incur charges; review AI Agent tool permissions and add human approval where appropriate. The node does not automatically retry sends. Supply a stable idempotency key to protect an explicitly retried send; the same key must represent the same request.

## Trigger

Select the owning **Agent Identity ID** and the inbound email and/or text events. n8n must expose a public HTTPS webhook URL.

**Activation.** The trigger creates its own [webhook subscription](https://inkbox.ai/docs/api/webhooks/subscriptions) with a random bearer token registered as `auth_token`. It stores the subscription ID, the bearer token and the identity signing key in n8n workflow static data.

**Signing key.** Inkbox signs every webhook for an identity with that identity's [signing key](https://inkbox.ai/docs/signing-keys) and returns the plaintext key only once:

- If the identity has no key yet, the first subscription returns one and the trigger stores it automatically.
- If the identity already has a key, enter it in the **Signing Key** field. Without a key, activation deletes the subscription it just created and fails with an error.
- If you no longer have the key, rotate it in the Inkbox Console or with `POST /identities/{agent_handle}/signing-key`, then paste the new key. Rotating replaces the key for every receiver of that identity. The node itself never rotates keys.

**Verification.** Each delivery must pass two checks before the workflow runs: the `Authorization: Bearer` token must match, and the `X-Inkbox-Signature` HMAC-SHA256 over `request_id.timestamp.raw_body` must match the signing key. Requests with a timestamp more than five minutes old are rejected. Failed checks return `401`.

**Deactivation.** The trigger deletes only its own subscription and removes the subscription ID, bearer token and signing key from workflow static data. An identity key that was stored automatically is therefore not kept after deactivation: before deactivating, note that re-activation will need the key in the **Signing Key** field (or a rotated key). If you delete a workflow without deactivating it, remove its subscription manually.

Inkbox may retry deliveries; deduplicate events in your workflow when necessary.

## Example

Import [examples/list-mail.json](examples/list-mail.json) using **Workflow menu > Import from File**, replace the sample mailbox address, and select an Inkbox credential. To use the node with an AI Agent, add an Inkbox tool for each permitted operation and let the agent fill individual parameters using n8n expressions. Do not give an agent unrestricted sending access without reviewing the implications.

## Workflow template

[`examples/template-inkbox-project-decisions.json`](examples/template-inkbox-project-decisions.json): **Resolve blocked project decisions with Inkbox, Google Sheets and Slack**. Import it in n8n (Workflows > Import from file). Setup steps are in the yellow sticky note.

## Development

Node.js 20 or newer. `npm ci --ignore-scripts`, `npm run build`, `npm run lint`, `npm test`. Tests mock the API; no live account is required.

## About the author

[Khairul Muhtadin](https://linkedin.com/in/khmuhtadin), n8n Ambassador.

## License

MIT.
