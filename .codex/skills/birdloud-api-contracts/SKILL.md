---
name: birdloud-api-contracts
description: Keep BirdLoud REST API contracts consistent with the V1 design. Use when designing or implementing endpoints, Zod validation, error responses, OpenAPI docs, request bodies, receipts, review APIs, results APIs, or organizer/voter flows.
---

# BirdLoud API Contracts

## Source of Truth

Use `design notes.md` API sections and `AGENTS.md`.

## When To Use It

Use this skill for endpoint design, request/response bodies, status codes, validation schemas, OpenAPI changes, and API reviews.

## What To Enforce

- Keep public examples sanitized; use fake IDs, fake tokens, fake emails, and placeholder URLs only.
- API-first REST/JSON design.
- Validate input with Zod.
- Document endpoints with OpenAPI.
- Organizer APIs cover auth, elections, campaigns, choices, optional invite tokens, review, results, and integrity.
- Voter APIs cover campaign details, identity start/verify, vote submission, and receipt verification.
- Vote submission requires identity proof, bot-protection token, and idempotency key.
- Responses include clear status: `counted`, `delayed`, `under_review`, `blocked`, or `rejected`.
- Error shape is consistent:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message.",
    "details": {}
  }
}
```

- Receipt verification never reveals selected candidate/choice.
- Results responses include integrity context and confidence breakdowns.

## What Not To Do

- Do not expose raw private identity signals.
- Do not include real secrets, production hostnames, real voter identifiers, real OAuth tokens, real invite tokens, or real receipts in examples or tests.
- Do not return selected vote from receipt verification.
- Do not add future-only APIs as V1 endpoints unless explicitly requested.
- Do not use ambiguous success responses for delayed or review states.

## Done Check

Confirm OpenAPI, Zod schemas, status codes, response examples, and error codes match the V1 design.
