-- Better Auth 1.7 scopes an account identity by trusted issuer plus provider account ID.
-- BirdLoud has only credential auth before this migration. Stop rather than guessing if an
-- unmodeled provider was inserted manually; OAuth issuers require an explicit trusted mapping.
ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "accounts"
    WHERE "providerId" <> 'credential'
  ) THEN
    RAISE EXCEPTION
      'Cannot backfill Better Auth account issuer: non-credential provider rows need an explicit trusted issuer mapping.';
  END IF;
END
$$;

UPDATE "accounts"
SET
  "issuer" = 'local:credential',
  "accountId" = "userId"::text
WHERE "providerId" = 'credential';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "accounts"
    GROUP BY "issuer", "accountId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot create Better Auth account issuer identity: duplicate issuer/accountId rows exist.';
  END IF;
END
$$;

ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;
DROP INDEX "accounts_providerId_accountId_key";
CREATE UNIQUE INDEX "accounts_issuer_accountId_key" ON "accounts"("issuer", "accountId");
