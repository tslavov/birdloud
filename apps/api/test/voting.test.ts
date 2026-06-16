import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryOrganizerService } from "./support/memory-organizer-service.js";
import { MemoryVotingService } from "./support/memory-voting-service.js";

const organizerId = "00000000-0000-4000-8000-000000000001";

function headers() {
  return {
    "x-birdloud-organizer-id": organizerId
  };
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
    const app = await buildApp({ organizerService: organizer, votingService: voting });
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
    const app = await buildApp({ organizerService: organizer, votingService: voting });
    const { campaign } = await createActiveCampaign(organizer);

    const issueResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens`,
      headers: headers(),
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
      headers: headers()
    });

    expect(summaryResponse.statusCode).toBe(200);
    expect(summaryResponse.json().active).toBe(2);

    const revokeResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens/${issueResponse.json().tokens[0].id}/revoke`,
      headers: headers()
    });

    expect(revokeResponse.statusCode).toBe(204);

    const updatedSummaryResponse = await app.inject({
      method: "GET",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens/summary`,
      headers: headers()
    });

    expect(updatedSummaryResponse.json().active).toBe(1);
    expect(updatedSummaryResponse.json().revoked).toBe(1);

    await app.close();
  });

  it("accepts a vote, replays idempotent retries, and verifies the receipt without option data", async () => {
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const app = await buildApp({ organizerService: organizer, votingService: voting });
    const { campaign, option } = await createActiveCampaign(organizer);

    const tokenResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/voter-tokens`,
      headers: headers(),
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
    const app = await buildApp({ organizerService: organizer, votingService: voting });
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
});

