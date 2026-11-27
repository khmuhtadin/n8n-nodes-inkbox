# Changelog

## 0.1.2

- Trigger: deactivation now also removes the signing key from workflow static data, and activation no longer reuses a previously stored key.
- Trigger: clearer error when an identity already has a signing key, with rotation guidance.
- README: one consistent Trigger section describing bearer-token and HMAC verification.

## 0.1.1

- Add a ready-to-import workflow template in `examples/`.
- Publish through npm trusted publishing (OIDC) with provenance.

## 0.1.0

- Initial email, SMS, identity, mailbox, phone number and inbound webhook nodes.
