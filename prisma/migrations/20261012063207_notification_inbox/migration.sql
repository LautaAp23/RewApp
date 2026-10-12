-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthMonth" INTEGER;

-- CreateTable
CREATE TABLE "MerchantEvent" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MerchantEvent_active_endsAt_idx" ON "MerchantEvent"("active", "endsAt");

-- CreateIndex
CREATE INDEX "MerchantEvent_merchantId_createdAt_idx" ON "MerchantEvent"("merchantId", "createdAt");

-- AddForeignKey
ALTER TABLE "MerchantEvent" ADD CONSTRAINT "MerchantEvent_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
