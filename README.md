# RewApp

Red global de pagos prepagos con fidelización incluida. El cliente paga escaneando un QR y, en la misma transacción, recibe la recompensa que definió el comercio y suma RewPoints Customer. El comercio cobra al instante y suma RewPoints Commerce. Todo se muestra en la moneda local de cada uno, sin wallets, gas ni frases semilla.

Proyecto para la hackathon de Monad (tracks *Consumer Products & Payments* y *Best Mera-Powered UX on Monad*).

- Plan completo: [docs/PLAN.md](docs/PLAN.md)
- Arquitectura y estado del proyecto: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Producción: https://rewapp-app.vercel.app

## Stack

- PWA mobile-first en Next.js (App Router, TypeScript, Tailwind)
- Cuentas con passkeys vía [Mera](https://mera.category.xyz) (`@category-labs/mera`)
- Contratos en Solidity con Foundry, desplegados en Monad Testnet (chain ID 10143)

## Estructura

```
src/         App Next.js (UI y API routes)
contracts/   Contratos Foundry (USDr, RewAppPay)
docs/        Plan y documentación
```

## Desarrollo local

Requiere Node 22. [Foundry](https://getfoundry.sh) solo hace falta para trabajar sobre `contracts/`, no para correr la app.

### 1. Instalar

```bash
git clone https://github.com/LautaAp23/RewApp.git
cd RewApp
cp .env.example .env.local
npm install
```

### 2. Base de datos (Postgres)

Las API routes (charges, fx, actividad, perfiles, vaults de respaldo) usan Postgres vía Prisma. Lo más simple es Docker:

```bash
docker run --name rewapp-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=rewapp -p 5432:5432 -d postgres:16
```

En `.env.local`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rewapp"
DATABASE_URL_UNPOOLED="postgresql://postgres:postgres@localhost:5432/rewapp"
```

(También sirve una base Neon propia: `DATABASE_URL` es la conexión pooled y `DATABASE_URL_UNPOOLED` la directa.)

Crear las tablas:

```bash
npx prisma migrate deploy
```

### 3. Variables de entorno (`.env.local`)

Las `NEXT_PUBLIC_*` ya vienen completas en `.env.example` (apuntan a Monad Testnet y a los contratos desplegados). Solo hay que completar:

- `DATABASE_URL` / `DATABASE_URL_UNPOOLED`: ver paso 2.
- `RELAYER_PRIVATE_KEY`: Insertar clave 
  3. Solo para `/api/onramp`: la address además necesita `ONRAMP_ROLE` en USDr. Un admin (`DEFAULT_ADMIN_ROLE`) la otorga con `grantRole(keccak256("ONRAMP_ROLE"), <address>)`. `payWithSig` y `redeemWithSig` son permissionless — cualquier relayer fondeado alcanza.

Sobre `NEXT_PUBLIC_RP_ID`: dejar el dominio de producción. `getRpId()` en `src/lib/account/derive.ts` detecta `localhost` automáticamente, así que las passkeys locales se atan a `localhost` y son **cuentas distintas** a las de producción (no se comparten).

### 4. Correr

```bash
npm run dev          # http://localhost:3000
npm run lint
npm run typecheck
npm test
npm run build
```

QR de pago de prueba (merchants demo deterministas de testnet; `base-url` por defecto es producción, en local pasar `http://localhost:3000`):

```bash
npm run demo:charge -- <monto> [ars|eur] [base-url]
```

> Nota: en Chrome de escritorio con perfil local las passkeys pueden no devolver PRF (limitación de Chrome, no del código). En el celular o con el autenticador virtual de DevTools (`WebAuthn` → *Enable virtual authenticator environment* + *prf*) sí funciona.

### Contratos (opcional)

```bash
cd contracts
forge build
forge test
```

## Contratos

- `USDr`: dólar de prueba (ERC-20 + permit EIP-2612, 6 decimales). Solo `ONRAMP_ROLE` puede mintear.
- `RewAppPay`: `payWithSig` cobra un `PaymentIntent` firmado (más el permit de USDr) y en la misma transacción reparte comercio / plataforma / recompensa del comercio y acredita RewPoints Customer y Commerce. También `setMerchantRule(WithSig)` (plantillas `CASHBACK` y `VISIT_BONUS`) y `redeemWithSig` (canje según el catálogo de cada público).
- ABIs y tipos EIP-712 para el frontend y el relayer: `src/lib/contracts` (regenerar con `cd contracts && forge build && cd .. && npm run contracts:export`).

Deploy en Monad Testnet (la clave del deployer necesita MON; queda como admin):

```bash
cd contracts
# opcional: MERCHANTS=0x...,0x...  RELAYER_ADDRESS=0x...  TREASURY_ADDRESS=0x...
forge script script/Deploy.s.sol --rpc-url monad_testnet --broadcast --private-key "$DEPLOYER_PRIVATE_KEY"
# Pago de punta a punta (comercio y pagador de prueba, el pagador con 0 MON)
forge script script/SmokePay.s.sol --rpc-url monad_testnet --broadcast --private-key "$DEPLOYER_PRIVATE_KEY"
```

Las direcciones quedan en `contracts/deployments/10143.json`.

Las passkeys quedan atadas a `NEXT_PUBLIC_RP_ID`. En producción es `rewapp-app.vercel.app` y no debe cambiarse.

### Monad Testnet (chain ID 10143)

Verificados en Sourcify (exact match):

| Contrato | Dirección |
| --- | --- |
| `USDr` | [`0xEDE21153D3675B8583A3622a071C7821C5aF8670`](https://testnet.monadexplorer.com/address/0xEDE21153D3675B8583A3622a071C7821C5aF8670) |
| `RewAppPay` | [`0xC1FECE4894229A6A39973163e5D000A1949a1898`](https://testnet.monadexplorer.com/address/0xC1FECE4894229A6A39973163e5D000A1949a1898) |

Relayer, admin y treasury: `0xb7F27e64bE387D3923d4399AE5e6b2767c086f59`.

```bash
forge verify-contract <dirección> src/USDr.sol:USDr --chain 10143 \
  --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org
```
