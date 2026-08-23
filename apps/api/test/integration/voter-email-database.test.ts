import { randomUUID } from "node:crypto";
import { CampaignStatus, ElectionStatus, PrismaClient, UserRole } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  SendVoterVerificationEmailInput,
  VoterEmailSender
} from "../../src/services/voter-email.js";
import { PrismaVotingService } from "../../src/services/voting.js";
import { availableAbuseSignalStore } from "../support/test-abuse-signal-store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const organizerEmail = "voter-email-integration@example.test";
const voterEmail = "verified-voter@example.test";

class CapturingEmailSender implements VoterEmailSender {
  sent: SendVoterVerificationEmailInput[] = [];

  async sendVerificationEmail(input: SendVoterVerificationEmailInput): Promise<void> {
    this.sent.push(input);
  }
}

databaseDescribe("database-backed voter email verification", () => {
  const database = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl ?? "postgresql://birdloud:birdloud@localhost:5433/birdloud_test"
      }
    }
  });
  const emailSender = new CapturingEmailSender();
  const service = new PrismaVotingService(
    database,
    emailSender,
    {
      async verify() {
        return {
          success: true as const,
          hostname: "localhost",
          action: "vote-submit"
        };
      }
    },
    availableAbuseSignalStore
  );
  const organizerId = randomUUID();
  const electionId = randomUUID();
  const campaignId = randomUUID();
  const optionId = randomUUID();

  beforeAll(async () => {
    await database.user.deleteMany({
      where: { email: organizerEmail }
    });

    await database.user.create({
      data: {
        id: organizerId,
        email: organizerEmail,
        name: "Voter Email Integration Organizer",
        emailVerified: true,
        role: UserRole.ORGANIZER,
        elections: {
          create: {
            id: electionId,
            title: "Verified Email Integration Election",
            status: ElectionStatus.ACTIVE,
            campaigns: {
              create: {
                id: campaignId,
                title: "Verified Email Integration Campaign",
                status: CampaignStatus.ACTIVE,
                options: {
                  create: {
                    id: optionId,
                    label: "Integration Option",
                    position: 0
                  }
                }
              }
            }
          }
        }
      }
    });
  });

  afterAll(async () => {
    await database.user.deleteMany({
      where: { email: organizerEmail }
    });
    await database.$disconnect();
  });

  it("stores only hashes, exchanges a one-time link, and consumes the proof with the vote", async () => {
    const requested = await service.requestEmailVerification(campaignId, voterEmail);
    expect(requested).toEqual({
      status: "verification_sent",
      expiresInSeconds: 900
    });
    expect(emailSender.sent).toHaveLength(1);
    expect(emailSender.sent[0]).toMatchObject({
      to: voterEmail,
      campaignTitle: "Verified Email Integration Campaign"
    });

    const challengeBeforeVerification = await database.emailVerificationChallenge.findFirstOrThrow({
      where: { campaignId }
    });
    expect(challengeBeforeVerification.emailHash).toMatch(/^[a-f0-9]{64}$/);
    expect(challengeBeforeVerification.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(challengeBeforeVerification)).not.toContain(voterEmail);

    const verificationUrl = new URL(emailSender.sent[0]?.verificationUrl ?? "");
    const token = verificationUrl.searchParams.get("token");
    expect(token).toMatch(/^emv_/);

    const verified = await service.verifyEmail(campaignId, token ?? "");
    expect(verified.status).toBe("verified");
    expect(verified.identityProof).toMatch(/^emp_/);

    await expect(service.verifyEmail(campaignId, token ?? "")).rejects.toMatchObject({
      code: "INVALID_EMAIL_VERIFICATION"
    });

    const voteInput = {
      optionId,
      idempotencyKey: randomUUID(),
      botProtectionToken: "turnstile-test-token",
      identity: {
        provider: "email" as const,
        proof: verified.identityProof
      }
    };
    const vote = await service.submitVote(campaignId, voteInput, {
      ip: "203.0.113.10",
      userAgent: "BirdLoud integration test"
    });
    expect(vote.statusCode).toBe(201);
    expect(vote.body.status).toBe("counted");

    const replay = await service.submitVote(campaignId, voteInput, {
      ip: "203.0.113.10",
      userAgent: "BirdLoud integration test"
    });
    expect(replay).toEqual(vote);

    const consumedChallenge = await database.emailVerificationChallenge.findFirstOrThrow({
      where: { campaignId }
    });
    expect(consumedChallenge.status).toBe("CONSUMED");
    expect(consumedChallenge.consumedAt).toBeInstanceOf(Date);
    expect(consumedChallenge.proofHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(consumedChallenge)).not.toContain(verified.identityProof);

    await expect(
      service.submitVote(
        campaignId,
        {
          ...voteInput,
          idempotencyKey: randomUUID()
        },
        {
          ip: "203.0.113.10",
          userAgent: "BirdLoud integration test"
        }
      )
    ).rejects.toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED"
    });

    const events = await database.identityVerificationEvent.findMany({
      where: { campaignId },
      orderBy: { createdAt: "asc" }
    });
    expect(events.map((event) => event.eventType)).toEqual([
      "email_verification_requested",
      "email_verified",
      "email_verification_consumed"
    ]);
    expect(JSON.stringify(events)).not.toContain(voterEmail);
  });

  it("records a failed Turnstile attempt and retries the same vote key with a fresh token", async () => {
    const retryEmail = "turnstile-retry@example.test";
    await service.requestEmailVerification(campaignId, retryEmail);
    const verificationUrl = new URL(emailSender.sent.at(-1)?.verificationUrl ?? "");
    const verification = await service.verifyEmail(
      campaignId,
      verificationUrl.searchParams.get("token") ?? ""
    );

    let verificationCalls = 0;
    const retryService = new PrismaVotingService(
      database,
      emailSender,
      {
        async verify() {
          verificationCalls += 1;

          if (verificationCalls === 1) {
            return {
              success: false as const,
              kind: "invalid" as const,
              errorCodes: ["invalid-input-response"]
            };
          }

          return {
            success: true as const,
            hostname: "localhost",
            action: "vote-submit"
          };
        }
      },
      availableAbuseSignalStore
    );
    const idempotencyKey = randomUUID();
    const voteInput = {
      optionId,
      idempotencyKey,
      botProtectionToken: "failed-turnstile-token",
      identity: {
        provider: "email" as const,
        proof: verification.identityProof
      }
    };

    await expect(
      retryService.submitVote(campaignId, voteInput, {
        ip: "203.0.113.21",
        userAgent: "BirdLoud Turnstile retry test"
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "BOT_PROTECTION_FAILED"
    });

    const failedAttempt = await database.voteAttempt.findFirstOrThrow({
      where: {
        campaignId,
        reason: "turnstile_failed:invalid-input-response"
      }
    });
    expect(failedAttempt.outcome).toBe("INVALID");

    const retry = await retryService.submitVote(
      campaignId,
      {
        ...voteInput,
        botProtectionToken: "fresh-turnstile-token"
      },
      {
        ip: "203.0.113.21",
        userAgent: "BirdLoud Turnstile retry test"
      }
    );
    expect(retry.statusCode).toBe(201);
    expect(verificationCalls).toBe(2);

    const idempotency = await database.idempotencyKey.findUniqueOrThrow({
      where: {
        campaignId_key: {
          campaignId,
          key: idempotencyKey
        }
      }
    });
    expect(idempotency.status).toBe("COMPLETED");
  });

  it("maps Redis burst and failure counters to an explainable review decision", async () => {
    const riskEmail = "redis-risk@example.test";
    await service.requestEmailVerification(campaignId, riskEmail);
    const verificationUrl = new URL(emailSender.sent.at(-1)?.verificationUrl ?? "");
    const verification = await service.verifyEmail(
      campaignId,
      verificationUrl.searchParams.get("token") ?? ""
    );
    const riskService = new PrismaVotingService(
      database,
      emailSender,
      {
        async verify() {
          return {
            success: true as const,
            hostname: "localhost",
            action: "vote-submit"
          };
        }
      },
      {
        async observeVote() {
          return {
            available: true,
            recentIpSubmissions: 8,
            recentDeviceSubmissions: 1,
            recentIpFailures: 5,
            recentDeviceFailures: 0
          };
        },
        async recordFailure() {}
      }
    );

    const result = await riskService.submitVote(
      campaignId,
      {
        optionId,
        idempotencyKey: randomUUID(),
        botProtectionToken: "turnstile-test-token",
        deviceId: "redis-risk-device",
        identity: {
          provider: "email",
          proof: verification.identityProof
        }
      },
      {
        ip: "203.0.113.30",
        userAgent: "BirdLoud Redis risk test"
      }
    );

    expect(result.statusCode).toBe(202);
    expect(result.body).toMatchObject({
      status: "under_review",
      confidenceLevel: "low"
    });

    const vote = await database.vote.findUniqueOrThrow({
      where: { id: result.body.voteId }
    });
    expect(vote.riskScore).toBe(45);
    expect(vote.reviewReason).toContain("abnormal_submission_speed");
    expect(vote.reviewReason).toContain("too_many_failed_attempts");
  });
});
