# BirdLoud Voting Platform Design Notes

## Purpose

BirdLoud should be an API-first backend voting platform for organizers and voters.

The core product promise is simple:

- Organizers can create and manage elections, campaigns, candidates, voting windows, and results.
- Voters can view a voting page, submit one vote quickly, and receive a clear outcome.
- BirdLoud prevents duplicate credentials, detects suspicious mass voting, rate-limits abuse, and protects results with review queues and integrity scoring.
- Suspicious activity is blocked, delayed, logged, or placed into review instead of being silently accepted.
- The system can absorb short, high-traffic voting windows without going down or losing vote attempts.

The V1 product promise is:

> BirdLoud makes voting fast and simple for normal voters, while making mass cheating expensive, visible, rate-limited, and reviewable.

V1 should not claim to perfectly guarantee that one real human can vote only once. A determined person may still find ways to vote more than once if a campaign does not require strong identity verification. That is acceptable for V1.

What is not acceptable:

- One person or bot easily creating hundreds or thousands of votes.
- Suspicious votes silently changing the result.
- Duplicate or abusive patterns not being logged.
- Organizers having no way to see integrity risks.
- The system pretending it has stronger identity guarantees than it actually has.

## Product Language Recommendation

The original language was:

- Campaign Owner
- Campaign
- Option

A cleaner product vocabulary for BirdLoud is:

- **Organizer**: the user who creates and manages voting activity.
- **Election**: a top-level voting event.
- **Campaign** or **Question**: a specific race, poll, referendum, or decision inside an election.
- **Candidate** or **Choice**: the selectable voting options.
- **Vote**: the submitted voter decision.

My recommendation:

- Use **Election**, **Campaign**, and **Candidate** if BirdLoud is focused on civic, school, club, board, or organizational elections.
- Use **Election**, **Question**, and **Choice** if BirdLoud should support general voting, referendums, surveys, and polls.

For V1, the database can stay flexible with neutral table names like `campaign_options`, while the UI/API copy can use the more polished product language.

## Key V1 Decisions

1. Add a dedicated `elections` entity above campaigns.
2. Use soft voter identity: OAuth, email magic link, or optional invite token.
3. Make `idempotencyKey` mandatory for every vote request.
4. Return vote receipts after successful or review-pending submissions.
5. Add an immutable `vote_ledger` table for auditability.
6. Add campaign integrity metrics and an `integrityScore`.
7. Store privacy-preserving hashes instead of unnecessary personal data.
8. Design the vote submission path for burst traffic from day one.
9. Model ledger events so webhooks can be added cleanly later.
10. Focus V1 on anti-mass-manipulation, not legal-grade one-person-one-vote guarantees.

These changes make the system more trustworthy without making the voter flow complicated.

## Current Implementation Snapshot

Last reviewed: 2026-08-23.

The repository currently has a working V1 backend foundation and a minimal web shell.

Implemented:

- Monorepo with `apps/api` and `apps/web`.
- React Router 7 web scaffold with Tailwind and shadcn-style UI primitives.
- Fastify API scaffold with Helmet, CORS, rate limiting plugin registration, OpenAPI/Swagger, and health route.
- Better Auth endpoints and session-based organizer/admin route authorization.
- Prisma schema for users, auth sessions/accounts, elections, campaigns, options, voter identities, tokens, votes, attempts, ledger, idempotency, identity events, conflicts, counts, and audit logs.
- Organizer election, campaign, and option management endpoints.
- Public campaign details endpoint.
- Email soft-identity vote submission with mandatory idempotency key.
- Optional invite-token issuing, summary, revocation, and token claiming during vote submission.
- Hashed tokens, receipts, email identity values, IP/device/user-agent signals where used by the vote path.
- Vote receipts and receipt verification that does not reveal selected option.
- Vote attempts and immutable vote ledger events for counted, blocked, review, token revocation, and review decisions.
- Basic explainable risk scoring in the vote service.
- Review queue with approve/reject actions.
- Results endpoint, integrity endpoint, integrity score, integrity signals, and JSON/CSV aggregate export.
- Unit tests for reporting logic and route-level tests for organizer and voting flows.

Important implementation shortcuts still present:

- Better Auth endpoints and session authorization are wired, but migrations and an end-to-end database-backed sign-up/sign-in/session test are still missing.
- Public voter identity is currently direct email input, not a real email magic-link verification flow.
- OAuth providers are not wired yet.
- Cloudflare Turnstile verification is not wired into vote submission yet.
- Redis is configured but not actively used for abuse counters or rate-limit state.
- There are no Prisma migrations or database seed scripts committed yet.
- API schemas in OpenAPI are still generic and need precise request/response contracts.
- The web app is still a static shell, not a usable organizer or voter UI.
- Vote ledger event names in implementation are not yet fully normalized to the planned product event names.
- Invite-token claiming currently checks then updates; before production it should be made atomic under concurrency.
- The database uniqueness rule currently applies to all `(campaign_id, voter_key_hash)` votes, not only active/countable statuses. This is stricter than the design and acceptable for V1, but it should be a deliberate product choice.

Architectural read: the backend is now a good prototype/MVP foundation, but it is not production-ready until database-backed auth, verified voter identity, bot protection, migrations, and concurrency hardening are done.

## Remaining Core Work

The next core work should happen in this order:

1. Add Prisma migrations and a reliable local database workflow, then validate Better Auth sign-up, sign-in, and session resolution end to end.
2. Add real email magic-link voter verification or clearly rename the current email identity mode as unverified email identity.
3. Add Cloudflare Turnstile verification to `POST /api/campaigns/:campaignId/votes`.
4. Use Redis for vote abuse counters and rate-limit signals that feed risk scoring.
5. Make invite-token claiming atomic and add concurrency tests for token reuse and double submission.
6. Normalize ledger event names to the product event catalog.
7. Add precise OpenAPI schemas for all request and response bodies.
8. Build the first usable web flows: organizer workspace, campaign setup, public voting page, review queue, and results view.
9. Add operational hardening: request IDs, structured logs, retention policy, launch checklist, and burst load tests.

Deferred but already modeled:

- OAuth identity providers.
- Identity conflict review.
- Identity merging.
- Webhook delivery.
- Advanced admin dashboard.
- Legal-grade certification.

## 1. High-Level Architecture

BirdLoud should use a simple layered backend:

### API Layer

- REST/JSON endpoints.
- Request validation.
- Authentication and authorization.
- Rate limiting.
- Bot protection verification for public voting endpoints.
- Consistent success and error responses.
- OpenAPI documentation.

### Application Layer

- Election and campaign management.
- Vote submission workflow.
- Soft identity validation.
- Optional invite token validation.
- Duplicate credential and mass-manipulation controls.
- Idempotency handling.
- Explainable risk scoring.
- Receipt generation.
- Review queue decisions.
- Internal event creation for future webhooks and integrations.

### Persistence Layer

- PostgreSQL for durable records.
- Strong database constraints for race-condition safety.
- Immutable ledger records for auditability.
- Redis only for temporary rate limits and abuse counters.

### Scalability and Reliability Layer

- Stateless API servers behind a load balancer.
- Horizontal scaling for short campaign traffic spikes.
- Managed PostgreSQL connection pooling if available.
- Short vote transactions with no slow external calls.
- Simple cached reads for dashboards if traffic grows.
- Health checks and basic autoscaling rules.
- No self-managed PgBouncer, Kubernetes, Kafka, queues, or microservices in V1.

### Review and Integrity Layer

- Suspicious vote review.
- Blocked attempt inspection.
- Campaign-level integrity score.
- Audit trail for organizer and admin actions.

### Recommended Vote Flow

```text
Voter opens campaign
  -> API validates campaign visibility and time window
  -> Voter identifies with OAuth, email magic link, or optional invite token
  -> Voter submits option, identity proof, idempotency key, and bot-protection token
  -> Server validates identity, option, campaign status, and duplicate credential status
  -> Server calculates risk score
  -> Vote is counted, delayed, blocked, rejected, or placed under review
  -> Vote attempt and ledger event are recorded
  -> Voter receives a clear response and receipt when applicable
```

## 2. Main Entities and Database Schema

### `users`

Organizers and platform admins.

```sql
users (
  id uuid primary key,
  email text unique not null,
  password_hash text,
  role text not null check (role in ('organizer', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `elections`

Top-level grouping for related campaigns.

Example:

```text
Sofia Municipal Election 2027
  - Mayor Campaign
  - District Campaign
  - Referendum Campaign
```

Schema:

```sql
elections (
  id uuid primary key,
  organizer_id uuid not null references users(id),
  title text not null,
  description text,
  status text not null check (status in ('draft', 'active', 'closed', 'archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

My thought: add `elections` now even if V1 has only one campaign per election. It is cheap to model early and avoids painful migration later.

### `campaigns`

A campaign is one voteable race, question, referendum, or poll inside an election.

```sql
campaigns (
  id uuid primary key,
  election_id uuid not null references elections(id) on delete cascade,
  title text not null,
  description text,
  status text not null check (status in ('draft', 'active', 'closed')),
  identity_mode text not null default 'soft_identity'
    check (identity_mode in ('soft_identity', 'invite_token_optional')),
  starts_at timestamptz,
  ends_at timestamptz,
  allow_review_queue boolean not null default true,
  duplicate_identity_policy text not null default 'review'
    check (duplicate_identity_policy in ('count_with_risk', 'review', 'block')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

A campaign is voteable only when:

```text
election.status = active
campaign.status = active
campaign.starts_at <= now
campaign.ends_at > now
```

### `campaign_options`

Candidates or choices.

```sql
campaign_options (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  label text not null,
  description text,
  position int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
)
```

### `voter_tokens`

Single-use voting tokens. The raw token is returned or sent only once. The database stores only a hash.

In V1, invite tokens are optional. They are useful for private campaigns, but they should not be treated as perfect proof of personhood.

```sql
voter_tokens (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  token_hash text not null,
  status text not null default 'active'
    check (status in ('active', 'used', 'revoked', 'expired')),
  used_at timestamptz,
  revoked_at timestamptz,
  issued_label_hash text,
  created_at timestamptz not null default now(),

  unique (campaign_id, token_hash)
)
```

### `voter_identities`

Soft identity records for a single campaign. These are not full voter accounts.

```sql
voter_identities (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  provider text not null check (
    provider in ('google', 'microsoft', 'facebook', 'email', 'invite_token')
  ),
  provider_subject_hash text,
  email_hash text,
  device_hash text,
  first_ip_hash text,
  user_agent_hash text,
  trust_level text not null check (
    trust_level in ('high', 'medium', 'low')
  ),
  created_at timestamptz not null default now(),

  unique (campaign_id, provider, provider_subject_hash)
)
```

Examples:

- Google OAuth with normal device/IP behavior can be `high`.
- Microsoft OAuth with normal device/IP behavior can be `high`.
- Facebook OAuth with normal device/IP behavior can be `high` or `medium`, depending on campaign policy.
- Email magic link can be `medium`.
- Invite token without OAuth/email can be `medium` or `low`, depending on surrounding signals.

### `votes`

The current state of a submitted vote. This table is query-friendly and can be updated by review actions.

```sql
votes (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id),
  option_id uuid not null references campaign_options(id),
  identity_id uuid references voter_identities(id),
  voter_token_id uuid references voter_tokens(id),

  voter_key_hash text not null,
  receipt_hash text not null unique,

  status text not null check (
    status in ('counted', 'delayed', 'under_review', 'blocked', 'rejected')
  ),
  confidence_level text not null check (
    confidence_level in ('high', 'medium', 'low')
  ),

  risk_score int not null default 0,
  review_reason text,

  ip_hash text,
  device_hash text,
  user_agent_hash text,

  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references users(id)
)
```

Critical database constraint:

```sql
create unique index one_vote_per_voter_per_campaign
on votes (campaign_id, voter_key_hash)
where status in ('counted', 'delayed', 'under_review');
```

This is the final backstop against duplicate credentials and race-condition double submissions. It does not prove one real human equals one vote.

### `vote_attempts`

Every vote submission attempt is logged, including invalid, duplicate, delayed, blocked, and review-pending attempts.

```sql
vote_attempts (
  id uuid primary key,
  campaign_id uuid references campaigns(id),
  option_id uuid references campaign_options(id),

  voter_key_hash text,
  ip_hash text,
  device_hash text,
  user_agent_hash text,

  outcome text not null check (
    outcome in ('counted', 'duplicate', 'delayed', 'blocked', 'under_review', 'invalid')
  ),

  reason text,
  risk_score int not null default 0,
  created_at timestamptz not null default now()
)
```

### `vote_ledger`

Immutable append-only event history. This should be the internal source for audit trails and future integrations. Do not add webhook delivery in V1.

```sql
vote_ledger (
  id uuid primary key,
  vote_id uuid references votes(id),
  campaign_id uuid references campaigns(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
)
```

Example events:

- `vote.counted`
- `vote.delayed`
- `vote.placed_under_review`
- `vote.reviewed`
- `vote.blocked`
- `vote.rejected`
- `duplicate_attempt.detected`
- `token.revoked`
- `campaign.closed`
- `results.published`

My thought: this is worth adding in V1. The regular `votes` table answers "what is the current state?" while the ledger answers "how did we get here?" That is exactly what voting systems need when something is disputed.

The event names should be stable and product-level where possible. Internal implementation details can go into `payload`, but public-style event names like `vote.counted` and `campaign.closed` make future webhook support much easier.

Important rule: never call organizer webhooks directly inside the vote transaction. Append the ledger event first, then let a background worker deliver webhooks from ledger events or a delivery queue.

### `idempotency_keys`

Mandatory for vote submission.

```sql
idempotency_keys (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id),
  key text not null,
  request_hash text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  response_body jsonb,
  status_code int,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  unique (campaign_id, key)
)
```

Rules:

- Same key and same request body returns the original response.
- Same key and different request body returns `409 IDEMPOTENCY_CONFLICT`.
- Keys can expire after a practical retention window, such as 24 to 72 hours.
- Concurrent requests with the same key should wait briefly, then return the stored result once completed.

### `campaign_option_counts`

Derived result counters for fast dashboards. This table is not the source of truth.

```sql
campaign_option_counts (
  campaign_id uuid not null references campaigns(id),
  option_id uuid not null references campaign_options(id),
  counted_votes bigint not null default 0,
  delayed_votes bigint not null default 0,
  under_review_votes bigint not null default 0,
  rejected_votes bigint not null default 0,
  updated_at timestamptz not null default now(),

  primary key (campaign_id, option_id)
)
```

For small campaigns, results can be computed directly from `votes`. For larger or bursty campaigns, update this table from `vote_ledger` with a background worker. The official final count should still be reconcilable from the immutable vote records.

### `webhook_endpoints`

Future organizer automation endpoints.

```sql
webhook_endpoints (
  id uuid primary key,
  organizer_id uuid not null references users(id),
  url text not null,
  secret_ciphertext text not null,
  event_types text[] not null,
  status text not null check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
)
```

### `webhook_deliveries`

Delivery records for retrying and debugging webhook sends.

```sql
webhook_deliveries (
  id uuid primary key,
  webhook_endpoint_id uuid not null references webhook_endpoints(id),
  ledger_id uuid not null references vote_ledger(id),
  event_type text not null,
  payload jsonb not null,
  status text not null check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  delivered_at timestamptz,

  unique (webhook_endpoint_id, ledger_id)
)
```

My thought: webhooks can be deferred from V1, but these tables show the shape of the future system. The key architectural move is already in V1: make ledger events clean and stable enough to power automation later.

### `audit_logs`

Organizer and admin actions.

```sql
audit_logs (
  id uuid primary key,
  actor_user_id uuid references users(id),
  election_id uuid references elections(id),
  campaign_id uuid references campaigns(id),
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
)
```

## 3. Organizer API Endpoints

### Elections

```http
POST /api/organizer/elections
GET /api/organizer/elections
GET /api/organizer/elections/:electionId
PATCH /api/organizer/elections/:electionId
POST /api/organizer/elections/:electionId/activate
POST /api/organizer/elections/:electionId/close
POST /api/organizer/elections/:electionId/archive
```

Example create request:

```json
{
  "title": "Sofia Municipal Election 2027",
  "description": "City-wide election for mayor, district representatives, and referendums.",
  "startsAt": "2027-10-01T09:00:00Z",
  "endsAt": "2027-10-03T17:00:00Z"
}
```

### Campaigns

```http
POST /api/organizer/elections/:electionId/campaigns
GET /api/organizer/elections/:electionId/campaigns
GET /api/organizer/campaigns/:campaignId
PATCH /api/organizer/campaigns/:campaignId
POST /api/organizer/campaigns/:campaignId/activate
POST /api/organizer/campaigns/:campaignId/close
```

### Candidates / Choices

```http
POST /api/organizer/campaigns/:campaignId/options
PATCH /api/organizer/campaigns/:campaignId/options/:optionId
DELETE /api/organizer/campaigns/:campaignId/options/:optionId
```

V1 rule: options can be changed freely in draft campaigns. Once active, option changes should be restricted and audit-logged.

### Invite Tokens

```http
POST /api/organizer/campaigns/:campaignId/voter-tokens
GET /api/organizer/campaigns/:campaignId/voter-tokens/summary
POST /api/organizer/campaigns/:campaignId/voter-tokens/:tokenId/revoke
```

Token creation response:

```json
{
  "tokens": [
    "vt_8GZx9...",
    "vt_kL22p..."
  ]
}
```

Raw tokens are returned once. Only token hashes are stored.

### Results and Integrity

```http
GET /api/organizer/campaigns/:campaignId/results
GET /api/organizer/campaigns/:campaignId/integrity
GET /api/organizer/campaigns/:campaignId/export?format=json
GET /api/organizer/campaigns/:campaignId/export?format=csv
```

Example results response:

```json
{
  "campaignId": "cmp_123",
  "status": "active",
  "countedVotes": 5000,
  "delayedVotes": 23,
  "underReviewVotes": 17,
  "blockedAttempts": 89,
  "duplicateAttempts": 44,
  "highConfidenceVotes": 4200,
  "mediumConfidenceVotes": 760,
  "lowConfidenceVotes": 40,
  "integrityScore": 97,
  "options": [
    {
      "optionId": "opt_1",
      "label": "Candidate A",
      "countedVotes": 2860
    },
    {
      "optionId": "opt_2",
      "label": "Candidate B",
      "countedVotes": 2140
    }
  ]
}
```

My thought: the integrity score is a strong product feature. It gives organizers a quick trust signal without forcing them to understand every fraud rule.

### Review Queue

```http
GET /api/organizer/campaigns/:campaignId/review
POST /api/organizer/campaigns/:campaignId/review/:voteId/approve
POST /api/organizer/campaigns/:campaignId/review/:voteId/reject
```

Only `under_review` votes appear in the review queue.

### Webhooks

Deferred from V1, but planned for organizer automation:

```http
POST /api/organizer/webhooks
GET /api/organizer/webhooks
GET /api/organizer/webhooks/:webhookId
PATCH /api/organizer/webhooks/:webhookId
DELETE /api/organizer/webhooks/:webhookId
POST /api/organizer/webhooks/:webhookId/test
GET /api/organizer/webhooks/:webhookId/deliveries
```

Initial event catalog:

- `vote.counted`
- `vote.delayed`
- `vote.placed_under_review`
- `vote.reviewed`
- `vote.blocked`
- `vote.rejected`
- `token.revoked`
- `campaign.closed`
- `results.published`

Webhook payloads should never reveal unnecessary voter data. For vote events, include IDs, campaign context, status, timestamps, and receipt reference where useful, but avoid exposing the selected option unless the organizer is authorized to see that result data.

## 4. Voter API Endpoints

### View Election

```http
GET /api/elections/:electionId
```

### View Campaign

```http
GET /api/campaigns/:campaignId
```

Example response:

```json
{
  "id": "cmp_123",
  "electionId": "el_123",
  "title": "Mayor Campaign",
  "description": "Vote for one candidate.",
  "status": "active",
  "startsAt": "2027-10-01T09:00:00Z",
  "endsAt": "2027-10-03T17:00:00Z",
  "options": [
    {
      "id": "opt_1",
      "label": "Candidate A"
    },
    {
      "id": "opt_2",
      "label": "Candidate B"
    }
  ]
}
```

### Submit Vote

```http
POST /api/campaigns/:campaignId/votes
```

Request:

```json
{
  "optionId": "opt_1",
  "identity": {
    "provider": "google",
    "identityToken": "provider-issued-token"
  },
  "inviteToken": "optional_vt_8GZx9...",
  "botProtectionToken": "turnstile-token",
  "idempotencyKey": "550e8400-e29b-41d4-a716-446655440000"
}
```

Counted response:

```json
{
  "voteId": "v_123",
  "receipt": "rcpt_abc123xyz",
  "status": "counted",
  "confidenceLevel": "high",
  "message": "Your vote was recorded."
}
```

Under review response:

```json
{
  "voteId": "v_123",
  "receipt": "rcpt_abc123xyz",
  "status": "under_review",
  "confidenceLevel": "low",
  "message": "Your vote requires review before it can be counted."
}
```

Delayed response:

```json
{
  "voteId": "v_123",
  "receipt": "rcpt_abc123xyz",
  "status": "delayed",
  "confidenceLevel": "medium",
  "message": "Your vote was received and is waiting for integrity checks."
}
```

Important receipt rule:

- The receipt proves that a vote submission exists.
- The receipt must not reveal the selected candidate or choice.
- Store only `receipt_hash`; return the raw receipt once.

### Verify Receipt

```http
GET /api/campaigns/:campaignId/receipts/:receipt
```

Example response:

```json
{
  "status": "recorded",
  "voteStatus": "counted",
  "recordedAt": "2027-10-01T12:30:00Z"
}
```

This endpoint should never reveal the selected option.

## 5. Authentication and Authorization Strategy

### Organizers

- Email/password or OAuth.
- JWT access tokens plus refresh tokens, or secure server sessions.
- Role-based authorization.
- Organizers can manage only their own elections and campaigns.
- Admins can inspect platform-wide abuse, audit logs, and review escalations.

### Voters

V1 should use soft identity:

- Voter identifies with OAuth, email magic link, or optional invite token.
- Public campaigns can use OAuth or email identity.
- Private campaigns can add invite tokens.
- Server stores only hashes for provider subjects, emails, device/IP signals, and invite tokens.
- Identity provider signals raise confidence but do not prove unique personhood.

This avoids full voter accounts, SMS verification, and unnecessary personal data in V1.

## 6. Voter Identity, Token Mapping, and Duplicate Identity Prevention

BirdLoud V1 should use soft identity to reduce low-cost manipulation without pretending to provide legal-grade personhood verification.

Soft identity means a voter can identify herself with a familiar, low-friction method:

- Google OAuth.
- Microsoft OAuth.
- Facebook OAuth.
- Email magic link.
- Optional invite token for private or organizer-controlled campaigns.

V1 should not require SMS, paid phone verification, government ID, or full voter accounts.

Important principle: identity provider signals are useful, but they are not perfect proof of personhood. BirdLoud should focus on preventing, slowing down, detecting, and reviewing mass manipulation that could change the overall result.

The guiding phrase:

> Fast and simple for normal voters. Expensive, visible, and limited for attackers.

### Four Different Integrity Layers

These are related, but they are not the same:

- **Credential reuse prevention** stops the same OAuth account, email identity, or invite token from voting twice in the same campaign.
- **Soft identity verification** confirms that the voter controls a provider account, email address, or invite token.
- **Mass-manipulation detection** looks for patterns such as many votes from one device, one IP/network, automation-like behavior, or many new low-trust identities.
- **Duplicate real-person detection** remains imperfect in V1 and should be treated as a risk signal, not a certainty.

My thought: the product should be honest about this distinction. An OAuth login proves control of an account. An email link proves control of an inbox. An invite token proves possession of a credential. None of those perfectly proves that no other credential belongs to the same person.

### Recommended Data Model

#### `voter_identities`

Campaign-scoped soft identity records. These are not full voter accounts and should not be treated as perfect personhood records.

```sql
voter_identities (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  provider text not null check (
    provider in ('google', 'microsoft', 'facebook', 'email', 'invite_token')
  ),
  provider_subject_hash text,
  email_hash text,
  device_hash text,
  first_ip_hash text,
  user_agent_hash text,
  trust_level text not null check (
    trust_level in ('high', 'medium', 'low')
  ),
  created_at timestamptz not null default now(),

  unique (campaign_id, provider, provider_subject_hash)
)
```

Notes:

- `provider_subject_hash` is the stable provider account ID hash for OAuth, the verified email hash for email, or the invite token hash for invite-token identity.
- `email_hash` is optional and should be normalized before hashing.
- `device_hash`, `first_ip_hash`, and `user_agent_hash` are risk signals, not identity proof.
- The same identity should not create multiple counted votes in the same campaign.

#### `voter_tokens`

Optional invite tokens for private campaigns.

```sql
voter_tokens (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id) on delete cascade,
  token_hash text not null,
  status text not null check (status in ('active', 'used', 'revoked', 'expired')),
  used_at timestamptz,
  revoked_at timestamptz,
  issued_label_hash text,
  created_at timestamptz not null default now(),

  unique (campaign_id, token_hash)
)
```

Invite tokens are useful when organizers already have a private distribution channel. They should be optional in V1 and should not replace OAuth/email identity for public campaigns.

#### `identity_verification_events`

Immutable records of soft identity checks and risk decisions.

```sql
identity_verification_events (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id),
  identity_id uuid references voter_identities(id),
  provider text not null,
  event_type text not null,
  trust_level text not null check (
    trust_level in ('high', 'medium', 'low')
  ),
  risk_score int not null default 0,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
)
```

Example events:

- `identity.created`
- `identity.verified`
- `identity.duplicate_credential_detected`
- `identity.mass_pattern_detected`
- `identity.trust_level_changed`

#### `identity_conflicts`

Review records for suspicious identity patterns.

```sql
identity_conflicts (
  id uuid primary key,
  campaign_id uuid not null references campaigns(id),
  identity_id uuid references voter_identities(id),
  conflict_type text not null,
  confidence text not null check (
    confidence in ('high', 'medium', 'low')
  ),
  reason text not null,
  status text not null check (
    status in ('open', 'resolved', 'dismissed')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references users(id)
)
```

### Soft Identity Mapping

BirdLoud should resolve identities in this order:

1. Existing provider identity for the campaign.
2. New OAuth identity with verified provider subject.
3. New email magic-link identity with verified email hash.
4. Optional invite token identity.
5. Low-trust identity if campaign settings allow it.

Provider mapping:

- **Google account** maps by `provider = 'google'` and stable Google subject hash.
- **Microsoft account** maps by `provider = 'microsoft'` and stable Microsoft subject hash.
- **Facebook account** maps by `provider = 'facebook'` and stable Facebook subject hash.
- **Email magic link** maps by `provider = 'email'` and verified normalized email hash.
- **Invite token** maps by `provider = 'invite_token'` and invite token hash.

V1 should not automatically merge Google, Microsoft, Facebook, and email identities into one real-person record. Matching emails and shared devices can raise or lower trust, but cross-provider identity merging belongs in a later version.

### Token Issuing Rules

Invite tokens are optional in V1. Token issuing should follow these rules:

- A token belongs to one `campaign_id`.
- The same token can never be counted twice.
- Token creation should fail if the same token hash already exists for the campaign.
- A revoked token can be replaced by a new token.
- A used token cannot be reissued in a way that creates another counted vote.
- If a token is lost before use, revoke the old token and issue a new active token.
- If a token was already used for a counted, delayed, or under-review vote, reissue should be blocked unless an admin explicitly resolves the vote first.

Suggested reissue flow:

```text
BEGIN
  find active token for campaign_id + issued_label_hash
  mark active token as revoked
  insert new active token
  append vote_ledger event token.revoked
  append audit_logs event token.reissued
COMMIT
```

### Voting Flow With Identity

V1 voting flow:

```text
Voter opens campaign
  -> bot protection is verified
  -> voter authenticates with OAuth, email magic link, or optional invite token
  -> system verifies provider claims
  -> system resolves or creates campaign-scoped identity_id
  -> system checks whether that credential already voted
  -> system evaluates device/IP/user-agent/rate-limit signals
  -> system calculates trust level and risk score
  -> system counts, delays, blocks, rejects, or places the vote under review
```

Recommended `votes` table update:

```sql
alter table votes
add column identity_id uuid references voter_identities(id);

create unique index one_countable_vote_per_identity_per_campaign
on votes (campaign_id, identity_id)
where status in ('counted', 'delayed', 'under_review');
```

Recommended credential key:

```text
voter_key_hash = hash(campaign_id + provider + provider_subject_hash + optional_token_hash + server_secret)
```

This blocks the same credential from voting again. It does not prove that the same human did not use another credential.

### Vote Confidence Model

Every vote should receive a confidence level:

- **High confidence**: OAuth identity plus normal device/IP behavior.
- **Medium confidence**: email magic link plus normal behavior, or invite token plus normal behavior.
- **Low confidence**: new/low-trust identity, suspicious device/IP pattern, automation-like behavior, or repeated failed attempts.

Example:

```text
OAuth identity + normal device/IP behavior = high confidence
Email magic link + normal behavior = medium confidence
Many votes from same IP/device/new identities = low confidence or under_review
```

### Counting Status Model

Vote status should separate "received" from "counted":

- `counted`: normal vote counted quickly.
- `delayed`: received but not counted yet, usually because short-term abuse signals need to settle.
- `under_review`: requires organizer/admin review before counting.
- `blocked`: rejected before creating a countable vote because risk is too high.
- `rejected`: reviewed or invalidated after submission.

Normal votes should be counted quickly. Risky votes may be delayed or placed under review. Clearly abusive attempts should be blocked.

Delayed votes should either become `counted` after short-lived risk checks pass or move to `under_review` if suspicious patterns persist.

### Duplicate and Mass-Manipulation Detection

Signals that may indicate abuse:

- Same verified email across providers.
- Same normalized email hash.
- Same identity already voted.
- Same device hash used by multiple identities.
- Same IP hash or network submitting many votes.
- Suspicious user agent.
- Abnormal submission speed.
- Many failed attempts before success.
- Many new or low-trust identities from the same source.
- Optional invite token reused, revoked, or invalid.

The system should store these as evidence and confidence, not as absolute truth.

### Risk Scoring

Keep risk scoring simple and explainable:

```text
+60 same identity already voted
+50 invite token reused or invalid
+35 same device hash exceeds threshold
+30 same IP hash or network exceeds threshold
+25 many new identities from same source
+20 suspicious user agent
+20 too many failed attempts before success
+15 abnormal submission speed
```

Suggested outcomes:

```text
risk_score < 40: counted
risk_score 40-79: delayed or under_review
risk_score >= 80: blocked
```

My recommendation: default to `delayed` for medium risk when traffic is spiky, and `under_review` when the vote could materially affect the result.

### API Endpoint Additions

Voter identity:

```http
POST /api/voter/identity/email/start
POST /api/voter/identity/email/verify
POST /api/voter/identity/oauth/:provider/start
POST /api/voter/identity/oauth/:provider/callback
```

Organizer review:

```http
GET /api/organizer/campaigns/:campaignId/identity-conflicts
GET /api/organizer/campaigns/:campaignId/review
POST /api/organizer/campaigns/:campaignId/review/:voteId/approve
POST /api/organizer/campaigns/:campaignId/review/:voteId/reject
```

Invite tokens:

```http
POST /api/organizer/campaigns/:campaignId/voter-tokens
GET /api/organizer/campaigns/:campaignId/voter-tokens/summary
POST /api/organizer/campaigns/:campaignId/voter-tokens/:tokenId/revoke
```

Results and integrity:

```http
GET /api/organizer/campaigns/:campaignId/results
GET /api/organizer/campaigns/:campaignId/integrity
```

### Edge Cases

- Same person uses Google first and Microsoft later.
- Same person uses multiple email addresses.
- Many legitimate voters share a school, office, or event Wi-Fi network.
- Two family members share a device.
- A bot creates many new email identities.
- Voter loses an invite token before voting.
- Voter tries to vote after a token was revoked and reissued.
- A provider changes or removes an email claim.
- Bot protection provider is unavailable.
- Redis is unavailable or slow.

The system should avoid harsh automatic decisions for weak signals like shared IP or shared device. Those are useful for review, not proof.

### Security and Privacy Rules

- Store provider subject IDs hashed for lookup.
- Store normalized email hashes instead of raw email whenever possible.
- Avoid unnecessary personal data.
- Do not collect phone numbers in V1 unless there is a specific organizer requirement.
- Do not require SMS or paid phone verification in V1.
- Store device, IP, and user-agent signals as salted hashes.
- Rotate salts if long-term correlation is not needed.
- Do not expose selected vote during receipt verification.
- Use audit logs for review and conflict resolution.
- Use immutable ledger events for vote-impacting decisions.
- Clearly disclose identity verification behavior to voters.
- Clearly disclose that OAuth/email identity does not prove unique real-world personhood.
- Apply retention policies to identity evidence and conflict records.

### Recommended V1 / Future Scope

V1 should focus on soft identity and anti-mass-manipulation.

V1 should include:

- OAuth or email identity.
- Optional invite token.
- Cloudflare Turnstile or CAPTCHA-style bot protection.
- Rate limiting.
- Device/IP/user-agent hashing.
- Vote attempts.
- Risk scoring.
- Review queue.
- Integrity score.
- Immutable ledger.
- Idempotency.
- Vote receipts.

Future versions can add:

- SMS verification.
- Paid phone verification.
- Strict one-person-one-vote guarantees.
- Government ID verification.
- Full voter accounts.
- Multi-factor voter identity.
- Complex machine-learning fraud detection.
- Public cryptographic vote verification.
- Advanced admin dashboards.
- Automatic identity merging across providers.
- Legal-grade election certification.
- Blockchain or public ledger.
- Complex result projections.

## 7. Duplicate Credential and Mass-Manipulation Enforcement Strategy

Create a stable `voter_key_hash` for each campaign and credential.

OAuth credential key:

```text
voter_key_hash = hash(campaign_id + provider + provider_subject_hash + server_secret)
```

Email credential key:

```text
voter_key_hash = hash(campaign_id + email_hash + server_secret)
```

Invite-token credential key:

```text
voter_key_hash = hash(campaign_id + token_hash + server_secret)
```

Enforcement happens in five layers:

1. Application validation checks identity, campaign status, option validity, and duplicate credential state.
2. Database constraints prevent two counted, delayed, or review-pending votes for the same campaign and credential.
3. Risk scoring catches mass-voting patterns across identities, devices, IPs, and user agents.
4. Rate limits slow suspicious sources before they can affect results at scale.
5. Idempotency handling protects normal users from double clicks, retries, refreshes, and flaky mobile connections.

Vote submission transaction:

```text
BEGIN
  claim idempotency key or replay existing response
  validate campaign is active and within voting window
  validate option belongs to campaign and is active
  verify bot-protection token
  validate OAuth, email magic link, or invite token
  resolve or create campaign-scoped identity_id
  calculate voter_key_hash
  calculate risk score
  choose confidence_level and status
  insert vote as counted, delayed, under_review, blocked, or rejected
  insert vote_attempt
  append vote_ledger event
  store idempotency response
COMMIT
```

If the unique credential constraint fails, return `409 ALREADY_VOTED`.

Invite token claiming should be atomic when invite tokens are used:

```sql
update voter_tokens
set status = 'used',
    used_at = now()
where campaign_id = $1
  and token_hash = $2
  and status = 'active'
returning id;
```

If this returns no row, the token is invalid, revoked, expired, or already used.

## 8. Anti-Cheat and Gatekeeping Rules

### Hard Blocks

Reject immediately when:

- Election does not exist.
- Campaign does not exist.
- Election or campaign is draft, closed, or archived.
- Campaign has not started.
- Campaign has expired.
- Option does not belong to campaign.
- Option is inactive.
- OAuth or email verification fails.
- Invite token is invalid, revoked, expired, or already used.
- Same credential already has a counted, delayed, or under-review vote.
- Bot protection fails.
- Idempotency key is reused with a different request body.
- Severe rate limit thresholds are exceeded.

### Delayed or Review Queue

Delay or place a vote under review when:

- Many votes come from the same IP hash in a short period.
- Many votes share the same device hash.
- User agent or device profile looks automated.
- There are rapid failed attempts before a successful submission.
- Invite-token usage pattern is abnormal.
- Many new or low-trust identities appear from the same source.
- Same network submits unusually high volume.
- Submission behavior is much faster than normal human interaction.

### Risk Scoring

Simple starting score:

```text
+60 same identity already voted
+50 invite token reused or invalid
+35 same device hash exceeds threshold
+30 same IP hash or network exceeds threshold
+25 many new identities from same source
+20 suspicious user agent
+20 too many failed attempts
+15 abnormal submission speed
```

Suggested outcome thresholds:

```text
risk_score < 40: counted
risk_score 40-79: delayed or under_review
risk_score >= 80: blocked
```

My thought: keep the score explainable. A simple score is easier to debug, easier to explain to organizers, and safer than introducing opaque fraud logic too early.

### Signals to Store

Store privacy-preserving hashes:

- `ip_hash`
- `device_hash`
- `user_agent_hash`
- `identity_id`
- `voter_key_hash`
- `confidence_level`

Avoid raw IP storage unless there is a clear legal/security reason and the privacy policy discloses it. Consider rotating salts if long-term cross-campaign tracking is not needed.

## 9. Burst Traffic and Availability

Voting systems have a bursty traffic pattern. Most requests arrive during a small voting window, especially near opening time, reminders, and closing time. BirdLoud should be designed so valid voters get a fast response even when many people vote at once.

### Design Target

The vote endpoint should:

- Accept a high number of concurrent submissions.
- Avoid duplicate votes under race conditions.
- Return the same response for retries with the same idempotency key.
- Never depend on email, analytics, exports, or dashboard recomputation before responding.
- Record rejected and suspicious attempts even during traffic spikes.
- Fail closed when integrity is uncertain, but avoid dropping requests silently.

### Hot Path Rules

Keep `POST /api/campaigns/:campaignId/votes` small:

1. Validate request shape.
2. Claim idempotency key.
3. Validate campaign and option.
4. Atomically claim token.
5. Insert vote, attempt, and ledger event.
6. Store response for idempotency replay.
7. Return receipt.

Do not do these synchronously in the vote request:

- Send emails.
- Call webhooks.
- Generate exports.
- Recalculate all results.
- Run expensive fraud analysis.
- Call third-party services.
- Render dashboards.

My thought: the vote path should be treated like a payment checkout path. It should be short, transactional, heavily tested, and protected from everything non-essential.

### Scaling Strategy

Practical V1 approach:

- Run multiple stateless Fastify API instances.
- Put Cloudflare or a load balancer in front.
- Use PostgreSQL as the durable source of truth.
- Use Redis for rate limits, temporary counters, and abuse signals.
- Use a database pooler so traffic spikes do not exhaust Postgres connections.
- Add indexes for all hot lookups: campaign status, token hash, voter key hash, idempotency key, and vote status.
- Keep result dashboards cached or projection-based during active campaigns.

### Database Considerations

The main bottleneck will usually be PostgreSQL, not the API framework.

Recommendations:

- Keep vote transactions short.
- Avoid full table counts during active voting.
- Use the partial unique index on `(campaign_id, voter_key_hash)`.
- Use `update ... where status = 'active' returning id` to claim invite tokens atomically.
- Avoid synchronous counter updates on a single hot row if one option receives many votes.
- Build result projections from `vote_ledger` asynchronously if campaigns become large.
- Recalculate final results from `votes` after campaign close for confidence.

### Queueing and Backpressure

Do not put the actual vote decision only in a background queue for V1. Voters need a clear immediate response, and duplicate-credential enforcement is easiest to enforce inside the database transaction.

Keep V1 synchronous and simple. Do not add queues, Kafka, or workflow infrastructure.

Allowed lightweight async work in V1 should be limited to simple scheduled jobs or request-adjacent maintenance tasks, such as expiring delayed votes or refreshing integrity counters. Do not add webhook delivery, event queues, or complex projection systems in V1.

If the system is overloaded:

- Prefer `429 RATE_LIMITED` for abusive sources.
- Prefer `503 TEMPORARILY_BUSY` with retry guidance for general overload.
- Preserve idempotency so client retries are safe.
- Alert operators before the database is saturated.

### Load Testing Checklist

Before launch, test:

- Many voters submitting at the campaign opening time.
- Double-clicks and mobile retries.
- Same token submitted concurrently from two requests.
- Same idempotency key submitted concurrently.
- Same IP submitting many different tokens.
- Result dashboard refreshes during high vote volume.
- Database connection pool exhaustion.
- Redis unavailable or slow.

Set a concrete launch target per expected campaign, for example:

```text
Target peak: 200 vote submissions per second for 10 minutes
P95 vote response time: under 500 ms
Error rate for valid requests: under 0.1%
No duplicate counted votes for the same credential
No lost idempotency responses
```

## 10. Webhooks and Automation

Organizers will eventually want BirdLoud to trigger external workflows.

Examples:

- `vote.counted`
- `vote.delayed`
- `vote.reviewed`
- `vote.blocked`
- `campaign.closed`
- `results.published`

### Design Approach

Use the ledger as the source of webhook events:

```text
Business action happens
  -> append vote_ledger event in the same database transaction
  -> background worker finds deliverable events
  -> create webhook_deliveries records
  -> send signed HTTP requests
  -> retry failed deliveries with backoff
```

This is a transactional outbox pattern. It keeps the main vote path reliable and gives integrations a durable event source.

### Delivery Rules

- Webhook delivery must be asynchronous.
- Each request should include a stable event ID.
- Each request should include an HMAC signature.
- Failed deliveries should retry with exponential backoff.
- Delivery attempts should be visible to organizers.
- Webhook endpoints should be disableable after repeated failures.
- Payloads should avoid unnecessary personal data.
- Webhook consumers should treat events as at-least-once delivery and deduplicate by event ID.

Example webhook payload:

```json
{
  "id": "evt_123",
  "type": "vote.counted",
  "createdAt": "2027-10-01T12:30:00Z",
  "data": {
    "electionId": "el_123",
    "campaignId": "cmp_123",
    "voteId": "v_123",
    "status": "counted"
  }
}
```

My thought: webhooks should not be part of the first voter-facing MVP, but the ledger should be designed as if webhooks are coming. That small discipline now prevents messy event-mapping work later.

## 11. Integrity Score

The integrity score is a campaign-level trust summary.

Results should not show only one raw number. Organizers need to see the result and the integrity context together.

Result reporting should include:

- Counted votes.
- Delayed votes.
- Under-review votes.
- Blocked attempts.
- Duplicate attempts.
- High-confidence votes.
- Medium-confidence votes.
- Low-confidence votes.
- Integrity score.

Example:

```json
{
  "integrityScore": 97,
  "countedVotes": 5000,
  "delayedVotes": 23,
  "underReviewVotes": 17,
  "blockedAttempts": 89,
  "duplicateAttempts": 44,
  "highConfidenceVotes": 4200,
  "mediumConfidenceVotes": 760,
  "lowConfidenceVotes": 40
}
```

Simple V1 formula:

```text
integrityScore = 100
  - review_rate_penalty
  - delayed_vote_penalty
  - blocked_attempt_penalty
  - duplicate_attempt_penalty
  - concentrated_ip_penalty
  - low_confidence_vote_penalty
```

Keep the first implementation conservative:

- Never use the score to automatically certify an election.
- Show the score as an operational signal.
- Provide counts and reasons behind the score.
- Let organizers drill into review and blocked-attempt data.
- Make it clear when a result is clean versus suspicious.

## 12. Error Handling and Response Examples

Use a consistent error shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message.",
    "details": {}
  }
}
```

### Campaign Inactive

```http
403 Forbidden
```

```json
{
  "error": {
    "code": "CAMPAIGN_NOT_ACTIVE",
    "message": "This campaign is not currently accepting votes."
  }
}
```

### Campaign Expired

```http
403 Forbidden
```

```json
{
  "error": {
    "code": "CAMPAIGN_EXPIRED",
    "message": "Voting for this campaign has ended."
  }
}
```

### Invalid Option

```http
400 Bad Request
```

```json
{
  "error": {
    "code": "INVALID_OPTION",
    "message": "The selected option is not valid for this campaign."
  }
}
```

### Already Voted

```http
409 Conflict
```

```json
{
  "error": {
    "code": "ALREADY_VOTED",
    "message": "This credential has already submitted a vote for this campaign."
  }
}
```

### Idempotency Conflict

```http
409 Conflict
```

```json
{
  "error": {
    "code": "IDEMPOTENCY_CONFLICT",
    "message": "This idempotency key was already used with a different request."
  }
}
```

### Suspicious Vote Blocked

```http
403 Forbidden
```

```json
{
  "error": {
    "code": "VOTE_BLOCKED",
    "message": "This vote could not be counted because it triggered integrity checks."
  }
}
```

### Temporarily Busy

```http
503 Service Unavailable
```

```json
{
  "error": {
    "code": "TEMPORARILY_BUSY",
    "message": "The voting service is busy. Please retry with the same idempotency key."
  }
}
```

### Vote Placed Under Review

```http
202 Accepted
```

```json
{
  "voteId": "v_123",
  "receipt": "rcpt_abc123xyz",
  "status": "under_review",
  "message": "Your vote requires review before it can be counted."
}
```

### Vote Delayed

```http
202 Accepted
```

```json
{
  "voteId": "v_123",
  "receipt": "rcpt_abc123xyz",
  "status": "delayed",
  "confidenceLevel": "medium",
  "message": "Your vote was received and is waiting for integrity checks."
}
```

## 13. Suggested Tech Stack

Recommended V1 stack:

### Monorepo

- `apps/web`
- `apps/api`

### Frontend / `apps/web`

- React Router 7
- TypeScript
- Tailwind CSS
- shadcn/ui

### Backend / `apps/api`

- Fastify
- TypeScript
- Prisma
- PostgreSQL
- Redis only for temporary rate limits and abuse counters
- Zod for request validation unless TypeBox is explicitly chosen later
- OpenAPI/Swagger for API docs
- Better Auth for organizer/admin authentication
- Cloudflare Turnstile for bot protection

### Infrastructure

- Docker
- Railway first
- Cloudflare
- Managed PostgreSQL
- Managed Redis
- Managed PostgreSQL connection pooling if available
- Do not self-manage PgBouncer in V1
- Basic autoscaling and health checks

Do not add queues, Kafka, Kubernetes, microservices, ML fraud detection, blockchain, webhook delivery, or advanced infrastructure in V1.

My thought: Fastify, Prisma, PostgreSQL, Redis, and Railway are a good fit here. The system needs clear transactional behavior and fast API responses more than it needs a heavy framework.

## 14. Implementation Phases / MVP Plan

### Phase 1: Core Foundation

- Create monorepo structure with `apps/web` and `apps/api`.
- Set up React Router 7 TypeScript app in `apps/web`.
- Set up Fastify TypeScript API.
- Add Prisma and PostgreSQL.
- Add Redis.
- Use managed PostgreSQL connection pooling if available.
- Add request validation and OpenAPI docs.
- Add Better Auth for organizer/admin authentication.
- Add role-based authorization.
- Add health checks and structured request logs.

### Phase 2: Election and Campaign Management

- Create/list/update elections.
- Create/list/update campaigns inside elections.
- Add campaign options.
- Support statuses: draft, active, closed, archived where appropriate.
- Add audit logs for organizer actions.

### Phase 3: Soft Identity Voting MVP

- Add OAuth or email identity flow.
- Add optional invite tokens.
- Store only provider subject, email, and token hashes.
- Add Cloudflare Turnstile or CAPTCHA-style bot protection.
- Expose public campaign detail endpoint.
- Submit vote with `optionId`, identity proof, bot-protection token, and mandatory `idempotencyKey`.
- Enforce one vote per credential with database constraints.
- Atomically claim invite tokens when used.
- Replay idempotent responses safely.
- Return vote receipt.

### Phase 4: Gatekeeping and Review

- Add `vote_attempts`.
- Add `vote_ledger`.
- Add `identity_verification_events`.
- Add device/IP/user-agent hashing.
- Add rate limiting.
- Add risk scoring.
- Add high/medium/low vote confidence.
- Add counted, delayed, under-review, blocked, and rejected statuses.
- Add hard blocks and under-review state.
- Add organizer review queue.
- Add count/reject review actions.

### Phase 5: Results and Integrity

- Add campaign results endpoint.
- Add counted, delayed, under-review, blocked, and duplicate counts.
- Add high/medium/low confidence counts.
- Add campaign integrity score.
- Add receipt verification endpoint.
- Add CSV/JSON export.

### Phase 6: Hardening

- Add stronger rate limiting.
- Add burst load tests for voting windows.
- Add request IDs and structured logs.
- Add monitoring and alerting.
- Add retention policies.
- Add privacy policy support notes.
- Add admin-wide abuse inspection endpoints.

### Phase 7: Future Identity and Certification

- Add SMS verification if customers need it.
- Add paid phone verification if economically justified.
- Add full voter accounts.
- Add multi-factor voter identity.
- Add government ID verification where legally appropriate.
- Add automatic identity merging across providers.
- Add legal-grade election certification workflows.

### Phase 8: Later Automation and Advanced Integrity

- Design webhook endpoint management only when automation becomes a priority.
- Add webhook signing and delivery only in a later explicitly scoped phase.
- Add event catalog documentation when webhook work starts.
- Add advanced admin dashboards.
- Add complex fraud models only after simple rules are insufficient.

## Future Plan / Later Versions

Move these outside the V1 core:

- SMS verification.
- Paid phone verification.
- Strict one-person-one-vote guarantee.
- Government ID verification.
- Full voter accounts.
- Multi-factor voter identity.
- Complex machine-learning fraud detection.
- Public cryptographic vote verification.
- Advanced admin dashboard.
- Automatic identity merging across providers.
- Legal-grade election certification.
- Blockchain or public ledger.
- Complex result projections.
- Webhooks and third-party automation.
- Queues, Kafka, Kubernetes, microservices, and advanced infrastructure.

## Recommended V1 Scope

Ship:

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
- Basic risk scoring.
- Review queue.
- Results endpoint.
- Integrity score.

Defer:

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
- Advanced identity conflict review and merge flows.
- Webhooks and third-party automation.

## Next Steps Before Production

Implementation has started. These are the remaining decisions and setup tasks before BirdLoud should be considered production-ready:

1. Finalize V1 product promise.
   - Use: "Fast and simple for normal voters. Expensive, visible, and limited for attackers."
   - Avoid claiming strict one-person-one-vote guarantees.

2. Choose the first identity methods.
   - Recommended: Google OAuth and email magic link.
   - Decide whether Microsoft/Facebook OAuth ship in V1 or shortly after.
   - Decide whether invite tokens are required for private campaigns or optional.

3. Define campaign configuration defaults.
   - Default identity mode.
   - Whether invite tokens are enabled.
   - Risk behavior: count, delay, review, or block.
   - Review queue threshold.
   - Result visibility during active campaigns.

4. Lock the V1 schema and migrations.
   - `elections`
   - `campaigns`
   - `campaign_options`
   - `voter_identities`
   - `voter_tokens`
   - `votes`
   - `vote_attempts`
   - `vote_ledger`
   - `idempotency_keys`
   - `identity_verification_events`
   - `identity_conflicts`
   - `audit_logs`

5. Define the vote status lifecycle.
   - `counted`
   - `delayed`
   - `under_review`
   - `blocked`
   - `rejected`
   - Decide when delayed votes automatically become counted or move to review.

6. Define the first risk scoring rules.
   - Same credential already voted.
   - Same device hash exceeds threshold.
   - Same IP/network exceeds threshold.
   - Suspicious user agent.
   - Abnormal submission speed.
   - Many failed attempts before success.
   - Many new/low-trust identities from the same source.

7. Decide privacy defaults.
   - Hash provider subjects, emails, IPs, devices, and user agents.
   - Avoid raw personal data where possible.
   - Decide salt rotation policy.
   - Decide log and identity evidence retention windows.

8. Choose infrastructure for V1.
   - Monorepo with `apps/web` and `apps/api`.
   - React Router 7 + TypeScript + Tailwind + shadcn/ui in `apps/web`.
   - Fastify + TypeScript.
   - Better Auth for organizer/admin authentication.
   - Prisma.
   - PostgreSQL.
   - Redis.
   - Cloudflare Turnstile.
   - Docker.
   - Railway first.
   - Managed PostgreSQL pooling if available.
   - No self-managed PgBouncer in V1.
   - No queues, Kafka, Kubernetes, microservices, ML fraud detection, blockchain, webhook delivery, or advanced infrastructure.

9. Tighten the API contract.
   - Organizer auth.
   - Election and campaign CRUD.
   - Candidate/choice management.
   - Public campaign details.
   - Vote submission.
   - Receipt verification.
   - Review queue.
   - Results and integrity reporting.

10. Continue implementation milestones.
    - Add migrations and database setup scripts, then validate Better Auth against PostgreSQL.
    - Add real email magic-link verification.
    - Add bot protection verification.
    - Add Redis-backed abuse counters.
    - Add concurrency hardening for vote/token/idempotency races.
    - Build usable web flows.
    - Add load testing and hardening.

11. Define launch-readiness checks.
    - No duplicate counted votes for the same credential.
    - Idempotent retries return the same response.
    - High-risk vote attempts are logged.
    - Review queue works end to end.
    - Results show confidence and risk breakdowns.
    - Burst load test passes target traffic.
    - Privacy disclosures are ready.

The guiding principle: fast and simple for normal voters. Expensive, visible, and limited for attackers.
