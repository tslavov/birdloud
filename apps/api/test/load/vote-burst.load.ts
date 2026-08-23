import { performance } from "node:perf_hooks";
import { randomUUID } from "node:crypto";
import {
  CampaignStatus,
  ElectionStatus,
  EmailVerificationStatus,
  IdentityProvider,
  PrismaClient,
  TrustLevel,
  UserRole
} from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashValue } from "../../src/lib/crypto.js";
import { PrismaVotingService } from "../../src/services/voting.js";
import { availableAbuseSignalStore } from "../support/test-abuse-signal-store.js";

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://birdloud:birdloud@localhost:5433/birdloud_test";
const voteCount = positiveInteger(process.env.LOAD_VOTES, 100);
const concurrency = Math.min(positiveInteger(process.env.LOAD_CONCURRENCY, 20), voteCount);
const p95TargetMs = positiveInteger(process.env.LOAD_P95_TARGET_MS, 5000);
const runId = randomUUID();
const organizerEmail = `vote-load-${runId}@example.test`;

describe("vote hot-path burst", () => {
  const database = new PrismaClient({
    datasources: {
      db: { url: databaseUrl }
    }
  });
  const organizerId = randomUUID();
  const campaignId = randomUUID();
  const optionId = randomUUID();
  const proofs = Array.from({ length: voteCount }, (_, index) => `emp_load_${runId}_${index}`);
  const service = new PrismaVotingService(
    database,
    { async sendVerificationEmail() {} },
    {
      async verify() {
        return {
          success: true as const,
          hostname: "load.test",
          action: "vote-submit"
        };
      }
    },
    availableAbuseSignalStore
  );

  beforeAll(async () => {
    await database.user.create({
      data: {
        id: organizerId,
        email: organizerEmail,
        name: "Synthetic Load Organizer",
        emailVerified: true,
        role: UserRole.ORGANIZER,
        elections: {
          create: {
            title: "Synthetic Load Election",
            status: ElectionStatus.ACTIVE,
            campaigns: {
              create: {
                id: campaignId,
                title: "Synthetic Load Campaign",
                status: CampaignStatus.ACTIVE,
                options: {
                  create: {
                    id: optionId,
                    label: "Synthetic Load Choice",
                    position: 0
                  }
                }
              }
            }
          }
        }
      }
    });

    const identities = proofs.map((_, index) => {
      const id = randomUUID();
      const emailHash = hashValue(`load-voter-${runId}-${index}@example.test`);
      return {
        id,
        campaignId,
        provider: IdentityProvider.EMAIL,
        providerSubjectHash: emailHash,
        emailHash,
        trustLevel: TrustLevel.HIGH
      };
    });
    await database.voterIdentity.createMany({ data: identities });
    await database.emailVerificationChallenge.createMany({
      data: proofs.map((proof, index) => {
        const identity = identities[index];
        if (!identity) throw new Error("Synthetic load identity setup is incomplete.");
        return {
          campaignId,
          identityId: identity.id,
          emailHash: identity.emailHash,
          tokenHash: hashValue(`load-token-${runId}-${index}`),
          proofHash: hashValue(proof),
          status: EmailVerificationStatus.VERIFIED,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000),
          proofExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
          verifiedAt: new Date()
        };
      })
    });
  });

  afterAll(async () => {
    await database.user.delete({ where: { id: organizerId } }).catch(() => undefined);
    await database.$disconnect();
  });

  it(
    `records ${voteCount} synthetic votes at concurrency ${concurrency} without loss`,
    async () => {
      const durations: number[] = [];
      let nextIndex = 0;
      const startedAt = performance.now();

      await Promise.all(
        Array.from({ length: concurrency }, async () => {
          while (true) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= voteCount) return;

            const requestStartedAt = performance.now();
            const result = await service.submitVote(
              campaignId,
              {
                optionId,
                idempotencyKey: randomUUID(),
                botProtectionToken: "synthetic-load-turnstile",
                deviceId: `synthetic-device-${runId}-${index}`,
                identity: {
                  provider: "email",
                  proof: proofs[index] ?? ""
                }
              },
              {
                ip: `198.51.100.${(index % 200) + 1}`,
                userAgent: "BirdLoud synthetic load harness"
              }
            );
            expect(result.statusCode).toBe(201);
            durations.push(performance.now() - requestStartedAt);
          }
        })
      );

      const elapsedMs = performance.now() - startedAt;
      const p95Ms = percentile(durations, 0.95);
      const counts = await Promise.all([
        database.vote.count({ where: { campaignId } }),
        database.voteAttempt.count({ where: { campaignId } }),
        database.voteLedger.count({ where: { campaignId } })
      ]);

      console.info(
        JSON.stringify({
          benchmark: "vote-hot-path",
          votes: voteCount,
          concurrency,
          elapsedMs: Math.round(elapsedMs),
          throughputPerSecond: Number(((voteCount * 1000) / elapsedMs).toFixed(2)),
          p95Ms: Math.round(p95Ms),
          p95TargetMs
        })
      );

      expect(durations).toHaveLength(voteCount);
      expect(counts).toEqual([voteCount, voteCount, voteCount]);
      expect(p95Ms).toBeLessThanOrEqual(p95TargetMs);
    },
    120_000
  );
});

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value ?? fallback);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(values: number[], proportion: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * proportion) - 1)] ?? Number.POSITIVE_INFINITY;
}
