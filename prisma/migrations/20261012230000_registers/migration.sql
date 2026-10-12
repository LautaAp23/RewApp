-- Checkout counters. A future register monitor will bind a passkey here.
CREATE TABLE "Register" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Register_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Register_merchantId_number_key" ON "Register"("merchantId", "number");

ALTER TABLE "Register" ADD CONSTRAINT "Register_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Charge" ADD COLUMN "registerId" TEXT;

CREATE INDEX "Charge_registerId_createdAt_idx" ON "Charge"("registerId", "createdAt");

ALTER TABLE "Charge" ADD CONSTRAINT "Charge_registerId_fkey" FOREIGN KEY ("registerId") REFERENCES "Register"("id") ON DELETE SET NULL ON UPDATE CASCADE;
