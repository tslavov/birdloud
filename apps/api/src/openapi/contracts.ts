import {
  exportQuery,
  exportResponse,
  receiptParams,
  schemaRef,
  uuidParams
} from "./schemas.js";

const error = schemaRef("ErrorResponse");
const organizerErrors = {
  400: error,
  401: error,
  403: error,
  404: error,
  409: error,
  429: error,
  500: error
} as const;
const publicErrors = {
  400: error,
  403: error,
  404: error,
  409: error,
  429: error,
  500: error
} as const;
const organizerSecurity = [{ cookieAuth: [] }] as const;

function organizerOperation(operationId: string, summary: string) {
  return {
    operationId,
    summary,
    tags: ["organizer"],
    security: organizerSecurity
  } as const;
}

function voterOperation(operationId: string, summary: string) {
  return {
    operationId,
    summary,
    tags: ["voter"],
    security: []
  } as const;
}

export const ORGANIZER_API_CONTRACT = {
  createElection: {
    ...organizerOperation("createElection", "Create an election"),
    body: schemaRef("CreateElectionRequest"),
    response: { 201: schemaRef("Election"), ...organizerErrors }
  },
  listElections: {
    ...organizerOperation("listElections", "List the organizer's elections"),
    response: {
      200: { type: "array", items: schemaRef("Election") },
      ...organizerErrors
    }
  },
  getElection: {
    ...organizerOperation("getElection", "Get an election"),
    params: uuidParams("electionId"),
    response: { 200: schemaRef("Election"), ...organizerErrors }
  },
  updateElection: {
    ...organizerOperation("updateElection", "Update an election"),
    params: uuidParams("electionId"),
    body: schemaRef("UpdateElectionRequest"),
    response: { 200: schemaRef("Election"), ...organizerErrors }
  },
  activateElection: {
    ...organizerOperation("activateElection", "Activate an election"),
    params: uuidParams("electionId"),
    response: { 200: schemaRef("Election"), ...organizerErrors }
  },
  closeElection: {
    ...organizerOperation("closeElection", "Close an election"),
    params: uuidParams("electionId"),
    response: { 200: schemaRef("Election"), ...organizerErrors }
  },
  archiveElection: {
    ...organizerOperation("archiveElection", "Archive an election"),
    params: uuidParams("electionId"),
    response: { 200: schemaRef("Election"), ...organizerErrors }
  },
  createCampaign: {
    ...organizerOperation("createCampaign", "Create a campaign in an election"),
    params: uuidParams("electionId"),
    body: schemaRef("CreateCampaignRequest"),
    response: { 201: schemaRef("Campaign"), ...organizerErrors }
  },
  listCampaigns: {
    ...organizerOperation("listCampaigns", "List campaigns in an election"),
    params: uuidParams("electionId"),
    response: {
      200: { type: "array", items: schemaRef("Campaign") },
      ...organizerErrors
    }
  },
  getCampaign: {
    ...organizerOperation("getOrganizerCampaign", "Get an organizer campaign"),
    params: uuidParams("campaignId"),
    response: { 200: schemaRef("Campaign"), ...organizerErrors }
  },
  updateCampaign: {
    ...organizerOperation("updateCampaign", "Update a campaign"),
    params: uuidParams("campaignId"),
    body: schemaRef("UpdateCampaignRequest"),
    response: { 200: schemaRef("Campaign"), ...organizerErrors }
  },
  activateCampaign: {
    ...organizerOperation("activateCampaign", "Activate a campaign"),
    params: uuidParams("campaignId"),
    response: { 200: schemaRef("Campaign"), ...organizerErrors }
  },
  closeCampaign: {
    ...organizerOperation("closeCampaign", "Close a campaign"),
    params: uuidParams("campaignId"),
    response: { 200: schemaRef("Campaign"), ...organizerErrors }
  },
  createCampaignOption: {
    ...organizerOperation("createCampaignOption", "Create a campaign option"),
    params: uuidParams("campaignId"),
    body: schemaRef("CreateCampaignOptionRequest"),
    response: { 201: schemaRef("CampaignOption"), ...organizerErrors }
  },
  updateCampaignOption: {
    ...organizerOperation("updateCampaignOption", "Update a campaign option"),
    params: uuidParams("campaignId", "optionId"),
    body: schemaRef("UpdateCampaignOptionRequest"),
    response: { 200: schemaRef("CampaignOption"), ...organizerErrors }
  },
  deleteCampaignOption: {
    ...organizerOperation("deleteCampaignOption", "Delete a campaign option"),
    params: uuidParams("campaignId", "optionId"),
    response: { 204: { type: "null" }, ...organizerErrors }
  }
} as const;

export const VOTING_API_CONTRACT = {
  issueVoterTokens: {
    ...organizerOperation("issueVoterTokens", "Issue one-time voter invite tokens"),
    params: uuidParams("campaignId"),
    body: schemaRef("IssueVoterTokensRequest"),
    response: { 201: schemaRef("IssuedVoterTokens"), ...organizerErrors }
  },
  getVoterTokenSummary: {
    ...organizerOperation("getVoterTokenSummary", "Get voter token status counts"),
    params: uuidParams("campaignId"),
    response: { 200: schemaRef("VoterTokenSummary"), ...organizerErrors }
  },
  revokeVoterToken: {
    ...organizerOperation("revokeVoterToken", "Revoke an active voter token"),
    params: uuidParams("campaignId", "tokenId"),
    response: { 204: { type: "null" }, ...organizerErrors }
  },
  listReviewVotes: {
    ...organizerOperation("listReviewVotes", "List votes awaiting organizer review"),
    params: uuidParams("campaignId"),
    response: {
      200: { type: "array", items: schemaRef("ReviewVote") },
      ...organizerErrors
    }
  },
  getCampaignResults: {
    ...organizerOperation("getCampaignResults", "Get campaign results with integrity context"),
    params: uuidParams("campaignId"),
    response: { 200: schemaRef("CampaignResults"), ...organizerErrors }
  },
  getCampaignIntegrity: {
    ...organizerOperation("getCampaignIntegrity", "Get campaign integrity metrics and signals"),
    params: uuidParams("campaignId"),
    response: { 200: schemaRef("CampaignIntegrity"), ...organizerErrors }
  },
  exportCampaignReport: {
    ...organizerOperation("exportCampaignReport", "Export aggregate campaign results"),
    description: "Exports aggregate data only; no voter identity evidence or selected-vote receipts are included.",
    params: uuidParams("campaignId"),
    querystring: exportQuery,
    response: { 200: exportResponse, ...organizerErrors }
  },
  approveReviewVote: {
    ...organizerOperation("approveReviewVote", "Approve an under-review vote"),
    params: uuidParams("campaignId", "voteId"),
    response: { 200: schemaRef("ReviewResolution"), ...organizerErrors }
  },
  rejectReviewVote: {
    ...organizerOperation("rejectReviewVote", "Reject an under-review vote"),
    params: uuidParams("campaignId", "voteId"),
    response: { 200: schemaRef("ReviewResolution"), ...organizerErrors }
  },
  getPublicCampaign: {
    ...voterOperation("getPublicCampaign", "Get public campaign details and active options"),
    params: uuidParams("campaignId"),
    response: { 200: schemaRef("PublicCampaign"), ...publicErrors }
  },
  requestEmailVerification: {
    ...voterOperation("requestEmailVerification", "Send a campaign-scoped voter verification email"),
    params: uuidParams("campaignId"),
    body: schemaRef("RequestEmailVerification"),
    response: {
      202: schemaRef("EmailVerificationRequested"),
      503: error,
      ...publicErrors
    }
  },
  verifyEmail: {
    ...voterOperation("verifyVoterEmail", "Exchange an email link token for a one-time vote proof"),
    params: uuidParams("campaignId"),
    body: schemaRef("VerifyEmailRequest"),
    response: { 200: schemaRef("EmailVerified"), ...publicErrors }
  },
  submitVote: {
    ...voterOperation("submitVote", "Submit an idempotent verified vote"),
    description:
      "Requires a one-time verified-email proof and server-verified bot token. Idempotent retries return the original receipt; the selected option is never exposed by receipt verification.",
    params: uuidParams("campaignId"),
    body: schemaRef("SubmitVoteRequest"),
    response: {
      201: schemaRef("CountedVoteResponse"),
      202: schemaRef("PendingVoteResponse"),
      503: error,
      ...publicErrors
    }
  },
  verifyReceipt: {
    ...voterOperation("verifyVoteReceipt", "Verify a receipt without revealing the selected option"),
    params: receiptParams,
    response: { 200: schemaRef("ReceiptStatus"), ...publicErrors }
  }
} as const;
