import type { AttemptOutcome, TrustLevel, VoteStatus } from "@prisma/client";

export type CampaignOptionResult = {
  optionId: string;
  label: string;
  countedVotes: number;
  delayedVotes: number;
  underReviewVotes: number;
  rejectedVotes: number;
};

export type CampaignStats = {
  countedVotes: number;
  delayedVotes: number;
  underReviewVotes: number;
  blockedVotes: number;
  rejectedVotes: number;
  blockedAttempts: number;
  duplicateAttempts: number;
  highConfidenceVotes: number;
  mediumConfidenceVotes: number;
  lowConfidenceVotes: number;
  options: CampaignOptionResult[];
};

export type IntegritySignal = {
  code: string;
  label: string;
  value: number;
  severity: "info" | "warning" | "critical";
};

export type ResultsCsvInput = {
  campaignId: string;
  integrityScore: number;
  countedVotes: number;
  delayedVotes: number;
  underReviewVotes: number;
  blockedAttempts: number;
  duplicateAttempts: number;
  highConfidenceVotes: number;
  mediumConfidenceVotes: number;
  lowConfidenceVotes: number;
  options: CampaignOptionResult[];
};

export function buildCampaignStats(
  options: Array<{ id: string; label: string }>,
  votes: Array<{ optionId: string; status: VoteStatus; confidenceLevel: TrustLevel }>,
  attempts: Array<{ outcome: AttemptOutcome }>
): CampaignStats {
  const stats: CampaignStats = {
    countedVotes: 0,
    delayedVotes: 0,
    underReviewVotes: 0,
    blockedVotes: 0,
    rejectedVotes: 0,
    blockedAttempts: 0,
    duplicateAttempts: 0,
    highConfidenceVotes: 0,
    mediumConfidenceVotes: 0,
    lowConfidenceVotes: 0,
    options: options.map((option) => ({
      optionId: option.id,
      label: option.label,
      countedVotes: 0,
      delayedVotes: 0,
      underReviewVotes: 0,
      rejectedVotes: 0
    }))
  };
  const optionStats = new Map(stats.options.map((option) => [option.optionId, option]));

  for (const vote of votes) {
    if (vote.status === "COUNTED") stats.countedVotes += 1;
    if (vote.status === "DELAYED") stats.delayedVotes += 1;
    if (vote.status === "UNDER_REVIEW") stats.underReviewVotes += 1;
    if (vote.status === "BLOCKED") stats.blockedVotes += 1;
    if (vote.status === "REJECTED") stats.rejectedVotes += 1;

    if (vote.confidenceLevel === "HIGH") stats.highConfidenceVotes += 1;
    if (vote.confidenceLevel === "MEDIUM") stats.mediumConfidenceVotes += 1;
    if (vote.confidenceLevel === "LOW") stats.lowConfidenceVotes += 1;

    const option = optionStats.get(vote.optionId);

    if (option) {
      if (vote.status === "COUNTED") option.countedVotes += 1;
      if (vote.status === "DELAYED") option.delayedVotes += 1;
      if (vote.status === "UNDER_REVIEW") option.underReviewVotes += 1;
      if (vote.status === "REJECTED") option.rejectedVotes += 1;
    }
  }

  for (const attempt of attempts) {
    if (attempt.outcome === "BLOCKED") stats.blockedAttempts += 1;
    if (attempt.outcome === "DUPLICATE") stats.duplicateAttempts += 1;
  }

  return stats;
}

export function calculateIntegrityScore(stats: CampaignStats): number {
  const totalSignals =
    stats.countedVotes +
    stats.delayedVotes +
    stats.underReviewVotes +
    stats.rejectedVotes +
    stats.blockedAttempts +
    stats.duplicateAttempts;

  if (totalSignals === 0) {
    return 100;
  }

  const penalty =
    (stats.underReviewVotes / totalSignals) * 25 +
    (stats.delayedVotes / totalSignals) * 15 +
    (stats.rejectedVotes / totalSignals) * 20 +
    (stats.blockedAttempts / totalSignals) * 20 +
    (stats.duplicateAttempts / totalSignals) * 15 +
    (stats.lowConfidenceVotes / Math.max(1, stats.countedVotes + stats.delayedVotes + stats.underReviewVotes)) * 15;

  return Math.max(0, Math.round(100 - penalty));
}

export function buildIntegritySignals(stats: CampaignStats): IntegritySignal[] {
  return [
    {
      code: "under_review_votes",
      label: "Votes waiting for review",
      value: stats.underReviewVotes,
      severity: stats.underReviewVotes > 0 ? "warning" : "info"
    },
    {
      code: "blocked_attempts",
      label: "Blocked vote attempts",
      value: stats.blockedAttempts,
      severity: stats.blockedAttempts > 0 ? "warning" : "info"
    },
    {
      code: "duplicate_attempts",
      label: "Duplicate vote attempts",
      value: stats.duplicateAttempts,
      severity: stats.duplicateAttempts > 0 ? "warning" : "info"
    },
    {
      code: "low_confidence_votes",
      label: "Low-confidence votes",
      value: stats.lowConfidenceVotes,
      severity: stats.lowConfidenceVotes > 0 ? "critical" : "info"
    }
  ];
}

export function buildResultsCsv(input: ResultsCsvInput): string {
  const rows = [
    [
      "campaign_id",
      "integrity_score",
      "total_counted_votes",
      "total_delayed_votes",
      "total_under_review_votes",
      "blocked_attempts",
      "duplicate_attempts",
      "high_confidence_votes",
      "medium_confidence_votes",
      "low_confidence_votes",
      "option_id",
      "option_label",
      "option_counted_votes",
      "option_delayed_votes",
      "option_under_review_votes",
      "option_rejected_votes"
    ],
    ...input.options.map((option) => [
      input.campaignId,
      String(input.integrityScore),
      String(input.countedVotes),
      String(input.delayedVotes),
      String(input.underReviewVotes),
      String(input.blockedAttempts),
      String(input.duplicateAttempts),
      String(input.highConfidenceVotes),
      String(input.mediumConfidenceVotes),
      String(input.lowConfidenceVotes),
      option.optionId,
      option.label,
      String(option.countedVotes),
      String(option.delayedVotes),
      String(option.underReviewVotes),
      String(option.rejectedVotes)
    ])
  ];

  return `${rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n")}\n`;
}

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}
