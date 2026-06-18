# BirdLoud Repo Guidance

## Repo Purpose

BirdLoud is an API-first voting backend for organizers and voters.

The source of truth for product and technical decisions is [design notes.md](design%20notes.md). When implementation details are unclear, follow that document over assumptions.

## V1 Product Promise

BirdLoud makes voting fast and simple for normal voters, while making mass cheating expensive, visible, rate-limited, and reviewable.

Do not claim BirdLoud V1 guarantees one real human can only vote once. V1 prevents duplicate credentials, detects suspicious mass voting, rate-limits abuse, logs integrity signals, and gives organizers review and integrity tools.

## V1 Scope

Build for:

- Organizer auth.
- Elections.
- Campaigns.
- Candidates/choices.
- Public voting endpoint.
- OAuth or email identity.
- Optional invite tokens.
- Cloudflare Turnstile or CAPTCHA-style bot protection.
- Rate limiting.
- Device/IP/user-agent hashing.
- Mandatory idempotency.
- Vote receipts.
- One vote per credential database constraint.
- Vote attempts.
- Immutable vote ledger.
- Basic explainable risk scoring.
- Review queue.
- Results endpoint.
- Integrity score.

## Current Implementation Priorities

The repo currently has an MVP backend foundation, but several core V1 pieces are still placeholders or missing. Prioritize work in this order unless the user explicitly redirects:

- Replace the temporary `x-birdloud-organizer-id` development header with Better Auth session-based organizer/admin authorization.
- Add Prisma migrations and a reliable local database setup/seed workflow.
- Add real email magic-link voter verification and/or OAuth identity linking.
- Add Cloudflare Turnstile verification to public vote submission.
- Use Redis for temporary abuse counters and risk-scoring signals.
- Harden invite-token claiming, idempotency, and duplicate-vote prevention under concurrent submissions.
- Normalize vote ledger event names to stable product event names.
- Replace generic OpenAPI schemas with precise request/response contracts.
- Build usable organizer and voter web flows.
- Add load tests and operational hardening before production claims.

## Deferred Scope

Do not build into V1 unless explicitly requested:

- Anonymous voting.
- Full voter accounts.
- SMS verification.
- Paid phone verification.
- Strict one-person-one-vote guarantee.
- Government ID verification.
- Multi-factor voter identity.
- Complex machine-learning fraud detection.
- Public cryptographic vote verification.
- Advanced admin dashboard.
- Automatic identity merging across providers.
- Legal-grade election certification.
- Blockchain or public ledger.
- Complex result projections.
- Webhooks and third-party automation.
- Queues, Kafka, Kubernetes, microservices, ML fraud detection, blockchain, webhook delivery, and advanced infrastructure.

## Expected Stack

- Monorepo: `apps/web` and `apps/api`.
- Web app: React Router 7 + TypeScript + Tailwind CSS + shadcn/ui.
- API app: Fastify + TypeScript + Prisma + PostgreSQL + Redis.
- Database: PostgreSQL.
- ORM: Prisma.
- Cache/counters: Redis only for temporary rate limits and abuse counters.
- Validation: Zod unless TypeBox has already been explicitly chosen.
- API docs: OpenAPI/Swagger.
- Auth: Better Auth for organizer/admin authentication.
- Bot protection: Cloudflare Turnstile.
- Deployment: Railway first, Docker-based.
- Connection pooling: use managed PostgreSQL pooling if available; do not self-manage PgBouncer in V1.

Do not add queues, Kafka, Kubernetes, microservices, ML fraud detection, blockchain, webhook delivery, or advanced infrastructure.

## Core Data/Behavior Rules

- Use soft identity: OAuth, email magic link, or optional invite token.
- Store provider subjects, emails, IPs, devices, user agents, and tokens as hashes where possible.
- Votes must reference `identity_id` when available.
- Vote statuses are `counted`, `delayed`, `under_review`, `blocked`, and `rejected`.
- Confidence levels are `high`, `medium`, and `low`.
- Idempotency is mandatory for vote submission.
- The vote ledger is append-only.
- Receipt verification must never expose the selected candidate/choice.
- Results must show integrity context, not only raw counts.

## Vote Hot Path Rules

Keep `POST /api/campaigns/:campaignId/votes` short and transactional:

1. Validate request shape.
2. Claim or replay idempotency key.
3. Validate campaign and option.
4. Verify bot-protection token.
5. Validate OAuth, email magic link, or invite token.
6. Resolve or create campaign-scoped identity.
7. Calculate credential key, confidence, and risk score.
8. Insert vote, vote attempt, and ledger event.
9. Store idempotency response.
10. Return receipt.

Do not call webhooks, send emails, generate exports, recompute dashboards, run expensive fraud analysis, or call slow third-party services inside the vote transaction.

## Testing Expectations

At minimum, test:

- Campaign status and time-window validation.
- Option belongs to campaign.
- Duplicate credential cannot create multiple countable votes.
- Idempotent retries return the same response.
- Conflicting idempotency payloads return conflict.
- Invite tokens cannot be reused.
- Risk scoring maps to `counted`, `delayed`/`under_review`, and `blocked`.
- Vote attempts are logged for invalid, duplicate, delayed, blocked, and review cases.
- Vote ledger events are appended and not mutated.
- Receipt verification does not reveal selected option.
- Results include counted, delayed, under-review, blocked, duplicate, and confidence counts.

For vote submission changes, include concurrency tests for double submit/race behavior.

## Privacy and Security Rules

- This repository is public. Treat every committed file as visible to everyone.
- Never commit secrets, API keys, OAuth client secrets, private keys, database URLs, Redis URLs, webhook secrets, Turnstile secrets, SMTP credentials, production salts, real tokens, or real voter data.
- Use `.env.example` for variable names and safe placeholder values only.
- Keep real environment values in local `.env` files that are ignored by git.
- Avoid unnecessary personal data.
- Prefer salted hashes for provider subjects, normalized emails, IPs, device IDs, user agents, and invite tokens.
- Do not store raw IPs unless a clear security/legal reason is documented.
- Do not require SMS or paid phone verification in V1.
- Clearly disclose that OAuth/email identity does not prove unique real-world personhood.
- Use audit logs for organizer/admin decisions.
- Use immutable ledger events for vote-impacting decisions.
- Keep secrets out of source control.
- Validate all external input with Zod.

## Done Means

A task is done only when:

- It stays inside the V1 scope or clearly labels future/deferred work.
- It follows [design notes.md](design%20notes.md).
- It preserves the vote hot path constraints.
- It includes or updates relevant tests.
- It updates OpenAPI/API docs when endpoints or responses change.
- It avoids storing unnecessary personal data.
- It does not add secrets, real credentials, real voter data, or production identifiers to the repo.
- It exposes suspicious/risky behavior through logs, attempts, review, or integrity reporting.
- It does not silently count risky or duplicate submissions.
- It documents any remaining limitation or follow-up.
