# Cómo arrancar y trabajar en este repo

Guía para el equipo y para cualquier agente (Claude Code, Codex, etc.) que toque el código.
**Es la fuente canónica del setup local**: el README solo tiene el arranque mínimo y apunta acá.

Qué es el producto y cómo se mueve la plata: [docs/MODEL.md](docs/MODEL.md) — leer primero.
Alcance y flujos: [docs/PLAN.md](docs/PLAN.md).
Cómo está hecho y qué falta: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — §13 hecho, §14 pendiente, §15 convenciones de código.
Qué piden los jueces: [docs/HACKATHON.md](docs/HACKATHON.md).
Marca, tono de voz y paleta: [docs/BRAND.md](docs/BRAND.md).

No repitas acá nada de eso. Si algo de ahí cambia, se actualiza ahí.

Deadline de la hackathon: **13 oct 2026, 20:00 GMT-3** (envío interno). Todo se prioriza contra eso.

## Comandos

```bash
npm run dev        # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build   # exactamente lo que corre CI
cd contracts && forge fmt --check && forge build && forge test   # el otro job de CI
```

Si tocás los contratos, regenerá ABIs y tipos para el frontend:

```bash
cd contracts && forge build && cd .. && npm run contracts:export
```

Cobro de prueba con QR, contra los comercios demo deterministas de testnet (el `base-url` por
defecto es producción, así que en local hay que pasarlo):

```bash
npm run demo:charge -- <monto> [ars|eur] [base-url]
npm run demo:charge -- 3500 ars http://localhost:3000
```

---

# Setup local

Requiere **Node 22** (hay `.nvmrc`) y **Docker**. [Foundry](https://getfoundry.sh) solo hace falta
para trabajar sobre `contracts/`, no para correr la app.

## 1. Clonar e instalar

```bash
git clone https://github.com/LautaAp23/RewApp.git
cd RewApp
cp .env.example .env.local
npm install                  # el postinstall corre prisma generate
```

## 2. Postgres

Las API routes (charges, pay, onramp, fx, activity, profile, backup-vaults) usan Postgres vía
Prisma.

```bash
docker run -d --name rewapp-pg -p 5433:5432 \
  -e POSTGRES_USER=rewapp -e POSTGRES_PASSWORD=rewapp -e POSTGRES_DB=rewapp postgres:16
```

Usamos el **5433** a propósito: el 5432 suele estar tomado por otro Postgres local. Si lo tenés
libre, podés usarlo cambiando el puerto en los dos lados. También sirve una base Neon propia
(`DATABASE_URL` es la conexión pooled y `DATABASE_URL_UNPOOLED` la directa).

## 3. Variables de entorno

**Hacen falta dos archivos, y esto es lo que más tiempo hace perder:**

- **Next.js lee `.env.local`.**
- **La CLI de Prisma (`migrate`, `studio`) NO lee `.env.local` — solo lee `.env`.**

Por eso `DATABASE_URL` y `DATABASE_URL_UNPOOLED` van **en los dos archivos**. Si solo las ponés en
`.env.local`, el `prisma migrate` del paso 4 falla así:

```
Error code: P1012
error: Environment variable not found: DATABASE_URL_UNPOOLED.
```

Si cambiás una, cambiá la otra.

```bash
# en .env.local Y en .env
DATABASE_URL=postgresql://rewapp:rewapp@localhost:5433/rewapp
DATABASE_URL_UNPOOLED=postgresql://rewapp:rewapp@localhost:5433/rewapp
```

### Las 8 variables

`.gitignore` tapa `.env*` menos `.env.example`, así que ninguna se commitea. Las `NEXT_PUBLIC_*`
ya vienen completas en `.env.example`: apuntan a Monad Testnet y a los contratos desplegados.

| Variable | Para qué | Si falta |
| --- | --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | `10143`. chainId de los dominios EIP-712 y de la policy de sesión | anda: hay fallback a `10143` |
| `NEXT_PUBLIC_RPC_URL` | `https://testnet-rpc.monad.xyz`. Lecturas del browser, del server y del relayer | anda: fallback al RPC default de viem |
| `NEXT_PUBLIC_RP_ID` | `rewapp-app.vercel.app` | anda: en dev da igual (ver abajo) |
| `NEXT_PUBLIC_USDR_ADDRESS` | Dirección de USDr | **rompe**: `requireContractAddresses()` tira error y no se crea la policy de sesión |
| `NEXT_PUBLIC_REWAPP_PAY_ADDRESS` | Dirección de RewAppPay | **rompe**: ídem |
| `DATABASE_URL` | Postgres. Lo usan 8 de las 9 API routes, y `/api/fx` lee de ahí los tipos de cambio | **rompe casi todo** |
| `DATABASE_URL_UNPOOLED` | `directUrl` de Prisma, para las migraciones | rompe `prisma migrate` |
| `RELAYER_PRIVATE_KEY` | La cuenta que paga el gas de las transacciones | el resto anda; `/api/pay`, `/api/onramp` y `/api/redeem` tiran error |

**Mínimo para que levante:** las 2 direcciones de contrato y las 2 `DATABASE_URL`.
**Para el flujo completo** (fondear → pagar → canjear): además `RELAYER_PRIVATE_KEY`.

Sobre el relayer: necesita **MON para gas**, y además `ONRAMP_ROLE` en USDr **solo** para
`/api/onramp`. Ese rol lo otorga un admin (`DEFAULT_ADMIN_ROLE`) con
`grantRole(keccak256("ONRAMP_ROLE"), <address>)`. `payWithSig` y `redeemWithSig` son
permissionless: para esos dos alcanza cualquier relayer con MON. Pedí la clave al equipo; sin ella
podés ver la app, crear cuenta con passkey y navegar, pero no fondear ni pagar.

`DEPLOYER_PRIVATE_KEY`, que menciona el README, **no** va en `.env`: es solo para los scripts de
Foundry y se pasa por shell.

## 4. Migraciones y arranque

```bash
npx prisma migrate deploy    # las 4 migraciones, con los seeds adentro
npm run dev
```

Los seeds vienen dentro de las migraciones (tipos de cambio y los dos comercios demo ARS/EUR), así
que no hay paso aparte. Para verificar: `npx prisma migrate status` tiene que decir
*"Database schema is up to date!"*.

## 5. Passkeys en local

`NEXT_PUBLIC_RP_ID` se deja con el dominio de producción. `getRpId()`
(`src/lib/account/derive.ts`) solo usa la variable si coincide con `location.hostname`, así que en
local el `rpId` efectivo es `localhost` — las passkeys locales quedan atadas a `localhost` y son
**cuentas distintas** a las de producción: no se comparten.

**Chrome de escritorio con passkeys en el perfil local puede no devolver PRF**, que es lo que
necesitamos para derivar la cuenta. Es una limitación de Chrome, no del código. Para probar en
local: usá el celular, o el autenticador virtual de DevTools
(*WebAuthn* → **Enable virtual authenticator environment** + **prf**).

---

# Cosas que no hay que romper

- **`NEXT_PUBLIC_RP_ID` está fijado en `rewapp-app.vercel.app`.** Las passkeys quedan atadas al
  `rpId`: cambiarlo en producción pierde todas las cuentas.
- **Mera `0.2.0` está en preview.** No subas la versión sin revalidar los flujos de passkey: la
  API puede cambiar.
- **Nunca texto hardcodeado en pantallas ni jerga cripto en la UI.** Todo por
  `messages/{es,en,pt}.json` y `useTranslations`. Es el criterio central con el que nos juzgan, no
  una preferencia de estilo. El resto de las convenciones están en ARCHITECTURE §15.
- **Los montos onchain viajan como strings decimales** y las conversiones van con `bigint`
  (`localToUsdr`, `usdrToLocal`, `divRound`). Nunca `number` para dinero.
- **Si la pantalla principal parece una billetera, está mal.** Ver docs/MODEL.md §5.3.

# Tablero

El sprint se maneja en un board de Trello cuyo dueño es Luis: él crea y mueve las tarjetas, y el
equipo se autoasigna de `Por hacer` lo que quiera tomar. Si trabajando aparece algo que no está en
el board, avisale para que entre como user story en lugar de perderse.
