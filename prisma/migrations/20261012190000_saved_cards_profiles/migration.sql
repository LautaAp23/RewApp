CREATE TABLE "SavedCard" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "brand" TEXT NOT NULL,
  "last4" TEXT NOT NULL,
  "holder" TEXT,
  "expiryMonth" INTEGER,
  "expiryYear" INTEGER,
  "funding" TEXT NOT NULL DEFAULT 'unknown',
  "provider" TEXT,
  "providerMethodId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending_provider',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SavedCard_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SavedCard_last4_check" CHECK ("last4" ~ '^[0-9]{4}$'),
  CONSTRAINT "SavedCard_expiryMonth_check" CHECK ("expiryMonth" BETWEEN 1 AND 12),
  CONSTRAINT "SavedCard_expiryYear_check" CHECK ("expiryYear" BETWEEN 2000 AND 2200),
  CONSTRAINT "SavedCard_provider_check" CHECK (("provider" IS NULL) = ("providerMethodId" IS NULL)),
  CONSTRAINT "SavedCard_status_check" CHECK ("status" IN ('pending_provider', 'active', 'disabled')),
  CONSTRAINT "SavedCard_active_check" CHECK ("status" <> 'active' OR "providerMethodId" IS NOT NULL)
);

-- Backfill missing profiles before adding the foreign key. Existing rows are retained.
INSERT INTO "Profile" ("address", "currency")
SELECT DISTINCT "accountAddress", 'USD' FROM "SavedDemoCard"
ON CONFLICT ("address") DO NOTHING;

INSERT INTO "SavedCard" ("id", "userId", "brand", "last4", "funding", "createdAt")
SELECT "id", "accountAddress",
  CASE "demoId" WHEN 'mastercard-credit' THEN 'Mastercard' ELSE 'Visa' END,
  CASE "demoId" WHEN 'visa-debit' THEN '4242' WHEN 'mastercard-credit' THEN '4444' ELSE '5556' END,
  CASE "demoId" WHEN 'visa-debit' THEN 'debit' WHEN 'mastercard-credit' THEN 'credit' ELSE 'prepaid' END,
  "createdAt"
FROM "SavedDemoCard"
WHERE "demoId" IN ('visa-debit', 'mastercard-credit', 'visa-prepaid');

CREATE INDEX "SavedCard_userId_createdAt_idx" ON "SavedCard"("userId", "createdAt");
CREATE UNIQUE INDEX "SavedCard_userId_brand_last4_expiryMonth_expiryYear_key" ON "SavedCard"("userId", "brand", "last4", "expiryMonth", "expiryYear");
CREATE UNIQUE INDEX "SavedCard_provider_providerMethodId_key" ON "SavedCard"("provider", "providerMethodId");
ALTER TABLE "SavedCard" ADD CONSTRAINT "SavedCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Profile"("address") ON DELETE CASCADE ON UPDATE CASCADE;
