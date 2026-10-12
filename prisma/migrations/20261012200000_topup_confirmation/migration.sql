-- A submitted hash alone does not prove a successful monetary operation.
-- Historical rows are reconciled against the confirmed token mint on first activity load.
ALTER TABLE "Onramp" ADD COLUMN "confirmedAt" TIMESTAMP(3);
