-- Testnet catalog metadata, aligned with Deploy.s.sol. No real rewards or money.
INSERT INTO "PlatformReward" ("id", "audience", "title", "description", "pointsCost", "active", "merchantId") VALUES
(1, 'CUSTOMER', 'Café de prueba', 'Premio de demostración: un café en Café Demo. Sin entrega real.', 300, true, 'demo-cafe-ars'),
(2, 'CUSTOMER', 'Postre de prueba', 'Premio de demostración: un postre en Bistro Demo. Sin entrega real.', 500, true, 'demo-bistro-eur'),
(3, 'CUSTOMER', 'Desayuno de prueba', 'Premio de demostración: un desayuno en Café Demo. Sin entrega real.', 1000, true, 'demo-cafe-ars')
ON CONFLICT ("id") DO NOTHING;
