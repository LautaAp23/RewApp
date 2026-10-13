-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('ARMING', 'ARMED', 'REWARDED', 'FAILED');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN "referralCode" TEXT;

-- CreateTable
CREATE TABLE "Referral" (
    "referee" TEXT NOT NULL,
    "referrer" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'ARMING',
    "armTxHash" TEXT,
    "expiresAt" TIMESTAMP(3),
    "rewardTxHash" TEXT,
    "referrerBonus" TEXT,
    "refereeBonus" TEXT,
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("referee")
);

-- CreateIndex
CREATE UNIQUE INDEX "Profile_referralCode_key" ON "Profile"("referralCode");
CREATE UNIQUE INDEX "Referral_armTxHash_key" ON "Referral"("armTxHash");
CREATE INDEX "Referral_referrer_createdAt_idx" ON "Referral"("referrer", "createdAt");
CREATE INDEX "Referral_ip_createdAt_idx" ON "Referral"("ip", "createdAt");
