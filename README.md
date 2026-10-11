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

## Desarrollo

Requiere Node 22 y Docker Desktop iniciado (contenedores Linux). Para trabajar
con contratos también se necesita [Foundry](https://getfoundry.sh).

Primera vez, desde la raíz del proyecto en PowerShell:

```powershell
if (-not (Test-Path .env.local)) { Copy-Item .env.example .env.local }
npm.cmd ci
npm.cmd run db:setup
npm.cmd run dev                  # http://localhost:3000
```

En Bash, usá `cp .env.example .env.local` y `npm` en lugar de `npm.cmd`.
Si ya tenés `.env.local`, conservá sus valores y configurá `DATABASE_URL` y
`DATABASE_URL_UNPOOLED` con la conexión local de `.env.example`.

`db:setup` levanta PostgreSQL 16 desde `compose.yaml`, espera a que esté listo
y aplica las migraciones de Prisma. Estas crean las tablas, los tipos de
cambio simulados (6 monedas) y los comercios Café Demo (ARS) y Bistro Demo
(EUR). Prisma CLI lee `.env.local` explícitamente a través de los scripts
`db:migrate` y `db:status`.

- Conexión local: `postgresql://rewapp:rewapp_local@127.0.0.1:5434/rewapp?schema=public`.
- El puerto se publica solo en loopback; las credenciales son exclusivamente
  para desarrollo local.
- Los datos persisten en el volumen Docker `rewapp-local_postgres_data`.
  `db:down` detiene y elimina los contenedores y la red, conservando ese volumen.

Para volver a iniciar, comprobar migraciones o detener la base:

```powershell
npm.cmd run db:up
npm.cmd run db:status
npm.cmd run db:migrate # Después de incorporar nuevas migraciones
npm.cmd run db:down
```

Para ver el selector: abrí `http://localhost:3000`, creá una cuenta de prueba
local y entrá a **Perfil → Tarjetas**. Las passkeys del dominio de producción
no sirven para iniciar sesión en localhost.

Para probar un QR local, con la app iniciada:

```powershell
npm.cmd run demo:charge -- 5000 ars http://localhost:3000
```

El script imprime el QR y un enlace al cobro local, que vence a los 15 minutos.
Crear el cobro y ver el selector no requiere la clave del relayer. Para cargar
saldo y liquidar pagos de prueba en Monad sí hay que configurar
`RELAYER_PRIVATE_KEY` en `.env.local`, con una cuenta autorizada en los contratos
desplegados y con MON de testnet para el gas.

Comprobaciones:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build

cd contracts
forge build
forge test
```

## Tarjetas de prueba

En Inicio, abrí el menú de usuario → **Tarjetas** → **Agregar tarjeta**.
También podés hacerlo desde el selector que aparece al abrir un cobro QR.
Completá número, titular, vencimiento y CVV con los datos ficticios de la
sección **Usar datos de prueba** y confirmá con tu passkey; se guarda por cuenta
en PostgreSQL y vuelve a aparecer en el selector, incluso después de recargar.
Si actualizás una instalación local existente, ejecutá `npm.cmd run db:migrate`.

El formulario solo acepta los números de prueba publicados en la pantalla.
Sus campos no se envían al servidor: se guarda únicamente el identificador
de la tarjeta ficticia. No cobra dinero. Los pagos con tarjeta todavía están pendientes; para pagar en el MVP,
elegí el saldo RewApp.

En desarrollo, Inicio también tiene **Testing · Generar QR de cobro**:
crea un cobro de ARS 5.000 de Café Demo y muestra su QR, vencimiento y un
enlace para abrirlo desde la misma cuenta. El botón y su API solo funcionan
con `npm.cmd run dev`. Crear el QR no realiza un pago ni necesita la clave
del relayer.

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
