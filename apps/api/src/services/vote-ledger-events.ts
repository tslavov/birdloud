export const VOTE_LEDGER_EVENT_VERSION = 1;

export const VOTE_LEDGER_EVENT = {
  VOTE_COUNTED: "vote.counted",
  VOTE_DELAYED: "vote.delayed",
  VOTE_PLACED_UNDER_REVIEW: "vote.placed_under_review",
  VOTE_REVIEWED: "vote.reviewed",
  VOTE_BLOCKED: "vote.blocked",
  VOTE_REJECTED: "vote.rejected",
  DUPLICATE_ATTEMPT_DETECTED: "duplicate_attempt.detected",
  TOKEN_REVOKED: "token.revoked",
  CAMPAIGN_CLOSED: "campaign.closed",
  RESULTS_PUBLISHED: "results.published"
} as const;

export type VoteLedgerEventType =
  (typeof VOTE_LEDGER_EVENT)[keyof typeof VOTE_LEDGER_EVENT];
