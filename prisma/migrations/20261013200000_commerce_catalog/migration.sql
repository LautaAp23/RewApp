-- Catálogo COMMERCE G3 con premios reales (cambio premios-comercio-g3).
-- UPDATE de 101/102 (títulos y condiciones; costos onchain intactos) e INSERT
-- de 103. En espejo con `setReward` onchain: 101/2000, 102/5000, 103/3000,
-- todos audiencia COMMERCE y activos. Los costos son autoritativos onchain.
-- Cumplimiento manual del equipo en los tres casos (ver descripciones).
-- `imageUrl` queda nulo a propósito: sin generador de imágenes disponible, la
-- tarjeta muestra el premio sin imagen en vez de una imagen rota.
UPDATE "PlatformReward"
SET "title" = 'Difusión en redes de RewApp',
    "description" = 'Publicación de muestra de tu comercio en las redes de RewApp. La coordinación (contenido y fecha) la hace el equipo con tu código de canje. Sin publicación automática en la demo.'
WHERE "id" = 101;
UPDATE "PlatformReward"
SET "title" = 'Cupón de comisión −0.5%',
    "description" = 'Reintegro de muestra del 0.5% de tu volumen liquidado durante 30 días desde el canje, transferido desde tesorería por el equipo. Sin aplicación automática en la demo.'
WHERE "id" = 102;
INSERT INTO "PlatformReward" ("id", "audience", "title", "description", "pointsCost", "active", "merchantId") VALUES
(103, 'COMMERCE', 'Comercio destacado', 'Difusión de muestra de tu comercio como destacado en la app durante 30 días desde el canje. La activación la hace el equipo con tu código de canje. Sin lista automática en la demo.', 3000, true, NULL)
ON CONFLICT ("id") DO NOTHING;
