# Cómo arrancar y trabajar en este repo

Guía para el equipo y para cualquier agente (Claude Code, Codex, etc.) que toque el código.

Qué es el producto y por qué: [docs/PLAN.md](docs/PLAN.md).
Cómo está hecho y qué falta: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — §13 qué está hecho, §14 qué falta, §15 convenciones de código.
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

## Levantar el proyecto en local

Requiere Node 22 (hay `.nvmrc`), Docker y [Foundry](https://getfoundry.sh) si vas a tocar contratos.

### Las 8 variables de entorno

Van en `.env.local`. `.gitignore` tapa `.env*` menos `.env.example`, así que ninguna se commitea.

| Variable | Para qué | Si falta |
| --- | --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | `10143`. chainId de los dominios EIP-712 y de la policy de sesión | anda: hay fallback a `10143` |
| `NEXT_PUBLIC_RPC_URL` | `https://testnet-rpc.monad.xyz`. Lecturas del browser, del server y del relayer | anda: fallback al RPC default de viem |
| `NEXT_PUBLIC_RP_ID` | `rewapp-app.vercel.app` | anda: en dev da igual (ver abajo) |
| `NEXT_PUBLIC_USDR_ADDRESS` | Dirección de USDr (está en `.env.example`) | **rompe**: `requireContractAddresses()` tira error y no se crea la policy de sesión |
| `NEXT_PUBLIC_REWAPP_PAY_ADDRESS` | Dirección de RewAppPay | **rompe**: ídem |
| `DATABASE_URL` | Postgres. Lo usan 8 de las 9 API routes, y `/api/fx` lee de ahí los tipos de cambio | **rompe casi todo** |
| `DATABASE_URL_UNPOOLED` | `directUrl` de Prisma, para las migraciones | rompe `prisma migrate` |
| `RELAYER_PRIVATE_KEY` | La cuenta que paga el gas y tiene `ONRAMP_ROLE` en USDr | el resto anda; `/api/pay`, `/api/onramp` y `/api/redeem` tiran error |

**Mínimo para que levante:** las 2 direcciones de contrato y las 2 `DATABASE_URL`.
**Para el flujo completo** (cargar saldo → pagar → canjear): además `RELAYER_PRIVATE_KEY`, con MON para gas y `ONRAMP_ROLE`.

`DEPLOYER_PRIVATE_KEY`, que menciona el README, **no** va en `.env`: es solo para los scripts de Foundry y se pasa por shell. Para correr la app no hace falta.

### La trampa: hacen falta dos archivos, no uno

Next.js lee `.env.local`. La CLI de Prisma (`migrate`, `studio`) **no** lee `.env.local` — solo `.env`. Por eso `DATABASE_URL` y `DATABASE_URL_UNPOOLED` están duplicadas en los dos archivos. **Si cambiás una, cambiá la otra**, o `prisma migrate` te va a apuntar a otra base sin avisarte.

### Postgres local

```bash
docker run -d --name rewapp-pg -p 5433:5432 \
  -e POSTGRES_USER=rewapp -e POSTGRES_PASSWORD=rewapp -e POSTGRES_DB=rewapp postgres:16
```

Con esto, en `.env.local` **y** en `.env`:

```
DATABASE_URL=postgresql://rewapp:rewapp@localhost:5433/rewapp
DATABASE_URL_UNPOOLED=postgresql://rewapp:rewapp@localhost:5433/rewapp
```

Después:

```bash
cp .env.example .env.local   # y completá lo de arriba
npm install                  # el postinstall corre prisma generate
npx prisma migrate deploy    # las 4 migraciones, con los seeds adentro
npm run dev
```

Los seeds vienen dentro de las migraciones (tipos de cambio y los dos comercios demo ARS/EUR), así que no hay paso aparte. Para verificar: `npx prisma migrate status` tiene que decir *"Database schema is up to date!"*.

Lo único que no sale del repo es `RELAYER_PRIVATE_KEY`. Sin eso podés ver la app, crear cuenta con passkey y navegar, pero no cargar saldo ni pagar. Pedila al equipo.

## Cosas que no hay que romper

- **`NEXT_PUBLIC_RP_ID` está fijado en `rewapp-app.vercel.app`.** Las passkeys quedan atadas al `rpId`: cambiarlo en producción pierde todas las cuentas. En dev no importa, porque `getRpId()` (`src/lib/account/derive.ts`) solo usa la variable si coincide con `location.hostname` — en localhost el `rpId` efectivo es `localhost`.
- **Mera `0.2.0` está en preview.** No subas la versión sin revalidar los flujos de passkey: la API puede cambiar.
- **Nunca texto hardcodeado en pantallas ni jerga cripto en la UI.** Todo por `messages/{es,en,pt}.json` y `useTranslations`. Es el criterio central con el que nos juzgan, no una preferencia de estilo. El resto de las convenciones de código están en ARCHITECTURE §15.
- **Los montos onchain viajan como strings decimales** y las conversiones van con `bigint` (`localToUsdr`, `usdrToLocal`, `divRound`). Nunca `number` para dinero.

## Tablero

El sprint se maneja en un board de Trello cuyo dueño es Luis: él crea y mueve las tarjetas, y el equipo se autoasigna de `Por hacer` lo que quiera tomar. Si trabajando aparece algo que no está en el board, avisale para que entre como user story en lugar de perderse.
