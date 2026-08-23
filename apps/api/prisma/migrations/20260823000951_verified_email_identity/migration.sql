-- CreateEnum
CREATE TYPE "EmailVerificationStatus" AS ENUM ('pending', 'verified', 'consumed', 'superseded', 'expired', 'delivery_failed');

-- CreateTable
CREATE TABLE "email_verification_challenges" (
    "id" UUID NOT NULL,
    "campaignId" UUID NOT NULL,
    "identityId" UUID,
    "emailHash" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "proofHash" TEXT,
    "status" "EmailVerificationStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "proofExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_challenges_tokenHash_key" ON "email_verification_challenges"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_challenges_proofHash_key" ON "email_verification_challenges"("proofHash");

-- CreateIndex
CREATE INDEX "email_verification_challenges_campaignId_emailHash_status_idx" ON "email_verification_challenges"("campaignId", "emailHash", "status");

-- CreateIndex
CREATE INDEX "email_verification_challenges_expiresAt_idx" ON "email_verification_challenges"("expiresAt");

-- AddForeignKey
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_challenges_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_challenges" ADD CONSTRAINT "email_verification_challenges_identityId_fkey" FOREIGN KEY ("identityId") REFERENCES "voter_identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
