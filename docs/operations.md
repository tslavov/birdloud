# BirdLoud Operations

This runbook covers the V1 monolith: one stateless API service, one static web service, managed
PostgreSQL, managed Redis, and SMTP. It does not introduce queues, microservices, or Kubernetes.

## Runtime Signals

- `GET /health` is a liveness check. It does not call dependencies.
- `GET /ready` is a readiness check. It returns 200 only when PostgreSQL and Redis both answer
  within `READINESS_TIMEOUT_MS`; otherwise it returns 503 with component names only.
- Every response includes `x-request-id`. A safe incoming ID is preserved; malformed or oversized
  IDs are replaced with a UUID.
- Fastify emits structured JSON request logs. Authorization, cookies, passwords, email addresses,
  magic-link tokens, identity proofs, invite tokens, bot tokens, and set-cookie values are redacted
  if a log call includes those fields. Request logs use normalized route templates and omit raw IP,
  user-agent, query-string, receipt, and token values.
- SIGTERM and SIGINT stop accepting work, wait for Fastify to close, disconnect PostgreSQL and Redis,
  and force-close lingering connections after `SHUTDOWN_GRACE_MS`.

Use the liveness endpoint only for process restart decisions. Use readiness for load-balancer
routing and deploy health. Redis is intentionally part of readiness because it backs shared rate
limits and abuse signals, even though PostgreSQL remains authoritative for vote correctness.

## Production Configuration

Set all values through the deployment platform. Never copy a production value into this repository.

Required production choices:

- Unique, high-entropy `BETTER_AUTH_SECRET` and `BIRDLOUD_HASH_SECRET`.
- Managed `DATABASE_URL` with provider pooling when available.
- Managed `REDIS_URL`.
- HTTPS `BETTER_AUTH_URL`, `CORS_ORIGIN`, and `VOTER_VERIFY_BASE_URL`.
- Real `TURNSTILE_SECRET_KEY`, plus expected hostname and action (`vote-submit`).
- SMTP host, TLS mode, credentials, and a verified sender.
- `TRUST_PROXY=true` only when the service is reachable exclusively through a trusted proxy that
  overwrites forwarding headers. Incorrect proxy trust weakens IP-based controls.
- A suitable `LOG_LEVEL`, readiness timeout, shutdown grace period, and global rate-limit target.

Production startup rejects public test keys, placeholder application secrets, missing Turnstile
hostname/action checks, and non-HTTPS public origins.

The web image receives `VITE_API_URL` and `VITE_TURNSTILE_SITE_KEY` as Docker build arguments.
These values are public browser configuration; the Turnstile secret stays only on the API.

## Deployment Sequence

For Railway or an equivalent Docker platform:

1. Provision managed PostgreSQL and Redis in the same region as the API.
2. Configure API environment variables and web build arguments.
3. Run `npm run db:deploy -w @birdloud/api` as the API pre-deploy/release command.
4. Deploy the API from `apps/api/Dockerfile`; wait for `/ready` to return 200.
5. Deploy the web app from `apps/web/Dockerfile`.
6. Exercise sign-in, email delivery, Turnstile, a synthetic vote, receipt verification, review, and
   export with non-real test data.
7. Confirm direct browser loads of organizer, magic-link, ballot, and receipt routes use the SPA
   fallback instead of returning 404.

Roll back application code by deploying the previous image. Database migrations must be
forward-compatible; do not automatically roll back a migration that may already contain live data.
The [Better Auth 1.7 issuer migration](https://better-auth.com/docs/guides/1-7-upgrade-guide)
intentionally refuses pre-existing non-credential accounts; map each OAuth provider to its exact
trusted issuer before that future identity method is enabled.

## Rate Limiting and Redis Failure

Normal runtime uses Redis for the Fastify rate limiter, so limits are shared across API instances.
The vote service also uses expiring campaign/IP/device counters for explainable risk scoring.
Rate-limit Redis errors skip the affected limit rather than returning an unrelated failure, while
`/ready` becomes unhealthy so a correctly configured platform stops routing new traffic. Turnstile,
database uniqueness, idempotency, token claiming, attempts, and the ledger remain active.

## Monitoring and Alerts

Create alerts for:

- Any sustained `/ready` failure or container restart loop.
- API 5xx rate, 429 rate, and vote latency p50/p95/p99.
- PostgreSQL connection saturation, CPU, storage, slow queries, and backup failure.
- Redis connection/memory pressure and evictions.
- SMTP delivery failures and Turnstile provider failures.
- Increasing blocked/duplicate attempts, integrity-score drops, or an aging review backlog.

Use `x-request-id`, campaign IDs, status codes, and stable error/ledger codes for correlation. Do
not add raw email, IP, device, user-agent, identity proof, token, receipt, or selected choice to
logs. The bundled static nginx disables access logging so magic-link query tokens and receipt paths
cannot leak; configure any platform edge logs to provide equivalent redaction.

## Burst Harness

`npm run test:load` runs a synthetic PostgreSQL-backed hot-path benchmark against the isolated test
database. Defaults are 100 unique verified credentials at concurrency 20 with a 5-second p95 ceiling.
Override `LOAD_VOTES`, `LOAD_CONCURRENCY`, and `LOAD_P95_TARGET_MS` to match a launch target.

The harness uses stubbed Turnstile and pre-seeded hashed proofs. It validates transaction throughput,
proof consumption, votes, attempts, ledger rows, and aggregate-count writes. It is not an
internet-to-database capacity certification: run a separate staging exercise with real proxy,
network, Turnstile, connection-pool, and deployment limits before launch.

## Recovery

- Enable managed PostgreSQL backups and point-in-time recovery; perform a restore drill before launch.
- Redis contains temporary counters only and may be rebuilt empty.
- If SMTP is unavailable, email verification fails without creating a vote.
- If Turnstile is unavailable, public vote submission fails closed and logs the attempt.
- If a release is unhealthy, stop routing via readiness, preserve PostgreSQL, and redeploy the last
  known-good image.

See [data retention](data-retention.md) and the [launch checklist](launch-checklist.md).
