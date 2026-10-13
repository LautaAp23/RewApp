ALTER TABLE "Charge" ADD COLUMN "notificationReadAt" TIMESTAMP(3);
CREATE INDEX "Charge_expectedPayer_status_createdAt_idx" ON "Charge"("expectedPayer", "status", "createdAt");
