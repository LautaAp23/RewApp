-- Premios App G1 (tab De RewApp), en espejo con DeployPay.s.sol `_seedRewards`.
-- 201 sorteo de 1000 RewPoints (entrada 100), 202 electrónico genérico (8000),
-- 203 viaje para dos genérico (120000). Todos CUSTOMER con `merchantId` nulo.
-- Los costos son autoritativos onchain vía `setReward`; esta semilla aporta metadatos.
-- `imageUrl` queda nulo a propósito: las miniaturas (/rewards/raffle.webp,
-- headphones.webp, trip.webp) llegan con la herramienta imagegen en una
-- migración posterior que no pisa fotos existentes. Sin miniatura, la tarjeta
-- muestra el premio sin imagen en vez de una imagen rota.
INSERT INTO "PlatformReward" ("id", "audience", "title", "description", "pointsCost", "active", "merchantId") VALUES
(201, 'CUSTOMER', 'Sorteo de 1000 RewPoints', 'Sorteo interno de muestra: 1000 RewPoints. Cierra el 20 dic 2026. Entrada individual de 100 puntos, tope 5 participaciones por cuenta. Los ganadores se publican en Avisos. Sin entrega en comercio.', 100, true, NULL),
(202, 'CUSTOMER', 'Auriculares de muestra', 'Auriculares genéricos de muestra por 8000 puntos. La entrega la coordina RewApp. Sin entrega real en la demo.', 8000, true, NULL),
(203, 'CUSTOMER', 'Viaje para dos de muestra', 'Viaje genérico de muestra para dos personas por 120000 puntos. La entrega la coordina RewApp. Sin entrega real en la demo.', 120000, true, NULL)
ON CONFLICT ("id") DO NOTHING;
