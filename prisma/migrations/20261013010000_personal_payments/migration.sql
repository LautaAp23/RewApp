ALTER TABLE "Profile" ADD COLUMN "handle" TEXT;
CREATE UNIQUE INDEX "Profile_handle_key" ON "Profile"("handle");
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_handle_format" CHECK ("handle" IS NULL OR ("handle" ~ '^[a-z0-9][a-z0-9._-]{1,22}[a-z0-9]$' AND "handle" NOT LIKE 'rw-%'));
CREATE TYPE "PersonalStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'EXPIRED', 'CANCELLED');
CREATE TABLE "PersonalCharge" (
 "id" TEXT PRIMARY KEY, "kind" TEXT NOT NULL, "recipient" TEXT NOT NULL,
 "expectedPayer" TEXT, "payer" TEXT, "recipientName" TEXT NOT NULL, "payerName" TEXT,
 "localAmount" DECIMAL(18,2) NOT NULL, "localCurrency" TEXT NOT NULL, "usdAmount" BIGINT NOT NULL,
 "status" "PersonalStatus" NOT NULL DEFAULT 'PENDING', "note" TEXT NOT NULL,
 "readAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "expiresAt" TIMESTAMP(3) NOT NULL, "paidAt" TIMESTAMP(3), "payerLock" TEXT,
 "authorization" JSONB, "permitHash" TEXT, "permitRaw" TEXT, "permitConfirmed" BOOLEAN NOT NULL DEFAULT false,
 "txHash" TEXT, "txRaw" TEXT,
 CONSTRAINT "PersonalCharge_recipient_fkey" FOREIGN KEY ("recipient") REFERENCES "Profile"("address") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PersonalCharge_expectedPayer_fkey" FOREIGN KEY ("expectedPayer") REFERENCES "Profile"("address") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PersonalCharge_payer_fkey" FOREIGN KEY ("payer") REFERENCES "Profile"("address") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "PersonalCharge_amount_positive" CHECK ("usdAmount" > 0 AND "localAmount" > 0),
 CONSTRAINT "PersonalCharge_kind" CHECK ("kind" IN ('DIRECT','REQUEST'))
);
CREATE UNIQUE INDEX "PersonalCharge_payerLock_key" ON "PersonalCharge"("payerLock");
CREATE UNIQUE INDEX "PersonalCharge_txHash_key" ON "PersonalCharge"("txHash");
CREATE INDEX "PersonalCharge_recipient_createdAt_idx" ON "PersonalCharge"("recipient", "createdAt");
CREATE INDEX "PersonalCharge_expectedPayer_status_createdAt_idx" ON "PersonalCharge"("expectedPayer", "status", "createdAt");
CREATE INDEX "PersonalCharge_payer_status_createdAt_idx" ON "PersonalCharge"("payer", "status", "createdAt");
