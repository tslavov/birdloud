import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient, TrustLevel, VoteStatus } from "@prisma/client";
import {
  AttemptOutcome,
  CampaignStatus,
  EmailVerificationStatus,
  ElectionStatus,
  IdentityProvider,
  IdempotencyStatus,
  TokenStatus
} from "@prisma/client";
import { env } from "../config/env.js";
import { ApiError, badRequest, conflict, forbidden, notFound } from "../http/errors.js";
import { createOpaqueToken, hashValue, normalizeEmail } from "../lib/crypto.js";
import type {
  AbuseSignalKeyInput,
  AbuseSignalSnapshot,
  AbuseSignalStore
} from "./abuse-signals.js";
import {
  buildCampaignStats,
  buildIntegritySignals,
  buildResultsCsv,
  calculateIntegrityScore,
  type CampaignStats
} from "./voting-reporting.js";
import type { TurnstileVerifier } from "./turnstile.js";
import type { VoterEmailSender } from "./voter-email.js";

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
  proof: string;
};

export type EmailVerificationRequestedDto = {
  status: "verification_sent";
  expiresInSeconds: number;
};

export type EmailVerifiedDto = {
  status: "verified";
  identityProof: string;
  expiresAt: string;
};

export type SubmitVoteInput = {
  optionId: string;
  idempotencyKey: string;
  identity: VoteIdentityInput;
  botProtectionToken: string;
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

export type ReviewVoteDto = {
  id: string;
  campaignId: string;
  optionId: string;
  status: "under_review";
  confidenceLevel: "high" | "medium" | "low";
  riskScore: number;
  reviewReason: string | null;
  createdAt: string;
};

export type ReviewResolutionDto = Omit<ReviewVoteDto, "status"> & {
  status: "counted" | "rejected";
  reviewedAt: string;
};

export type CampaignResultsDto = {
  campaignId: string;
  status: "draft" | "active" | "closed";
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
  integrityScore: number;
  options: CampaignStats["options"];
};

export type CampaignIntegrityDto = {
  campaignId: string;
  integrityScore: number;
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
  signals: Array<{
    code: string;
    label: string;
    value: number;
    severity: "info" | "warning" | "critical";
  }>;
};

export type CampaignExportFormat = "json" | "csv";

export type CampaignExportDto = {
  format: CampaignExportFormat;
  filename: string;
  contentType: string;
  body: string;
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
  requestEmailVerification(
    campaignId: string,
    email: string
  ): Promise<EmailVerificationRequestedDto>;
  verifyEmail(campaignId: string, token: string): Promise<EmailVerifiedDto>;
  submitVote(
    campaignId: string,
    input: SubmitVoteInput,
    context: SubmitVoteContext
  ): Promise<{ statusCode: number; body: VoteResponseDto }>;
  verifyReceipt(campaignId: string, receipt: string): Promise<ReceiptStatusDto>;
  listReviewVotes(organizerId: string, campaignId: string): Promise<ReviewVoteDto[]>;
  approveReviewVote(organizerId: string, campaignId: string, voteId: string): Promise<ReviewResolutionDto>;
  rejectReviewVote(organizerId: string, campaignId: string, voteId: string): Promise<ReviewResolutionDto>;
  getCampaignResults(organizerId: string, campaignId: string): Promise<CampaignResultsDto>;
  getCampaignIntegrity(organizerId: string, campaignId: string): Promise<CampaignIntegrityDto>;
  exportCampaignReport(
    organizerId: string,
    campaignId: string,
    format: CampaignExportFormat
  ): Promise<CampaignExportDto>;
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

const recentIpSubmissionThreshold = 8;
const recentDeviceSubmissionThreshold = 4;
const recentFailureThreshold = 5;

export class PrismaVotingService implements VotingService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly emailSender: VoterEmailSender,
    private readonly turnstileVerifier: TurnstileVerifier,
    private readonly abuseSignalStore: AbuseSignalStore
  ) {}

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

  async requestEmailVerification(
    campaignId: string,
    email: string
  ): Promise<EmailVerificationRequestedDto> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { election: true }
    });

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    this.validateCampaignWindow(campaign, new Date());

    const normalizedEmail = normalizeEmail(email);
    const emailHash = hashValue(normalizedEmail);
    const token = createOpaqueToken("emv");
    const tokenHash = hashValue(token);
    const expiresInMinutes = env.VOTER_EMAIL_TOKEN_TTL_MINUTES;
    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const challenge = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationChallenge.updateMany({
        where: {
          campaignId,
          emailHash,
          status: EmailVerificationStatus.PENDING
        },
        data: {
          status: EmailVerificationStatus.SUPERSEDED
        }
      });

      const created = await tx.emailVerificationChallenge.create({
        data: {
          campaignId,
          emailHash,
          tokenHash,
          expiresAt
        }
      });

      await tx.identityVerificationEvent.create({
        data: {
          campaignId,
          provider: "email",
          eventType: "email_verification_requested",
          trustLevel: "MEDIUM",
          metadata: {
            challengeId: created.id,
            expiresAt: expiresAt.toISOString()
          }
        }
      });

      return created;
    });

    const verificationUrl = new URL(
      `/vote/${campaignId}/verify-email`,
      env.VOTER_VERIFY_BASE_URL
    );
    verificationUrl.searchParams.set("token", token);

    try {
      await this.emailSender.sendVerificationEmail({
        to: normalizedEmail,
        campaignTitle: campaign.title,
        verificationUrl: verificationUrl.toString(),
        expiresInMinutes
      });
    } catch {
      await this.prisma.$transaction([
        this.prisma.emailVerificationChallenge.update({
          where: { id: challenge.id },
          data: { status: EmailVerificationStatus.DELIVERY_FAILED }
        }),
        this.prisma.identityVerificationEvent.create({
          data: {
            campaignId,
            provider: "email",
            eventType: "email_verification_delivery_failed",
            trustLevel: "LOW",
            reason: "smtp_delivery_failed",
            metadata: {
              challengeId: challenge.id
            }
          }
        })
      ]);

      throw new ApiError(
        503,
        "EMAIL_DELIVERY_FAILED",
        "The verification email could not be sent. Please try again."
      );
    }

    return {
      status: "verification_sent",
      expiresInSeconds: expiresInMinutes * 60
    };
  }

  async verifyEmail(campaignId: string, token: string): Promise<EmailVerifiedDto> {
    const tokenHash = hashValue(token);
    const now = new Date();
    const proof = createOpaqueToken("emp");
    const proofHash = hashValue(proof);
    const proofExpiresAt = new Date(
      now.getTime() + env.VOTER_EMAIL_TOKEN_TTL_MINUTES * 60 * 1000
    );

    return this.prisma.$transaction(async (tx) => {
      const challenge = await tx.emailVerificationChallenge.findUnique({
        where: { tokenHash },
        include: {
          campaign: {
            include: { election: true }
          }
        }
      });

      if (!challenge || challenge.campaignId !== campaignId) {
        throw new ApiError(403, "INVALID_EMAIL_VERIFICATION", "The verification link is invalid.");
      }

      this.validateCampaignWindow(challenge.campaign, now);

      if (
        challenge.status !== EmailVerificationStatus.PENDING ||
        challenge.expiresAt <= now
      ) {
        throw new ApiError(
          403,
          "INVALID_EMAIL_VERIFICATION",
          "The verification link is invalid or expired."
        );
      }

      const identity = await tx.voterIdentity.upsert({
        where: {
          campaignId_provider_providerSubjectHash: {
            campaignId,
            provider: IdentityProvider.EMAIL,
            providerSubjectHash: challenge.emailHash
          }
        },
        create: {
          campaignId,
          provider: IdentityProvider.EMAIL,
          providerSubjectHash: challenge.emailHash,
          emailHash: challenge.emailHash,
          trustLevel: "MEDIUM"
        },
        update: {}
      });

      const claimed = await tx.emailVerificationChallenge.updateMany({
        where: {
          id: challenge.id,
          status: EmailVerificationStatus.PENDING,
          expiresAt: { gt: now }
        },
        data: {
          identityId: identity.id,
          proofHash,
          proofExpiresAt,
          status: EmailVerificationStatus.VERIFIED,
          verifiedAt: now
        }
      });

      if (claimed.count !== 1) {
        throw conflict(
          "EMAIL_VERIFICATION_ALREADY_USED",
          "This verification link has already been used."
        );
      }

      await tx.identityVerificationEvent.create({
        data: {
          campaignId,
          identityId: identity.id,
          provider: "email",
          eventType: "email_verified",
          trustLevel: "MEDIUM",
          metadata: {
            challengeId: challenge.id,
            proofExpiresAt: proofExpiresAt.toISOString()
          }
        }
      });

      return {
        status: "verified",
        identityProof: proof,
        expiresAt: proofExpiresAt.toISOString()
      };
    });
  }

  async submitVote(
    campaignId: string,
    input: SubmitVoteInput,
    context: SubmitVoteContext
  ): Promise<{ statusCode: number; body: VoteResponseDto }> {
    const requestHash = createVoteRequestHash(campaignId, input);
    const claim = await this.claimIdempotencyKey(campaignId, input.idempotencyKey, requestHash);

    if (claim.kind === "replay") {
      return claim.result;
    }

    const abuseSignalKeys: AbuseSignalKeyInput = { campaignId };
    if (context.ip) abuseSignalKeys.ipHash = hashValue(context.ip);
    if (input.deviceId) abuseSignalKeys.deviceHash = hashValue(input.deviceId);

    try {
      await this.validateVoteTargetBeforeBotProtection(
        campaignId,
        input.optionId,
        input.deviceId,
        context
      );

      const verification = await this.turnstileVerifier.verify({
        token: input.botProtectionToken,
        remoteIp: context.ip,
        idempotencyKey: randomUUID()
      });

      if (!verification.success) {
        await this.prisma.voteAttempt.create({
          data: {
            campaignId,
            optionId: input.optionId,
            outcome: AttemptOutcome.INVALID,
            reason: `${verification.kind === "unavailable" ? "turnstile_unavailable" : "turnstile_failed"}:${verification.errorCodes.join(",")}`,
            ipHash: context.ip ? hashValue(context.ip) : null,
            deviceHash: input.deviceId ? hashValue(input.deviceId) : null,
            userAgentHash: context.userAgent ? hashValue(context.userAgent) : null
          }
        });

        if (verification.kind === "unavailable") {
          throw new ApiError(
            503,
            "BOT_PROTECTION_UNAVAILABLE",
            "Bot protection is temporarily unavailable. Please try again."
          );
        }

        throw new ApiError(
          403,
          "BOT_PROTECTION_FAILED",
          "Bot protection verification failed. Please try again."
        );
      }

      const abuseSignals = await this.abuseSignalStore.observeVote(abuseSignalKeys);

      const result = await this.prisma.$transaction((tx) =>
        this.processVote(tx, campaignId, input, context, abuseSignals)
      );

      await this.prisma.idempotencyKey.update({
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
      await this.abuseSignalStore.recordFailure(abuseSignalKeys);
      await this.prisma.idempotencyKey.updateMany({
        where: {
          campaignId,
          key: input.idempotencyKey,
          status: IdempotencyStatus.PROCESSING
        },
        data: {
          status: IdempotencyStatus.FAILED
        }
      });

      throw error;
    }
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

  async listReviewVotes(organizerId: string, campaignId: string): Promise<ReviewVoteDto[]> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const votes = await this.prisma.vote.findMany({
      where: {
        campaignId,
        status: "UNDER_REVIEW"
      },
      orderBy: {
        createdAt: "asc"
      }
    });

    return votes.map(mapReviewVote);
  }

  async approveReviewVote(
    organizerId: string,
    campaignId: string,
    voteId: string
  ): Promise<ReviewResolutionDto> {
    return this.resolveReviewVote(organizerId, campaignId, voteId, "COUNTED", "vote_review_approved");
  }

  async rejectReviewVote(
    organizerId: string,
    campaignId: string,
    voteId: string
  ): Promise<ReviewResolutionDto> {
    return this.resolveReviewVote(organizerId, campaignId, voteId, "REJECTED", "vote_review_rejected");
  }

  async getCampaignResults(
    organizerId: string,
    campaignId: string
  ): Promise<CampaignResultsDto> {
    const campaign = await this.findOwnedCampaign(organizerId, campaignId);
    const stats = await this.getCampaignStats(campaignId);

    return {
      campaignId,
      status: mapCampaignStatus(campaign.status),
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
      integrityScore: calculateIntegrityScore(stats),
      options: stats.options
    };
  }

  async getCampaignIntegrity(
    organizerId: string,
    campaignId: string
  ): Promise<CampaignIntegrityDto> {
    await this.findOwnedCampaign(organizerId, campaignId);
    const stats = await this.getCampaignStats(campaignId);

    return {
      campaignId,
      integrityScore: calculateIntegrityScore(stats),
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
      signals: buildIntegritySignals(stats)
    };
  }

  async exportCampaignReport(
    organizerId: string,
    campaignId: string,
    format: CampaignExportFormat
  ): Promise<CampaignExportDto> {
    const [results, integrity] = await Promise.all([
      this.getCampaignResults(organizerId, campaignId),
      this.getCampaignIntegrity(organizerId, campaignId)
    ]);
    const generatedAt = new Date().toISOString();

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
      body: JSON.stringify(
        {
          generatedAt,
          results,
          integrity
        },
        null,
        2
      )
    };
  }

  private async processVote(
    tx: Prisma.TransactionClient,
    campaignId: string,
    input: SubmitVoteInput,
    context: SubmitVoteContext,
    abuseSignals: AbuseSignalSnapshot
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

    const identity = await this.consumeEmailProof(
      tx,
      campaignId,
      input.identity.proof,
      now
    );

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
      inviteTokenProvided: Boolean(input.inviteToken),
      abuseSignals
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

  private async claimIdempotencyKey(
    campaignId: string,
    key: string,
    requestHash: string
  ): Promise<
    | { kind: "claimed" }
    | { kind: "replay"; result: { statusCode: number; body: VoteResponseDto } }
  > {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          campaignId,
          key,
          requestHash,
          status: IdempotencyStatus.PROCESSING,
          expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000)
        }
      });
      return { kind: "claimed" };
    } catch (error) {
      if (isPrismaError(error, "P2003")) {
        throw notFound("Campaign was not found.");
      }

      if (!isPrismaError(error, "P2002")) {
        throw error;
      }
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        campaignId_key: {
          campaignId,
          key
        }
      }
    });

    if (!existing) {
      throw conflict("IDEMPOTENCY_IN_PROGRESS", "This vote request is already processing.");
    }

    if (existing.requestHash !== requestHash) {
      throw conflict(
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was already used with a different request."
      );
    }

    if (
      existing.status === IdempotencyStatus.COMPLETED &&
      existing.responseBody &&
      existing.statusCode
    ) {
      return {
        kind: "replay",
        result: {
          statusCode: existing.statusCode,
          body: existing.responseBody as VoteResponseDto
        }
      };
    }

    if (existing.status === IdempotencyStatus.FAILED) {
      const reclaimed = await this.prisma.idempotencyKey.updateMany({
        where: {
          id: existing.id,
          status: IdempotencyStatus.FAILED
        },
        data: {
          status: IdempotencyStatus.PROCESSING,
          statusCode: null
        }
      });

      if (reclaimed.count === 1) {
        return { kind: "claimed" };
      }
    }

    throw conflict("IDEMPOTENCY_IN_PROGRESS", "This vote request is already processing.");
  }

  private async validateVoteTargetBeforeBotProtection(
    campaignId: string,
    optionId: string,
    deviceId: string | undefined,
    context: SubmitVoteContext
  ): Promise<void> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { election: true }
    });

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    this.validateCampaignWindow(campaign, new Date());

    const option = await this.prisma.campaignOption.findFirst({
      where: {
        id: optionId,
        campaignId,
        isActive: true
      },
      select: { id: true }
    });

    if (!option) {
      await this.prisma.voteAttempt.create({
        data: {
          campaignId,
          optionId,
          outcome: AttemptOutcome.INVALID,
          reason: "invalid_option",
          ipHash: context.ip ? hashValue(context.ip) : null,
          deviceHash: deviceId ? hashValue(deviceId) : null,
          userAgentHash: context.userAgent ? hashValue(context.userAgent) : null
        }
      });
      throw badRequest("The selected option is not valid for this campaign.");
    }
  }

  private async consumeEmailProof(
    tx: Prisma.TransactionClient,
    campaignId: string,
    proof: string,
    now: Date
  ) {
    const proofHash = hashValue(proof);
    const challenge = await tx.emailVerificationChallenge.findUnique({
      where: { proofHash },
      include: { identity: true }
    });

    if (
      !challenge ||
      challenge.campaignId !== campaignId ||
      challenge.status !== EmailVerificationStatus.VERIFIED ||
      !challenge.identity ||
      !challenge.proofExpiresAt ||
      challenge.proofExpiresAt <= now
    ) {
      throw new ApiError(
        403,
        "EMAIL_VERIFICATION_REQUIRED",
        "A valid email verification proof is required to vote."
      );
    }

    const consumed = await tx.emailVerificationChallenge.updateMany({
      where: {
        id: challenge.id,
        status: EmailVerificationStatus.VERIFIED,
        proofExpiresAt: { gt: now }
      },
      data: {
        status: EmailVerificationStatus.CONSUMED,
        consumedAt: now
      }
    });

    if (consumed.count !== 1) {
      throw conflict("EMAIL_PROOF_ALREADY_USED", "This email verification proof was already used.");
    }

    await tx.identityVerificationEvent.create({
      data: {
        campaignId,
        identityId: challenge.identity.id,
        provider: "email",
        eventType: "email_verification_consumed",
        trustLevel: challenge.identity.trustLevel,
        metadata: {
          challengeId: challenge.id
        }
      }
    });

    return challenge.identity;
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
      abuseSignals: AbuseSignalSnapshot;
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

    if (!signals.abuseSignals.available) {
      reasons.push("temporary_abuse_signals_unavailable");
    }

    if (signals.abuseSignals.recentIpSubmissions >= recentIpSubmissionThreshold) {
      score += 15;
      reasons.push("abnormal_submission_speed");
    }

    if (signals.abuseSignals.recentDeviceSubmissions >= recentDeviceSubmissionThreshold) {
      score += 20;
      reasons.push("device_submission_burst");
    }

    if (
      Math.max(
        signals.abuseSignals.recentIpFailures,
        signals.abuseSignals.recentDeviceFailures
      ) >= recentFailureThreshold
    ) {
      score += 20;
      reasons.push("too_many_failed_attempts");
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

  private async resolveReviewVote(
    organizerId: string,
    campaignId: string,
    voteId: string,
    status: "COUNTED" | "REJECTED",
    eventType: string
  ): Promise<ReviewResolutionDto> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const existing = await this.prisma.vote.findFirst({
      where: {
        id: voteId,
        campaignId
      }
    });

    if (!existing) {
      throw notFound("Review vote was not found.");
    }

    if (existing.status !== "UNDER_REVIEW") {
      throw conflict("VOTE_NOT_UNDER_REVIEW", "Only under-review votes can be resolved.");
    }

    const vote = await this.prisma.vote.update({
      where: { id: voteId },
      data: {
        status,
        reviewedAt: new Date()
      }
    });

    await this.prisma.voteLedger.create({
      data: {
        voteId,
        campaignId,
        eventType,
        payload: {
          previousStatus: "under_review",
          newStatus: voteStatusToApi[vote.status]
        }
      }
    });

    await this.audit(organizerId, eventType, {
      campaignId,
      voteId
    });

    return {
      id: vote.id,
      campaignId: vote.campaignId,
      optionId: vote.optionId,
      status: voteStatusToApi[vote.status] as ReviewResolutionDto["status"],
      confidenceLevel: trustLevelToApi[vote.confidenceLevel],
      riskScore: vote.riskScore,
      reviewReason: vote.reviewReason,
      createdAt: vote.createdAt.toISOString(),
      reviewedAt: vote.reviewedAt?.toISOString() ?? new Date().toISOString()
    };
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

  private async getCampaignStats(campaignId: string) {
    const [options, votes, attempts] = await Promise.all([
      this.prisma.campaignOption.findMany({
        where: { campaignId },
        orderBy: { position: "asc" }
      }),
      this.prisma.vote.findMany({
        where: { campaignId },
        select: {
          optionId: true,
          status: true,
          confidenceLevel: true
        }
      }),
      this.prisma.voteAttempt.findMany({
        where: { campaignId },
        select: {
          outcome: true
        }
      })
    ]);

    return buildCampaignStats(
      options.map((option) => ({
        id: option.id,
        label: option.label
      })),
      votes,
      attempts
    );
  }
}

function mapCampaignStatus(status: CampaignStatus): CampaignResultsDto["status"] {
  if (status === "ACTIVE") return "active";
  if (status === "CLOSED") return "closed";
  return "draft";
}

function createVoteRequestHash(campaignId: string, input: SubmitVoteInput): string {
  return hashValue(
    JSON.stringify({
      campaignId,
      optionId: input.optionId,
      identity: input.identity,
      inviteToken: input.inviteToken,
      deviceId: input.deviceId
    })
  );
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function mapReviewVote(vote: {
  id: string;
  campaignId: string;
  optionId: string;
  status: VoteStatus;
  confidenceLevel: TrustLevel;
  riskScore: number;
  reviewReason: string | null;
  createdAt: Date;
}): ReviewVoteDto {
  return {
    id: vote.id,
    campaignId: vote.campaignId,
    optionId: vote.optionId,
    status: "under_review",
    confidenceLevel: trustLevelToApi[vote.confidenceLevel],
    riskScore: vote.riskScore,
    reviewReason: vote.reviewReason,
    createdAt: vote.createdAt.toISOString()
  };
}
