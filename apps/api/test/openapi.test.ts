import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { MemoryOrganizerService } from "./support/memory-organizer-service.js";
import { MemoryVotingService } from "./support/memory-voting-service.js";
import { authenticatedAuthService } from "./support/test-auth-service.js";

type OpenApiOperation = {
  operationId?: string;
  summary?: string;
  security?: Array<Record<string, unknown>>;
  requestBody?: {
    content?: Record<string, { schema?: Record<string, unknown> }>;
  };
  responses?: Record<
    string,
    {
      content?: Record<string, { schema?: Record<string, unknown> }>;
      headers?: Record<string, Record<string, unknown>>;
    }
  >;
};

type OpenApiDocument = {
  openapi: string;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components: {
    headers: Record<string, Record<string, unknown>>;
    securitySchemes: Record<string, Record<string, unknown>>;
    schemas: Record<string, Record<string, unknown>>;
  };
};

const expectedOperations = [
  ["get", "/health", "getHealth"],
  ["get", "/ready", "getReadiness"],
  ["post", "/api/organizer/elections", "createElection"],
  ["get", "/api/organizer/elections", "listElections"],
  ["get", "/api/organizer/elections/{electionId}", "getElection"],
  ["patch", "/api/organizer/elections/{electionId}", "updateElection"],
  ["post", "/api/organizer/elections/{electionId}/activate", "activateElection"],
  ["post", "/api/organizer/elections/{electionId}/close", "closeElection"],
  ["post", "/api/organizer/elections/{electionId}/archive", "archiveElection"],
  ["post", "/api/organizer/elections/{electionId}/campaigns", "createCampaign"],
  ["get", "/api/organizer/elections/{electionId}/campaigns", "listCampaigns"],
  ["get", "/api/organizer/campaigns/{campaignId}", "getOrganizerCampaign"],
  ["patch", "/api/organizer/campaigns/{campaignId}", "updateCampaign"],
  ["post", "/api/organizer/campaigns/{campaignId}/activate", "activateCampaign"],
  ["post", "/api/organizer/campaigns/{campaignId}/close", "closeCampaign"],
  ["post", "/api/organizer/campaigns/{campaignId}/options", "createCampaignOption"],
  ["patch", "/api/organizer/campaigns/{campaignId}/options/{optionId}", "updateCampaignOption"],
  ["delete", "/api/organizer/campaigns/{campaignId}/options/{optionId}", "deleteCampaignOption"],
  ["post", "/api/organizer/campaigns/{campaignId}/voter-tokens", "issueVoterTokens"],
  ["get", "/api/organizer/campaigns/{campaignId}/voter-tokens/summary", "getVoterTokenSummary"],
  ["post", "/api/organizer/campaigns/{campaignId}/voter-tokens/{tokenId}/revoke", "revokeVoterToken"],
  ["get", "/api/organizer/campaigns/{campaignId}/review", "listReviewVotes"],
  ["get", "/api/organizer/campaigns/{campaignId}/results", "getCampaignResults"],
  ["get", "/api/organizer/campaigns/{campaignId}/integrity", "getCampaignIntegrity"],
  ["get", "/api/organizer/campaigns/{campaignId}/export", "exportCampaignReport"],
  ["post", "/api/organizer/campaigns/{campaignId}/review/{voteId}/approve", "approveReviewVote"],
  ["post", "/api/organizer/campaigns/{campaignId}/review/{voteId}/reject", "rejectReviewVote"],
  ["get", "/api/campaigns/{campaignId}", "getPublicCampaign"],
  ["post", "/api/campaigns/{campaignId}/identity/email/start", "requestEmailVerification"],
  ["post", "/api/campaigns/{campaignId}/identity/email/verify", "verifyVoterEmail"],
  ["post", "/api/campaigns/{campaignId}/votes", "submitVote"],
  ["get", "/api/campaigns/{campaignId}/receipts/{receipt}", "verifyVoteReceipt"]
] as const;

describe("OpenAPI contract", () => {
  it("documents every BirdLoud-owned operation with precise schemas and session security", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const document = response.json() as OpenApiDocument;

    expect(document.openapi).toBe("3.0.3");
    expect(document.components.securitySchemes.cookieAuth).toMatchObject({
      type: "apiKey",
      in: "cookie",
      name: "better-auth.session_token"
    });
    expect(document.components.headers.RequestId).toMatchObject({
      schema: {
        type: "string",
        minLength: 8,
        maxLength: 128,
        pattern: "^[A-Za-z0-9._:-]+$"
      }
    });

    const documentedOperationIds: string[] = [];
    for (const [method, path, operationId] of expectedOperations) {
      const operation = document.paths[path]?.[method];
      expect(operation, `${method.toUpperCase()} ${path}`).toBeDefined();
      expect(operation?.operationId).toBe(operationId);
      expect(operation?.summary).toEqual(expect.any(String));
      documentedOperationIds.push(operation?.operationId ?? "");

      if (path.startsWith("/api/organizer/")) {
        expect(operation?.security).toEqual([{ cookieAuth: [] }]);
        expect(operation?.responses).toHaveProperty("401");
        expect(operation?.responses).toHaveProperty("403");
      } else {
        expect(operation?.security).toEqual([]);
      }

      for (const media of Object.values(operation?.requestBody?.content ?? {})) {
        expect(isBareGenericObject(media.schema)).toBe(false);
      }

      for (const [status, contract] of Object.entries(operation?.responses ?? {})) {
        expect(contract.headers?.["x-request-id"], `${operationId} ${status}`).toEqual({
          $ref: "#/components/headers/RequestId"
        });
        if (!status.startsWith("2") || status === "204") continue;
        expect(contract.content, `${operationId} ${status}`).toBeDefined();
        for (const media of Object.values(contract.content ?? {})) {
          expect(isBareGenericObject(media.schema)).toBe(false);
        }
      }
    }

    expect(new Set(documentedOperationIds).size).toBe(expectedOperations.length);
    const actualOperationIds = Object.values(document.paths).flatMap((pathItem) =>
      Object.entries(pathItem)
        .filter(([method]) => ["get", "post", "put", "patch", "delete"].includes(method))
        .map(([, operation]) => operation.operationId ?? "")
    );
    expect(actualOperationIds.sort()).toEqual([...documentedOperationIds].sort());
    expect(document.paths).not.toHaveProperty("/api/auth/*");

    await app.close();
  });

  it("publishes exact vote, receipt, and export privacy contracts", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/docs/json" });
    const document = response.json() as OpenApiDocument;
    const vote = document.paths["/api/campaigns/{campaignId}/votes"]?.post;
    const voteRequestRef = vote?.requestBody?.content?.["application/json"]?.schema?.$ref;
    const voteRequest = componentByRef(document, voteRequestRef);

    expect(voteRequest).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["optionId", "idempotencyKey", "identity", "botProtectionToken"]
    });
    expect(voteRequest?.properties).toHaveProperty("botProtectionToken");
    expect(vote?.responses).toHaveProperty("201");
    expect(vote?.responses).toHaveProperty("202");
    expect(vote?.responses).toHaveProperty("409");
    expect(vote?.responses).toHaveProperty("503");

    const receiptOperation =
      document.paths["/api/campaigns/{campaignId}/receipts/{receipt}"]?.get;
    const receiptRef =
      receiptOperation?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref;
    const receipt = componentByRef(document, receiptRef);
    expect(receipt?.properties).toEqual({
      status: { type: "string", enum: ["recorded"] },
      voteStatus: {
        type: "string",
        enum: ["counted", "delayed", "under_review", "blocked", "rejected"]
      },
      recordedAt: { type: "string", format: "date-time" }
    });
    expect(receipt?.properties).not.toHaveProperty("optionId");

    const exportOperation =
      document.paths["/api/organizer/campaigns/{campaignId}/export"]?.get;
    expect(Object.keys(exportOperation?.responses?.["200"]?.content ?? {}).sort()).toEqual([
      "application/json",
      "text/csv"
    ]);

    await app.close();
  });

  it("returns the documented BirdLoud envelope when a public route is rate limited", async () => {
    const organizerId = "00000000-0000-4000-8000-000000000090";
    const organizer = new MemoryOrganizerService();
    const voting = new MemoryVotingService(organizer);
    const election = await organizer.createElection(organizerId, { title: "Rate Limit Election" });
    await organizer.setElectionStatus(organizerId, election.id, "active");
    const campaign = await organizer.createCampaign(organizerId, election.id, {
      title: "Rate Limit Campaign"
    });
    await organizer.setCampaignStatus(organizerId, campaign.id, "active");
    const app = await buildApp({
      authService: authenticatedAuthService(organizerId),
      organizerService: organizer,
      votingService: voting
    });

    for (let index = 0; index < 5; index += 1) {
      const response = await app.inject({
        method: "POST",
        url: `/api/campaigns/${campaign.id}/identity/email/start`,
        payload: { email: `rate-limit-${index}@example.test` }
      });
      expect(response.statusCode).toBe(202);
    }

    const limited = await app.inject({
      method: "POST",
      url: `/api/campaigns/${campaign.id}/identity/email/start`,
      payload: { email: "rate-limit-final@example.test" }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: expect.any(String),
        details: {
          retryAfter: expect.any(String)
        }
      }
    });

    await app.close();
  });
});

function isBareGenericObject(schema: Record<string, unknown> | undefined): boolean {
  return Boolean(
    schema?.type === "object" &&
      schema.additionalProperties === true &&
      !("properties" in schema) &&
      !("$ref" in schema)
  );
}

function componentByRef(document: OpenApiDocument, ref: unknown) {
  if (typeof ref !== "string") return undefined;
  const componentName = ref.split("/").at(-1);
  return componentName ? document.components.schemas[componentName] : undefined;
}
