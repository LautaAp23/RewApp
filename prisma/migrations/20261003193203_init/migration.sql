-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RewardAudience" AS ENUM ('CUSTOMER', 'COMMERCE');

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,
    "category" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "address" TEXT NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "localAmount" DECIMAL(18,2) NOT NULL,
    "localCurrency" TEXT NOT NULL,
    "usdAmount" BIGINT NOT NULL,
    "status" "ChargeStatus" NOT NULL DEFAULT 'PENDING',
    "txHash" TEXT,
    "payer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profile" (
    "address" TEXT NOT NULL,
    "alias" TEXT,
    "country" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',

    CONSTRAINT "Profile_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "FxRate" (
    "currency" TEXT NOT NULL,
    "usdRate" DECIMAL(18,6) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FxRate_pkey" PRIMARY KEY ("currency")
);

-- CreateTable
CREATE TABLE "BackupVault" (
    "credentialId" TEXT NOT NULL,
    "accountAddress" TEXT NOT NULL,
    "vault" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupVault_pkey" PRIMARY KEY ("credentialId")
);

-- CreateTable
CREATE TABLE "PlatformReward" (
    "id" INTEGER NOT NULL,
    "audience" "RewardAudience" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT,
    "pointsCost" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PlatformReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_address_key" ON "Merchant"("address");

-- CreateIndex
CREATE INDEX "Charge_merchantId_createdAt_idx" ON "Charge"("merchantId", "createdAt");

-- CreateIndex
CREATE INDEX "BackupVault_accountAddress_idx" ON "BackupVault"("accountAddress");

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
