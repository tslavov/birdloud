# BirdLoud V1 Data Retention

This is the V1 baseline policy, subject to organizer contracts and applicable law. BirdLoud stores
privacy-preserving hashes where possible, but hashed identifiers can still be personal data when
linkable. Access and deletion procedures require legal/privacy review before a real launch.

## Baseline Schedule

| Data | Default retention | Treatment |
| --- | --- | --- |
| Redis rate/abuse counters | 10–30 minutes | Automatic TTL; never durable or authoritative. |
| Pending/consumed email challenges | 30 days after expiry/consumption | Delete challenge rows; raw email, link token, and proof are never stored. |
| Idempotency records | 7 days after `expiresAt` | Delete only after replay and incident windows have passed. |
| IP/device/user-agent hashes on identities, votes, and attempts | 90 days after campaign close | Null nullable fields where supported; keep aggregate integrity counts. |
| Vote attempts | 90 days after campaign close | Retain longer only for an active integrity investigation or contractual need. |
| Application/proxy logs | 30 days | Keep structured metadata; never log request secrets or selected choices. |
| SMTP provider message content | Shortest supported window, at most 7 days | Configure at the provider; local Mailpit is development-only. |
| Database backups | 30 days rolling | Encrypt, restrict access, and test restoration. Expired data also ages out of backups. |
| Votes, receipt hashes, aggregate counts, ledger, and organizer audit logs | Election policy, documented before launch | Preserve vote/audit integrity; deletion is campaign/election scoped, never a silent ledger mutation. |

Legal hold or a documented integrity investigation may suspend deletion for the minimum necessary
scope and time. Record the reason, owner, start date, and review date.

## Enforcement Status

Redis TTLs are enforced in code. Token/proof values are stored only as keyed hashes, and application
logs redact known secret fields. Scheduled PostgreSQL cleanup, log-provider retention, backup expiry,
legal hold, and organizer deletion workflows are operational controls and are not automated in this
repository yet. A production owner must configure and verify them before handling real voter data.

`BIRDLOUD_HASH_SECRET` rotation is not automatic because it affects lookup continuity. Treat it as
a protected long-lived secret and define a migration plan before rotation.

## Deletion Safety

- Never delete an individual ledger event to change an election outcome.
- Pause cleanup for campaigns under active review.
- Recompute/verify aggregate counts before and after any approved campaign-level deletion.
- Keep deletion audit evidence without retaining the deleted identifier itself.
- Verify removal from replicas and eventual backup expiry.

BirdLoud V1 does not collect government ID, SMS identity, or full voter profiles.
