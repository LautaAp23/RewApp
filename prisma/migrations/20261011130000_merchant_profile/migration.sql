-- Merchant profile from self-registration (docs/MODEL.md §6: no approval step).
-- city and streetAddress are required in the schema, but seed_demo_merchants
-- already inserted two rows, so they are added nullable, backfilled, and only
-- then set NOT NULL. placeId/lat/lng come from the place search and stay
-- optional: the form has to work when that search is down.
ALTER TABLE "Merchant" ADD COLUMN "city" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "streetAddress" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "placeId" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "lat" DOUBLE PRECISION;
ALTER TABLE "Merchant" ADD COLUMN "lng" DOUBLE PRECISION;
ALTER TABLE "Merchant" ADD COLUMN "email" TEXT;
ALTER TABLE "Merchant" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "Merchant" SET "city" = 'Salta', "streetAddress" = 'Balcarce 100' WHERE "id" = 'demo-cafe-ars';
UPDATE "Merchant" SET "city" = 'Madrid', "streetAddress" = 'Calle Mayor 1' WHERE "id" = 'demo-bistro-eur';
-- Defensive: any row the seeds did not create keeps the column non-null.
UPDATE "Merchant" SET "city" = '' WHERE "city" IS NULL;
UPDATE "Merchant" SET "streetAddress" = '' WHERE "streetAddress" IS NULL;

ALTER TABLE "Merchant" ALTER COLUMN "city" SET NOT NULL;
ALTER TABLE "Merchant" ALTER COLUMN "streetAddress" SET NOT NULL;
