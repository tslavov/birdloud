import { randomUUID } from "node:crypto";
import {
  CampaignStatus,
  ElectionStatus,
  PrismaClient,
  UserRole
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AbuseSignalStore } from "../../src/services/abuse-signals.js";
import {
  VOTE_LEDGER_EVENT,
  VOTE_LEDGER_EVENT_VERSION
} from "../../src/services/vote-ledger-events.js";
import type {
  SendVoterVerificationEmailInput,
  VoterEmailSender
} from "../../src/services/voter-email.js";
import { PrismaVotingService, type SubmitVoteInput } from "../../src/services/voting.js";
import { availableAbuseSignalStore } from "../support/test-abuse-signal-store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
const databaseDescribe = databaseUrl ? describe : describe.skip;
const organizerEmail = "vote-ledger@example.test";

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

const blockingAbuseSignals: AbuseSignalStore = {
  async observeVote() {
    return {
      available: true,
      recentIpSubmissions: 1,
      recentDeviceSubmissions: 4,
      recentIpFailures: 0,
      recentDeviceFailures: 0
    };
  },
  async recordFailure() {}
};

databaseDescribe("stable vote ledger and outcome lifecycle", () => {
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
        name: "Vote Ledger Organizer",
        emailVerified: true,
        role: UserRole.ORGANIZER,
        elections: {
          create: {
            title: "Ledger Election",
            status: ElectionStatus.ACTIVE,
            campaigns: {
              create: {
                id: campaignId,
                title: "Ledger Campaign",
                status: CampaignStatus.ACTIVE,
                options: {
                  create: {
                    id: optionId,
                    label: "Ledger Option",
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

  function voteInput(proof: string, deviceId: string): SubmitVoteInput {
    return {
      optionId,
      idempotencyKey: randomUUID(),
      botProtectionToken: "turnstile-test-token",
      deviceId,
      identity: {
        provider: "email",
        proof
      }
    };
  }

  async function submitForEmail(email: string, deviceId: string) {
    const proof = await verifiedProof(email);
    return service.submitVote(campaignId, voteInput(proof, deviceId), {
      ip: "203.0.113.70",
      userAgent: "BirdLoud ledger test"
    });
  }

  it("uses stable product events for counted, review, rejected, duplicate, and blocked outcomes", async () => {
    const deviceId = `ledger-device-${randomUUID()}`;
    const first = await submitForEmail("ledger-counted-1@example.test", deviceId);
    const second = await submitForEmail("ledger-counted-2@example.test", deviceId);
    const third = await submitForEmail("ledger-counted-3@example.test", deviceId);

    expect([first.body.status, second.body.status, third.body.status]).toEqual([
      "counted",
      "counted",
      "counted"
    ]);

    const review = await submitForEmail("ledger-review@example.test", deviceId);
    expect(review).toMatchObject({
      statusCode: 202,
      body: {
        status: "under_review",
        confidenceLevel: "low"
      }
    });

    const reviewEvents = await database.voteLedger.findMany({
      where: { voteId: review.body.voteId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    expect(reviewEvents).toHaveLength(1);
    expect(reviewEvents[0]).toMatchObject({
      eventType: VOTE_LEDGER_EVENT.VOTE_PLACED_UNDER_REVIEW,
      payload: {
        eventVersion: VOTE_LEDGER_EVENT_VERSION,
        status: "under_review",
        riskScore: 40
      }
    });

    const rejected = await service.rejectReviewVote(
      organizerId,
      campaignId,
      review.body.voteId
    );
    expect(rejected.status).toBe("rejected");

    const resolvedEvents = await database.voteLedger.findMany({
      where: { voteId: review.body.voteId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    expect(resolvedEvents.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        VOTE_LEDGER_EVENT.VOTE_PLACED_UNDER_REVIEW,
        VOTE_LEDGER_EVENT.VOTE_REVIEWED,
        VOTE_LEDGER_EVENT.VOTE_REJECTED
      ])
    );
    expect(resolvedEvents).toHaveLength(3);
    expect(
      resolvedEvents.find((event) => event.eventType === VOTE_LEDGER_EVENT.VOTE_REVIEWED)
    ).toMatchObject({
      payload: {
        eventVersion: VOTE_LEDGER_EVENT_VERSION,
        decision: "rejected",
        previousStatus: "under_review",
        newStatus: "rejected"
      }
    });

    const duplicateProof = await verifiedProof("ledger-counted-1@example.test");
    await expect(
      service.submitVote(campaignId, voteInput(duplicateProof, `${deviceId}-duplicate`), {
        ip: "203.0.113.71",
        userAgent: "BirdLoud ledger duplicate test"
      })
    ).rejects.toMatchObject({ code: "ALREADY_VOTED" });

    const duplicateEvent = await database.voteLedger.findFirst({
      where: {
        campaignId,
        eventType: VOTE_LEDGER_EVENT.DUPLICATE_ATTEMPT_DETECTED
      },
      orderBy: { createdAt: "desc" }
    });
    expect(duplicateEvent).toMatchObject({
      payload: {
        eventVersion: VOTE_LEDGER_EVENT_VERSION,
        reason: "same_identity_already_voted"
      }
    });

    const blockedProof = await verifiedProof("ledger-blocked@example.test");
    const blockingService = new PrismaVotingService(
      database,
      emailSender,
      passingTurnstile,
      blockingAbuseSignals
    );
    await expect(
      blockingService.submitVote(campaignId, voteInput(blockedProof, deviceId), {
        ip: "203.0.113.72"
      })
    ).rejects.toMatchObject({ code: "VOTE_BLOCKED" });

    const blockedEvent = await database.voteLedger.findFirst({
      where: {
        campaignId,
        eventType: VOTE_LEDGER_EVENT.VOTE_BLOCKED
      },
      orderBy: { createdAt: "desc" }
    });
    expect(blockedEvent).toMatchObject({
      voteId: null,
      payload: {
        eventVersion: VOTE_LEDGER_EVENT_VERSION,
        status: "blocked",
        riskScore: 80
      }
    });
    expect(blockedEvent?.payload).not.toHaveProperty("optionId");

    const legacyEventCount = await database.voteLedger.count({
      where: {
        campaignId,
        eventType: {
          in: [
            "vote_counted",
            "vote_delayed",
            "vote_placed_under_review",
            "vote_review_approved",
            "vote_review_rejected",
            "vote_blocked",
            "token_revoked"
          ]
        }
      }
    });
    expect(legacyEventCount).toBe(0);
  });

  it("resolves a review once when organizer decisions race", async () => {
    const deviceId = `decision-device-${randomUUID()}`;
    await submitForEmail("decision-counted-1@example.test", deviceId);
    await submitForEmail("decision-counted-2@example.test", deviceId);
    await submitForEmail("decision-counted-3@example.test", deviceId);
    const review = await submitForEmail("decision-review@example.test", deviceId);
    expect(review.body.status).toBe("under_review");

    const decisions = await Promise.allSettled([
      service.approveReviewVote(organizerId, campaignId, review.body.voteId),
      service.rejectReviewVote(organizerId, campaignId, review.body.voteId)
    ]);
    expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
    const losingDecision = decisions.find((decision) => decision.status === "rejected");
    if (losingDecision?.status === "rejected") {
      expect(losingDecision.reason).toMatchObject({ code: "VOTE_NOT_UNDER_REVIEW" });
    }

    const events = await database.voteLedger.findMany({
      where: { voteId: review.body.voteId }
    });
    expect(
      events.filter((event) => event.eventType === VOTE_LEDGER_EVENT.VOTE_REVIEWED)
    ).toHaveLength(1);
    expect(
      events.filter((event) =>
        [VOTE_LEDGER_EVENT.VOTE_COUNTED, VOTE_LEDGER_EVENT.VOTE_REJECTED].includes(
          event.eventType as
            | typeof VOTE_LEDGER_EVENT.VOTE_COUNTED
            | typeof VOTE_LEDGER_EVENT.VOTE_REJECTED
        )
      )
    ).toHaveLength(1);
  });

  it("revokes a token once and commits its ledger and audit records atomically", async () => {
    const issued = await service.issueTokens(organizerId, campaignId, { count: 1 });
    const tokenId = issued.tokens[0]?.id;
    if (!tokenId) {
      throw new Error("Expected an issued voter token.");
    }

    const revocations = await Promise.allSettled([
      service.revokeToken(organizerId, campaignId, tokenId),
      service.revokeToken(organizerId, campaignId, tokenId)
    ]);
    expect(revocations.filter((revocation) => revocation.status === "fulfilled")).toHaveLength(1);
    const losingRevocation = revocations.find((revocation) => revocation.status === "rejected");
    if (losingRevocation?.status === "rejected") {
      expect(losingRevocation.reason).toMatchObject({ code: "TOKEN_NOT_ACTIVE" });
    }

    expect(
      await database.voteLedger.count({
        where: {
          campaignId,
          eventType: VOTE_LEDGER_EVENT.TOKEN_REVOKED,
          payload: { path: ["tokenId"], equals: tokenId }
        }
      })
    ).toBe(1);
    expect(
      await database.auditLog.count({
        where: {
          campaignId,
          action: VOTE_LEDGER_EVENT.TOKEN_REVOKED,
          metadata: { path: ["tokenId"], equals: tokenId }
        }
      })
    ).toBe(1);
  });
});
