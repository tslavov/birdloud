-- Normalize legacy implementation strings to the stable product event catalog.
UPDATE "vote_ledger"
SET "eventType" = CASE "eventType"
  WHEN 'vote_counted' THEN 'vote.counted'
  WHEN 'vote_delayed' THEN 'vote.delayed'
  WHEN 'vote_placed_under_review' THEN 'vote.placed_under_review'
  WHEN 'vote_reviewed' THEN 'vote.reviewed'
  WHEN 'vote_review_approved' THEN 'vote.reviewed'
  WHEN 'vote_blocked' THEN 'vote.blocked'
  WHEN 'vote_rejected' THEN 'vote.rejected'
  WHEN 'vote_review_rejected' THEN 'vote.rejected'
  WHEN 'duplicate_attempt_detected' THEN 'duplicate_attempt.detected'
  WHEN 'token_revoked' THEN 'token.revoked'
  WHEN 'voter_token_revoked' THEN 'token.revoked'
  WHEN 'campaign_closed' THEN 'campaign.closed'
  WHEN 'results_published' THEN 'results.published'
  ELSE "eventType"
END
WHERE "eventType" IN (
  'vote_counted',
  'vote_delayed',
  'vote_placed_under_review',
  'vote_reviewed',
  'vote_review_approved',
  'vote_blocked',
  'vote_rejected',
  'vote_review_rejected',
  'duplicate_attempt_detected',
  'token_revoked',
  'voter_token_revoked',
  'campaign_closed',
  'results_published'
);
