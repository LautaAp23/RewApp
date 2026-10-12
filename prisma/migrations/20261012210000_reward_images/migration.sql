-- Existing catalog photos are retained. Only the seeded demonstration rewards are decorated.
UPDATE "PlatformReward" SET "imageUrl" = '/rewards/coffee.webp'
WHERE "id" = 1 AND "merchantId" = 'demo-cafe-ars' AND "imageUrl" IS NULL;
UPDATE "PlatformReward" SET "imageUrl" = '/rewards/dessert.webp'
WHERE "id" = 2 AND "merchantId" = 'demo-bistro-eur' AND "imageUrl" IS NULL;
UPDATE "PlatformReward" SET "imageUrl" = '/rewards/breakfast.webp'
WHERE "id" = 3 AND "merchantId" = 'demo-cafe-ars' AND "imageUrl" IS NULL;
UPDATE "PlatformReward" SET "imageUrl" = '/rewards/birthday.webp'
WHERE "id" = 90 AND "title" = 'Regalo de cumpleaños' AND "imageUrl" IS NULL;
