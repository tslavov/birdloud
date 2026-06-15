---
name: birdloud-v1-scope-guard
description: Keep BirdLoud planning, implementation, and reviews aligned with the V1 scope. Use when Codex is asked to add features, choose architecture, review changes, or decide whether something belongs in V1 versus later versions.
---

# BirdLoud V1 Scope Guard

## Source of Truth

Use `design notes.md` and `AGENTS.md` as the governing references.

## When To Use It

Use this skill for feature planning, code review, implementation scoping, milestone slicing, and any request that might expand BirdLoud beyond the V1 plan.

## What To Enforce

- Treat the repository as public; never add secrets, real credentials, production URLs, real voter data, or sensitive environment values.
- Preserve the V1 promise: fast and simple for normal voters; expensive, visible, and limited for attackers.
- Keep V1 focused on soft identity, duplicate-credential prevention, rate limits, review queues, integrity scoring, idempotency, receipts, vote attempts, and immutable ledger events.
- Prefer OAuth or email identity plus optional invite tokens.
- Include bot protection for public voting.
- Ensure results show integrity context, not only raw totals.
- Make limitations explicit when identity guarantees are soft.

## What Not To Do

- Do not claim strict one-person-one-vote guarantees in V1.
- Do not add SMS, paid phone checks, government ID, full voter accounts, MFA, legal-grade certification, blockchain, public cryptographic verification, or ML fraud detection unless explicitly scoped as future work.
- Do not commit `.env` files, OAuth secrets, database URLs, Redis URLs, Turnstile secrets, production salts, invite tokens, or real identity data.
- Do not silently count suspicious submissions.
- Do not add complex abstractions before the MVP needs them.

## Done Check

Before finishing, state whether the work is V1 core or future/deferred, and name any scope risk.
