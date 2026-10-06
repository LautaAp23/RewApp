-- Demo merchants for testing the payment flow until the merchant panel (phase 3).
-- Their keys are deterministic testnet-only keys used by scripts/demo-charge.mjs:
-- keccak256("rewapp.smoke.merchant") has a 10% cashback rule over USD 5 (SmokePay.s.sol)
-- and keccak256("rewapp.demo.merchant.eur") is registered without rules.
INSERT INTO "Merchant" ("id", "name", "logoUrl", "category", "country", "currency", "address") VALUES
    ('demo-cafe-ars', 'Café Demo', NULL, 'cafe', 'AR', 'ARS', '0x52576f0fECBE8E68f830DB256411201bAdA49EeA'),
    ('demo-bistro-eur', 'Bistro Demo', NULL, 'restaurant', 'ES', 'EUR', '0xbF2f915364875bad814E9b31B9dfaFF2C9070A0e')
ON CONFLICT ("address") DO NOTHING;
