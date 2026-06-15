---
name: birdloud-integrity-review
description: Review BirdLoud integrity behavior. Use when designing or checking risk scoring, vote confidence, anti-mass-manipulation controls, review queues, vote attempts, integrity score, or suspicious result reporting.
---

# BirdLoud Integrity Review

## Source of Truth

Use `design notes.md`, especially anti-cheat, confidence, review, result reporting, and integrity score sections.

## When To Use It

Use this skill when work affects abuse detection, vote status decisions, review queues, result trust, or organizer visibility into risk.

## What To Enforce

- Treat logs, fixtures, and examples as public; use synthetic data only.
- Keep risk scoring simple and explainable.
- Use confidence levels: `high`, `medium`, `low`.
- Use statuses: `counted`, `delayed`, `under_review`, `blocked`, `rejected`.
- Track signals such as duplicate credential, device hash volume, IP/network volume, suspicious user agent, abnormal speed, failed attempts, low-trust identity bursts, and invalid/reused invite tokens.
- Log every vote attempt outcome.
- Send risky votes to delayed or review states; block clearly abusive attempts.
- Results must show counted, delayed, under-review, blocked attempts, duplicate attempts, and confidence counts.
- Integrity score is an operational signal, not certification.

## What Not To Do

- Do not silently count suspicious mass voting.
- Do not overfit with complex ML or opaque rules in V1.
- Do not treat shared IP/device as proof of cheating.
- Do not publish real abuse logs, real IPs, real device fingerprints, real identity hashes, or production integrity data.
- Do not present the integrity score as legal-grade validation.

## Done Check

Confirm organizers can see what happened, why risky votes were not counted immediately, and which signals affected integrity.
