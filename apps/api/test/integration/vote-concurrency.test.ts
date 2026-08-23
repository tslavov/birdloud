import { randomUUID } from "node:crypto";
import {
  CampaignStatus,
  ElectionStatus,
  IdempotencyStatus,
  PrismaClient,
  UserRole
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashValue } from "../../src/lib/crypto.js";
import type {
  SendVoterVerificationEmailInput,
  VoterEmailSender
} from "../../src/services/voter-email.js";
import { PrismaVotingService, type SubmitVoteInput } from "../../src/services/voting.js";
import { availableAbuseSignalStore } from "../support/test-abuse-signal-store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const organizerEmail = "vote-concurrency@example.test";

class CapturingEmailSender implements VoterEmailSender {
  sent: SendVoterVerificationEmailInput[] = [];

  async sendVerificationEmail(input: SendVoterVerificationEmailInput): Promise<void> {
    this.sent.push(input);
  }
}

const passingTurnstile = {
  async verify() {
    return {
      success: true as const,
      hostname: "localhost",
      action: "vote-submit"
    };
  }
};

databaseDescribe("vote concurrency", () => {
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
    passingTurnstile,
    availableAbuseSignalStore
  );
  const organizerId = randomUUID();
  const campaignId = randomUUID();
  const optionId = randomUUID();

  beforeAll(async () => {
    await database.user.deleteMany({ where: { email: organizerEmail } });
    await database.user.create({
      data: {
        id: organizerId,
        email: organizerEmail,
        name: "Vote Concurrency Organizer",
        emailVerified: true,
        role: UserRole.ORGANIZER,
        elections: {
          create: {
            title: "Concurrency Election",
            status: ElectionStatus.ACTIVE,
            campaigns: {
              create: {
                id: campaignId,
                title: "Concurrency Campaign",
                status: CampaignStatus.ACTIVE,
                options: {
                  create: {
                    id: optionId,
                    label: "Concurrency Option",
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
    await database.user.deleteMany({ where: { email: organizerEmail } });
    await database.$disconnect();
  });

  async function verifiedProof(email: string): Promise<string> {
    await service.requestEmailVerification(campaignId, email);
    const message = [...emailSender.sent].reverse().find((candidate) => candidate.to === email);
    const token = new URL(message?.verificationUrl ?? "").searchParams.get("token");
    return (await service.verifyEmail(campaignId, token ?? "")).identityProof;
  }

  function voteInput(proof: string, extra: Partial<SubmitVoteInput> = {}): SubmitVoteInput {
    return {
      optionId,
      idempotencyKey: randomUUID(),
      botProtectionToken: "turnstile-test-token",
      identity: {
        provider: "email",
        proof
      },
      ...extra
    };
  }

  it("allows only one concurrent vote for two proofs of the same verified email", async () => {
    const firstProof = await verifiedProof("same-identity@example.test");
    const secondProof = await verifiedProof("same-identity@example.test");
    const beforeCount = await database.vote.count({ where: { campaignId } });

    const results = await Promise.allSettled([
      service.submitVote(campaignId, voteInput(firstProof), {
        ip: "203.0.113.40",
        userAgent: "BirdLoud concurrency test"
      }),
      service.submitVote(campaignId, voteInput(secondProof), {
        ip: "203.0.113.41",
        userAgent: "BirdLoud concurrency test"
      })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status).toBe("rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toMatchObject({ code: "ALREADY_VOTED" });
    }
    expect(await database.vote.count({ where: { campaignId } })).toBe(beforeCount + 1);
    expect(
      await database.voteAttempt.count({
        where: {
          campaignId,
          outcome: "DUPLICATE",
          reason: "same_identity_already_voted"
        }
      })
    ).toBeGreaterThanOrEqual(1);
  });

  it("allows only one concurrent claimant for an invite token", async () => {
    const issued = await service.issueTokens(organizerId, campaignId, { count: 1 });
    const token = issued.tokens[0]?.token;
    if (!token) {
      throw new Error("Expected an issued invite token.");
    }
    const firstProof = await verifiedProof("invite-one@example.test");
    const secondProof = await verifiedProof("invite-two@example.test");
    const beforeCount = await database.vote.count({ where: { campaignId } });

    const results = await Promise.allSettled([
      service.submitVote(campaignId, voteInput(firstProof, { inviteToken: token }), {
        ip: "203.0.113.42",
        userAgent: "BirdLoud invite concurrency test"
      }),
      service.submitVote(campaignId, voteInput(secondProof, { inviteToken: token }), {
        ip: "203.0.113.43",
        userAgent: "BirdLoud invite concurrency test"
      })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toMatchObject({ code: "INVITE_TOKEN_ALREADY_USED" });
    }
    expect(await database.vote.count({ where: { campaignId } })).toBe(beforeCount + 1);
    expect(
      await database.voteAttempt.count({
        where: { campaignId, reason: "invite_token_already_used" }
      })
    ).toBeGreaterThanOrEqual(1);
  });

  it("keeps one in-flight idempotency owner and replays its committed response", async () => {
    const proof = await verifiedProof("same-key@example.test");
    let releaseVerification: (() => void) | undefined;
    let markVerificationEntered: (() => void) | undefined;
    const verificationEntered = new Promise<void>((resolve) => {
      markVerificationEntered = resolve;
    });
    const verificationRelease = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    let verificationCalls = 0;
    const blockingService = new PrismaVotingService(
      database,
      emailSender,
      {
        async verify() {
          verificationCalls += 1;
          markVerificationEntered?.();
          await verificationRelease;
          return {
            success: true as const,
            hostname: "localhost",
            action: "vote-submit"
          };
        }
      },
      availableAbuseSignalStore
    );
    const input = voteInput(proof);
    const firstSubmission = blockingService.submitVote(campaignId, input, {
      ip: "203.0.113.44",
      userAgent: "BirdLoud idempotency concurrency test"
    });
    await verificationEntered;

    await expect(
      blockingService.submitVote(campaignId, input, {
        ip: "203.0.113.44",
        userAgent: "BirdLoud idempotency concurrency test"
      })
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_IN_PROGRESS" });

    releaseVerification?.();
    const firstResult = await firstSubmission;
    const replay = await blockingService.submitVote(campaignId, input, {
      ip: "203.0.113.44",
      userAgent: "BirdLoud idempotency concurrency test"
    });
    expect(replay).toEqual(firstResult);
    expect(verificationCalls).toBe(1);
    expect(
      await database.vote.count({
        where: { id: firstResult.body.voteId }
      })
    ).toBe(1);
  });

  it("atomically reclaims an abandoned processing idempotency key", async () => {
    const proof = await verifiedProof("stale-key@example.test");
    const input = voteInput(proof);
    const requestHash = hashValue(
      JSON.stringify({
        campaignId,
        optionId: input.optionId,
        identity: input.identity
      })
    );
    await database.idempotencyKey.create({
      data: {
        campaignId,
        key: input.idempotencyKey,
        requestHash,
        status: IdempotencyStatus.PROCESSING,
        lockedAt: new Date(Date.now() - 5 * 60 * 1000),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000)
      }
    });

    const result = await service.submitVote(campaignId, input, {
      ip: "203.0.113.45",
      userAgent: "BirdLoud stale idempotency test"
    });
    expect(result.statusCode).toBe(201);

    const key = await database.idempotencyKey.findUniqueOrThrow({
      where: {
        campaignId_key: {
          campaignId,
          key: input.idempotencyKey
        }
      }
    });
    expect(key.status).toBe("COMPLETED");
    expect(key.statusCode).toBe(201);
  });
});
