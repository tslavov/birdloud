-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('organizer', 'admin');

-- CreateEnum
CREATE TYPE "ElectionStatus" AS ENUM ('draft', 'active', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "IdentityMode" AS ENUM ('soft_identity', 'invite_token_optional');

-- CreateEnum
CREATE TYPE "DuplicateIdentityPolicy" AS ENUM ('count_with_risk', 'review', 'block');

-- CreateEnum
CREATE TYPE "TokenStatus" AS ENUM ('active', 'used', 'revoked', 'expired');

-- CreateEnum
CREATE TYPE "IdentityProvider" AS ENUM ('google', 'microsoft', 'facebook', 'email', 'invite_token');

-- CreateEnum
CREATE TYPE "TrustLevel" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "VoteStatus" AS ENUM ('counted', 'delayed', 'under_review', 'blocked', 'rejected');

-- CreateEnum
CREATE TYPE "AttemptOutcome" AS ENUM ('counted', 'duplicate', 'delayed', 'blocked', 'under_review', 'invalid');

-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "ConflictStatus" AS ENUM ('open', 'resolved', 'dismissed');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'organizer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elections" (
    "id" UUID NOT NULL,
    "organizerId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ElectionStatus" NOT NULL DEFAULT 'draft',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "electionId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "identityMode" "IdentityMode" NOT NULL DEFAULT 'soft_identity',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "allowReviewQueue" BOOLEAN NOT NULL DEFAULT true,
    "duplicateIdentityPolicy" "DuplicateIdentityPolicy" NOT NULL DEFAULT 'review',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_options" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "campaign_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voter_identities" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "provider" "IdentityProvider" NOT NULL,
    "providerSubjectHash" TEXT,
    "emailHash" TEXT,
    "deviceHash" TEXT,
    "firstIpHash" TEXT,
    "userAgentHash" TEXT,
    "trustLevel" "TrustLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voter_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voter_tokens" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "TokenStatus" NOT NULL DEFAULT 'active',
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "issuedLabelHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voter_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "votes" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "identityId" UUID,
    "voterTokenId" UUID,
    "voterKeyHash" TEXT NOT NULL,
    "receiptHash" TEXT NOT NULL,
    "status" "VoteStatus" NOT NULL,
    "confidenceLevel" "TrustLevel" NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "reviewReason" TEXT,
    "ipHash" TEXT,
    "deviceHash" TEXT,
    "userAgentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_attempts" (
    "id" UUID NOT NULL,
    "campaignId" UUID,
    "optionId" UUID,
    "voterKeyHash" TEXT,
    "ipHash" TEXT,
    "deviceHash" TEXT,
    "userAgentHash" TEXT,
    "outcome" "AttemptOutcome" NOT NULL,
    "reason" TEXT,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vote_ledger" (
    "id" UUID NOT NULL,
    "voteId" UUID,
    "campaignId" UUID,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vote_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL,
    "responseBody" JSONB,
    "statusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_verification_events" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "identityId" UUID,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "trustLevel" "TrustLevel" NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_conflicts" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "identityId" UUID,
    "conflictType" TEXT NOT NULL,
    "confidence" "TrustLevel" NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ConflictStatus" NOT NULL DEFAULT 'open',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" UUID,

    CONSTRAINT "identity_conflicts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_option_counts" (
    "campaignId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "countedVotes" BIGINT NOT NULL DEFAULT 0,
    "delayedVotes" BIGINT NOT NULL DEFAULT 0,
    "underReviewVotes" BIGINT NOT NULL DEFAULT 0,
    "rejectedVotes" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_option_counts_pkey" PRIMARY KEY ("campaignId","optionId")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "electionId" UUID,
    "campaignId" UUID,
    "action" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "elections_organizerId_idx" ON "elections"("organizerId");

-- CreateIndex
CREATE INDEX "elections_status_startsAt_endsAt_idx" ON "elections"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "campaigns_electionId_idx" ON "campaigns"("electionId");

-- CreateIndex
CREATE INDEX "campaigns_status_startsAt_endsAt_idx" ON "campaigns"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "campaign_options_campaignId_isActive_idx" ON "campaign_options"("campaignId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_options_campaignId_position_key" ON "campaign_options"("campaignId", "position");

-- CreateIndex
CREATE INDEX "voter_identities_campaignId_emailHash_idx" ON "voter_identities"("campaignId", "emailHash");

-- CreateIndex
CREATE INDEX "voter_identities_campaignId_deviceHash_idx" ON "voter_identities"("campaignId", "deviceHash");

-- CreateIndex
CREATE INDEX "voter_identities_campaignId_firstIpHash_idx" ON "voter_identities"("campaignId", "firstIpHash");

-- CreateIndex
CREATE UNIQUE INDEX "voter_identities_campaignId_provider_providerSubjectHash_key" ON "voter_identities"("campaignId", "provider", "providerSubjectHash");

-- CreateIndex
CREATE INDEX "voter_tokens_campaignId_status_idx" ON "voter_tokens"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "voter_tokens_campaignId_tokenHash_key" ON "voter_tokens"("campaignId", "tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "votes_receiptHash_key" ON "votes"("receiptHash");

-- CreateIndex
CREATE INDEX "votes_campaignId_status_idx" ON "votes"("campaignId", "status");

-- CreateIndex
CREATE INDEX "votes_campaignId_confidenceLevel_idx" ON "votes"("campaignId", "confidenceLevel");

-- CreateIndex
CREATE INDEX "votes_identityId_idx" ON "votes"("identityId");

-- CreateIndex
CREATE UNIQUE INDEX "votes_campaignId_voterKeyHash_key" ON "votes"("campaignId", "voterKeyHash");

-- CreateIndex
CREATE INDEX "vote_attempts_campaignId_outcome_idx" ON "vote_attempts"("campaignId", "outcome");

-- CreateIndex
CREATE INDEX "vote_attempts_campaignId_createdAt_idx" ON "vote_attempts"("campaignId", "createdAt");

-- CreateIndex
CREATE INDEX "vote_attempts_ipHash_idx" ON "vote_attempts"("ipHash");

-- CreateIndex
CREATE INDEX "vote_attempts_deviceHash_idx" ON "vote_attempts"("deviceHash");

-- CreateIndex
CREATE INDEX "vote_ledger_campaignId_eventType_idx" ON "vote_ledger"("campaignId", "eventType");

-- CreateIndex
CREATE INDEX "vote_ledger_voteId_idx" ON "vote_ledger"("voteId");

-- CreateIndex
CREATE INDEX "idempotency_keys_expiresAt_idx" ON "idempotency_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_campaignId_key_key" ON "idempotency_keys"("campaignId", "key");

-- CreateIndex
CREATE INDEX "identity_verification_events_campaignId_eventType_idx" ON "identity_verification_events"("campaignId", "eventType");

-- CreateIndex
CREATE INDEX "identity_verification_events_identityId_idx" ON "identity_verification_events"("identityId");

-- CreateIndex
CREATE INDEX "identity_conflicts_campaignId_status_idx" ON "identity_conflicts"("campaignId", "status");

-- CreateIndex
CREATE INDEX "identity_conflicts_identityId_idx" ON "identity_conflicts"("identityId");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_option_counts_optionId_key" ON "campaign_option_counts"("optionId");

-- CreateIndex
CREATE INDEX "audit_logs_actorUserId_idx" ON "audit_logs"("actorUserId");

-- CreateIndex
CREATE INDEX "audit_logs_campaignId_action_idx" ON "audit_logs"("campaignId", "action");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "elections" ADD CONSTRAINT "elections_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_options" ADD CONSTRAINT "campaign_options_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_identities" ADD CONSTRAINT "voter_identities_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voter_tokens" ADD CONSTRAINT "voter_tokens_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "campaign_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "voter_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "votes" ADD CONSTRAINT "votes_voterTokenId_fkey" FOREIGN KEY ("voterTokenId") REFERENCES "voter_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_attempts" ADD CONSTRAINT "vote_attempts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_ledger" ADD CONSTRAINT "vote_ledger_voteId_fkey" FOREIGN KEY ("voteId") REFERENCES "votes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vote_ledger" ADD CONSTRAINT "vote_ledger_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_verification_events" ADD CONSTRAINT "identity_verification_events_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_verification_events" ADD CONSTRAINT "identity_verification_events_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "voter_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_conflicts" ADD CONSTRAINT "identity_conflicts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_conflicts" ADD CONSTRAINT "identity_conflicts_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "voter_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_conflicts" ADD CONSTRAINT "identity_conflicts_resolvedBy_fkey" FOREIGN KEY ("resolvedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_option_counts" ADD CONSTRAINT "campaign_option_counts_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_option_counts" ADD CONSTRAINT "campaign_option_counts_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "campaign_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_electionId_fkey" FOREIGN KEY ("electionId") REFERENCES "elections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;
