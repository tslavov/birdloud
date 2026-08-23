# BirdLoud

BirdLoud is an API-first voting platform for organizers and voters.

V1 focuses on making voting fast and simple for normal voters while making mass cheating expensive, visible, rate-limited, and reviewable. It does not claim to perfectly prove one real human equals one vote without stronger identity verification.

## What It Does

- Organizers create elections, campaigns, and candidates/choices.
- Voters view campaign details and submit votes through a simple API flow.
- The backend prevents duplicate credentials, records vote attempts, returns receipts, and flags risky activity.
- Organizers can review suspicious votes, view results, inspect integrity signals, and export aggregate reports.

## Current Status

BirdLoud is currently an MVP backend foundation, not a production-ready service.

Implemented:

- API scaffold, health check, OpenAPI shell, and Prisma schema.
- Better Auth endpoints and session-based organizer/admin route authorization.
- Baseline Prisma migration, Docker-based PostgreSQL/Redis setup, safe synthetic seed, and database-backed auth integration test.
- Campaign-scoped email magic links delivered over SMTP, with hashed one-time challenges and vote proofs.
- Server-side Cloudflare Turnstile verification with timeout, production hostname/action checks, and durable failed-attempt logging.
- Redis-backed short-lived IP/device submission and failure counters that feed explainable risk scoring without becoming authoritative.
- Atomic invite-token claims, transactionally completed idempotency records, stale-claim recovery, and PostgreSQL concurrency tests for duplicate submissions.
- Versioned, stable product ledger events with atomic review/revocation transitions and an explicit V1 counted/review/blocked risk policy.
- Organizer election, campaign, and choice management.
- Public campaign details and vote submission.
- Verified email soft identity without voter accounts.
- Optional invite-token issuing, revocation, and use during voting.
- Mandatory idempotency, receipts, vote attempts, vote ledger, review queue, results, integrity score, and aggregate JSON/CSV export.
- Unit and route tests for the core backend behavior.

Still required before production:

- Precise OpenAPI request/response schemas.
- Usable organizer and voter web flows.

## Current Stack

- Monorepo: `apps/web` and `apps/api`
- Web: React Router 7, TypeScript, Tailwind, shadcn-style components
- API: Fastify, TypeScript, Prisma, PostgreSQL, Redis
- Validation: Zod
- API docs: OpenAPI/Swagger
- Auth direction: Better Auth for organizer/admin authentication
- Deployment target: Railway first, Docker-based

## Local Development

Requirements:

- Node.js `>=20.11.0`
- Docker Desktop (recommended for the included PostgreSQL and Redis services)

Setup:

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run infra:up
npm run db:deploy
npm run db:deploy:test
npm run db:seed
```

Use safe local values in `.env`. Do not commit real secrets, production database URLs, OAuth secrets, Turnstile secrets, real tokens, or voter data.

The compose setup exposes the development database on port `5432`, an isolated integration-test database on port `5433`, Redis on port `6379`, Mailpit SMTP on port `1025`, and the Mailpit inbox at `http://localhost:8025`. The seed is refused in production and creates only synthetic `.example.test` data. Override `SEED_ORGANIZER_EMAIL` and `SEED_ORGANIZER_PASSWORD` in your ignored local `.env` when needed.

The example Turnstile secret is Cloudflare's public always-pass test key. Production startup rejects that key and also requires `TURNSTILE_EXPECTED_HOSTNAME` and `TURNSTILE_EXPECTED_ACTION`; never commit a real secret key.

Run the apps:

```bash
npm run dev
```

Useful commands:

```bash
npm run check
npm run test
npm run build
npm run validate
npm run prisma:generate
npm run db:migrate
npm run db:deploy:test
npm run db:seed
npm run test:integration
npm run infra:down
```

`npm run test:integration` targets `TEST_DATABASE_URL` when set and otherwise uses the isolated compose database on port `5433`. Run `npm run db:deploy:test` before the first integration test.

Integration tests also use `TEST_REDIS_URL` or the compose Redis instance on port `6379`. Redis stores only expiring counters keyed by campaign IDs and already-hashed IP/device signals; PostgreSQL remains the durable source of truth.

## API Usage

Organizer APIs are under:

```text
/api/organizer
```

Voter/public APIs are under:

```text
/api/campaigns
```

Important V1 flows:

- Create an election and campaign.
- Add campaign options.
- Activate the election and campaign.
- Optionally issue invite tokens.
- Request an email verification link and exchange its one-time token for an identity proof.
- Submit votes with mandatory `idempotencyKey` and `botProtectionToken`.
- Review suspicious votes.
- Fetch results and integrity reports.
- Export aggregate reports as JSON or CSV.

OpenAPI/Swagger is registered by the API app for endpoint exploration during development.

## For Clients And Organizers

BirdLoud V1 is best used for polls, community votes, organization votes, school/club elections, and campaigns where strong usability and abuse visibility matter.

BirdLoud V1 helps with:

- duplicate credential prevention
- invite-token voting
- verified email soft identity
- idempotent vote submission
- vote receipts
- suspicious vote review
- integrity scoring
- aggregate result exports

BirdLoud V1 does not provide:

- government-grade identity verification
- legal election certification
- a strict guarantee that one real person can only vote once
- SMS or paid phone verification
- blockchain or public cryptographic verification

The honest promise is:

> Fast and simple for normal voters. Expensive, visible, and limited for attackers.

## Privacy And Security

This repository is public. Treat every committed file as visible to everyone.

Rules:

- Never commit real secrets or real voter data.
- Store tokens, receipts, emails, IPs, devices, and user agents as hashes where possible.
- Receipt verification must never reveal the selected choice.
- Exports should stay aggregate-only unless a future privacy review explicitly allows more.
- Keep risky votes visible through attempts, review queues, audit logs, and integrity reports.

## Project Guidance

Read these before making larger changes:

- [design notes.md](design%20notes.md)
- [AGENTS.md](AGENTS.md)

The implementation should stay inside the simple V1 scope unless a future task explicitly expands it.
