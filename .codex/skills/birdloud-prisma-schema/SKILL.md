---
name: birdloud-prisma-schema
description: Model BirdLoud data in Prisma/PostgreSQL according to the V1 design. Use when creating or reviewing Prisma models, migrations, indexes, constraints, relations, enums, or database transaction behavior.
---

# BirdLoud Prisma Schema

## Source of Truth

Use `design notes.md` schema sections and `AGENTS.md`.

## When To Use It

Use this skill for schema design, migrations, model naming, constraints, indexes, and persistence-related reviews.

## What To Enforce

- Assume the repo is public; migrations, seeds, fixtures, and examples must contain only fake safe data.
- PostgreSQL is the source of truth.
- Prisma belongs in `apps/api`; keep the repo as a simple `apps/web` and `apps/api` monorepo.
- Core V1 models include elections, campaigns, campaign options, voter identities, invite tokens, votes, vote attempts, vote ledger, idempotency keys, identity verification events, identity conflicts, audit logs, and result counters if needed.
- Use enums or constrained values for statuses and confidence levels.
- Votes reference `identity_id` when available.
- Enforce one countable vote per campaign and credential.
- Idempotency keys must store request hash, status, response body, status code, and expiry.
- Vote ledger must be append-only.
- Store hashes for provider subjects, emails, device/IP/user-agent signals, and invite tokens.
- Add indexes for hot lookups: campaign status/time, identity credential, invite token hash, idempotency key, vote status, and review queries.

## What Not To Do

- Do not model full voter accounts or canonical person merging for V1.
- Do not store unnecessary raw personal data.
- Do not commit real voter data, real provider subject IDs, real emails, real IPs, production salts, database URLs, or backup dumps.
- Do not introduce event-store databases, queues, Kafka, or cross-service persistence.
- Do not make result counters the only source of truth.
- Do not omit database constraints and rely only on service logic.

## Done Check

Confirm migrations preserve duplicate-credential safety, idempotency, auditability, and privacy-by-default storage.
