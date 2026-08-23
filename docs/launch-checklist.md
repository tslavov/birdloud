# BirdLoud V1 Launch Checklist

BirdLoud is not production-approved merely because this checklist exists. The release owner should
record evidence for each item in the deployment environment.

## Product and Privacy

- [ ] The organizer-facing promise does not claim strict one-real-person-one-vote.
- [ ] Intended election use is compatible with soft email identity and optional invite tokens.
- [ ] Privacy notice, retention schedule, deletion path, and incident contacts are approved.
- [ ] No real voter data or production identifier is present in source control, seed data, or CI.

## Configuration and Access

- [ ] Placeholder secrets and public Turnstile test keys are replaced in production.
- [ ] Public URLs are HTTPS and CORS allows only the deployed web origin.
- [ ] Better Auth cookie behavior and organizer/admin roles are tested on the production domain.
- [ ] The API trusts forwarding headers only from the deployment proxy.
- [ ] Database, Redis, SMTP, and deployment access follow least privilege with named owners.

## Database and Integrity

- [ ] `prisma migrate deploy` succeeds in a release rehearsal and backups exist before migration.
- [ ] Managed PostgreSQL pooling and connection limits match API replica/concurrency settings.
- [ ] Concurrent duplicate credential, invite-token, and idempotency tests pass.
- [ ] Counted, under-review, blocked, duplicate, rejected, and receipt-privacy cases pass.
- [ ] Organizer review and revocation actions produce audit and append-only ledger evidence.
- [ ] Aggregate results match counted votes and include confidence/integrity context.

## Reliability and Operations

- [ ] Liveness and readiness probes are configured with distinct meanings.
- [ ] SIGTERM drains cleanly within the platform termination window.
- [ ] Request IDs appear end to end and secret/body redaction is verified in collected logs.
- [ ] Alerts cover 5xx, latency, readiness, PostgreSQL, Redis, SMTP, Turnstile, and review backlog.
- [ ] PostgreSQL restore, Redis-loss behavior, SMTP outage, Turnstile outage, and rollback are rehearsed.
- [ ] Log, backup, SMTP, and database retention controls match the retention policy.

## Capacity

- [ ] CI validation, integration tests, and the synthetic database hot-path burst pass.
- [ ] A staging end-to-end burst uses the expected proxy, region, database pool, Redis, and Turnstile.
- [ ] Launch traffic, concurrency, p95 target, headroom, and autoscaling limits are written down.
- [ ] The vote path remains short; no email, exports, webhooks, or dashboard recomputation runs inside
      the vote transaction.

## Go/No-Go

- [ ] A named release owner reviewed all exceptions.
- [ ] Remaining limitations are disclosed to organizers.
- [ ] Rollback owner, incident channel, and support contact are staffed for the voting window.
