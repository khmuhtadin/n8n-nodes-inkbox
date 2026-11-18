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

Select the owning **Agent Identity ID** and the inbound email and/or text events. n8n must expose a public HTTPS webhook URL. On activation, the trigger creates its own [subscription](https://inkbox.ai/docs/api/webhooks/subscriptions); on deactivation it deletes only that subscription. It generates a random bearer token, registers it as `auth_token`, and validates incoming authorization headers before emitting data. The token and subscription ID are stored in n8n workflow static data. If Inkbox returns a one-time identity signing key on first creation, it is also retained in that static data. Treat workflow data as sensitive. If you delete a workflow without deactivating it, remove its subscription manually.

This implementation validates the subscription bearer token, not Inkbox HMAC signatures. The node retains but does not use the optional one-time signing key for HMAC verification. Inkbox may retry deliveries; deduplicate events in your workflow when necessary. Webhook registration and delivery have not been tested against a live Inkbox account.

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

### Webhook signing

The trigger verifies the subscription bearer token and Inkbox HMAC-SHA256 signature against the raw request body, rejecting timestamps more than five minutes old. Inkbox returns a signing key only on the first subscription for an identity. If a key already exists, enter that existing key in the Signing Key field; the node never rotates it. A missing key causes activation to remove the newly created subscription and fail safely.
