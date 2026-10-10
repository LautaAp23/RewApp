# RewApp — Arquitectura y estado del proyecto

> Documento técnico para el equipo. Describe lo que está en la rama `main` remota
> (`origin/main` @ `fcace98`). Para el porqué del producto, los flujos y las
> decisiones de negocio: [docs/PLAN.md](PLAN.md). Para la marca: [docs/BRAND.md](BRAND.md).

---

## 1. Qué es RewApp

Red global de pagos prepagos con fidelización incluida (*Loyalty-as-a-Service*),
en forma de **PWA mobile-first**. Proyecto para la hackathon de Monad (tracks
*Consumer Products & Payments* y *Best Mera-Powered UX on Monad*).

- **El cliente** carga saldo (simulado) y paga escaneando un QR. En la misma
  transacción recibe la recompensa que definió el comercio (cashback % o bonus
  por visitas) y acumula **RewPoints Customer**.
- **El comercio** cobra al instante y acumula **RewPoints Commerce**.
- **Nadie ve cripto**: no hay wallets, gas, tokens ni frases semilla. La cuenta
  es la huella/FaceID (passkey vía Mera), el gas lo paga un relayer y todo se
  muestra en la moneda local de cada usuario.
- Liquidación onchain en **Monad Testnet** con un token de prueba `USDr`
  (ERC-20, 6 decimales, peg 1:1 USD).

Producción: `https://rewapp-app.vercel.app`. El dominio está **fijado**: las
passkeys quedan atadas al `rpId` y cambiarlo pierde todas las cuentas.

---

## 2. Stack

| Capa | Tecnología |
|---|---|
| App | Next.js 15 (App Router) + React 19 + TypeScript, desplegada en Vercel |
| Estilos | Tailwind CSS 4 con tokens propios en `globals.css` (`@theme`), solo modo oscuro |
| PWA | `manifest.ts` (standalone), íconos en `public/` y `brand/` |
| i18n | `next-intl` sin prefijo en la URL: `messages/{es,en,pt}.json`, cookie `NEXT_LOCALE`, fallback a `Accept-Language` |
| Identidad | Passkeys WebAuthn/PRF vía `@category-labs/mera` **0.2.0** (versión fijada, está en preview) + `@scure/bip32`/`bip39` |
| Chain | `viem`, Monad Testnet (chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`) |
| Contratos | Solidity 0.8.24+ con Foundry, OpenZeppelin 5.x (vendored en `contracts/lib/`) |
| DB | Postgres (Neon/Vercel Postgres) con Prisma 6 |
| Tests | Vitest (unitarios TS) + `forge test` (Solidity); CI en GitHub Actions |

Node 22 (`.nvmrc`). Dependencias de UI: `@zxing/browser` (escáner QR),
`qrcode` (solo en scripts), `server-only` (marca módulos del servidor).

---

## 3. Mapa del repositorio

```
src/
  app/
    page.tsx                     Landing: "Ingresar con mi passkey" / "Crear una cuenta nueva"
    layout.tsx                   Root layout: fuente, NextIntlClientProvider, AccountProvider
    manifest.ts                  PWA manifest (standalone, dark)
    globals.css                  Tokens de marca (@theme), animaciones pop/rise
    (cliente)/                   Área autenticada del cliente (guard + bottom nav)
      layout.tsx                 Guard de sesión: redirect a /?next=… o ConfirmIdentity
      inicio/                    Saldo, RewPoints, comercios con progreso, historial, menú
      cargar/                    Carga de saldo simulada (gatea al respaldo la 1ª vez)
      respaldo/                  Agregar passkey de respaldo (Mera secret vault)
      escanear/                  Escáner QR con @zxing/browser
      pagar/[chargeId]/          Pantalla de pago + pantalla de éxito
      canjear/                   Stub "Muy pronto" (falta el catálogo y la UI de canje)
    dev/passkey/                 POC manual de la integración Mera (dev only)
    api/                         Backend (ver §7)
  components/                    bottom-nav, confirm-identity, numeric-keypad,
                                 merchant-avatar, locale-switcher, fx-note, ui.ts
  i18n/                          config, request config, server action setLocale
  lib/
    account/                     Núcleo de cuenta Mera (ver §5)
    api/                         Tipos wire de la API + typed-data off-chain
    contracts/                   ABIs generados + dominios/tipos EIP-712
    server/                      Solo servidor: relayer, publicClient, revert map
    db.ts, fx.ts, money.ts, qr.ts, chain-client.ts, backup-prompt.ts
    use-activity.ts, use-currency.ts, use-fx.ts   Hooks de datos del cliente
contracts/                       Proyecto Foundry
  src/USDr.sol                   ERC-20 + permit, mint con ONRAMP_ROLE
  src/RewAppPay.sol              Liquidación de pagos, reglas, puntos, canje
  script/Deploy.s.sol            Deploy + grant roles + seed de catálogos onchain
  script/SmokePay.s.sol          Pago e2e contra el deploy (claves demo)
  test/                          Tests Foundry (fuzz incluido)
  deployments/10143.json         Direcciones en Monad Testnet
prisma/                          schema + migraciones (incluye seeds FX y comercios demo)
messages/                        es.json, en.json, pt.json
scripts/                         export-contracts.mjs (ABIs), demo-charge.mjs
docs/                            PLAN.md (producto), BRAND.md (marca), este archivo
.github/workflows/ci.yml         CI: web (lint/typecheck/test/build) + contracts
```

---

## 4. Arquitectura general

```
┌──────────── Celular (PWA) ────────────┐   ┌──────── Vercel / Next.js ─────────┐   ┌──────── Monad Testnet ────────┐
│ Passkey (WebAuthn PRF) vía Mera       │   │ API routes                         │   │ RewAppPay.sol                 │
│  PRF → mnemonic → HDKey → session     │   │  /api/pay      relayer (gasless)   │   │  split atómico, reglas del    │
│  clave privada SOLO en RAM            │──►│  /api/redeem   relayer             │──►│  comercio, puntos, canje      │
│ SessionPolicy acotada (firmas)        │   │  /api/onramp   mint USDr (ONRAMP)  │   │ USDr.sol (ERC-20 + permit)    │
│ UI cliente, QR, moneda local          │◄──│  /api/charges, /api/fx, /api/…     │◄──│                               │
└───────────────────────────────────────┘   │ Postgres (Neon) + Prisma           │   └───────────────────────────────┘
                                            └────────────────────────────────────┘
```

Principios rectores (de PLAN.md):

1. **Nada cripto en la UI.** Lenguaje de todos los días; ninguna pantalla muestra
   wallet, gas, token, dirección o firma.
2. **Postgres es almacenamiento no confiable.** Saldo, puntos, visitas y reglas
   viven onchain; Postgres guarda metadatos (perfiles, comercios, cobros, FX,
   vaults cifrados). Si se borra, la plataforma sigue funcionando.
3. **Gas patrocinado.** Toda acción del usuario es un *intent* EIP-712 firmado
   por su cuenta y enviado por el relayer, que paga el MON. El usuario nunca
   tiene MON.
4. **Sesión acotada.** La clave derivada de la passkey solo vive en memoria y un
   wrapper (`SessionPolicy`) decide qué puede firmar sin volver a pedir huella.

---

## 5. Identidad y cuenta (Mera) — `src/lib/account/`

Es la pieza central y la que cumple la bounty de Mera. Cuatro archivos:

### Derivación determinística — `derive.ts`

```
PRF de la passkey (32 bytes)
  → entropyToMnemonic (bip39, wordlist inglés)
  → mnemonicToSeedSync
  → HDKey.derive("m/44'/60'/0'/0/0")
  → createSecp256k1SigningSession (Mera)
  → getEvmAddress
```

La entropía de la cuenta **es** el PRF de la passkey principal: la cuenta se
reconstruye idéntica en cualquier dispositivo sin guardar nada ("prueba de los
apátridas"). El mapping es **inmutable**: cambiarlo cambia todas las direcciones.
`getRpId()` usa `NEXT_PUBLIC_RP_ID` solo si coincide con `location.hostname`
(en dev, el rpId es `localhost`).

### Flujos de passkey — `passkey-flows.ts`

| Función | Qué hace |
|---|---|
| `getAccountEntropy(rpId)` | `getPasskeyPrfOutput` sin credencial → si el `credentialId` tiene vault en `/api/backup-vaults/[id]`, descifra el vault (2º prompt) y devuelve la entropía de la cuenta principal. Si no hay vault (404), el PRF es la entropía. Devuelve `kind: "principal" \| "respaldo"` |
| `createAccountPasskey(rpId)` | `createPasskeyWithPrfOutput` → entropía nueva |
| `addBackupPasskey(rpId, entropy)` | `createSecretVaultWithNewPasskey` cifra la entropía con la passkey nueva → firma `backupVaultMessage` → `POST /api/backup-vaults` |

### Estado de sesión — `account-context.tsx`

`<AccountProvider>` (en el root layout) expone `useAccount()`:

- `status`: `signed-out | busy | signed-in | expired`. La sesión expira tras
  **15 min sin actividad** (se escucha `pointerdown`/`keydown`, chequeo cada 15 s)
  o al recargar (la dirección se guarda en `sessionStorage` y pide
  "Confirmá que sos vos").
- `signIn()`, `createAccount()`, `confirmIdentity()`, `addBackupPasskey()`,
  `endSession()`.
- `signPayment(intent, permitNonce)` y `signRedeem(intent)`: firman a través de
  la policy; fuera de alcance hacen **un** prompt de passkey y firman con la
  cuenta reconstruida (`confirmedBy`). Si la passkey es de otra cuenta →
  `WRONG_ACCOUNT`.
- Persistencia deliberadamente mínima: `localStorage` guarda solo una *pista* de
  `credentialId`; `sessionStorage` guarda la dirección para re-confirmar tras
  recarga. **Nunca** claves, entropía ni PRF — se ponen a cero (`fill(0)`,
  `session.end()`, `wipe`).

### SessionPolicy — `session-policy.ts`

Wrapper sobre el signer de Mera. **Por construcción no existe un método de
firma genérico**: solo puede firmar `PaymentIntent` + su `Permit` de USDr y
`RedeemIntent`, todos del dominio EIP-712 de `RewAppPay`.

| Límite | Valor | Superarlo → |
|---|---|---|
| Pago por operación | 20 USDr (`SESSION_MAX_PAYMENT`) | `NeedsConfirmation` → 1 prompt de huella |
| Gasto diario (UTC) | 100 USDr (`SESSION_DAILY_LIMIT`) | ídem; el ledger sobrevive entre sesiones del provider |
| Inactividad | 15 min | sesión `expired` → prompt |
| Deadline del intent | ≤ 30 min en el futuro | `PolicyRejection` (nunca se firma) |

Otros rechazos duros: intents de otra cuenta, monto ≤ 0, policy terminada.
Un `confirmedBy` válido también renueva la expiración. Tests en
`session-policy.test.ts` cubren la matriz completa.

### Errores — `errors.ts`

Todo error de Mera/WebAuthn/red se mapea a una `AccountErrorKey` con texto
humano en `messages/<locale>.json` (`errors.*`). Nunca se muestra el error crudo.

---

## 6. Frontend — `src/app/`

### Rutas

| Ruta | Qué hace | Estado |
|---|---|---|
| `/` | Landing: "Ingresar con mi passkey" (principal), "Crear una cuenta nueva" (secundario, con aviso anti-duplicados). Error → Reintentar / Usar otro dispositivo. Redirige a `?next=` o `/inicio` | Hecho |
| `/(cliente)` | Layout-guard: sin sesión → `/?next=<ruta>`; sesión expirada → `ConfirmIdentity`; incluye `BottomNav` (Inicio / Escanear destacado / Canjear) | Hecho |
| `/inicio` | Saldo USDr→moneda local, RewPoints, tarjetas "Tus comercios" con progreso de visitas, historial (pagos + cargas), aviso de respaldo, menú (idioma, respaldo, salir) | Hecho |
| `/cargar` | Teclado numérico grande → `POST /api/onramp`. Primera vez: redirige a `/respaldo?next=/cargar` salvo "Ahora no" (dura la pestaña) | Hecho |
| `/respaldo` | Propone crear la passkey de respaldo en otro dispositivo/llave | Hecho |
| `/escanear` | Cámara + `@zxing/browser`; valida que el QR sea `/pagar/<id>` del propio host | Hecho |
| `/pagar/[chargeId]` | GET del cobro (conversión + preview de recompensa) → botón "Pagar" → firma intent+permit → `POST /api/pay` → pantalla de éxito con cashback/puntos + vibración | Hecho |
| `/canjear` | Placeholder | **Stub — falta** |
| `/dev/passkey` | POC manual de la integración Mera (ingresar, crear, respaldo, vault adulterado, borrado de storage, demo de policy) | Dev only |
| `/comercio/*` | Panel del comercio | **No existe — falta** |

### Detalles de implementación

- Todo el área del cliente es `"use client"`; el guard vive en
  `(cliente)/layout.tsx`, no en middleware.
- Moneda del usuario: `useCurrency(address)` lee `GET /api/profile/[address]`
  (caéndole al idioma del navegador → región → `COUNTRY_CURRENCY`).
- FX: `useFxRates()` cachea `GET /api/fx` una sola vez por sesión de página.
- Actividad: `useActivity()` pega a `GET /api/activity/[address]`.
- Formato de dinero: `Intl.NumberFormat` con `moneyLocale()` (moneda → región
  BCP-47, p.ej. ARS se muestra `$ 1.234,50`); `formatUsdr()` convierte unidades
  base a la moneda del usuario. Toda pantalla con montos convertidos muestra
  `<FxNote/>` ("tipo de cambio simulado").
- i18n: sin prefijo en la URL (los QR sirven en cualquier idioma); locales
  `es`/`en`/`pt`, default `en`; `LocaleSwitcher` llama a la server action
  `setLocale` (cookie) + `router.refresh()`.
- Marca: solo oscuro; tokens `@theme` en `globals.css` (la paleta por defecto de
  Tailwind está desactivada); `primaryButton`/`secondaryButton`/`card` en
  `components/ui.ts`; tipografía Plus Jakarta Sans.

---

## 7. Backend — API routes (`src/app/api/`)

Todas validan el body campo por campo y responden `{ error: "<code>" }` con HTTP
4xx/5xx. Los `uint256` viajan como **strings decimales** en JSON.

| Endpoint | Qué hace |
|---|---|
| `POST /api/charges` | Crea un cobro. Exige firma EIP-712 `CreateCharge` del comercio (dominio `RewApp`, TTL 10 min), que exista `Merchant` con esa `address` y que `currency` sea la suya. Convierte `localAmount` → `usdAmount` (USDr, vía `FxRate`) y guarda `Charge` con `expiresAt = +15 min`. Devuelve `url: /pagar/<id>` |
| `GET /api/charges/[id]` | Datos para `/pagar`. Con `?payer=` y `?currency=` agrega el monto convertido y `reward`: preview onchain (`visits+1`, `previewMerchantReward`, `customerPointsPerUsd`). Marca `EXPIRED` lazy |
| `POST /api/pay` | Relayer de `PaymentIntent`+`Permit`. Verifica: cobro existe, `PENDING`, no vencido, `chargeId`/`merchant`/`amount` coinciden con la DB, y la firma EIP-712 del payer. Simula `payWithSig`, envía por el relayer, espera receipt, marca `PAID` y devuelve `{ txHash, merchantReward, customerPoints }` (del evento `PaymentSettled`) |
| `POST /api/redeem` | Relayer de `RedeemIntent`. Verifica firma, simula y envía `redeemWithSig`. Devuelve `{ txHash }` |
| `POST /api/onramp` | Carga simulada: convierte moneda local → USDr y el relayer llama `USDr.mint` (tiene `ONRAMP_ROLE`). Límites: ≤ 200 USDr por carga, 5 cargas/hora por dirección, 10/hora por IP; registra cada carga en `Onramp` |
| `GET /api/fx` | Tabla simulada `{ rates: {ARS: "1523.0868", …}, simulated: true }` con caché CDN 5 min |
| `GET /api/profile/[address]` | `{ alias, country, currency }` (default `USD`) |
| `PUT /api/profile/[address]` | Upsert del perfil, exige firma `ProfileUpdate` (dominio `RewApp`, TTL 10 min) |
| `GET /api/activity/[address]` | Home: balance USDr y `customerPoints` onchain, comercios visitados con su `visitsGoal` (regla `VISIT_BONUS`), últimas 20 cargas y pagos de Postgres |
| `POST /api/backup-vaults` | Guarda el vault de la passkey de respaldo. Verifica `parseSecretVault` y una firma `personal_sign` de la cuenta sobre `credentialId`+hash del vault. No reemplaza: 409 `vault_exists` |
| `GET /api/backup-vaults/[credentialId]` | Devuelve `{ accountAddress, vault }` o 404 (passkey principal). Es lo que distingue una passkey de respaldo al ingresar |
| `GET /api/backup-vaults?account=` | `{ count }` — saber si la cuenta tiene respaldo sin exponer vaults |

Endpoints del PLAN **todavía no implementados**: `GET /api/rewards` (catálogos).

### Relayer y cadena — `src/lib/server/`

- `chain.ts`: `publicClient` viem read-only sobre `NEXT_PUBLIC_RPC_URL`.
- `relayer.ts`: wallet del relayer desde `RELAYER_PRIVATE_KEY` (env, nunca en el
  repo). `relay(send)` **serializa todas las txs** en una cola por instancia y
  asigna nonces localmente (`getTransactionCount` con `blockTag: "pending"`);
  ante un error de nonce resincroniza una vez.
- `revert.ts`: mapea reverts del contrato (por nombre y por selector, para los
  errores de USDr que burbujean) a `RelayErrorCode` de la API.
- `chain-client.ts` (cliente): publicClient de solo lectura para el browser.

### Dos dominios EIP-712 distintos

1. **`RewAppPay`** (onchain): `PaymentIntent`, `RedeemIntent`, `RuleIntent` —
   los verifica el contrato; los firma la `SessionPolicy` (o la passkey).
2. **`RewApp`** (offchain, `src/lib/api/typed-data.ts`): `CreateCharge`,
   `ProfileUpdate` — los verifica la API con `verifyTypedData`, deadline ≤ 10
   min, siempre firmados tras un prompt fresco (nunca por la policy).

`chargeId` onchain = `keccak256(id de Postgres)` (`chargeIdToBytes32`).

---

## 8. Datos off-chain — Postgres + Prisma

Schema en `prisma/schema.prisma` (`db.ts` reutiliza el cliente en dev):

| Modelo | Campos clave | Uso |
|---|---|---|
| `Merchant` | `name`, `logoUrl`, `category`, `country`, `currency`, `address` (única) | Perfil del comercio; `address` es su cuenta |
| `Charge` | `localAmount`, `localCurrency`, `usdAmount` (BigInt, base units), `status` (`PENDING/PAID/EXPIRED`), `txHash`, `payer`, `expiresAt` | Cobro creado por el comercio |
| `Profile` | `address` (PK), `alias`, `country`, `currency` | Preferencias del usuario |
| `FxRate` | `currency` (PK), `usdRate` | Unidades de la moneda por 1 USD |
| `BackupVault` | `credentialId` (PK), `accountAddress`, `vault` (JSON de Mera) | Respaldo cifrado; sin la passkey no sirve |
| `PlatformReward` | `id`, `audience` (`CUSTOMER/COMMERCE`), `title`, `description`, `imageUrl`, `pointsCost`, `active` | Metadatos de los dos catálogos — **sin seed ni endpoint todavía** |
| `Onramp` | `address`, `ip`, montos, `txHash` | Auditoría + rate limit de `/api/onramp` |

Migraciones: `init`, `seed_fx_rates` (USD, ARS, EUR, BRL, MXN, CLP — tasas
reales cargadas a mano 2026-10-05), `onramp`, `seed_demo_merchants`
(**Café Demo** ARS `0x5257…9EeA` con cashback 10% > USD 5 y **Bistro Demo** EUR
`0xbF2f…0A0e`; claves determinísticas de testnet usadas por `scripts/`).

Deploy corre `prisma migrate deploy` automáticamente (`vercel-build`).

---

## 9. Contratos — `contracts/` (Foundry)

Config: solc `0.8.30`, `evm_version = cancun`, optimizer 200 runs, fuzz 512.
OpenZeppelin y forge-std vendored en `contracts/lib/`.

### `USDr.sol`

ERC-20 "RewApp Dollar" + `ERC20Permit` (EIP-2612), 6 decimales, `AccessControl`.
`mint` restringido a `ONRAMP_ROLE` (lo tiene el relayer).

### `RewAppPay.sol`

Contrato de liquidación. Todo llega como **intent EIP-712 firmado** y lo envía
el relayer; los intents de una misma cuenta comparten un nonce secuencial
(`Nonces` de OZ). Firmas verificadas con `SignatureChecker` (admite EOAs y
contratos).

**`payWithSig(PaymentIntent, sig, PermitData)`** — valida deadline, comercio
registrado, monto > 0, tope por pago y tope diario por cuenta, `chargeId` de un
solo uso, nonce y firma. Después, **en una sola tx**:

```
platformFee     = amount × feeBps / 10000
visits[payer][merchant] += 1
merchantReward  = cashback (si amount ≥ minAmount → amount × valueBps)
                + visit bonus (si visit % visitsGoal == 0 y amount ≥ min → fixedAmount o %)
                  cappeado al neto del comercio
merchantNet     = amount − platformFee − merchantReward
customerPoints[payer]    += amount × customerPointsPerUsd / 1e6
commercePoints[merchant] += amount × commercePointsPerUsd / 1e6
transferFrom payer → [merchant: net] [treasury: fee] [payer: reward]
emit PaymentSettled(...)
```

- El `permit` EIP-2612 es opcional (`deadline=0` lo salta) y su fallo no es
  fatal (un permit front-runeado deja el allowance).
- `previewMerchantReward(merchant, amount, visitCount)` — vista para la UI.
- Reglas del comercio: `CASHBACK` y `VISIT_BONUS` por `rules[merchant][type]`;
  se escriben con `setMerchantRule` (directo) o `setMerchantRuleWithSig`
  (gasless). Validan `valueBps ≤ 50%`, campos coherentes por plantilla.
- Puntos: `customerPoints` y `commercePoints` son **dos mappings separados, no
  ERC-20** → intransferibles por construcción.
- Catálogo onchain: `setReward(rewardId, audience, pointsCost, active)` (admin).
  `redeemWithSig(RedeemIntent, sig)` descuenta del saldo según el `audience` de
  la recompensa (un comercio solo canjea `COMMERCE`, un cliente `CUSTOMER`) y
  emite `RewardRedeemed`. La entrega del premio es off-chain (pendiente).
- Admin (`DEFAULT_ADMIN_ROLE`): `registerMerchant`/`unregisterMerchant`,
  `setReward`, `setFee` (≤ 10%), `setTreasury`, `setPointsRates`, `setLimits`.
- Errores con nombre (`Expired`, `ChargeAlreadyUsed`, `PaymentLimitExceeded`,
  `DailyLimitExceeded`, `InsufficientPoints`, `WrongAudience`, …) que la API
  mapea a códigos.

**Parámetros del deploy actual** (`Deploy.s.sol`, supuestos de PLAN §8):
fee 1.5%, 10 puntos/USD para ambos públicos, tope 500 USDr por pago y
1.000 USDr por día. Catálogos onchain sembrados: rewards 1-3 `CUSTOMER`
(300/500/1000 pts) y 101-102 `COMMERCE` (2000/5000 pts) — los ids deben
coincidir con `PlatformReward.id` en Postgres.

**Direcciones en Monad Testnet** (`deployments/10143.json`, verificados en
Sourcify): USDr `0xEDE21153D3675B8583A3622a071C7821C5aF8670`, RewAppPay
`0xC1FECE4894229A6A39973163e5D000A1949a1898`. Relayer = admin = treasury =
`0xb7F27e64bE387D3923d4399AE5e6b2767c086f59` (deployer de la demo).

**Scripts**: `Deploy.s.sol` (deploy + roles + seeds), `SmokePay.s.sol` (pago e2e
con claves demo determinísticas, el pagador con 0 MON).

**ABIs para el front**: `cd contracts && forge build && cd .. &&
npm run contracts:export` regenera `src/lib/contracts/abis.ts` (no editar a
mano). Los tipos EIP-712 viven en `src/lib/contracts/eip712.ts` y deben
coincidir con los typehash del contrato.

---

## 10. Flujos end-to-end

### Crear cuenta / ingresar

```
/  →  "Ingresar con mi passkey"       (1 prompt; si es de respaldo, 2)
    o "Crear una cuenta nueva" → aviso → "Crear cuenta" (1 prompt)
PRF → derive → session en RAM → status signed-in → router.replace(next || /inicio)
```

Errores de passkey → "Reintentar" / "Usar otro dispositivo" (WebAuthn híbrido).
Nunca se crea una cuenta como salida de un error.

### Respaldo (antes del primer depósito)

`/cargar` (1ª vez) → `/respaldo` → passkey actual recupera la entropía (si no
siguiera en RAM) → `createSecretVaultWithNewPasskey` → firma del mensaje →
`POST /api/backup-vaults` → Postgres indexa por `credentialId`. Al ingresar con
la passkey de respaldo: prompt 1 identifica la passkey, `GET
/api/backup-vaults/<credentialId>` devuelve el vault, prompt 2 lo descifra →
misma dirección.

### Pago por QR

```
Comercio crea cobro: firma CreateCharge → POST /api/charges → QR = /pagar/<id>
Cliente: cámara nativa (abre /pagar/<id>) o /escanear
  → GET /api/charges/<id>?payer&currency  (monto local + reward preview)
  → "Pagar": balance, nonces (RewAppPay y USDr) → signPayment(intent, permitNonce)
  → POST /api/pay → verify → simulate → relay → receipt → Charge=PAID
  → éxito: monto + cashback + puntos (evento PaymentSettled)
```

### Cargar saldo

`/cargar` → teclado → `POST /api/onramp` → relayer `mint` → tx → `/inicio`
muestra el balance nuevo.

### Canje (contrato listo, UI pendiente)

`signRedeem(RedeemIntent)` → `POST /api/redeem` → `redeemWithSig` →
`RewardRedeemed` onchain. Falta: catálogo (seed `PlatformReward` +
`GET /api/rewards`), la UI de `/canjear` y el fulfillment off-chain.

---

## 11. Testing y CI

- **Vitest** (`npm test`): `session-policy.test.ts` (matriz T5 completa),
  `money.test.ts`, `qr.test.ts`.
- **Forge** (`cd contracts && forge test`): `USDr.t.sol` + `RewAppPay.t.sol` —
  ~45 tests: split exacto (fuzz), reglas con/sin condición, cap al neto,
  replay/nonce/chargeId, deadlines, topes, canje cruzado prohibido, admin.
- **CI** (`.github/workflows/ci.yml`, push a main y PRs): job `web` (npm ci,
  lint, typecheck, `npm test`, build) y job `contracts` (`forge fmt --check`,
  build, test -vvv).

Comandos: `npm run dev | lint | typecheck | build | test | demo:charge |
contracts:export`.

---

## 12. Configuración

Variables (`.env.example` → `.env.local`):

| Var | Uso |
|---|---|
| `NEXT_PUBLIC_CHAIN_ID` | 10143 |
| `NEXT_PUBLIC_RPC_URL` | RPC de Monad Testnet |
| `NEXT_PUBLIC_RP_ID` | `rewapp-app.vercel.app` — **no cambiar** (las passkeys quedan atadas) |
| `NEXT_PUBLIC_USDR_ADDRESS` / `NEXT_PUBLIC_REWAPP_PAY_ADDRESS` | Contratos desplegados |
| `RELAYER_PRIVATE_KEY` | Clave del relayer — **solo servidor, nunca en el repo** |
| `DATABASE_URL` / `DATABASE_URL_UNPOOLED` | Postgres (pooled / directo para migraciones) |

---

## 13. Qué está hecho (en `main`)

**Fase 0 — Setup e identidad** ✅

- Next.js 15 + Tailwind 4 + PWA (manifest, íconos, tema oscuro de marca),
  despliegue en Vercel con dominio fijado.
- Prisma + Postgres (Neon), migraciones y seeds.
- POC de Mera en `/dev/passkey`: derivación PRF→cuenta, respaldo con secret
  vaults, vault adulterado rechazado, prueba de los apátridas.
- Identidad visual completa (BRAND.md) y i18n es/en/pt.
- CI con los dos jobs corriendo.

**Fase 1 — Contratos** ✅

- `USDr` y `RewAppPay` con reglas del comercio (cashback + visit bonus),
  RewPoints Customer/Commerce y canje por audiences; tests y fuzz en verde;
  deploy **verificado en Sourcify** + `SmokePay` e2e.

**Fase 2 — Cuenta, sesión y pago** ✅ (flujo del cliente completo)

- Módulo de cuenta reutilizable (`account-context` + `passkey-flows` +
  `session-policy` + `derive`), todo en memoria.
- Landing anti-duplicados, `ConfirmIdentity` tras expiración/recarga.
- Passkey de respaldo end-to-end (UI + API + verificación de firma).
- Policy de sesión acotada con tests.
- FX simulado + moneda local (6 monedas) + `Profile` firmado.
- API completa: `charges`, `pay`, `redeem`, `onramp` (rate limit), `fx`,
  `activity`, `profile`, `backup-vaults`; relayer con cola de nonces y mapeo
  de reverts.
- UI del cliente: `/inicio`, `/cargar`, `/respaldo`, `/escanear`,
  `/pagar/[chargeId]` con pantalla de éxito, bottom nav.
- Comercios demo (ARS y EUR) + `npm run demo:charge` para generar cobros con QR.

**Fase 3 — Comercio y pulido** 🚧 solo empezada (comercios demo + script)

**Fases 4–5 — Pruebas con usuarios y entregables** ⬜ no empezadas.

## 14. Qué falta por hacer

En orden sugerido (referencias a PLAN.md):

1. **Panel del comercio** (núcleo de la fase 3):
   - Rutas `/comercio`, `/comercio/cobrar` (teclado → `POST /api/charges` → QR a
     pantalla completa), `/comercio/movimientos` (cobros en vivo, < 3 s),
     `/comercio/recompensas` (plantillas → `RuleIntent` firmado; hoy solo hay
     tipos EIP-712 listos, falta la UI y decidir si se relayea
     `setMerchantRuleWithSig` o el comercio firma directo),
     `/comercio/canjear` (saldo `commercePoints` + catálogo).
   - Navegación/bottom-nav del comercio y sesión/policy de comercio
     (solo `RedeemIntent` Commerce; acciones del panel con huella).
   - Alta de comercios: hoy `registerMerchant` es manual por admin + seed en
     Postgres.
2. **Canje del cliente**: `/canjear` es un stub. Falta sembrar `PlatformReward`
   en Postgres (ids alineados a los del contrato: 1-3 CUSTOMER, 101-102
   COMMERCE), `GET /api/rewards` (metadatos) y la UI que llame
   `signRedeem` + `POST /api/redeem` (endpoint y contrato ya están).
3. **Fulfillment de recompensas**: `RewardRedeemed` solo descuenta puntos
   onchain; la entrega del premio es off-chain y está pendiente (PLAN §4.6).
4. **PWA completa**: falta el service worker / shell offline (PLAN pide
   "instalable" — hay manifest, falta SW y prueba Lighthouse T12).
5. **Pantalla de perfil**: `PUT /api/profile` existe pero no hay UI para
   editar alias/país/moneda.
6. **Decisiones de producto pendientes** (PLAN §8): catálogos definitivos,
   tasas de puntos y fee (el deploy usa los supuestos: 10 pts/USD y 1.5%).
7. **Demo global**: seed de comercios de 2-3 países y pagos entre monedas
   (T8, parcialmente cubierto por los dos comercios demo).
8. **Pruebas y entregables de hackathon**: prueba con ≥ 5 usuarios no cripto y
   2-3 comercios (T11), Lighthouse accesibilidad ≥ 90 (T12), auditoría de
   jerga con script de grep (T9), videos demo/pitch, README final para jueces
   con QR de comercios demo.
9. **Operación**: monitoreo del balance MON del relayer, réplica de vaults
   fuera de Postgres post-MVP, job para expirar cobros (hoy el `EXPIRED` es
   lazy, al leer).

## 15. Convenciones del código

- **Nunca** texto hardcodeado en pantallas: todo por `messages/*.json` y
  `useTranslations`. Nunca jerga cripto ni errores crudos en la UI.
- `uint256`/montos onchain viajan como strings decimales; dinero local como
  string con ≤ 2 decimales (`parseDecimal`); conversiones con `bigint`
  (`localToUsdr`, `usdrToLocal`, `divRound`).
- Módulos del servidor marcados con `import "server-only"`.
- Claves/entropía: solo en RAM, se limpian con `fill(0)`/`session.end()`; en el
  cliente solo se persiste una pista de `credentialId` y la dirección de
  sesión.
- Endpoints que leen estado fresco usan `Cache-Control: no-store`.
- Estilo: compacto, early-returns, nombres en inglés; textos de UI en español
  rioplatense ("vos"), traducidos a en/pt.
- Mera `0.2.0` está en preview: no actualizar la versión sin revalidar los
  flujos (API puede cambiar).
