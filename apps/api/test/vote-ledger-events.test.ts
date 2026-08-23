import { describe, expect, it } from "vitest";
import { VOTE_LEDGER_EVENT } from "../src/services/vote-ledger-events.js";

describe("vote ledger product event catalog", () => {
  it("uses stable dotted product event names", () => {
    expect(VOTE_LEDGER_EVENT).toEqual({
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
    });
  });
});
