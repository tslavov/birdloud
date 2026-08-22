import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryOrganizerService } from "./support/memory-organizer-service.js";
import { MemoryVotingService } from "./support/memory-voting-service.js";
import { authenticatedAuthService } from "./support/test-auth-service.js";

const organizerId = "00000000-0000-4000-8000-000000000001";

function buildVotingApp(
  organizerService: MemoryOrganizerService,
  votingService: MemoryVotingService
) {
  return buildApp({
    authService: authenticatedAuthService(organizerId),
    organizerService,
    votingService
  });
}

async function createActiveCampaign(organizer: MemoryOrganizerService) {
  const election = await organizer.createElection(organizerId, {
    title: "Sofia Municipal Election 2027"
  });
  await organizer.setElectionStatus(organizerId, election.id, "active");
  const campaign = await organizer.createCampaign(organizerId, election.id, {
    title: "Mayor Campaign"
  });
  await organizer.setCampaignStatus(organizerId, campaign.id, "active");
  const option = await organizer.createOption(organizerId, campaign.id, {
    label: "Candidate A",
    position: 0
  });

  return { election, campaign, option };
}

describe("voting routes", () => {
  it("returns public campaign details with active options", async () => {
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const app = await buildVotingApp(organizer, voting);
    const { campaign } = await createActiveCampaign(organizer);

    const response = await app.inject({
      method: "GET",
      url: `/api/campaigns/${campaign.id}`
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe("Mayor Campaign");
    expect(response.json().options).toHaveLength(1);

    await app.close();
  });

  it("issues, summarizes, and revokes invite tokens", async () => {
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const app = await buildVotingApp(organizer, voting);
    const { campaign } = await createActiveCampaign(organizer);

    const issueResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens`,
      payload: {
        count: 2,
        issuedLabel: "pilot list"
      }
    });

    expect(issueResponse.statusCode).toBe(201);
    expect(issueResponse.json().tokens).toHaveLength(2);
    expect(issueResponse.json().tokens[0].token).toMatch(/^ivt_/);

    const summaryResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens/summary`,
    });

    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json().active).toBe(2);

    const revokeResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens/${issueResponse.json().tokens[0].id}/revoke`,
    });

    expect(revokeResponse.statusCode).toBe(204);

    const updatedSummaryResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens/summary`,
    });

    expect(updatedSummaryResponse.json().active).toBe(1);
    expect(updatedSummaryResponse.json().revoked).toBe(1);

    await app.close();
  });

  it("accepts a vote, replays idempotent retries, and verifies the receipt without option data", async () => {
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const app = await buildVotingApp(organizer, voting);
    const { campaign, option } = await createActiveCampaign(organizer);

    const tokenResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens`,
      payload: {
        count: 1
      }
    });
    const inviteToken = tokenResponse.json().tokens[0].token;
    const payload = {
      optionId: option.id,
      idempotencyKey: randomUUID(),
      inviteToken,
      identity: {
        provider: "email",
        email: "voter@example.com"
      },
      deviceId: "device-12345"
    };

    const voteResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload
    });

    expect(voteResponse.statusCode).toBe(201);
    expect(voteResponse.json().status).toBe("counted");
    expect(voteResponse.json().receipt).toMatch(/^rcpt_/);

    const replayResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload
    });

    expect(replayResponse.statusCode).toBe(201);
    expect(replayResponse.json()).toEqual(voteResponse.json());

    const receiptResponse = await app.inject({
      method: "GET",
      url: `/api/campaigns/${campaign.id}/receipts/${voteResponse.json().receipt}`
    });

    expect(receiptResponse.statusCode).toBe(200);
    expect(receiptResponse.json()).toEqual({
      status: "recorded",
      voteStatus: "counted",
      recordedAt: expect.any(String)
    });
    expect(receiptResponse.body).not.toContain(option.id);
    expect(receiptResponse.body).not.toContain("Candidate A");

    await app.close();
  });

  it("blocks duplicate identity votes and idempotency conflicts", async () => {
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const app = await buildVotingApp(organizer, voting);
    const { campaign, option } = await createActiveCampaign(organizer);
    const idempotencyKey = randomUUID();

    const firstPayload = {
      optionId: option.id,
      idempotencyKey,
      identity: {
        provider: "email",
        email: "voter@example.com"
      }
    };

    const firstResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: firstPayload
    });

    expect(firstResponse.statusCode).toBe(201);

    const conflictResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: {
        ...firstPayload,
        identity: {
          provider: "email",
          email: "other@example.com"
        }
      }
    });

    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictResponse.json().error.code).toBe("IDEMPOTENCY_CONFLICT");

    const duplicateResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: {
        ...firstPayload,
        idempotencyKey: randomUUID()
      }
    });

    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json().error.code).toBe("ALREADY_VOTED");

    await app.close();
  });

  it("lists and resolves under-review votes", async () => {
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const app = await buildVotingApp(organizer, voting);
    const { campaign, option } = await createActiveCampaign(organizer);

    const firstVoteResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: {
        optionId: option.id,
        idempotencyKey: randomUUID(),
        identity: {
          provider: "email",
          email: "review-me@example.com"
        }
      }
    });
    voting.markVoteUnderReview(firstVoteResponse.json().voteId);

    const secondVoteResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: {
        optionId: option.id,
        idempotencyKey: randomUUID(),
        identity: {
          provider: "email",
          email: "reject-me@example.com"
        }
      }
    });
    voting.markVoteUnderReview(secondVoteResponse.json().voteId, "abnormal_submission_speed");

    const reviewResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/review`,
    });

    expect(reviewResponse.statusCode).toBe(200);
    expect(reviewResponse.json()).toHaveLength(2);
    expect(reviewResponse.json()[0]).toMatchObject({
      status: "under_review",
      confidenceLevel: "low",
      riskScore: 45
    });

    const approveResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/review/${firstVoteResponse.json().voteId}/approve`,
    });

    expect(approveResponse.statusCode).toBe(200);
    expect(approveResponse.json()).toMatchObject({
      status: "counted",
      reviewedAt: expect.any(String)
    });

    const rejectResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/review/${secondVoteResponse.json().voteId}/reject`,
    });

    expect(rejectResponse.statusCode).toBe(200);
    expect(rejectResponse.json()).toMatchObject({
      status: "rejected",
      reviewReason: "abnormal_submission_speed"
    });

    const emptyReviewResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/review`,
    });

    expect(emptyReviewResponse.json()).toHaveLength(0);

    await app.close();
  });

  it("reports campaign results and integrity context", async () => {
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const app = await buildVotingApp(organizer, voting);
    const { campaign, option } = await createActiveCampaign(organizer);

    const countedResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: {
        optionId: option.id,
        idempotencyKey: randomUUID(),
        identity: {
          provider: "email",
          email: "counted@example.com"
        }
      }
    });

    expect(countedResponse.statusCode).toBe(201);

    const reviewResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: {
        optionId: option.id,
        idempotencyKey: randomUUID(),
        identity: {
          provider: "email",
          email: "reviewed@example.com"
        }
      }
    });
    voting.markVoteUnderReview(reviewResponse.json().voteId, "many_votes_from_same_device");

    await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/review/${reviewResponse.json().voteId}/reject`,
    });

    const duplicateResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: {
        optionId: option.id,
        idempotencyKey: randomUUID(),
        identity: {
          provider: "email",
          email: "counted@example.com"
        }
      }
    });

    expect(duplicateResponse.statusCode).toBe(409);

    const resultsResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/results`,
    });

    expect(resultsResponse.statusCode).toBe(200);
    expect(resultsResponse.json()).toMatchObject({
      campaignId: campaign.id,
      countedVotes: 1,
      rejectedVotes: 1,
      duplicateAttempts: 1,
      mediumConfidenceVotes: 1,
      lowConfidenceVotes: 1
    });
    expect(resultsResponse.json().integrityScore).toBeLessThan(100);
    expect(resultsResponse.json().options[0]).toMatchObject({
      optionId: option.id,
      label: "Candidate A",
      countedVotes: 1,
      rejectedVotes: 1
    });

    const integrityResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/integrity`,
    });

    expect(integrityResponse.statusCode).toBe(200);
    expect(integrityResponse.json()).toMatchObject({
      campaignId: campaign.id,
      countedVotes: 1,
      rejectedVotes: 1,
      duplicateAttempts: 1
    });
    expect(integrityResponse.json().signals).toContainEqual(
      expect.objectContaining({
        code: "duplicate_attempts",
        value: 1,
        severity: "warning"
      })
    );

    await app.close();
  });

  it("exports aggregate campaign reports as JSON and CSV without voter-level secrets", async () => {
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const app = await buildVotingApp(organizer, voting);
    const { campaign, option } = await createActiveCampaign(organizer);

    const voteResponse = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/votes`,
      payload: {
        optionId: option.id,
        idempotencyKey: randomUUID(),
        identity: {
          provider: "email",
          email: "export-voter@example.com"
        }
      }
    });

    const jsonResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/export?format=json`,
    });

    expect(jsonResponse.statusCode).toBe(200);
    expect(jsonResponse.headers["content-disposition"]).toContain(`${campaign.id}-results.json`);
    expect(jsonResponse.json().results).toMatchObject({
      campaignId: campaign.id,
      countedVotes: 1
    });
    expect(jsonResponse.json().integrity).toMatchObject({
      campaignId: campaign.id,
      integrityScore: 100
    });
    expect(jsonResponse.body).not.toContain(voteResponse.json().receipt);
    expect(jsonResponse.body).not.toContain("export-voter@example.com");

    const csvResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/export?format=csv`,
    });

    expect(csvResponse.statusCode).toBe(200);
    expect(csvResponse.headers["content-type"]).toContain("text/csv");
    expect(csvResponse.headers["content-disposition"]).toContain(`${campaign.id}-results.csv`);
    expect(csvResponse.body).toContain("campaign_id,integrity_score,total_counted_votes");
    expect(csvResponse.body).toContain(`${campaign.id},100,1,0,0,0,0,0,1,0,${option.id},Candidate A,1,0,0,0`);
    expect(csvResponse.body).not.toContain(voteResponse.json().receipt);
    expect(csvResponse.body).not.toContain("export-voter@example.com");

    await app.close();
  });
});
