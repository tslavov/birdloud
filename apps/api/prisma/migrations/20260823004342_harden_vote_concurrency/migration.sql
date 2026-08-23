-- AlterTable
ALTER TABLE "idempotency_keys"
ADD COLUMN "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "updatedAt" TIMESTAMP(3);

-- Backfill existing claims before enforcing the required application timestamp.
UPDATE "idempotency_keys"
SET "updatedAt" = "createdAt"
WHERE "updatedAt" IS NULL;

ALTER TABLE "idempotency_keys"
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "idempotency_keys_status_lockedAt_idx" ON "idempotency_keys"("status", "lockedAt");
