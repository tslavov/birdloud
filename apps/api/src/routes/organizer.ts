import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireOrganizer } from "../http/authorization.js";
import { ApiError, sendApiError } from "../http/errors.js";
import { parseWithSchema } from "../http/validation.js";
import type { AuthService } from "../lib/auth.js";
import type { OrganizerService } from "../services/organizer.js";

const uuidParamSchema = z.object({
  electionId: z.string().uuid().optional(),
  campaignId: z.string().uuid().optional(),
  optionId: z.string().uuid().optional()
});

const optionalDateTimeSchema = z.string().datetime({ offset: true });

const createElectionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  startsAt: optionalDateTimeSchema.optional(),
  endsAt: optionalDateTimeSchema.optional()
});

const updateElectionSchema = createElectionSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided."
);

const createCampaignSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional(),
  identityMode: z.enum(["soft_identity", "invite_token_optional"]).optional(),
  startsAt: optionalDateTimeSchema.optional(),
  endsAt: optionalDateTimeSchema.optional(),
  allowReviewQueue: z.boolean().optional(),
  duplicateIdentityPolicy: z.enum(["count_with_risk", "review", "block"]).optional()
});

const updateCampaignSchema = createCampaignSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "At least one field must be provided."
);

const createOptionSchema = z.object({
  label: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
  position: z.number().int().min(0)
});

const updateOptionSchema = z
  .object({
    label: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(1000).optional(),
    position: z.number().int().min(0).optional(),
    isActive: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, "At least one field must be provided.");

const genericObjectSchema = {
  type: "object",
  additionalProperties: true
} as const;

const genericArraySchema = {
  type: "array",
  items: genericObjectSchema
} as const;

export async function registerOrganizerRoutes(
  app: FastifyInstance,
  service: OrganizerService,
  authService: AuthService
): Promise<void> {
  app.post(
    "/api/organizer/elections",
    {
      schema: {
        tags: ["organizer"],
        response: {
          201: genericObjectSchema
        }
      }
    },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const body = parseWithSchema(createElectionSchema, request.body);
        const election = await service.createElection(organizerId, body);
        return reply.status(201).send(election);
      })
  );

  app.get(
    "/api/organizer/elections",
    {
      schema: {
        tags: ["organizer"],
        response: {
          200: genericArraySchema
        }
      }
    },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        return service.listElections(organizerId);
      })
  );

  app.get(
    "/api/organizer/elections/:electionId",
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
        const { electionId } = parseParams(request);
        return service.getElection(organizerId, requireParam(electionId, "electionId"));
      })
  );

  app.patch(
    "/api/organizer/elections/:electionId",
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
        const { electionId } = parseParams(request);
        const body = parseWithSchema(updateElectionSchema, request.body);
        return service.updateElection(organizerId, requireParam(electionId, "electionId"), body);
      })
  );

  app.post(
    "/api/organizer/elections/:electionId/activate",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { electionId } = parseParams(request);
        return service.setElectionStatus(
          organizerId,
          requireParam(electionId, "electionId"),
          "active"
        );
      })
  );

  app.post(
    "/api/organizer/elections/:electionId/close",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { electionId } = parseParams(request);
        return service.setElectionStatus(
          organizerId,
          requireParam(electionId, "electionId"),
          "closed"
        );
      })
  );

  app.post(
    "/api/organizer/elections/:electionId/archive",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { electionId } = parseParams(request);
        return service.setElectionStatus(
          organizerId,
          requireParam(electionId, "electionId"),
          "archived"
        );
      })
  );

  app.post(
    "/api/organizer/elections/:electionId/campaigns",
    { schema: { tags: ["organizer"], response: { 201: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { electionId } = parseParams(request);
        const body = parseWithSchema(createCampaignSchema, request.body);
        const campaign = await service.createCampaign(
          organizerId,
          requireParam(electionId, "electionId"),
          body
        );
        return reply.status(201).send(campaign);
      })
  );

  app.get(
    "/api/organizer/elections/:electionId/campaigns",
    { schema: { tags: ["organizer"], response: { 200: genericArraySchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { electionId } = parseParams(request);
        return service.listCampaigns(organizerId, requireParam(electionId, "electionId"));
      })
  );

  app.get(
    "/api/organizer/campaigns/:campaignId",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        return service.getCampaign(organizerId, requireParam(campaignId, "campaignId"));
      })
  );

  app.patch(
    "/api/organizer/campaigns/:campaignId",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        const body = parseWithSchema(updateCampaignSchema, request.body);
        return service.updateCampaign(organizerId, requireParam(campaignId, "campaignId"), body);
      })
  );

  app.post(
    "/api/organizer/campaigns/:campaignId/activate",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        return service.setCampaignStatus(
          organizerId,
          requireParam(campaignId, "campaignId"),
          "active"
        );
      })
  );

  app.post(
    "/api/organizer/campaigns/:campaignId/close",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        return service.setCampaignStatus(
          organizerId,
          requireParam(campaignId, "campaignId"),
          "closed"
        );
      })
  );

  app.post(
    "/api/organizer/campaigns/:campaignId/options",
    { schema: { tags: ["organizer"], response: { 201: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId } = parseParams(request);
        const body = parseWithSchema(createOptionSchema, request.body);
        const option = await service.createOption(
          organizerId,
          requireParam(campaignId, "campaignId"),
          body
        );
        return reply.status(201).send(option);
      })
  );

  app.patch(
    "/api/organizer/campaigns/:campaignId/options/:optionId",
    { schema: { tags: ["organizer"], response: { 200: genericObjectSchema } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId, optionId } = parseParams(request);
        const body = parseWithSchema(updateOptionSchema, request.body);
        return service.updateOption(
          organizerId,
          requireParam(campaignId, "campaignId"),
          requireParam(optionId, "optionId"),
          body
        );
      })
  );

  app.delete(
    "/api/organizer/campaigns/:campaignId/options/:optionId",
    { schema: { tags: ["organizer"], response: { 204: { type: "null" } } } },
    async (request, reply) =>
      handle(reply, async () => {
        const organizerId = await getOrganizerId(request, authService);
        const { campaignId, optionId } = parseParams(request);
        await service.deleteOption(
          organizerId,
          requireParam(campaignId, "campaignId"),
          requireParam(optionId, "optionId")
        );
        return reply.status(204).send();
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
