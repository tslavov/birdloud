import { randomUUID } from "node:crypto";
import { forbidden, notFound } from "../../src/http/errors.js";
import type {
  CampaignDto,
  CampaignOptionDto,
  CampaignStatusValue,
  CreateCampaignInput,
  CreateElectionInput,
  CreateOptionInput,
  ElectionDto,
  ElectionStatusValue,
  OrganizerService,
  UpdateCampaignInput,
  UpdateElectionInput,
  UpdateOptionInput
} from "../../src/services/organizer.js";

export class MemoryOrganizerService implements OrganizerService {
  readonly elections = new Map<string, ElectionDto>();
  readonly campaigns = new Map<string, CampaignDto>();
  readonly options = new Map<string, CampaignOptionDto>();

  async createElection(organizerId: string, input: CreateElectionInput): Promise<ElectionDto> {
    const now = new Date().toISOString();
    const election: ElectionDto = {
      id: randomUUID(),
      organizerId,
      title: input.title,
      description: input.description ?? null,
      status: "draft",
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      createdAt: now,
      updatedAt: now
    };

    this.elections.set(election.id, election);
    return election;
  }

  async listElections(organizerId: string): Promise<ElectionDto[]> {
    return [...this.elections.values()].filter((election) => election.organizerId === organizerId);
  }

  async getElection(organizerId: string, electionId: string): Promise<ElectionDto> {
    return this.getOwnedElection(organizerId, electionId);
  }

  async updateElection(
    organizerId: string,
    electionId: string,
    input: UpdateElectionInput
  ): Promise<ElectionDto> {
    const election = this.getOwnedElection(organizerId, electionId);
    const updated: ElectionDto = {
      ...election,
      title: input.title ?? election.title,
      description: input.description ?? election.description,
      startsAt: input.startsAt ?? election.startsAt,
      endsAt: input.endsAt ?? election.endsAt,
      updatedAt: new Date().toISOString()
    };

    this.elections.set(electionId, updated);
    return updated;
  }

  async setElectionStatus(
    organizerId: string,
    electionId: string,
    status: ElectionStatusValue
  ): Promise<ElectionDto> {
    const election = this.getOwnedElection(organizerId, electionId);
    const updated = {
      ...election,
      status,
      updatedAt: new Date().toISOString()
    };

    this.elections.set(electionId, updated);
    return updated;
  }

  async createCampaign(
    organizerId: string,
    electionId: string,
    input: CreateCampaignInput
  ): Promise<CampaignDto> {
    this.getOwnedElection(organizerId, electionId);
    const now = new Date().toISOString();
    const campaign: CampaignDto = {
      id: randomUUID(),
      electionId,
      title: input.title,
      description: input.description ?? null,
      status: "draft",
      identityMode: input.identityMode ?? "soft_identity",
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      allowReviewQueue: input.allowReviewQueue ?? true,
      duplicateIdentityPolicy: input.duplicateIdentityPolicy ?? "review",
      createdAt: now,
      updatedAt: now
    };

    this.campaigns.set(campaign.id, campaign);
    return campaign;
  }

  async listCampaigns(organizerId: string, electionId: string): Promise<CampaignDto[]> {
    this.getOwnedElection(organizerId, electionId);
    return [...this.campaigns.values()].filter((campaign) => campaign.electionId === electionId);
  }

  async getCampaign(organizerId: string, campaignId: string): Promise<CampaignDto> {
    return this.getOwnedCampaign(organizerId, campaignId);
  }

  async updateCampaign(
    organizerId: string,
    campaignId: string,
    input: UpdateCampaignInput
  ): Promise<CampaignDto> {
    const campaign = this.getOwnedCampaign(organizerId, campaignId);
    const updated: CampaignDto = {
      ...campaign,
      title: input.title ?? campaign.title,
      description: input.description ?? campaign.description,
      identityMode: input.identityMode ?? campaign.identityMode,
      startsAt: input.startsAt ?? campaign.startsAt,
      endsAt: input.endsAt ?? campaign.endsAt,
      allowReviewQueue: input.allowReviewQueue ?? campaign.allowReviewQueue,
      duplicateIdentityPolicy: input.duplicateIdentityPolicy ?? campaign.duplicateIdentityPolicy,
      updatedAt: new Date().toISOString()
    };

    this.campaigns.set(campaignId, updated);
    return updated;
  }

  async setCampaignStatus(
    organizerId: string,
    campaignId: string,
    status: CampaignStatusValue
  ): Promise<CampaignDto> {
    const campaign = this.getOwnedCampaign(organizerId, campaignId);
    const updated = {
      ...campaign,
      status,
      updatedAt: new Date().toISOString()
    };

    this.campaigns.set(campaignId, updated);
    return updated;
  }

  async createOption(
    organizerId: string,
    campaignId: string,
    input: CreateOptionInput
  ): Promise<CampaignOptionDto> {
    this.getOwnedCampaign(organizerId, campaignId);
    const option: CampaignOptionDto = {
      id: randomUUID(),
      campaignId,
      label: input.label,
      description: input.description ?? null,
      position: input.position,
      isActive: true,
      createdAt: new Date().toISOString()
    };

    this.options.set(option.id, option);
    return option;
  }

  async updateOption(
    organizerId: string,
    campaignId: string,
    optionId: string,
    input: UpdateOptionInput
  ): Promise<CampaignOptionDto> {
    this.getOwnedCampaign(organizerId, campaignId);
    const option = this.options.get(optionId);

    if (!option || option.campaignId !== campaignId) {
      throw notFound("Campaign option was not found.");
    }

    const updated: CampaignOptionDto = {
      ...option,
      label: input.label ?? option.label,
      description: input.description ?? option.description,
      position: input.position ?? option.position,
      isActive: input.isActive ?? option.isActive
    };

    this.options.set(optionId, updated);
    return updated;
  }

  async deleteOption(
    organizerId: string,
    campaignId: string,
    optionId: string
  ): Promise<void> {
    this.getOwnedCampaign(organizerId, campaignId);
    const option = this.options.get(optionId);

    if (!option || option.campaignId !== campaignId) {
      throw notFound("Campaign option was not found.");
    }

    this.options.delete(optionId);
  }

  private getOwnedElection(organizerId: string, electionId: string): ElectionDto {
    const election = this.elections.get(electionId);

    if (!election) {
      throw notFound("Election was not found.");
    }

    if (election.organizerId !== organizerId) {
      throw forbidden("You do not have access to this election.");
    }

    return election;
  }

  private getOwnedCampaign(organizerId: string, campaignId: string): CampaignDto {
    const campaign = this.campaigns.get(campaignId);

    if (!campaign) {
      throw notFound("Campaign was not found.");
    }

    this.getOwnedElection(organizerId, campaign.electionId);
    return campaign;
  }
}
