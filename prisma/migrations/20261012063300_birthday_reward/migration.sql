-- Birthday reward metadata, aligned with the onchain catalog (setReward 90).
-- Minimal cost of 1: RewAppPay.setReward rejects zero, so a free gift is
-- impossible without a contract change. The once-per-year limit is enforced
-- by POST /api/redeem, not by points.
INSERT INTO "PlatformReward" ("id", "audience", "title", "description", "pointsCost", "active", "merchantId") VALUES
(90, 'CUSTOMER', 'Regalo de cumpleaños', 'Un premio por tu cumpleaños, canjeable una vez por año. Sin entrega real en la demo.', 1, true, NULL)
ON CONFLICT ("id") DO NOTHING;
