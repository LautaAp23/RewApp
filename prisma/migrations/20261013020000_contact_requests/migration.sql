-- The original creation date of existing contacts is unknown.
ALTER TABLE "Contact" ADD COLUMN "createdAt" TIMESTAMP(3);
ALTER TABLE "Contact" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
CREATE TABLE "PaymentRequestBlock" (
  "owner" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentRequestBlock_pkey" PRIMARY KEY ("owner", "sender"),
  CONSTRAINT "PaymentRequestBlock_owner_fkey" FOREIGN KEY ("owner") REFERENCES "Profile"("address") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PaymentRequestBlock_sender_fkey" FOREIGN KEY ("sender") REFERENCES "Profile"("address") ON DELETE CASCADE ON UPDATE CASCADE
);
