import { randomUUID } from "node:crypto";
import { forbidden, notFound, conflict, ApiError, badRequest } from "../../src/http/errors.js";
import type {
  CampaignExportDto,
  CampaignExportFormat,
  CampaignIntegrityDto,
  CampaignResultsDto,
  IssuedTokenDto,
  PublicCampaignDto,
  ReceiptStatusDto,
  ReviewResolutionDto,
  ReviewVoteDto,
  SubmitVoteContext,
  SubmitVoteInput,
  TokenSummaryDto,
  VoteResponseDto,
  VotingService
} from "../../src/services/voting.js";
import { buildResultsCsv } from "../../src/services/voting-reporting.js";
import { MemoryOrganizerService } from "./memory-organizer-service.js";

type StoredToken = {
  id: string;
  campaignId: string;
  token: string;
  status: "active" | "used" | "revoked" | "expired";
};

type StoredVote = {
  id: string;
  campaignId: string;
  optionId: string;
  identityKey: string;
  receipt: string;
  status: "counted" | "delayed" | "under_review" | "blocked" | "rejected";
  confidenceLevel: "high" | "medium" | "low";
  riskScore: number;
  reviewReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export class MemoryVotingService implements VotingService {
  readonly tokens = new Map<string, StoredToken>();
  readonly votes = new Map<string, StoredVote>();
  readonly attempts: Array<{ campaignId: string; outcome: "blocked" | "duplicate" | "invalid" }> = [];
  readonly idempotency = new Map<string, { request: string; statusCode: number; body: VoteResponseDto }>();

  constructor(private readonly organizer: MemoryOrganizerService) {}

  async issueTokens(
    organizerId: string,
    campaignId: string,
    input: { count: number; issuedLabel?: string | undefined }
  ): Promise<{ tokens: IssuedTokenDto[] }> {
    this.ensureOwnedCampaign(organizerId, campaignId);
    const issued: IssuedTokenDto[] = [];

    for (let index = 0; index < input.count; index += 1) {
      const token: StoredToken = {
        id: randomUUID(),
        campaignId,
        token: `ivt_${randomUUID()}`,
        status: "active"
      };

      this.tokens.set(token.id, token);
      issued.push({
        id: token.id,
        token: token.token
      });
    }

    return { tokens: issued };
  }

  async getTokenSummary(organizerId: string, campaignId: string): Promise<TokenSummaryDto> {
    this.ensureOwnedCampaign(organizerId, campaignId);
    const summary: TokenSummaryDto = {
      active: 0,
      used: 0,
      revoked: 0,
      expired: 0
    };

    for (const token of this.tokens.values()) {
      if (token.campaignId === campaignId) {
        summary[token.status] += 1;
      }
    }

    return summary;
  }

  async revokeToken(organizerId: string, campaignId: string, tokenId: string): Promise<void> {
    this.ensureOwnedCampaign(organizerId, campaignId);
    const token = this.tokens.get(tokenId);

    if (!token || token.campaignId !== campaignId) {
      throw notFound("Voter token was not found.");
    }

    if (token.status === "used") {
      throw conflict("TOKEN_ALREADY_USED", "Used voter tokens cannot be revoked.");
    }

    token.status = "revoked";
  }

  async getPublicCampaign(campaignId: string): Promise<PublicCampaignDto> {
    const campaign = this.organizer.campaigns.get(campaignId);

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    return {
      id: campaign.id,
      electionId: campaign.electionId,
      title: campaign.title,
      description: campaign.description,
      status: campaign.status,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
      options: [...this.organizer.options.values()]
        .filter((option) => option.campaignId === campaignId && option.isActive)
        .sort((first, second) => first.position - second.position)
        .map((option) => ({
          id: option.id,
          label: option.label,
          description: option.description,
          position: option.position
        }))
    };
  }

  async submitVote(
    campaignId: string,
    input: SubmitVoteInput,
    _context: SubmitVoteContext
  ): Promise<{ statusCode: number; body: VoteResponseDto }> {
    const idempotencyKey = `${campaignId}:${input.idempotencyKey}`;
    const request = JSON.stringify(input);
    const existing = this.idempotency.get(idempotencyKey);

    if (existing) {
      if (existing.request !== request) {
        throw conflict(
          "IDEMPOTENCY_CONFLICT",
          "This idempotency key was already used with a different request."
        );
      }

      return {
        statusCode: existing.statusCode,
        body: existing.body
      };
    }

    const campaign = this.organizer.campaigns.get(campaignId);

    if (!campaign || campaign.status !== "active") {
      throw new ApiError(403, "CAMPAIGN_NOT_ACTIVE", "This campaign is not currently accepting votes.");
    }

    const option = this.organizer.options.get(input.optionId);

    if (!option || option.campaignId !== campaignId || !option.isActive) {
      throw badRequest("The selected option is not valid for this campaign.");
    }

    const identityKey = `${input.identity.provider}:${input.identity.email.trim().toLowerCase()}`;

    if (
      [...this.votes.values()].some(
        (vote) => vote.campaignId === campaignId && vote.identityKey === identityKey
      )
    ) {
      this.attempts.push({
        campaignId,
        outcome: "duplicate"
      });
      throw conflict("ALREADY_VOTED", "A vote has already been submitted for this campaign.");
    }

    if (input.inviteToken) {
      const token = [...this.tokens.values()].find(
        (candidate) => candidate.campaignId === campaignId && candidate.token === input.inviteToken
      );

      if (!token) {
        throw new ApiError(403, "INVALID_INVITE_TOKEN", "The invite token is invalid.");
      }

      if (token.status !== "active") {
        throw conflict("INVITE_TOKEN_ALREADY_USED", "This invite token has already been used.");
      }

      token.status = "used";
    }

    const vote: StoredVote = {
      id: randomUUID(),
      campaignId,
      optionId: input.optionId,
      identityKey,
      receipt: `rcpt_${randomUUID()}`,
      status: "counted",
      confidenceLevel: input.inviteToken ? "high" : "medium",
      riskScore: 0,
      reviewReason: null,
      createdAt: new Date().toISOString(),
      reviewedAt: null
    };
    this.votes.set(vote.id, vote);

    const body: VoteResponseDto = {
      voteId: vote.id,
      receipt: vote.receipt,
      status: "counted",
      confidenceLevel: input.inviteToken ? "high" : "medium",
      message: "Your vote was recorded."
    };

    this.idempotency.set(idempotencyKey, {
      request,
      statusCode: 201,
      body
    });

    return {
      statusCode: 201,
      body
    };
  }

  async verifyReceipt(campaignId: string, receipt: string): Promise<ReceiptStatusDto> {
    const vote = [...this.votes.values()].find(
      (candidate) => candidate.campaignId === campaignId && candidate.receipt === receipt
    );

    if (!vote) {
      throw notFound("Receipt was not found.");
    }

    return {
      status: "recorded",
      voteStatus: vote.status,
      recordedAt: vote.createdAt
    };
  }

  async listReviewVotes(organizerId: string, campaignId: string): Promise<ReviewVoteDto[]> {
    this.ensureOwnedCampaign(organizerId, campaignId);

    return [...this.votes.values()]
      .filter((vote) => vote.campaignId === campaignId && vote.status === "under_review")
      .map((vote) => ({
        id: vote.id,
        campaignId: vote.campaignId,
        optionId: vote.optionId,
        status: "under_review",
        confidenceLevel: vote.confidenceLevel,
        riskScore: vote.riskScore,
        reviewReason: vote.reviewReason,
        createdAt: vote.createdAt
      }));
  }

  async approveReviewVote(
    organizerId: string,
    campaignId: string,
    voteId: string
  ): Promise<ReviewResolutionDto> {
    return this.resolveReviewVote(organizerId, campaignId, voteId, "counted");
  }

  async rejectReviewVote(
    organizerId: string,
    campaignId: string,
    voteId: string
  ): Promise<ReviewResolutionDto> {
    return this.resolveReviewVote(organizerId, campaignId, voteId, "rejected");
  }

  async getCampaignResults(
    organizerId: string,
    campaignId: string
  ): Promise<CampaignResultsDto> {
    this.ensureOwnedCampaign(organizerId, campaignId);
    const campaign = this.organizer.campaigns.get(campaignId);
    const stats = this.buildStats(campaignId);

    return {
      campaignId,
      status: campaign?.status ?? "draft",
      ...stats
    };
  }

  async getCampaignIntegrity(
    organizerId: string,
    campaignId: string
  ): Promise<CampaignIntegrityDto> {
    this.ensureOwnedCampaign(organizerId, campaignId);
    const stats = this.buildStats(campaignId);

    return {
      campaignId,
      integrityScore: stats.integrityScore,
      countedVotes: stats.countedVotes,
      delayedVotes: stats.delayedVotes,
      underReviewVotes: stats.underReviewVotes,
      blockedVotes: stats.blockedVotes,
      rejectedVotes: stats.rejectedVotes,
      blockedAttempts: stats.blockedAttempts,
      duplicateAttempts: stats.duplicateAttempts,
      highConfidenceVotes: stats.highConfidenceVotes,
      mediumConfidenceVotes: stats.mediumConfidenceVotes,
      lowConfidenceVotes: stats.lowConfidenceVotes,
      signals: [
        {
          code: "under_review_votes",
          label: "Votes waiting for review",
          value: stats.underReviewVotes,
          severity: stats.underReviewVotes > 0 ? "warning" : "info"
        },
        {
          code: "duplicate_attempts",
          label: "Duplicate vote attempts",
          value: stats.duplicateAttempts,
          severity: stats.duplicateAttempts > 0 ? "warning" : "info"
        }
      ]
    };
  }

  async exportCampaignReport(
    organizerId: string,
    campaignId: string,
    format: CampaignExportFormat
  ): Promise<CampaignExportDto> {
    const results = await this.getCampaignResults(organizerId, campaignId);
    const integrity = await this.getCampaignIntegrity(organizerId, campaignId);

    if (format === "csv") {
      return {
        format,
        filename: `birdloud-${campaignId}-results.csv`,
        contentType: "text/csv; charset=utf-8",
        body: buildResultsCsv(results)
      };
    }

    return {
      format,
      filename: `birdloud-${campaignId}-results.json`,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        results,
        integrity
      })
    };
  }

  markVoteUnderReview(voteId: string, reason = "many_votes_from_same_device"): void {
    const vote = this.votes.get(voteId);

    if (!vote) {
      throw new Error(`Vote ${voteId} was not found.`);
    }

    vote.status = "under_review";
    vote.confidenceLevel = "low";
    vote.riskScore = 45;
    vote.reviewReason = reason;
  }

  private ensureOwnedCampaign(organizerId: string, campaignId: string): void {
    const campaign = this.organizer.campaigns.get(campaignId);

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    const election = this.organizer.elections.get(campaign.electionId);

    if (!election || election.organizerId !== organizerId) {
      throw forbidden("You do not have access to this campaign.");
    }
  }

  private resolveReviewVote(
    organizerId: string,
    campaignId: string,
    voteId: string,
    status: "counted" | "rejected"
  ): ReviewResolutionDto {
    this.ensureOwnedCampaign(organizerId, campaignId);
    const vote = this.votes.get(voteId);

    if (!vote || vote.campaignId !== campaignId) {
      throw notFound("Review vote was not found.");
    }

    if (vote.status !== "under_review") {
      throw conflict("VOTE_NOT_UNDER_REVIEW", "Only under-review votes can be resolved.");
    }

    vote.status = status;
    vote.reviewedAt = new Date().toISOString();

    return {
      id: vote.id,
      campaignId: vote.campaignId,
      optionId: vote.optionId,
      status,
      confidenceLevel: vote.confidenceLevel,
      riskScore: vote.riskScore,
      reviewReason: vote.reviewReason,
      createdAt: vote.createdAt,
      reviewedAt: vote.reviewedAt
    };
  }

  private buildStats(campaignId: string): Omit<CampaignResultsDto, "campaignId" | "status"> {
    const votes = [...this.votes.values()].filter((vote) => vote.campaignId === campaignId);
    const duplicateAttempts = this.attempts.filter(
      (attempt) => attempt.campaignId === campaignId && attempt.outcome === "duplicate"
    ).length;
    const blockedAttempts = this.attempts.filter(
      (attempt) => attempt.campaignId === campaignId && attempt.outcome === "blocked"
    ).length;
    const options = [...this.organizer.options.values()]
      .filter((option) => option.campaignId === campaignId)
      .sort((first, second) => first.position - second.position)
      .map((option) => {
        const optionVotes = votes.filter((vote) => vote.optionId === option.id);

        return {
          optionId: option.id,
          label: option.label,
          countedVotes: optionVotes.filter((vote) => vote.status === "counted").length,
          delayedVotes: optionVotes.filter((vote) => vote.status === "delayed").length,
          underReviewVotes: optionVotes.filter((vote) => vote.status === "under_review").length,
          rejectedVotes: optionVotes.filter((vote) => vote.status === "rejected").length
        };
      });
    const countedVotes = votes.filter((vote) => vote.status === "counted").length;
    const delayedVotes = votes.filter((vote) => vote.status === "delayed").length;
    const underReviewVotes = votes.filter((vote) => vote.status === "under_review").length;
    const rejectedVotes = votes.filter((vote) => vote.status === "rejected").length;
    const lowConfidenceVotes = votes.filter((vote) => vote.confidenceLevel === "low").length;
    const totalSignals =
      countedVotes + delayedVotes + underReviewVotes + rejectedVotes + duplicateAttempts + blockedAttempts;
    const integrityScore =
      totalSignals === 0
        ? 100
        : Math.max(
            0,
            Math.round(
              100 -
                (underReviewVotes / totalSignals) * 25 -
                (rejectedVotes / totalSignals) * 20 -
                (duplicateAttempts / totalSignals) * 15 -
                (blockedAttempts / totalSignals) * 20 -
                (lowConfidenceVotes / Math.max(1, votes.length)) * 15
            )
          );

    return {
      countedVotes,
      delayedVotes,
      underReviewVotes,
      blockedVotes: votes.filter((vote) => vote.status === "blocked").length,
      rejectedVotes,
      blockedAttempts,
      duplicateAttempts,
      highConfidenceVotes: votes.filter((vote) => vote.confidenceLevel === "high").length,
      mediumConfidenceVotes: votes.filter((vote) => vote.confidenceLevel === "medium").length,
      lowConfidenceVotes,
      integrityScore,
      options
    };
  }
}
