import { describe, expect, it } from "vitest";
import {
  buildCampaignStats,
  buildIntegritySignals,
  buildResultsCsv,
  calculateIntegrityScore
} from "../src/services/voting-reporting.js";

describe("voting reporting logic", () => {
  it("aggregates campaign totals, confidence totals, and option totals", () => {
    const stats = buildCampaignStats(
      [
        { id: "option-a", label: "Candidate A" },
        { id: "option-b", label: "Candidate B" }
      ],
      [
        { optionId: "option-a", status: "COUNTED", confidenceLevel: "HIGH" },
        { optionId: "option-a", status: "COUNTED", confidenceLevel: "MEDIUM" },
        { optionId: "option-a", status: "UNDER_REVIEW", confidenceLevel: "LOW" },
        { optionId: "option-b", status: "DELAYED", confidenceLevel: "LOW" },
        { optionId: "option-b", status: "REJECTED", confidenceLevel: "LOW" },
        { optionId: "option-b", status: "BLOCKED", confidenceLevel: "LOW" }
      ],
      [
        { outcome: "COUNTED" },
        { outcome: "DUPLICATE" },
        { outcome: "DUPLICATE" },
        { outcome: "BLOCKED" }
      ]
    );

    expect(stats).toMatchObject({
      countedVotes: 2,
      delayedVotes: 1,
      underReviewVotes: 1,
      blockedVotes: 1,
      rejectedVotes: 1,
      blockedAttempts: 1,
      duplicateAttempts: 2,
      highConfidenceVotes: 1,
      mediumConfidenceVotes: 1,
      lowConfidenceVotes: 4
    });
    expect(stats.options).toEqual([
      {
        optionId: "option-a",
        label: "Candidate A",
        countedVotes: 2,
        delayedVotes: 0,
        underReviewVotes: 1,
        rejectedVotes: 0
      },
      {
        optionId: "option-b",
        label: "Candidate B",
        countedVotes: 0,
        delayedVotes: 1,
        underReviewVotes: 0,
        rejectedVotes: 1
      }
    ]);
  });

  it("keeps unknown option votes out of option totals but still counts campaign totals", () => {
    const stats = buildCampaignStats(
      [{ id: "known-option", label: "Known" }],
      [
        { optionId: "known-option", status: "COUNTED", confidenceLevel: "HIGH" },
        { optionId: "deleted-option", status: "COUNTED", confidenceLevel: "MEDIUM" }
      ],
      []
    );

    expect(stats.countedVotes).toBe(2);
    expect(stats.options).toEqual([
      {
        optionId: "known-option",
        label: "Known",
        countedVotes: 1,
        delayedVotes: 0,
        underReviewVotes: 0,
        rejectedVotes: 0
      }
    ]);
  });

  it("scores a clean campaign at 100 and penalizes review, rejected, duplicate, blocked, and low-confidence signals", () => {
    const cleanStats = buildCampaignStats(
      [{ id: "option-a", label: "Candidate A" }],
      [{ optionId: "option-a", status: "COUNTED", confidenceLevel: "HIGH" }],
      []
    );
    const riskyStats = buildCampaignStats(
      [{ id: "option-a", label: "Candidate A" }],
      [
        { optionId: "option-a", status: "COUNTED", confidenceLevel: "LOW" },
        { optionId: "option-a", status: "UNDER_REVIEW", confidenceLevel: "LOW" },
        { optionId: "option-a", status: "REJECTED", confidenceLevel: "LOW" }
      ],
      [{ outcome: "DUPLICATE" }, { outcome: "BLOCKED" }]
    );

    expect(calculateIntegrityScore(cleanStats)).toBe(100);
    expect(calculateIntegrityScore(riskyStats)).toBeLessThan(75);
  });

  it("produces operator-friendly integrity signals with severity", () => {
    const stats = buildCampaignStats(
      [{ id: "option-a", label: "Candidate A" }],
      [
        { optionId: "option-a", status: "COUNTED", confidenceLevel: "LOW" },
        { optionId: "option-a", status: "UNDER_REVIEW", confidenceLevel: "LOW" }
      ],
      [{ outcome: "DUPLICATE" }, { outcome: "BLOCKED" }]
    );

    expect(buildIntegritySignals(stats)).toEqual([
      {
        code: "under_review_votes",
        label: "Votes waiting for review",
        value: 1,
        severity: "warning"
      },
      {
        code: "blocked_attempts",
        label: "Blocked vote attempts",
        value: 1,
        severity: "warning"
      },
      {
        code: "duplicate_attempts",
        label: "Duplicate vote attempts",
        value: 1,
        severity: "warning"
      },
      {
        code: "low_confidence_votes",
        label: "Low-confidence votes",
        value: 2,
        severity: "critical"
      }
    ]);
  });

  it("builds a CSV export with escaped option labels and aggregate context on each row", () => {
    const csv = buildResultsCsv({
      campaignId: "campaign-1",
      integrityScore: 87,
      countedVotes: 10,
      delayedVotes: 1,
      underReviewVotes: 2,
      blockedAttempts: 3,
      duplicateAttempts: 4,
      highConfidenceVotes: 7,
      mediumConfidenceVotes: 3,
      lowConfidenceVotes: 3,
      options: [
        {
          optionId: "option-a",
          label: "Candidate A",
          countedVotes: 6,
          delayedVotes: 0,
          underReviewVotes: 1,
          rejectedVotes: 0
        },
        {
          optionId: "option-b",
          label: "Candidate, \"B\"",
          countedVotes: 4,
          delayedVotes: 1,
          underReviewVotes: 1,
          rejectedVotes: 2
        }
      ]
    });

    expect(csv.split("\n")[0]).toBe(
      "campaign_id,integrity_score,total_counted_votes,total_delayed_votes,total_under_review_votes,blocked_attempts,duplicate_attempts,high_confidence_votes,medium_confidence_votes,low_confidence_votes,option_id,option_label,option_counted_votes,option_delayed_votes,option_under_review_votes,option_rejected_votes"
    );
    expect(csv).toContain("campaign-1,87,10,1,2,3,4,7,3,3,option-a,Candidate A,6,0,1,0");
    expect(csv).toContain('campaign-1,87,10,1,2,3,4,7,3,3,option-b,"Candidate, ""B""",4,1,1,2');
    expect(csv.endsWith("\n")).toBe(true);
  });
});
