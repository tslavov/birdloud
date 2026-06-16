import type { Prisma, PrismaClient, TrustLevel, VoteStatus } from "@prisma/client";
import {
  AttemptOutcome,
  CampaignStatus,
  ElectionStatus,
  IdentityProvider,
  IdempotencyStatus,
  TokenStatus
} from "@prisma/client";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors.js";
import { createOpaqueToken, hashValue, normalizeEmail } from "../lib/crypto.js";

export type TokenSummaryDto = {
  active: number;
  used: number;
  revoked: number;
  expired: number;
};

export type IssuedTokenDto = {
  id: string;
  token: string;
};

export type PublicCampaignDto = {
  id: string;
  electionId: string;
  title: string;
  description: string | null;
  status: "draft" | "active" | "closed";
  startsAt: string | null;
  endsAt: string | null;
  options: Array<{
    id: string;
    label: string;
    description: string | null;
    position: number;
  }>;
};

export type VoteIdentityInput = {
  provider: "email";
  email: string;
};

export type SubmitVoteInput = {
  optionId: string;
  idempotencyKey: string;
  identity: VoteIdentityInput;
  inviteToken?: string | undefined;
  deviceId?: string | undefined;
};

export type SubmitVoteContext = {
  ip?: string | undefined;
  userAgent?: string | undefined;
};

export type VoteResponseDto = {
  voteId: string;
  receipt: string;
  status: "counted" | "delayed" | "under_review";
  confidenceLevel: "high" | "medium" | "low";
  message: string;
};

export type ReceiptStatusDto = {
  status: "recorded";
  voteStatus: "counted" | "delayed" | "under_review" | "blocked" | "rejected";
  recordedAt: string;
};

export type VotingService = {
  issueTokens(
    organizerId: string,
    campaignId: string,
    input: { count: number; issuedLabel?: string | undefined }
  ): Promise<{ tokens: IssuedTokenDto[] }>;
  getTokenSummary(organizerId: string, campaignId: string): Promise<TokenSummaryDto>;
  revokeToken(organizerId: string, campaignId: string, tokenId: string): Promise<void>;
  getPublicCampaign(campaignId: string): Promise<PublicCampaignDto>;
  submitVote(
    campaignId: string,
    input: SubmitVoteInput,
    context: SubmitVoteContext
  ): Promise<{ statusCode: number; body: VoteResponseDto }>;
  verifyReceipt(campaignId: string, receipt: string): Promise<ReceiptStatusDto>;
};

const providerToPrisma: Record<VoteIdentityInput["provider"], IdentityProvider> = {
  email: IdentityProvider.EMAIL
};

const voteStatusToApi: Record<VoteStatus, VoteResponseDto["status"] | ReceiptStatusDto["voteStatus"]> = {
  COUNTED: "counted",
  DELAYED: "delayed",
  UNDER_REVIEW: "under_review",
  BLOCKED: "blocked",
  REJECTED: "rejected"
};

const trustLevelToApi: Record<TrustLevel, VoteResponseDto["confidenceLevel"]> = {
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
};

export class PrismaVotingService implements VotingService {
  constructor(private readonly prisma: PrismaClient) {}

  async issueTokens(
    organizerId: string,
    campaignId: string,
    input: { count: number; issuedLabel?: string | undefined }
  ): Promise<{ tokens: IssuedTokenDto[] }> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const tokens: IssuedTokenDto[] = [];

    for (let index = 0; index < input.count; index += 1) {
      const rawToken = createOpaqueToken("ivt");
      const data: Prisma.VoterTokenUncheckedCreateInput = {
        campaignId,
        tokenHash: hashValue(rawToken)
      };

      if (input.issuedLabel !== undefined) {
        data.issuedLabelHash = hashValue(input.issuedLabel);
      }

      const token = await this.prisma.voterToken.create({
        data
      });

      tokens.push({
        id: token.id,
        token: rawToken
      });
    }

    await this.audit(organizerId, "voter_tokens.issued", {
      campaignId,
      count: input.count
    });

    return { tokens };
  }

  async getTokenSummary(organizerId: string, campaignId: string): Promise<TokenSummaryDto> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const grouped = await this.prisma.voterToken.groupBy({
      by: ["status"],
      where: { campaignId },
      _count: { _all: true }
    });

    const summary: TokenSummaryDto = {
      active: 0,
      used: 0,
      revoked: 0,
      expired: 0
    };

    for (const item of grouped) {
      if (item.status === TokenStatus.ACTIVE) summary.active = item._count._all;
      if (item.status === TokenStatus.USED) summary.used = item._count._all;
      if (item.status === TokenStatus.REVOKED) summary.revoked = item._count._all;
      if (item.status === TokenStatus.EXPIRED) summary.expired = item._count._all;
    }

    return summary;
  }

  async revokeToken(organizerId: string, campaignId: string, tokenId: string): Promise<void> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const token = await this.prisma.voterToken.findFirst({
      where: {
        id: tokenId,
        campaignId
      }
    });

    if (!token) {
      throw notFound("Voter token was not found.");
    }

    if (token.status === TokenStatus.USED) {
      throw conflict("TOKEN_ALREADY_USED", "Used voter tokens cannot be revoked.");
    }

    await this.prisma.voterToken.update({
      where: { id: tokenId },
      data: {
        status: TokenStatus.REVOKED,
        revokedAt: new Date()
      }
    });

    await this.prisma.voteLedger.create({
      data: {
        campaignId,
        eventType: "token_revoked",
        payload: {
          tokenId
        }
      }
    });

    await this.audit(organizerId, "voter_token.revoked", {
      campaignId,
      tokenId
    });
  }

  async getPublicCampaign(campaignId: string): Promise<PublicCampaignDto> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        options: {
          where: { isActive: true },
          orderBy: { position: "asc" }
        }
      }
    });

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    return {
      id: campaign.id,
      electionId: campaign.electionId,
      title: campaign.title,
      description: campaign.description,
      status: campaign.status === CampaignStatus.ACTIVE ? "active" : campaign.status === CampaignStatus.CLOSED ? "closed" : "draft",
      startsAt: campaign.startsAt?.toISOString() ?? null,
      endsAt: campaign.endsAt?.toISOString() ?? null,
      options: campaign.options.map((option) => ({
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
    context: SubmitVoteContext
  ): Promise<{ statusCode: number; body: VoteResponseDto }> {
    const requestHash = hashValue(JSON.stringify({ campaignId, input }));

    return this.prisma.$transaction(async (tx) => {
      const existingKey = await tx.idempotencyKey.findUnique({
        where: {
          campaignId_key: {
            campaignId,
            key: input.idempotencyKey
          }
        }
      });

      if (existingKey) {
        if (existingKey.requestHash !== requestHash) {
          throw conflict(
            "IDEMPOTENCY_CONFLICT",
            "This idempotency key was already used with a different request."
          );
        }

        if (
          existingKey.status === IdempotencyStatus.COMPLETED &&
          existingKey.responseBody &&
          existingKey.statusCode
        ) {
          return {
            statusCode: existingKey.statusCode,
            body: existingKey.responseBody as VoteResponseDto
          };
        }

        throw conflict("IDEMPOTENCY_IN_PROGRESS", "This vote request is already processing.");
      }

      await tx.idempotencyKey.create({
        data: {
          campaignId,
          key: input.idempotencyKey,
          requestHash,
          status: IdempotencyStatus.PROCESSING,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
        }
      });

      try {
        const result = await this.processVote(tx, campaignId, input, context);

        await tx.idempotencyKey.update({
          where: {
            campaignId_key: {
              campaignId,
              key: input.idempotencyKey
            }
          },
          data: {
            status: IdempotencyStatus.COMPLETED,
            statusCode: result.statusCode,
            responseBody: result.body as unknown as Prisma.InputJsonObject
          }
        });

        return result;
      } catch (error) {
        await tx.idempotencyKey.update({
          where: {
            campaignId_key: {
              campaignId,
              key: input.idempotencyKey
            }
          },
          data: {
            status: IdempotencyStatus.FAILED
          }
        });

        throw error;
      }
    });
  }

  async verifyReceipt(campaignId: string, receipt: string): Promise<ReceiptStatusDto> {
    const vote = await this.prisma.vote.findFirst({
      where: {
        campaignId,
        receiptHash: hashValue(receipt)
      }
    });

    if (!vote) {
      throw notFound("Receipt was not found.");
    }

    return {
      status: "recorded",
      voteStatus: voteStatusToApi[vote.status],
      recordedAt: vote.createdAt.toISOString()
    };
  }

  private async processVote(
    tx: Prisma.TransactionClient,
    campaignId: string,
    input: SubmitVoteInput,
    context: SubmitVoteContext
  ): Promise<{ statusCode: number; body: VoteResponseDto }> {
    const campaign = await tx.campaign.findUnique({
      where: { id: campaignId },
      include: {
        election: true
      }
    });

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    const now = new Date();
    const ipHash = context.ip ? hashValue(context.ip) : undefined;
    const userAgentHash = context.userAgent ? hashValue(context.userAgent) : undefined;
    const deviceHash = input.deviceId ? hashValue(input.deviceId) : undefined;

    this.validateCampaignWindow(campaign, now);

    const option = await tx.campaignOption.findFirst({
      where: {
        id: input.optionId,
        campaignId,
        isActive: true
      }
    });

    if (!option) {
      await this.recordAttempt(tx, {
        campaignId,
        optionId: input.optionId,
        outcome: AttemptOutcome.INVALID,
        reason: "invalid_option",
        ipHash,
        deviceHash,
        userAgentHash
      });
      throw badRequest("The selected option is not valid for this campaign.");
    }

    const normalizedEmail = normalizeEmail(input.identity.email);
    const emailHash = hashValue(normalizedEmail);
    const provider = providerToPrisma[input.identity.provider];
    const identityCreateData: Prisma.VoterIdentityUncheckedCreateInput = {
      campaignId,
      provider,
      providerSubjectHash: emailHash,
      emailHash,
      trustLevel: "MEDIUM"
    };

    if (deviceHash !== undefined) identityCreateData.deviceHash = deviceHash;
    if (ipHash !== undefined) identityCreateData.firstIpHash = ipHash;
    if (userAgentHash !== undefined) identityCreateData.userAgentHash = userAgentHash;

    const identity = await tx.voterIdentity.upsert({
      where: {
        campaignId_provider_providerSubjectHash: {
          campaignId,
          provider,
          providerSubjectHash: emailHash
        }
      },
      create: identityCreateData,
      update: {}
    });

    const token = input.inviteToken
      ? await this.claimInviteToken(tx, campaignId, input.inviteToken)
      : null;
    const tokenHash = input.inviteToken ? hashValue(input.inviteToken) : "no_invite_token";
    const voterKeyHash = hashValue(`${campaignId}:${identity.id}:${tokenHash}`);

    const duplicateVote = await tx.vote.findUnique({
      where: {
        campaignId_voterKeyHash: {
          campaignId,
          voterKeyHash
        }
      }
    });

    if (duplicateVote) {
      await this.recordAttempt(tx, {
        campaignId,
        optionId: input.optionId,
        voterKeyHash,
        outcome: AttemptOutcome.DUPLICATE,
        reason: "same_identity_or_token_already_voted",
        ipHash,
        deviceHash,
        userAgentHash
      });
      throw conflict("ALREADY_VOTED", "A vote has already been submitted for this campaign.");
    }

    const risk = await this.calculateRisk(tx, campaignId, {
      identityId: identity.id,
      ipHash,
      deviceHash,
      userAgentHash,
      inviteTokenProvided: Boolean(input.inviteToken)
    });

    if (risk.score >= 80) {
      await this.recordAttempt(tx, {
        campaignId,
        optionId: input.optionId,
        voterKeyHash,
        outcome: AttemptOutcome.BLOCKED,
        reason: risk.reasons.join(","),
        riskScore: risk.score,
        ipHash,
        deviceHash,
        userAgentHash
      });
      await tx.voteLedger.create({
        data: {
          campaignId,
          eventType: "vote_blocked",
          payload: {
            reasons: risk.reasons,
            riskScore: risk.score
          }
        }
      });
      throw new ApiError(
        403,
        "VOTE_BLOCKED",
        "This vote could not be accepted because it triggered integrity checks."
      );
    }

    const voteStatus = risk.score >= 40 ? "UNDER_REVIEW" : "COUNTED";
    const attemptOutcome =
      voteStatus === "UNDER_REVIEW" ? AttemptOutcome.UNDER_REVIEW : AttemptOutcome.COUNTED;
    const receipt = createOpaqueToken("rcpt");
    const voteData: Prisma.VoteUncheckedCreateInput = {
      campaignId,
      optionId: input.optionId,
      identityId: identity.id,
      voterKeyHash,
      receiptHash: hashValue(receipt),
      status: voteStatus,
      confidenceLevel: risk.confidence,
      riskScore: risk.score
    };

    if (token?.id !== undefined) voteData.voterTokenId = token.id;
    if (risk.reasons.length > 0) voteData.reviewReason = risk.reasons.join(",");
    if (ipHash !== undefined) voteData.ipHash = ipHash;
    if (deviceHash !== undefined) voteData.deviceHash = deviceHash;
    if (userAgentHash !== undefined) voteData.userAgentHash = userAgentHash;

    const vote = await tx.vote.create({
      data: voteData
    });

    await this.recordAttempt(tx, {
      campaignId,
      optionId: input.optionId,
      voterKeyHash,
      outcome: attemptOutcome,
      reason: risk.reasons.length > 0 ? risk.reasons.join(",") : undefined,
      riskScore: risk.score,
      ipHash,
      deviceHash,
      userAgentHash
    });

    await tx.voteLedger.create({
      data: {
        voteId: vote.id,
        campaignId,
        eventType: voteStatus === "UNDER_REVIEW" ? "vote_placed_under_review" : "vote_counted",
        payload: {
          confidenceLevel: trustLevelToApi[vote.confidenceLevel],
          riskScore: vote.riskScore,
          reasons: risk.reasons
        }
      }
    });

    return {
      statusCode: voteStatus === "UNDER_REVIEW" ? 202 : 201,
      body: {
        voteId: vote.id,
        receipt,
        status: voteStatusToApi[vote.status] as VoteResponseDto["status"],
        confidenceLevel: trustLevelToApi[vote.confidenceLevel],
        message:
          voteStatus === "UNDER_REVIEW"
            ? "Your vote requires review before it can be counted."
            : "Your vote was recorded."
      }
    };
  }

  private validateCampaignWindow(
    campaign: {
      status: CampaignStatus;
      startsAt: Date | null;
      endsAt: Date | null;
      election: {
        status: ElectionStatus;
        startsAt: Date | null;
        endsAt: Date | null;
      };
    },
    now: Date
  ): void {
    if (campaign.election.status !== ElectionStatus.ACTIVE || campaign.status !== CampaignStatus.ACTIVE) {
      throw new ApiError(403, "CAMPAIGN_NOT_ACTIVE", "This campaign is not currently accepting votes.");
    }

    const startsAt = campaign.startsAt ?? campaign.election.startsAt;
    const endsAt = campaign.endsAt ?? campaign.election.endsAt;

    if (startsAt && startsAt > now) {
      throw new ApiError(403, "CAMPAIGN_NOT_STARTED", "Voting for this campaign has not started.");
    }

    if (endsAt && endsAt <= now) {
      throw new ApiError(403, "CAMPAIGN_EXPIRED", "Voting for this campaign has ended.");
    }
  }

  private async claimInviteToken(
    tx: Prisma.TransactionClient,
    campaignId: string,
    rawToken: string
  ) {
    const token = await tx.voterToken.findUnique({
      where: {
        campaignId_tokenHash: {
          campaignId,
          tokenHash: hashValue(rawToken)
        }
      }
    });

    if (!token) {
      throw new ApiError(403, "INVALID_INVITE_TOKEN", "The invite token is invalid.");
    }

    if (token.status !== TokenStatus.ACTIVE) {
      throw conflict("INVITE_TOKEN_ALREADY_USED", "This invite token has already been used.");
    }

    return tx.voterToken.update({
      where: { id: token.id },
      data: {
        status: TokenStatus.USED,
        usedAt: new Date()
      }
    });
  }

  private async calculateRisk(
    tx: Prisma.TransactionClient,
    campaignId: string,
    signals: {
      identityId: string;
      ipHash?: string | undefined;
      deviceHash?: string | undefined;
      userAgentHash?: string | undefined;
      inviteTokenProvided: boolean;
    }
  ): Promise<{ score: number; confidence: TrustLevel; reasons: string[] }> {
    let score = 0;
    const reasons: string[] = [];

    const existingIdentityVotes = await tx.vote.count({
      where: {
        campaignId,
        identityId: signals.identityId,
        status: {
          in: ["COUNTED", "DELAYED", "UNDER_REVIEW"]
        }
      }
    });

    if (existingIdentityVotes > 0) {
      score += 80;
      reasons.push("identity_already_voted");
    }

    if (signals.deviceHash) {
      const deviceVotes = await tx.vote.count({
        where: {
          campaignId,
          deviceHash: signals.deviceHash,
          status: {
            in: ["COUNTED", "DELAYED", "UNDER_REVIEW"]
          }
        }
      });

      if (deviceVotes >= 3) {
        score += 30;
        reasons.push("many_votes_from_same_device");
      }
    }

    if (signals.ipHash) {
      const ipVotes = await tx.vote.count({
        where: {
          campaignId,
          ipHash: signals.ipHash,
          status: {
            in: ["COUNTED", "DELAYED", "UNDER_REVIEW"]
          }
        }
      });

      if (ipVotes >= 20) {
        score += 30;
        reasons.push("many_votes_from_same_ip");
      }
    }

    if (signals.userAgentHash === undefined) {
      score += 20;
      reasons.push("missing_user_agent");
    }

    if (!signals.inviteTokenProvided) {
      score += 10;
      reasons.push("no_invite_token");
    }

    const confidence: TrustLevel = score >= 40 ? "LOW" : signals.inviteTokenProvided ? "HIGH" : "MEDIUM";

    return {
      score,
      confidence,
      reasons
    };
  }

  private async recordAttempt(
    tx: Prisma.TransactionClient,
    input: {
      campaignId?: string | undefined;
      optionId?: string | undefined;
      voterKeyHash?: string | undefined;
      outcome: AttemptOutcome;
      reason?: string | undefined;
      riskScore?: number | undefined;
      ipHash?: string | undefined;
      deviceHash?: string | undefined;
      userAgentHash?: string | undefined;
    }
  ): Promise<void> {
    const data: Prisma.VoteAttemptUncheckedCreateInput = {
      outcome: input.outcome,
      riskScore: input.riskScore ?? 0
    };

    if (input.campaignId !== undefined) data.campaignId = input.campaignId;
    if (input.optionId !== undefined) data.optionId = input.optionId;
    if (input.voterKeyHash !== undefined) data.voterKeyHash = input.voterKeyHash;
    if (input.reason !== undefined) data.reason = input.reason;
    if (input.ipHash !== undefined) data.ipHash = input.ipHash;
    if (input.deviceHash !== undefined) data.deviceHash = input.deviceHash;
    if (input.userAgentHash !== undefined) data.userAgentHash = input.userAgentHash;

    await tx.voteAttempt.create({ data });
  }

  private async findOwnedCampaign(organizerId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        election: {
          select: {
            organizerId: true
          }
        }
      }
    });

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    if (campaign.election.organizerId !== organizerId) {
      throw forbidden("You do not have access to this campaign.");
    }

    return campaign;
  }

  private async audit(
    organizerId: string,
    action: string,
    metadata: Prisma.InputJsonObject
  ): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      actorUserId: organizerId,
      action,
      metadata
    };

    if (typeof metadata.campaignId === "string") data.campaignId = metadata.campaignId;

    await this.prisma.auditLog.create({ data });
  }
}
