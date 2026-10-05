-- Simulated FX table (docs/PLAN.md §2): real rates loaded by hand on 2026-10-05
-- from open.er-api.com. Units of each currency per 1 USD.
INSERT INTO "FxRate" ("currency", "usdRate", "updatedAt") VALUES
    ('USD', 1.000000, '2026-10-05 00:00:00'),
    ('ARS', 1523.086800, '2026-10-05 00:00:00'),
    ('EUR', 0.888890, '2026-10-05 00:00:00'),
    ('BRL', 5.222532, '2026-10-05 00:00:00'),
    ('MXN', 18.193970, '2026-10-05 00:00:00'),
    ('CLP', 987.993764, '2026-10-05 00:00:00')
ON CONFLICT ("currency") DO UPDATE
SET "usdRate" = EXCLUDED."usdRate", "updatedAt" = EXCLUDED."updatedAt";
