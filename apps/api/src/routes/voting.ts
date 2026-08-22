import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireOrganizer } from "../http/authorization.js";
import { ApiError, sendApiError } from "../http/errors.js";
import { parseWithSchema } from "../http/validation.js";
import type { AuthService } from "../lib/auth.js";
import type { VotingService } from "../services/voting.js";

const uuidParamSchema = z.object({
  campaignId: z.string().uuid().optional(),
  tokenId: z.string().uuid().optional(),
  voteId: z.string().uuid().optional(),
  receipt: z.string().min(1).optional()
});

const issueTokensSchema = z.object({
  count: z.number().int().min(1).max(500),
  issuedLabel: z.string().trim().min(1).max(160).optional()
});

const submitVoteSchema = z.object({
  optionId: z.string().uuid(),
  idempotencyKey: z.string().uuid(),
  identity: z.object({
    provider: z.literal("email"),
    email: z.string().email()
  }),
  inviteToken: z.string().trim().min(8).optional(),
  deviceId: z.string().trim().min(8).max(256).optional()
});

const exportQuerySchema = z.object({
  format: z.enum(["json", "csv"]).default("json")
});

const genericObjectSchema = {
  type: "object",
  additionalProperties: true
} as const;

export async function registerVotingRoutes(
  app: FastifyInstance,
  service: VotingService,
  authService: AuthService
): Promise<void> {
  app.post(
    "/api/organizer/campaigns/:campaignId/voter-tokens",
    { schema: { tags: ["organizer"], response: { 201: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        const body = parseWithSchema(issueTokensSchema, request.body);
        const result = await service.issueTokens(
          organizerId,
          requireParam(campaignId, "campaignId"),
          body
        );
        return reply.status(201).send(result);
      })
  );

  app.get(
    "/api/organizer/campaigns/:campaignId/voter-tokens/summary",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        return service.getTokenSummary(organizerId, requireParam(campaignId, "campaignId"));
      })
  );

  app.post(
    "/api/organizer/campaigns/:campaignId/voter-tokens/:tokenId/revoke",
    { schema: { tags: ["organizer"], response: { 204: { type: "null" } } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId, tokenId } = parseParams(request);
        await service.revokeToken(
          organizerId,
          requireParam(campaignId, "campaignId"),
          requireParam(tokenId, "tokenId")
        );
        return reply.status(204).send();
      })
  );

  app.get(
    "/api/organizer/campaigns/:campaignId/review",
    { schema: { tags: ["organizer"], response: { 200: { type: "array", items: genericObjectSchema } } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        return service.listReviewVotes(organizerId, requireParam(campaignId, "campaignId"));
      })
  );

  app.get(
    "/api/organizer/campaigns/:campaignId/results",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        return service.getCampaignResults(organizerId, requireParam(campaignId, "campaignId"));
      })
  );

  app.get(
    "/api/organizer/campaigns/:campaignId/integrity",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        return service.getCampaignIntegrity(organizerId, requireParam(campaignId, "campaignId"));
      })
  );

  app.get(
    "/api/organizer/campaigns/:campaignId/export",
    {
      schema: {
        tags: ["organizer"],
        response: {
          200: genericObjectSchema
        }
      }
    },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        const query = parseWithSchema(exportQuerySchema, request.query);
        const exported = await service.exportCampaignReport(
          organizerId,
          requireParam(campaignId, "campaignId"),
          query.format
        );

        reply
          .header("content-disposition", `attachment; filename="${exported.filename}"`)
          .type(exported.contentType);

        if (exported.format === "json") {
          return JSON.parse(exported.body) as unknown;
        }

        return exported.body;
      })
  );

  app.post(
    "/api/organizer/campaigns/:campaignId/review/:voteId/approve",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId, voteId } = parseParams(request);
        return service.approveReviewVote(
          organizerId,
          requireParam(campaignId, "campaignId"),
          requireParam(voteId, "voteId")
        );
      })
  );

  app.post(
    "/api/organizer/campaigns/:campaignId/review/:voteId/reject",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId, voteId } = parseParams(request);
        return service.rejectReviewVote(
          organizerId,
          requireParam(campaignId, "campaignId"),
          requireParam(voteId, "voteId")
        );
      })
  );

  app.get(
    "/api/campaigns/:campaignId",
    { schema: { tags: ["voter"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const { campaignId } = parseParams(request);
        return service.getPublicCampaign(requireParam(campaignId, "campaignId"));
      })
  );

  app.post(
    "/api/campaigns/:campaignId/votes",
    {
      schema: {
        tags: ["voter"],
        response: {
          201: genericObjectSchema,
          202: genericObjectSchema
        }
      }
    },
    async (request, reply) =>
      handle(reply, async () => {
        const { campaignId } = parseParams(request);
        const body = parseWithSchema(submitVoteSchema, request.body);
        const result = await service.submitVote(requireParam(campaignId, "campaignId"), body, {
          ip: request.ip,
          userAgent: request.headers["user-agent"]
        });

        return reply.status(result.statusCode as 201 | 202).send(result.body);
      })
  );

  app.get(
    "/api/campaigns/:campaignId/receipts/:receipt",
    { schema: { tags: ["voter"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const { campaignId, receipt } = parseParams(request);
        return service.verifyReceipt(
          requireParam(campaignId, "campaignId"),
          requireParam(receipt, "receipt")
        );
      })
  );
}

async function handle<T>(reply: FastifyReply, action: () => Promise<T>): Promise<T | FastifyReply> {
  try {
    return await action();
  } catch (error) {
    return sendApiError(reply, error);
  }
}

async function getOrganizerId(
  request: FastifyRequest,
  authService: AuthService
): Promise<string> {
  const organizer = await requireOrganizer(request, authService);
  return organizer.id;
}

function parseParams(request: FastifyRequest) {
  return parseWithSchema(uuidParamSchema, request.params);
}

function requireParam(value: string | undefined, name: string): string {
  if (!value) {
    throw new ApiError(400, "BAD_REQUEST", `Missing route parameter: ${name}.`);
  }

  return value;
}
