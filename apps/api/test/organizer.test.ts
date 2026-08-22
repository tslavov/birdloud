import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryOrganizerService } from "./support/memory-organizer-service.js";
import {
  authenticatedAuthService,
  unauthenticatedAuthService
} from "./support/test-auth-service.js";

const organizerId = "00000000-0000-4000-8000-000000000001";
const otherOrganizerId = "00000000-0000-4000-8000-000000000002";

function buildOrganizerApp(service: MemoryOrganizerService) {
  return buildApp({
    authService: authenticatedAuthService(organizerId),
    organizerService: service
  });
}

describe("organizer election and campaign routes", () => {
  it("requires organizer authentication", async () => {
    const app = await buildApp({
      authService: unauthenticatedAuthService(),
      organizerService: new MemoryOrganizerService()
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/organizer/elections",
      headers: {
        "x-birdloud-organizer-id": organizerId
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTH_REQUIRED");

    await app.close();
  });

  it("requires an organizer or administrator role", async () => {
    const app = await buildApp({
      authService: authenticatedAuthService(organizerId, "VOTER"),
      organizerService: new MemoryOrganizerService()
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/organizer/elections"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("ORGANIZER_ROLE_REQUIRED");

    await app.close();
  });

  it("allows administrator sessions through the organizer authorization boundary", async () => {
    const app = await buildApp({
      authService: authenticatedAuthService(organizerId, "ADMIN"),
      organizerService: new MemoryOrganizerService()
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/organizer/elections"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);

    await app.close();
  });

  it("creates, lists, updates, and activates an election", async () => {
    const service = new MemoryOrganizerService();
    const app = await buildOrganizerApp(service);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/organizer/elections",
      payload: {
        title: "Sofia Municipal Election 2027",
        description: "City-wide election.",
        startsAt: "2027-10-01T09:00:00.000Z",
        endsAt: "2027-10-03T17:00:00.000Z"
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const election = createResponse.json();
    expect(election.status).toBe("draft");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/organizer/elections"
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toHaveLength(1);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/organizer/elections/${election.id}`,
      payload: {
        title: "Updated Election"
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().title).toBe("Updated Election");

    const activateResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/elections/${election.id}/activate`
    });

    expect(activateResponse.statusCode).toBe(200);
    expect(activateResponse.json().status).toBe("active");

    await app.close();
  });

  it("creates campaigns and options inside owned elections", async () => {
    const service = new MemoryOrganizerService();
    const app = await buildOrganizerApp(service);
    const election = await service.createElection(organizerId, {
      title: "Board Vote"
    });

    const campaignResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/elections/${election.id}/campaigns`,
      payload: {
        title: "Mayor Campaign",
        identityMode: "invite_token_optional",
        duplicateIdentityPolicy: "review"
      }
    });

    expect(campaignResponse.statusCode).toBe(201);
    expect(campaignResponse.json().identityMode).toBe("invite_token_optional");

    const campaign = campaignResponse.json();
    const optionResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/options`,
      payload: {
        label: "Candidate A",
        position: 0
      }
    });

    expect(optionResponse.statusCode).toBe(201);
    expect(optionResponse.json().label).toBe("Candidate A");

    const patchOptionResponse = await app.inject({
      method: "PATCH",
      url: `/api/organizer/campaigns/${campaign.id}/options/${optionResponse.json().id}`,
      payload: {
        isActive: false
      }
    });

    expect(patchOptionResponse.statusCode).toBe(200);
    expect(patchOptionResponse.json().isActive).toBe(false);

    const activateCampaignResponse = await app.inject({
      method: "POST",
      url: `/api/organizer/campaigns/${campaign.id}/activate`
    });

    expect(activateCampaignResponse.statusCode).toBe(200);
    expect(activateCampaignResponse.json().status).toBe("active");

    await app.close();
  });

  it("blocks access to another organizer's election", async () => {
    const service = new MemoryOrganizerService();
    const app = await buildOrganizerApp(service);
    const election = await service.createElection(otherOrganizerId, {
      title: "Private Election"
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/organizer/elections/${election.id}`
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");

    await app.close();
  });

  it("returns validation errors for invalid payloads", async () => {
    const app = await buildApp({
      authService: authenticatedAuthService(organizerId),
      organizerService: new MemoryOrganizerService()
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/organizer/elections",
      payload: {
        title: ""
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("BAD_REQUEST");
    expect(response.json().error.details.issues).toHaveLength(1);

    await app.close();
  });

  it("returns not found for missing resources", async () => {
    const app = await buildApp({
      authService: authenticatedAuthService(organizerId),
      organizerService: new MemoryOrganizerService()
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/organizer/elections/${randomUUID()}`
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("NOT_FOUND");

    await app.close();
  });
});
