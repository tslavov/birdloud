import type { Prisma, PrismaClient } from "@prisma/client";
import {
  CampaignStatus,
  DuplicateIdentityPolicy,
  ElectionStatus,
  IdentityMode
} from "@prisma/client";
import { forbidden, notFound } from "../http/errors.js";

export type ElectionStatusValue = "draft" | "active" | "closed" | "archived";
export type CampaignStatusValue = "draft" | "active" | "closed";
export type IdentityModeValue = "soft_identity" | "invite_token_optional";
export type DuplicateIdentityPolicyValue = "count_with_risk" | "review" | "block";

export type ElectionDto = {
  id: string;
  organizerId: string;
  title: string;
  description: string | null;
  status: ElectionStatusValue;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CampaignDto = {
  id: string;
  electionId: string;
  title: string;
  description: string | null;
  status: CampaignStatusValue;
  identityMode: IdentityModeValue;
  startsAt: string | null;
  endsAt: string | null;
  allowReviewQueue: boolean;
  duplicateIdentityPolicy: DuplicateIdentityPolicyValue;
  createdAt: string;
  updatedAt: string;
};

export type CampaignOptionDto = {
  id: string;
  campaignId: string;
  label: string;
  description: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
};

export type CreateElectionInput = {
  title: string;
  description?: string | undefined;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
};

export type UpdateElectionInput = {
  title?: string | undefined;
  description?: string | undefined;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
};

export type CreateCampaignInput = {
  title: string;
  description?: string | undefined;
  identityMode?: IdentityModeValue | undefined;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
  allowReviewQueue?: boolean | undefined;
  duplicateIdentityPolicy?: DuplicateIdentityPolicyValue | undefined;
};

export type UpdateCampaignInput = {
  title?: string | undefined;
  description?: string | undefined;
  identityMode?: IdentityModeValue | undefined;
  startsAt?: string | undefined;
  endsAt?: string | undefined;
  allowReviewQueue?: boolean | undefined;
  duplicateIdentityPolicy?: DuplicateIdentityPolicyValue | undefined;
};

export type CreateOptionInput = {
  label: string;
  description?: string | undefined;
  position: number;
};

export type UpdateOptionInput = {
  label?: string | undefined;
  description?: string | undefined;
  position?: number | undefined;
  isActive?: boolean | undefined;
};

export type OrganizerService = {
  createElection(organizerId: string, input: CreateElectionInput): Promise<ElectionDto>;
  listElections(organizerId: string): Promise<ElectionDto[]>;
  getElection(organizerId: string, electionId: string): Promise<ElectionDto>;
  updateElection(
    organizerId: string,
    electionId: string,
    input: UpdateElectionInput
  ): Promise<ElectionDto>;
  setElectionStatus(
    organizerId: string,
    electionId: string,
    status: ElectionStatusValue
  ): Promise<ElectionDto>;
  createCampaign(
    organizerId: string,
    electionId: string,
    input: CreateCampaignInput
  ): Promise<CampaignDto>;
  listCampaigns(organizerId: string, electionId: string): Promise<CampaignDto[]>;
  getCampaign(organizerId: string, campaignId: string): Promise<CampaignDto>;
  updateCampaign(
    organizerId: string,
    campaignId: string,
    input: UpdateCampaignInput
  ): Promise<CampaignDto>;
  setCampaignStatus(
    organizerId: string,
    campaignId: string,
    status: CampaignStatusValue
  ): Promise<CampaignDto>;
  createOption(
    organizerId: string,
    campaignId: string,
    input: CreateOptionInput
  ): Promise<CampaignOptionDto>;
  updateOption(
    organizerId: string,
    campaignId: string,
    optionId: string,
    input: UpdateOptionInput
  ): Promise<CampaignOptionDto>;
  deleteOption(organizerId: string, campaignId: string, optionId: string): Promise<void>;
};

const electionStatusToApi: Record<ElectionStatus, ElectionStatusValue> = {
  DRAFT: "draft",
  ACTIVE: "active",
  CLOSED: "closed",
  ARCHIVED: "archived"
};

const electionStatusToPrisma: Record<ElectionStatusValue, ElectionStatus> = {
  draft: ElectionStatus.DRAFT,
  active: ElectionStatus.ACTIVE,
  closed: ElectionStatus.CLOSED,
  archived: ElectionStatus.ARCHIVED
};

const campaignStatusToApi: Record<CampaignStatus, CampaignStatusValue> = {
  DRAFT: "draft",
  ACTIVE: "active",
  CLOSED: "closed"
};

const campaignStatusToPrisma: Record<CampaignStatusValue, CampaignStatus> = {
  draft: CampaignStatus.DRAFT,
  active: CampaignStatus.ACTIVE,
  closed: CampaignStatus.CLOSED
};

const identityModeToApi: Record<IdentityMode, IdentityModeValue> = {
  SOFT_IDENTITY: "soft_identity",
  INVITE_TOKEN_OPTIONAL: "invite_token_optional"
};

const identityModeToPrisma: Record<IdentityModeValue, IdentityMode> = {
  soft_identity: IdentityMode.SOFT_IDENTITY,
  invite_token_optional: IdentityMode.INVITE_TOKEN_OPTIONAL
};

const duplicatePolicyToApi: Record<DuplicateIdentityPolicy, DuplicateIdentityPolicyValue> = {
  COUNT_WITH_RISK: "count_with_risk",
  REVIEW: "review",
  BLOCK: "block"
};

const duplicatePolicyToPrisma: Record<DuplicateIdentityPolicyValue, DuplicateIdentityPolicy> = {
  count_with_risk: DuplicateIdentityPolicy.COUNT_WITH_RISK,
  review: DuplicateIdentityPolicy.REVIEW,
  block: DuplicateIdentityPolicy.BLOCK
};

function toDate(value: string): Date {
  return new Date(value);
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function mapElection(election: {
  id: string;
  organizerId: string;
  title: string;
  description: string | null;
  status: ElectionStatus;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): ElectionDto {
  return {
    id: election.id,
    organizerId: election.organizerId,
    title: election.title,
    description: election.description,
    status: electionStatusToApi[election.status],
    startsAt: toIso(election.startsAt),
    endsAt: toIso(election.endsAt),
    createdAt: election.createdAt.toISOString(),
    updatedAt: election.updatedAt.toISOString()
  };
}

function mapCampaign(campaign: {
  id: string;
  electionId: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  identityMode: IdentityMode;
  startsAt: Date | null;
  endsAt: Date | null;
  allowReviewQueue: boolean;
  duplicateIdentityPolicy: DuplicateIdentityPolicy;
  createdAt: Date;
  updatedAt: Date;
}): CampaignDto {
  return {
    id: campaign.id,
    electionId: campaign.electionId,
    title: campaign.title,
    description: campaign.description,
    status: campaignStatusToApi[campaign.status],
    identityMode: identityModeToApi[campaign.identityMode],
    startsAt: toIso(campaign.startsAt),
    endsAt: toIso(campaign.endsAt),
    allowReviewQueue: campaign.allowReviewQueue,
    duplicateIdentityPolicy: duplicatePolicyToApi[campaign.duplicateIdentityPolicy],
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString()
  };
}

function mapOption(option: {
  id: string;
  campaignId: string;
  label: string;
  description: string | null;
  position: number;
  isActive: boolean;
  createdAt: Date;
}): CampaignOptionDto {
  return {
    id: option.id,
    campaignId: option.campaignId,
    label: option.label,
    description: option.description,
    position: option.position,
    isActive: option.isActive,
    createdAt: option.createdAt.toISOString()
  };
}

export class PrismaOrganizerService implements OrganizerService {
  constructor(private readonly prisma: PrismaClient) {}

  async createElection(organizerId: string, input: CreateElectionInput): Promise<ElectionDto> {
    const data: Prisma.ElectionUncheckedCreateInput = {
      organizerId,
      title: input.title
    };

    if (input.description !== undefined) data.description = input.description;
    if (input.startsAt !== undefined) data.startsAt = toDate(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = toDate(input.endsAt);

    const election = await this.prisma.election.create({
      data
    });

    await this.audit(organizerId, "election.created", {
      electionId: election.id
    });

    return mapElection(election);
  }

  async listElections(organizerId: string): Promise<ElectionDto[]> {
    const elections = await this.prisma.election.findMany({
      where: { organizerId },
      orderBy: { createdAt: "desc" }
    });

    return elections.map(mapElection);
  }

  async getElection(organizerId: string, electionId: string): Promise<ElectionDto> {
    const election = await this.findOwnedElection(organizerId, electionId);
    return mapElection(election);
  }

  async updateElection(
    organizerId: string,
    electionId: string,
    input: UpdateElectionInput
  ): Promise<ElectionDto> {
    await this.findOwnedElection(organizerId, electionId);

    const data: Prisma.ElectionUncheckedUpdateInput = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.startsAt !== undefined) data.startsAt = toDate(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = toDate(input.endsAt);

    const election = await this.prisma.election.update({
      where: { id: electionId },
      data
    });

    await this.audit(organizerId, "election.updated", { electionId });

    return mapElection(election);
  }

  async setElectionStatus(
    organizerId: string,
    electionId: string,
    status: ElectionStatusValue
  ): Promise<ElectionDto> {
    await this.findOwnedElection(organizerId, electionId);

    const election = await this.prisma.election.update({
      where: { id: electionId },
      data: {
        status: electionStatusToPrisma[status]
      }
    });

    await this.audit(organizerId, `election.${status}`, { electionId });

    return mapElection(election);
  }

  async createCampaign(
    organizerId: string,
    electionId: string,
    input: CreateCampaignInput
  ): Promise<CampaignDto> {
    await this.findOwnedElection(organizerId, electionId);

    const data: Prisma.CampaignUncheckedCreateInput = {
      electionId,
      title: input.title
    };

    if (input.description !== undefined) data.description = input.description;
    if (input.identityMode !== undefined) data.identityMode = identityModeToPrisma[input.identityMode];
    if (input.startsAt !== undefined) data.startsAt = toDate(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = toDate(input.endsAt);
    if (input.allowReviewQueue !== undefined) data.allowReviewQueue = input.allowReviewQueue;
    if (input.duplicateIdentityPolicy !== undefined) {
      data.duplicateIdentityPolicy = duplicatePolicyToPrisma[input.duplicateIdentityPolicy];
    }

    const campaign = await this.prisma.campaign.create({
      data
    });

    await this.audit(organizerId, "campaign.created", {
      electionId,
      campaignId: campaign.id
    });

    return mapCampaign(campaign);
  }

  async listCampaigns(organizerId: string, electionId: string): Promise<CampaignDto[]> {
    await this.findOwnedElection(organizerId, electionId);

    const campaigns = await this.prisma.campaign.findMany({
      where: { electionId },
      orderBy: { createdAt: "desc" }
    });

    return campaigns.map(mapCampaign);
  }

  async getCampaign(organizerId: string, campaignId: string): Promise<CampaignDto> {
    const campaign = await this.findOwnedCampaign(organizerId, campaignId);
    return mapCampaign(campaign);
  }

  async updateCampaign(
    organizerId: string,
    campaignId: string,
    input: UpdateCampaignInput
  ): Promise<CampaignDto> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const data: Prisma.CampaignUncheckedUpdateInput = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.identityMode !== undefined) data.identityMode = identityModeToPrisma[input.identityMode];
    if (input.startsAt !== undefined) data.startsAt = toDate(input.startsAt);
    if (input.endsAt !== undefined) data.endsAt = toDate(input.endsAt);
    if (input.allowReviewQueue !== undefined) data.allowReviewQueue = input.allowReviewQueue;
    if (input.duplicateIdentityPolicy !== undefined) {
      data.duplicateIdentityPolicy = duplicatePolicyToPrisma[input.duplicateIdentityPolicy];
    }

    const campaign = await this.prisma.campaign.update({
      where: { id: campaignId },
      data
    });

    await this.audit(organizerId, "campaign.updated", { campaignId });

    return mapCampaign(campaign);
  }

  async setCampaignStatus(
    organizerId: string,
    campaignId: string,
    status: CampaignStatusValue
  ): Promise<CampaignDto> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const campaign = await this.prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: campaignStatusToPrisma[status]
      }
    });

    await this.audit(organizerId, `campaign.${status}`, { campaignId });

    return mapCampaign(campaign);
  }

  async createOption(
    organizerId: string,
    campaignId: string,
    input: CreateOptionInput
  ): Promise<CampaignOptionDto> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const data: Prisma.CampaignOptionUncheckedCreateInput = {
      campaignId,
      label: input.label,
      position: input.position
    };

    if (input.description !== undefined) data.description = input.description;

    const option = await this.prisma.campaignOption.create({
      data
    });

    await this.audit(organizerId, "campaign_option.created", {
      campaignId,
      optionId: option.id
    });

    return mapOption(option);
  }

  async updateOption(
    organizerId: string,
    campaignId: string,
    optionId: string,
    input: UpdateOptionInput
  ): Promise<CampaignOptionDto> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const existing = await this.prisma.campaignOption.findFirst({
      where: {
        id: optionId,
        campaignId
      }
    });

    if (!existing) {
      throw notFound("Campaign option was not found.");
    }

    const data: Prisma.CampaignOptionUncheckedUpdateInput = {};

    if (input.label !== undefined) data.label = input.label;
    if (input.description !== undefined) data.description = input.description;
    if (input.position !== undefined) data.position = input.position;
    if (input.isActive !== undefined) data.isActive = input.isActive;

    const option = await this.prisma.campaignOption.update({
      where: { id: optionId },
      data
    });

    await this.audit(organizerId, "campaign_option.updated", {
      campaignId,
      optionId
    });

    return mapOption(option);
  }

  async deleteOption(organizerId: string, campaignId: string, optionId: string): Promise<void> {
    await this.findOwnedCampaign(organizerId, campaignId);

    const existing = await this.prisma.campaignOption.findFirst({
      where: {
        id: optionId,
        campaignId
      }
    });

    if (!existing) {
      throw notFound("Campaign option was not found.");
    }

    await this.prisma.campaignOption.delete({
      where: { id: optionId }
    });

    await this.audit(organizerId, "campaign_option.deleted", {
      campaignId,
      optionId
    });
  }

  private async findOwnedElection(organizerId: string, electionId: string) {
    const election = await this.prisma.election.findUnique({
      where: { id: electionId }
    });

    if (!election) {
      throw notFound("Election was not found.");
    }

    if (election.organizerId !== organizerId) {
      throw forbidden("You do not have access to this election.");
    }

    return election;
  }

  private async findOwnedCampaign(organizerId: string, campaignId: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        election: {
          select: {
            organizerId: true
          }
        }
      }
    });

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    if (campaign.election.organizerId !== organizerId) {
      throw forbidden("You do not have access to this campaign.");
    }

    return campaign;
  }

  private async audit(
    organizerId: string,
    action: string,
    metadata: Prisma.InputJsonObject
  ): Promise<void> {
    const data: Prisma.AuditLogUncheckedCreateInput = {
      actorUserId: organizerId,
      action,
      metadata
    };

    if (typeof metadata.electionId === "string") data.electionId = metadata.electionId;
    if (typeof metadata.campaignId === "string") data.campaignId = metadata.campaignId;

    await this.prisma.auditLog.create({
      data
    });
  }
}
