---
name: birdloud-vote-hot-path
description: Protect BirdLoud vote submission behavior. Use when implementing or reviewing POST /api/campaigns/:campaignId/votes, idempotency, identity resolution, invite token claiming, risk scoring, vote attempts, receipts, or ledger writes.
---

# BirdLoud Vote Hot Path

## Source of Truth

Use `design notes.md`, especially the vote flow, burst traffic, idempotency, and duplicate credential sections.

## When To Use It

Use this skill for vote submission, retry behavior, duplicate prevention, race conditions, transaction boundaries, and performance-sensitive voting work.

## What To Enforce

- Treat all committed tests, fixtures, and examples as public; use fake tokens, fake identities, and fake receipts.
- Keep the vote endpoint short and transactional.
- Validate request shape, campaign status, option, bot-protection token, and identity proof.
- Claim or replay idempotency before creating side effects.
- Resolve or create campaign-scoped `identity_id`.
- Atomically claim invite tokens when used.
- Calculate `voter_key_hash`, risk score, and confidence level.
- Write vote, vote attempt, and ledger event together.
- Return a receipt without exposing the selected choice through receipt verification.
- Preserve the status model: `counted`, `delayed`, `under_review`, `blocked`, `rejected`.

## What Not To Do

- Do not call webhooks, send emails, generate exports, recompute dashboards, or run expensive fraud analysis in the vote transaction.
- Do not commit real idempotency keys, invite tokens, OAuth tokens, receipt values, webhook URLs, or production request logs.
- Do not rely only on application checks for duplicate credentials; use database constraints too.
- Do not make risky votes silently counted.
- Do not turn V1 into strict real-person identity verification.

## Done Check

Verify idempotent retry behavior, duplicate-credential races, ledger append, vote attempt logging, and status/risk mapping.
