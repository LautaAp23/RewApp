-- CreateTable
CREATE TABLE "Onramp" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "localAmount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "usdAmount" BIGINT NOT NULL,
    "txHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Onramp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Onramp_address_createdAt_idx" ON "Onramp"("address", "createdAt");

-- CreateIndex
CREATE INDEX "Onramp_ip_createdAt_idx" ON "Onramp"("ip", "createdAt");
