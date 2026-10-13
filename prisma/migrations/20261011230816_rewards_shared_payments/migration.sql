-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ChargeStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "ChargeStatus" ADD VALUE 'SPLIT';

-- AlterTable
ALTER TABLE "Charge" ADD COLUMN     "expectedPayer" TEXT,
ADD COLUMN     "groupId" TEXT,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "splitOwner" TEXT;

-- AlterTable
ALTER TABLE "PlatformReward" ADD COLUMN     "merchantId" TEXT;

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialGroup" (
    "id" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "members" JSONB NOT NULL,

    CONSTRAINT "SocialGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiAuthorization" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceSession" (
    "tokenHash" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSession_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "Redemption" (
    "id" TEXT NOT NULL,
    "account" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "rewardId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "merchantId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "txHash" TEXT,
    "pickupCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "Redemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Contact_owner_address_key" ON "Contact"("owner", "address");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_txHash_key" ON "Redemption"("txHash");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_pickupCode_key" ON "Redemption"("pickupCode");

-- CreateIndex
CREATE INDEX "Redemption_account_createdAt_idx" ON "Redemption"("account", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Redemption_account_nonce_key" ON "Redemption"("account", "nonce");

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Charge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformReward" ADD CONSTRAINT "PlatformReward_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redemption" ADD CONSTRAINT "Redemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "PlatformReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
