export const API_BASE_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

export type OrganizerSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "ORGANIZER" | "ADMIN" | string;
  };
};

export type Election = {
  id: string;
  organizerId: string;
  title: string;
  description: string | null;
  status: "draft" | "active" | "closed" | "archived";
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Campaign = {
  id: string;
  electionId: string;
  title: string;
  description: string | null;
  status: "draft" | "active" | "closed";
  identityMode: "soft_identity" | "invite_token_optional";
  startsAt: string | null;
  endsAt: string | null;
  allowReviewQueue: boolean;
  duplicateIdentityPolicy: "count_with_risk" | "review" | "block";
  createdAt: string;
  updatedAt: string;
};

export type CampaignOption = {
  id: string;
  campaignId: string;
  label: string;
  description: string | null;
  position: number;
  isActive: boolean;
  createdAt: string;
};

export type PublicCampaign = {
  id: string;
  electionId: string;
  title: string;
  description: string | null;
  status: "draft" | "active" | "closed";
  startsAt: string | null;
  endsAt: string | null;
  options: Array<{
    id: string;
    label: string;
    description: string | null;
    position: number;
  }>;
};

export type ReviewVote = {
  id: string;
  campaignId: string;
  optionId: string;
  status: "under_review";
  confidenceLevel: "high" | "medium" | "low";
  riskScore: number;
  reviewReason: string | null;
  createdAt: string;
};

export type ReviewResolution = Omit<ReviewVote, "status"> & {
  status: "counted" | "rejected";
  reviewedAt: string;
};

export type CampaignOptionResult = {
  optionId: string;
  label: string;
  countedVotes: number;
  delayedVotes: number;
  underReviewVotes: number;
  rejectedVotes: number;
};

export type CampaignResults = {
  campaignId: string;
  status: "draft" | "active" | "closed";
  countedVotes: number;
  delayedVotes: number;
  underReviewVotes: number;
  blockedVotes: number;
  rejectedVotes: number;
  blockedAttempts: number;
  duplicateAttempts: number;
  highConfidenceVotes: number;
  mediumConfidenceVotes: number;
  lowConfidenceVotes: number;
  integrityScore: number;
  options: CampaignOptionResult[];
};

export type CampaignIntegrity = Omit<CampaignResults, "status" | "integrityScore" | "options"> & {
  integrityScore: number;
  signals: Array<{
    code: string;
    label: string;
    value: number;
    severity: "info" | "warning" | "critical";
  }>;
};

export type VoteResponse = {
  voteId: string;
  receipt: string;
  status: "counted" | "delayed" | "under_review";
  confidenceLevel: "high" | "medium" | "low";
  message: string;
};

export type ReceiptStatus = {
  status: "recorded";
  voteStatus: "counted" | "delayed" | "under_review" | "blocked" | "rejected";
  recordedAt: string;
};

export const api = {
  async getSession(): Promise<OrganizerSession | null> {
    try {
      return await request<OrganizerSession | null>("/api/auth/get-session");
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 401) return null;
      throw error;
    }
  },

  signIn(input: { email: string; password: string }) {
    return request<unknown>("/api/auth/sign-in/email", { method: "POST", body: input });
  },

  signUp(input: { name: string; email: string; password: string }) {
    return request<unknown>("/api/auth/sign-up/email", { method: "POST", body: input });
  },

  signOut() {
    return request<unknown>("/api/auth/sign-out", { method: "POST" });
  },

  listElections() {
    return request<Election[]>("/api/organizer/elections");
  },

  createElection(input: {
    title: string;
    description?: string;
    startsAt?: string;
    endsAt?: string;
  }) {
    return request<Election>("/api/organizer/elections", { method: "POST", body: input });
  },

  getElection(electionId: string) {
    return request<Election>(`/api/organizer/elections/${electionId}`);
  },

  setElectionStatus(electionId: string, status: "activate" | "close" | "archive") {
    return request<Election>(`/api/organizer/elections/${electionId}/${status}`, {
      method: "POST"
    });
  },

  listCampaigns(electionId: string) {
    return request<Campaign[]>(`/api/organizer/elections/${electionId}/campaigns`);
  },

  createCampaign(
    electionId: string,
    input: {
      title: string;
      description?: string;
      identityMode?: Campaign["identityMode"];
      startsAt?: string;
      endsAt?: string;
      allowReviewQueue?: boolean;
      duplicateIdentityPolicy?: Campaign["duplicateIdentityPolicy"];
    }
  ) {
    return request<Campaign>(`/api/organizer/elections/${electionId}/campaigns`, {
      method: "POST",
      body: input
    });
  },

  getCampaign(campaignId: string) {
    return request<Campaign>(`/api/organizer/campaigns/${campaignId}`);
  },

  setCampaignStatus(campaignId: string, status: "activate" | "close") {
    return request<Campaign>(`/api/organizer/campaigns/${campaignId}/${status}`, {
      method: "POST"
    });
  },

  createOption(campaignId: string, input: { label: string; description?: string; position: number }) {
    return request<CampaignOption>(`/api/organizer/campaigns/${campaignId}/options`, {
      method: "POST",
      body: input
    });
  },

  updateOption(
    campaignId: string,
    optionId: string,
    input: { label?: string; description?: string; position?: number; isActive?: boolean }
  ) {
    return request<CampaignOption>(
      `/api/organizer/campaigns/${campaignId}/options/${optionId}`,
      { method: "PATCH", body: input }
    );
  },

  deleteOption(campaignId: string, optionId: string) {
    return request<void>(`/api/organizer/campaigns/${campaignId}/options/${optionId}`, {
      method: "DELETE"
    });
  },

  getPublicCampaign(campaignId: string) {
    return request<PublicCampaign>(`/api/campaigns/${campaignId}`);
  },

  issueTokens(campaignId: string, input: { count: number; issuedLabel?: string }) {
    return request<{ tokens: Array<{ id: string; token: string }> }>(
      `/api/organizer/campaigns/${campaignId}/voter-tokens`,
      { method: "POST", body: input }
    );
  },

  getTokenSummary(campaignId: string) {
    return request<{ active: number; used: number; revoked: number; expired: number }>(
      `/api/organizer/campaigns/${campaignId}/voter-tokens/summary`
    );
  },

  listReviewVotes(campaignId: string) {
    return request<ReviewVote[]>(`/api/organizer/campaigns/${campaignId}/review`);
  },

  resolveReviewVote(campaignId: string, voteId: string, decision: "approve" | "reject") {
    return request<ReviewResolution>(
      `/api/organizer/campaigns/${campaignId}/review/${voteId}/${decision}`,
      { method: "POST" }
    );
  },

  getCampaignResults(campaignId: string) {
    return request<CampaignResults>(`/api/organizer/campaigns/${campaignId}/results`);
  },

  getCampaignIntegrity(campaignId: string) {
    return request<CampaignIntegrity>(`/api/organizer/campaigns/${campaignId}/integrity`);
  },

  requestEmailVerification(campaignId: string, email: string) {
    return request<{ status: "verification_sent"; expiresInSeconds: number }>(
      `/api/campaigns/${campaignId}/identity/email/start`,
      { method: "POST", body: { email } }
    );
  },

  verifyEmail(campaignId: string, token: string) {
    return verifyEmailOnce(campaignId, token);
  },

  submitVote(
    campaignId: string,
    input: {
      optionId: string;
      idempotencyKey: string;
      identity: { provider: "email"; proof: string };
      botProtectionToken: string;
      inviteToken?: string;
      deviceId?: string;
    }
  ) {
    return request<VoteResponse>(`/api/campaigns/${campaignId}/votes`, {
      method: "POST",
      body: input
    });
  },

  verifyReceipt(campaignId: string, receipt: string) {
    return request<ReceiptStatus>(
      `/api/campaigns/${campaignId}/receipts/${encodeURIComponent(receipt)}`
    );
  },

  async downloadCampaignExport(campaignId: string, format: "json" | "csv") {
    const response = await fetchApi(
      `/api/organizer/campaigns/${campaignId}/export?format=${format}`
    );
    if (!response.ok) await throwResponseError(response);
    const disposition = response.headers.get("content-disposition") ?? "";
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `birdloud-results.${format}`;
    return { filename, blob: await response.blob() };
  }
};

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
};

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await fetchApi(path, options);
  if (!response.ok) await throwResponseError(response);
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

function fetchApi(path: string, options: RequestOptions = {}) {
  const init: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include"
  };

  if (options.body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(options.body);
  }

  return fetch(`${API_BASE_URL}${path}`, init);
}

async function throwResponseError(response: Response): Promise<never> {
  let payload: unknown;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    payload = null;
  }

  const envelope =
    typeof payload === "object" && payload !== null && "error" in payload
      ? (payload.error as Record<string, unknown>)
      : typeof payload === "object" && payload !== null
        ? (payload as Record<string, unknown>)
        : {};
  const code = typeof envelope.code === "string" ? envelope.code : `HTTP_${response.status}`;
  const message =
    typeof envelope.message === "string" ? envelope.message : "The request could not be completed.";
  const details =
    typeof envelope.details === "object" && envelope.details !== null
      ? (envelope.details as Record<string, unknown>)
      : {};

  throw new ApiClientError(response.status, code, message, details);
}

const emailVerificationExchanges = new Map<
  string,
  Promise<{ status: "verified"; identityProof: string; expiresAt: string }>
>();

function verifyEmailOnce(campaignId: string, token: string) {
  const key = `${campaignId}:${token}`;
  const existing = emailVerificationExchanges.get(key);
  if (existing) return existing;

  const exchange = request<{ status: "verified"; identityProof: string; expiresAt: string }>(
    `/api/campaigns/${campaignId}/identity/email/verify`,
    { method: "POST", body: { token } }
  );
  emailVerificationExchanges.set(key, exchange);
  return exchange;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request could not be completed.";
}
