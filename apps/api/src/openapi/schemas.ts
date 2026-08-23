const uuid = { type: "string", format: "uuid" } as const;
const dateTime = { type: "string", format: "date-time" } as const;
const nullableDateTime = { ...dateTime, nullable: true } as const;
const nullableString = { type: "string", nullable: true } as const;
const nonNegativeInteger = { type: "integer", minimum: 0 } as const;
const confidenceLevel = { type: "string", enum: ["high", "medium", "low"] } as const;

const electionProperties = {
  id: uuid,
  organizerId: uuid,
  title: { type: "string" },
  description: nullableString,
  status: { type: "string", enum: ["draft", "active", "closed", "archived"] },
  startsAt: nullableDateTime,
  endsAt: nullableDateTime,
  createdAt: dateTime,
  updatedAt: dateTime
} as const;

const campaignProperties = {
  id: uuid,
  electionId: uuid,
  title: { type: "string" },
  description: nullableString,
  status: { type: "string", enum: ["draft", "active", "closed"] },
  identityMode: { type: "string", enum: ["soft_identity", "invite_token_optional"] },
  startsAt: nullableDateTime,
  endsAt: nullableDateTime,
  allowReviewQueue: { type: "boolean" },
  duplicateIdentityPolicy: {
    type: "string",
    enum: ["count_with_risk", "review", "block"]
  },
  createdAt: dateTime,
  updatedAt: dateTime
} as const;

const optionResultProperties = {
  optionId: uuid,
  label: { type: "string" },
  countedVotes: nonNegativeInteger,
  delayedVotes: nonNegativeInteger,
  underReviewVotes: nonNegativeInteger,
  rejectedVotes: nonNegativeInteger
} as const;

const campaignMetricsProperties = {
  countedVotes: nonNegativeInteger,
  delayedVotes: nonNegativeInteger,
  underReviewVotes: nonNegativeInteger,
  blockedVotes: nonNegativeInteger,
  rejectedVotes: nonNegativeInteger,
  blockedAttempts: nonNegativeInteger,
  duplicateAttempts: nonNegativeInteger,
  highConfidenceVotes: nonNegativeInteger,
  mediumConfidenceVotes: nonNegativeInteger,
  lowConfidenceVotes: nonNegativeInteger
} as const;

const createElectionProperties = {
  title: { type: "string", minLength: 1, maxLength: 160 },
  description: { type: "string", maxLength: 2000 },
  startsAt: dateTime,
  endsAt: dateTime
} as const;

const createCampaignProperties = {
  title: { type: "string", minLength: 1, maxLength: 160 },
  description: { type: "string", maxLength: 2000 },
  identityMode: { type: "string", enum: ["soft_identity", "invite_token_optional"] },
  startsAt: dateTime,
  endsAt: dateTime,
  allowReviewQueue: { type: "boolean" },
  duplicateIdentityPolicy: {
    type: "string",
    enum: ["count_with_risk", "review", "block"]
  }
} as const;

export const OPEN_API_SCHEMAS = [
  {
    $id: "ErrorResponse",
    description: "BirdLoud error envelope.",
    type: "object",
    additionalProperties: false,
    required: ["error"],
    properties: {
      error: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message", "details"],
        properties: {
          code: { type: "string", minLength: 1 },
          message: { type: "string", minLength: 1 },
          details: {
            type: "object",
            additionalProperties: true,
            properties: {
              issues: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["path", "message"],
                  properties: {
                    path: { type: "string" },
                    message: { type: "string" }
                  }
                }
              },
              reason: { type: "string" },
              reasons: { type: "array", items: { type: "string" } },
              riskScore: nonNegativeInteger,
              errorCodes: { type: "array", items: { type: "string" } },
              retryAfter: { type: "string" }
            }
          }
        }
      }
    }
  },
  {
    $id: "Election",
    type: "object",
    additionalProperties: false,
    required: Object.keys(electionProperties),
    properties: electionProperties
  },
  {
    $id: "CreateElectionRequest",
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: createElectionProperties
  },
  {
    $id: "UpdateElectionRequest",
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: createElectionProperties
  },
  {
    $id: "Campaign",
    type: "object",
    additionalProperties: false,
    required: Object.keys(campaignProperties),
    properties: campaignProperties
  },
  {
    $id: "CreateCampaignRequest",
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: createCampaignProperties
  },
  {
    $id: "UpdateCampaignRequest",
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: createCampaignProperties
  },
  {
    $id: "CampaignOption",
    type: "object",
    additionalProperties: false,
    required: ["id", "campaignId", "label", "description", "position", "isActive", "createdAt"],
    properties: {
      id: uuid,
      campaignId: uuid,
      label: { type: "string" },
      description: nullableString,
      position: nonNegativeInteger,
      isActive: { type: "boolean" },
      createdAt: dateTime
    }
  },
  {
    $id: "CreateCampaignOptionRequest",
    type: "object",
    additionalProperties: false,
    required: ["label", "position"],
    properties: {
      label: { type: "string", minLength: 1, maxLength: 160 },
      description: { type: "string", maxLength: 1000 },
      position: nonNegativeInteger
    }
  },
  {
    $id: "UpdateCampaignOptionRequest",
    type: "object",
    additionalProperties: false,
    minProperties: 1,
    properties: {
      label: { type: "string", minLength: 1, maxLength: 160 },
      description: { type: "string", maxLength: 1000 },
      position: nonNegativeInteger,
      isActive: { type: "boolean" }
    }
  },
  {
    $id: "IssueVoterTokensRequest",
    type: "object",
    additionalProperties: false,
    required: ["count"],
    properties: {
      count: { type: "integer", minimum: 1, maximum: 500 },
      issuedLabel: { type: "string", minLength: 1, maxLength: 160 }
    }
  },
  {
    $id: "IssuedVoterTokens",
    type: "object",
    additionalProperties: false,
    required: ["tokens"],
    properties: {
      tokens: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "token"],
          properties: {
            id: uuid,
            token: {
              type: "string",
              pattern: "^ivt_",
              description: "One-time plaintext invite token. It is not returned again."
            }
          }
        }
      }
    }
  },
  {
    $id: "VoterTokenSummary",
    type: "object",
    additionalProperties: false,
    required: ["active", "used", "revoked", "expired"],
    properties: {
      active: nonNegativeInteger,
      used: nonNegativeInteger,
      revoked: nonNegativeInteger,
      expired: nonNegativeInteger
    }
  },
  {
    $id: "ReviewVote",
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "optionId",
      "status",
      "confidenceLevel",
      "riskScore",
      "reviewReason",
      "createdAt"
    ],
    properties: {
      id: uuid,
      campaignId: uuid,
      optionId: uuid,
      status: { type: "string", enum: ["under_review"] },
      confidenceLevel,
      riskScore: nonNegativeInteger,
      reviewReason: nullableString,
      createdAt: dateTime
    }
  },
  {
    $id: "ReviewResolution",
    type: "object",
    additionalProperties: false,
    required: [
      "id",
      "campaignId",
      "optionId",
      "status",
      "confidenceLevel",
      "riskScore",
      "reviewReason",
      "createdAt",
      "reviewedAt"
    ],
    properties: {
      id: uuid,
      campaignId: uuid,
      optionId: uuid,
      status: { type: "string", enum: ["counted", "rejected"] },
      confidenceLevel,
      riskScore: nonNegativeInteger,
      reviewReason: nullableString,
      createdAt: dateTime,
      reviewedAt: dateTime
    }
  },
  {
    $id: "CampaignOptionResult",
    type: "object",
    additionalProperties: false,
    required: Object.keys(optionResultProperties),
    properties: optionResultProperties
  },
  {
    $id: "CampaignResults",
    type: "object",
    additionalProperties: false,
    required: [
      "campaignId",
      "status",
      ...Object.keys(campaignMetricsProperties),
      "integrityScore",
      "options"
    ],
    properties: {
      campaignId: uuid,
      status: { type: "string", enum: ["draft", "active", "closed"] },
      ...campaignMetricsProperties,
      integrityScore: { type: "integer", minimum: 0, maximum: 100 },
      options: { type: "array", items: { $ref: "CampaignOptionResult#" } }
    }
  },
  {
    $id: "IntegritySignal",
    type: "object",
    additionalProperties: false,
    required: ["code", "label", "value", "severity"],
    properties: {
      code: { type: "string" },
      label: { type: "string" },
      value: nonNegativeInteger,
      severity: { type: "string", enum: ["info", "warning", "critical"] }
    }
  },
  {
    $id: "CampaignIntegrity",
    type: "object",
    additionalProperties: false,
    required: [
      "campaignId",
      "integrityScore",
      ...Object.keys(campaignMetricsProperties),
      "signals"
    ],
    properties: {
      campaignId: uuid,
      integrityScore: { type: "integer", minimum: 0, maximum: 100 },
      ...campaignMetricsProperties,
      signals: { type: "array", items: { $ref: "IntegritySignal#" } }
    }
  },
  {
    $id: "CampaignExportJson",
    type: "object",
    additionalProperties: false,
    required: ["generatedAt", "results", "integrity"],
    properties: {
      generatedAt: dateTime,
      results: { $ref: "CampaignResults#" },
      integrity: { $ref: "CampaignIntegrity#" }
    }
  },
  {
    $id: "PublicCampaign",
    type: "object",
    additionalProperties: false,
    required: ["id", "electionId", "title", "description", "status", "startsAt", "endsAt", "options"],
    properties: {
      id: uuid,
      electionId: uuid,
      title: { type: "string" },
      description: nullableString,
      status: { type: "string", enum: ["draft", "active", "closed"] },
      startsAt: nullableDateTime,
      endsAt: nullableDateTime,
      options: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "label", "description", "position"],
          properties: {
            id: uuid,
            label: { type: "string" },
            description: nullableString,
            position: nonNegativeInteger
          }
        }
      }
    }
  },
  {
    $id: "RequestEmailVerification",
    type: "object",
    additionalProperties: false,
    required: ["email"],
    properties: {
      email: { type: "string", format: "email", maxLength: 320 }
    }
  },
  {
    $id: "EmailVerificationRequested",
    type: "object",
    additionalProperties: false,
    required: ["status", "expiresInSeconds"],
    properties: {
      status: { type: "string", enum: ["verification_sent"] },
      expiresInSeconds: { type: "integer", minimum: 300, maximum: 3600 }
    }
  },
  {
    $id: "VerifyEmailRequest",
    type: "object",
    additionalProperties: false,
    required: ["token"],
    properties: {
      token: { type: "string", minLength: 16, maxLength: 512, pattern: "^emv_", writeOnly: true }
    }
  },
  {
    $id: "EmailVerified",
    type: "object",
    additionalProperties: false,
    required: ["status", "identityProof", "expiresAt"],
    properties: {
      status: { type: "string", enum: ["verified"] },
      identityProof: {
        type: "string",
        pattern: "^emp_",
        description: "Short-lived, one-time proof accepted by vote submission."
      },
      expiresAt: dateTime
    }
  },
  {
    $id: "SubmitVoteRequest",
    type: "object",
    additionalProperties: false,
    required: ["optionId", "idempotencyKey", "identity", "botProtectionToken"],
    properties: {
      optionId: uuid,
      idempotencyKey: {
        ...uuid,
        description: "Mandatory retry key. Reuse only for the same logical vote request."
      },
      identity: {
        type: "object",
        additionalProperties: false,
        required: ["provider", "proof"],
        properties: {
          provider: { type: "string", enum: ["email"] },
          proof: { type: "string", minLength: 16, maxLength: 512, pattern: "^emp_", writeOnly: true }
        }
      },
      botProtectionToken: {
        type: "string",
        minLength: 1,
        maxLength: 2048,
        writeOnly: true
      },
      inviteToken: { type: "string", minLength: 8, pattern: "^ivt_", writeOnly: true },
      deviceId: { type: "string", minLength: 8, maxLength: 256, writeOnly: true }
    }
  },
  {
    $id: "CountedVoteResponse",
    type: "object",
    additionalProperties: false,
    required: ["voteId", "receipt", "status", "confidenceLevel", "message"],
    properties: {
      voteId: uuid,
      receipt: { type: "string", pattern: "^rcpt_" },
      status: { type: "string", enum: ["counted"] },
      confidenceLevel,
      message: { type: "string" }
    }
  },
  {
    $id: "PendingVoteResponse",
    type: "object",
    additionalProperties: false,
    required: ["voteId", "receipt", "status", "confidenceLevel", "message"],
    properties: {
      voteId: uuid,
      receipt: { type: "string", pattern: "^rcpt_" },
      status: { type: "string", enum: ["delayed", "under_review"] },
      confidenceLevel,
      message: { type: "string" }
    }
  },
  {
    $id: "ReceiptStatus",
    description: "Receipt state. The selected option is deliberately never included.",
    type: "object",
    additionalProperties: false,
    required: ["status", "voteStatus", "recordedAt"],
    properties: {
      status: { type: "string", enum: ["recorded"] },
      voteStatus: {
        type: "string",
        enum: ["counted", "delayed", "under_review", "blocked", "rejected"]
      },
      recordedAt: dateTime
    }
  }
] as const;

export function schemaRef(schemaId: string) {
  return { $ref: `${schemaId}#` } as const;
}

export function uuidParams(...names: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: names,
    properties: Object.fromEntries(names.map((name) => [name, uuid]))
  };
}

export const receiptParams = {
  type: "object",
  additionalProperties: false,
  required: ["campaignId", "receipt"],
  properties: {
    campaignId: uuid,
    receipt: { type: "string", minLength: 1 }
  }
} as const;

export const exportQuery = {
  type: "object",
  additionalProperties: false,
  properties: {
    format: { type: "string", enum: ["json", "csv"], default: "json" }
  }
} as const;

export const exportResponse = {
  description: "Aggregate campaign report as JSON or CSV, selected by the format query parameter.",
  headers: {
    "content-disposition": {
      type: "string",
      description: "Attachment filename for the generated report."
    }
  },
  content: {
    "application/json": { schema: schemaRef("CampaignExportJson") },
    "text/csv": { schema: { type: "string" } }
  }
} as const;
