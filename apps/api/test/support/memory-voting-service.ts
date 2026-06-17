import { randomUUID } from "node:crypto";
import { forbidden, notFound, conflict, ApiError, badRequest } from "../../src/http/errors.js";
import type {
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
}
