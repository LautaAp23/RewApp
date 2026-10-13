-- Premios de comercio de la App (G3), en espejo con DeployPay.s.sol `_seedRewards`.
-- 101 cuesta 2000 puntos COMMERCE y 102 cuesta 5000 puntos COMMERCE, ambos activos.
-- Origen: catálogo de RewApp para comercios (`merchantId` nulo, audiencia `COMMERCE`).
-- Los costos son autoritativos onchain vía `setReward`; esta semilla solo aporta metadatos.
INSERT INTO "PlatformReward" ("id", "audience", "title", "description", "pointsCost", "active", "merchantId") VALUES
(101, 'COMMERCE', 'Premio comercio 101', 'Premio de muestra para comercios por 2000 puntos de comercio. Sin entrega real en la demo.', 2000, true, NULL),
(102, 'COMMERCE', 'Premio comercio 102', 'Premio de muestra para comercios por 5000 puntos de comercio. Sin entrega real en la demo.', 5000, true, NULL)
ON CONFLICT ("id") DO NOTHING;
