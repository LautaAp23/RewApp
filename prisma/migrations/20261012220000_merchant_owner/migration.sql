-- The person who registered the business. Demo merchants stay unowned.
-- derivationIndex selects which key of the same passkey signs for this business.
ALTER TABLE "Merchant" ADD COLUMN "ownerAddress" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "derivationIndex" INTEGER;

CREATE INDEX "Merchant_ownerAddress_idx" ON "Merchant"("ownerAddress");
CREATE UNIQUE INDEX "Merchant_ownerAddress_derivationIndex_key" ON "Merchant"("ownerAddress", "derivationIndex");
