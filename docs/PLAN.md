# RewApp: plan del proyecto

> Hackathon de Monad. Tracks: **Consumer Products & Payments** y **Best Mera-Powered UX on Monad**.
> Deadline: **14 oct 2026, 00:59 GMT-3**. Envío interno: **13 oct a las 20:00 (GMT-3)**.

---

## 1. Qué es RewApp

RewApp es una red global de pagos prepagos con fidelización incluida (*Loyalty-as-a-Service*), en forma de PWA mobile-first.

- **El cliente** carga saldo y paga en cualquier comercio adherido escaneando un QR. En el mismo instante pasan dos cosas:
  1. Recibe la **recompensa que definió el comercio**, si cumple las condiciones que el comercio fijó (por ejemplo, un % de cashback en compras mayores a cierto monto, o un bonus en la 5ª visita).
  2. Acumula **RewPoints Customer** por usar la plataforma. Después los canjea por recompensas que define la plataforma.

  Todos los montos se le muestran en **su moneda local**.
- **El comercio** cobra en el momento (liquidación instantánea en Monad) y obtiene un programa de fidelidad sin tener que integrar ni mantener nada. Además, por cada cobro con RewApp acumula **RewPoints Commerce**, que canjea por recompensas que define la plataforma.
- **Nadie ve cripto**: no hay wallets, gas, tokens, direcciones ni frases semilla. La cuenta es la huella o el FaceID (passkey con Mera).

### Por qué onchain

En **una sola transacción** se cobra el pago, se evalúan las condiciones del comercio, se reparte entre comercio, plataforma y la recompensa del cliente, y se acreditan los RewPoints Customer del cliente y los RewPoints Commerce del comercio. Sin conciliación, sin T+2, sin un sistema de puntos aparte y sin depender del país del comercio. Es la misma red y la misma liquidación en cualquier lugar del mundo.

### Mercado

- **Visión:** comercio global. Cualquier comercio físico chico o mediano y sus clientes frecuentes, en cualquier país.
- **Segmento inicial (beachhead) para validar:** cafeterías, panaderías y almacenes de barrio que pagan comisiones altas, cobran a T+N y no tienen programa de fidelidad. Sus clientes son frecuentes, de 18 a 35 años, y ya pagan con QR o con el celular. El piloto arranca en Salta (Argentina) porque ahí podemos testear en persona. El producto no tiene nada específico de Salta.
- **Por qué se separan visión y segmento:** el criterio *Founder & Market Readiness* (25%) pide "un segmento específico y con nombre". La visión global va en el pitch y el segmento concreto va en la evidencia.

### Definition of Done

Un usuario nuevo toca **"Crear una cuenta nueva"**, confirma con su huella, recibe saldo simulado, paga un QR sin ninguna aprobación extra, ve acreditada la recompensa del comercio (en su moneda local) y sus RewPoints Customer, y el comercio ve en su panel el cobro acreditado y sus RewPoints Commerce. Ninguno de los dos ve un mensaje cripto.

---

## 2. Alcance

### Incluye

- PWA instalable (manifest y service worker) en Next.js, mobile-first.
- **Acceso pensado contra cuentas duplicadas:** "Ingresar con mi passkey" como opción principal y "Crear una cuenta nueva" como opción secundaria y explícita. Cada una dispara un solo prompt biométrico. Nunca se crea una cuenta automáticamente (ver 4.2).
- **Passkey de respaldo antes del primer depósito:** una segunda passkey que abre la misma cuenta, cifrada con los secret vaults de Mera (ver 4.2).
- Cuenta con Mera (`@category-labs/mera`), derivada del PRF de la passkey.
- **Sesión de firma de Mera con alcance acotado:** los pagos dentro del alcance no piden prompt.
- **Gas patrocinado** con un relayer e intenciones de pago firmadas (EIP-712). El usuario nunca necesita MON.
- **Moneda local del cliente y del comercio:**
  - Liquidación onchain en un único token de prueba con valor en dólares (`USDr`).
  - El monto del cobro se fija en la moneda local del comercio y se convierte a `USDr` al crear el cobro.
  - El cliente ve todo en su moneda local (`Intl.NumberFormat` según su país o configuración).
  - Los tipos de cambio son una tabla simulada en Postgres, actualizable por script.
- Carga de saldo simulada ("Cargar saldo") en la moneda local, que mintea el equivalente en `USDr`.
- Pago por QR:
  - El comercio genera un cobro. El QR es un link `https://rewapp-app.vercel.app/pagar/<chargeId>`, así que la cámara nativa del celular abre la app directo.
  - También hay un escáner dentro de la app.
- **Triple gamificación onchain:**
  1. **Comercio → cliente.** Cada comercio arma sus reglas de recompensa a partir de plantillas, desde su panel. Se guardan y se evalúan onchain, y las paga el comercio de su neto. Plantillas del MVP:
     - **Cashback %**, opcionalmente con un monto mínimo de compra.
     - **Bonus por visitas**: en la visita N el cliente recibe un monto fijo o un %.
  2. **Plataforma → cliente.** Cada pago acredita **RewPoints Customer**: un saldo intransferible onchain, a razón de X puntos por cada USD 1 pagado (X lo define la plataforma). Se canjean en el **catálogo de recompensas para clientes** que arma la plataforma.
  3. **Plataforma → comercio.** Cada cobro acredita **RewPoints Commerce** al comercio: otro saldo intransferible onchain, separado del de clientes, a razón de Y puntos por cada USD 1 cobrado. Se canjean en el **catálogo de recompensas para comercios**, que la plataforma definirá más adelante.

  Ver Decisiones pendientes.
- Panel del comercio: crear un cobro y mostrar su QR, ver los cobros en vivo, ver el saldo, los clientes frecuentes y sus RewPoints Commerce, y canjearlos.
- Perfiles de comercios (nombre, logo, rubro, país y moneda) en Postgres con Prisma.
- Prueba de los apátridas superada: la cuenta se reconstruye completa solo con la passkey.

### No incluye

- App nativa (React Native o Expo) ni publicación en tiendas.
- Crédito, cuotas ni BNPL.
- On/off-ramp real, KYC, integración bancaria ni proveedores reales de FX. Todo es simulado con tokens de prueba y una tabla de tipos de cambio.
- Recuperación manual de cuenta, soporte que devuelva el acceso, y pedir DNI u otro documento. Un documento puede ayudar a detectar una coincidencia, pero no devuelve el acceso a una passkey perdida. Si se pierden la passkey principal y la de respaldo, se pierde la cuenta.
- Mainnet y dinero real.
- Smart accounts o EIP-7702 (queda como extra si sobra tiempo).
- Transferencias P2P, retiro a banco y stablecoins por país.
- Reglas del comercio fuera de las plantillas (por ejemplo, condiciones combinadas o por horario).
- XP y niveles.
- Comisión variable por volumen del comercio. La gamificación plataforma → comercio se hace solo con RewPoints Commerce.

---

## 3. Experiencia de usuario (UX intuitiva)

**Objetivo:** que una persona que nunca usó cripto complete todo el flujo (crear cuenta, cargar, pagar, ver su recompensa y canjear) **sin ayuda y sin dudar**. Es el criterio central de *Design & Craft* (20%) y de la bounty de Mera.

### Principios

1. **Una acción principal por pantalla.** Un botón grande y claro (por ejemplo "Pagar $3.500"), y las acciones secundarias más chicas.
2. **Lenguaje de todos los días.** Saldo, pagar, cobrar, recompensa, puntos, comprobante. Nunca wallet, gas, token, firma, red o dirección.
3. **El dinero siempre en la moneda local**, con su símbolo y formato (`$ 3.500,00`, `€ 3,50`). Nunca decimales raros ni siglas de tokens.
4. **Pocos toques.** Crear cuenta: 1 toque + huella. Pagar: escanear + 1 toque "Pagar". Canjear: 2 toques.
5. **Respuesta inmediata.** Cada toque muestra un cambio visual en menos de 100 ms (botón presionado, spinner). La confirmación del pago aparece en menos de 2 s (Monad confirma en ~1 s).
6. **Celebrar la recompensa.** Al pagar se muestra una pantalla de éxito con el monto pagado, la recompensa del comercio ("¡Ganaste $350 de cashback en Café Central!") y los puntos sumados, con una animación corta y vibración (`navigator.vibrate`).
7. **Errores en lenguaje humano y con salida.** Por ejemplo "No te alcanza el saldo. ¿Cargar $X?" en lugar de "insufficient balance". Nunca se muestran errores técnicos crudos.
8. **Siempre se sabe qué falta.** Por ejemplo "Te faltan 2 visitas para tu premio en Café Central", o "Con 500 puntos más canjeás un café".
9. **Accesible.** Botones de al menos 48 px, contraste AA, texto que respeta el tamaño de fuente del sistema, se puede usar con una mano y tiene modo oscuro.
10. **Se siente como una app.** Instalable en la pantalla de inicio, sin barras del navegador, con splash e ícono propio, y las pantallas principales cargan offline (shell en caché).

### Flujos clave

| Flujo | Pasos que ve el usuario |
|---|---|
| Primer uso | Landing: "Pagá y ganá recompensas en tus comercios favoritos" → **Ingresar con mi passkey** (principal) o **Crear una cuenta nueva** (secundario) → aviso "Si ya tenías una cuenta, ingresá con tu passkey anterior para acceder a tu saldo" → **Crear cuenta** → huella → Inicio |
| Protección antes del primer depósito | Al tocar "Cargar saldo" por primera vez: "Protegé tu saldo: agregá una passkey de respaldo en otro dispositivo o llave de seguridad" → **Agregar respaldo** → huella actual + passkey nueva → "Listo, tu cuenta está protegida" → carga de saldo. Se puede posponer con "Ahora no", pero el aviso vuelve mientras haya saldo sin respaldo |
| Volver a entrar | Landing → **Ingresar con mi passkey** → huella → Inicio con el saldo y los RewPoints Customer de siempre. Con la passkey principal es una huella. Con la de respaldo son dos: la primera identifica la passkey y la segunda abre el respaldo |
| Ingreso cancelado o fallido | "No pudimos leer tu passkey" → **Reintentar** o **Usar otro dispositivo** (QR para usar la passkey de otro celular). Nunca se ofrece crear una cuenta como salida de este error |
| Pagar | Cámara del celular o botón "Escanear" → pantalla con el logo del comercio, el monto y la recompensa que se va a ganar → **Pagar** → pantalla de éxito |
| Ver recompensas | Inicio: saldo grande arriba, puntos abajo, tarjetas "Tus comercios" con el progreso de visitas |
| Canjear | Pestaña Canjear → elegir recompensa → **Canjear** → código o confirmación |
| Comercio canjea sus puntos | Pestaña Recompensas → "Mis RewPoints Commerce" → elegir recompensa → **Canjear** |
| Comercio cobra | Panel → ingresar monto con teclado numérico grande → QR a pantalla completa → "¡Cobrado!" con sonido |
| Comercio configura recompensas | Recompensas → elegir plantilla ("Cashback" o "Premio por visitas") → completar 1 o 2 campos con vista previa en lenguaje natural ("Tus clientes ganan 10% en compras de más de $5.000") → **Guardar** |

### Navegación

- **Cliente:** barra inferior con 3 pestañas: Inicio, Escanear (botón central destacado) y Canjear. El perfil va en el ícono de arriba a la derecha.
- **Comercio:** barra inferior con 3 pestañas: Cobrar, Movimientos y Recompensas (las que el comercio da a sus clientes y el canje de sus RewPoints Commerce).

### Cómo se valida

- Prueba con usuarios (T11): se mide el **% que completa cada flujo sin ayuda**, con meta de 100% en "Primer uso" y "Pagar".
- Se cuenta cada momento en que alguien duda o pregunta "¿y ahora qué?", y se corrige antes de grabar el demo.
- Lighthouse: Accessibility ≥ 90 (T12).

---

## 4. Arquitectura

Un solo proyecto **Next.js (App Router)** en Vercel, que tiene el frontend PWA y las API routes, más contratos **Foundry** en **Monad Testnet** (chain ID `10143`, RPC `https://testnet-rpc.monad.xyz`, verificado).

```
┌──────────── Celular (PWA) ────────────┐     ┌──────── Vercel / Next.js API ────────┐     ┌──────── Monad Testnet ────────┐
│ Passkey + Mera                        │     │ /api/pay     relayer (paga el gas)   │     │ RewAppPay.sol                 │
│  PRF → seed → clave → sesión (RAM)    │ ──► │ /api/onramp  mint de saldo simulado  │ ──► │  split atómico, reglas del    │
│ Policy de sesión (alcance/expiración) │     │ /api/charges cobros + conversión FX  │     │  comercio, puntos, canje      │
│ UI cliente / comercio, QR, puntos     │ ◄── │ Postgres + Prisma (no confiable)     │ ◄── │ USDr.sol (ERC-20 + permit)    │
└───────────────────────────────────────┘     └──────────────────────────────────────┘     └───────────────────────────────┘
```

### 4.1 Frontend (PWA)

- Next.js, TypeScript, Tailwind, `viem`, `@category-labs/mera` (versión fijada) y `@scure/bip32`, `@scure/bip39`.
- Rutas:

  | Ruta | Para qué |
  |---|---|
  | `/` | Landing con "Ingresar con mi passkey" (principal) y "Crear una cuenta nueva" (secundario) |
| `/respaldo` | Agregar o ver la passkey de respaldo |
  | `/inicio` | Saldo, RewPoints Customer, recompensas recibidas e historial |
| `/canjear` | Catálogo de recompensas de la plataforma para clientes |
  | `/cargar` | Carga de saldo simulada |
  | `/pagar/[chargeId]` | Pantalla de pago |
  | `/escanear` | Escáner QR dentro de la app |
  | `/comercio` | Panel del comercio |
  | `/comercio/cobrar` | Crear un cobro y mostrar el QR |
| `/comercio/recompensas` | Configurar las recompensas del comercio con las plantillas |
| `/comercio/canjear` | Saldo de RewPoints Commerce y catálogo de recompensas para comercios |

- Escáner QR con `@zxing/browser`.
- Formato de moneda con `Intl.NumberFormat(locale, { style: "currency", currency })`.

### 4.2 Cuenta e identidad (Mera)

Flujo confirmado en la documentación oficial de Mera:

1. **"Ingresar con mi passkey"** (opción principal) llama a `getPasskeyPrfOutput({ rpId })` **sin** credencial guardada, con la salt por defecto de Mera (`sha256("mera.prf.salt.v1")`, estable entre versiones). El navegador ofrece las passkeys de RewApp que ya existen. Es un prompt.
2. Con el `credentialId` que devuelve, la app busca en Postgres si esa passkey tiene un vault de respaldo:
   - **Sin vault (passkey principal):** el PRF es la entropía de la cuenta.
   - **Con vault (passkey de respaldo):** `decryptSecretVaultWithPasskey({ rpId, vault })` devuelve la entropía de la cuenta principal. Pide un segundo prompt: cada vault usa su propia salt aleatoria, y Mera 0.2.0 no expone descifrar con un PRF ya obtenido.
3. La cuenta se deriva así: entropía → `entropyToMnemonic` → `mnemonicToSeedSync` → `HDKey.derive("m/44'/60'/0'/0/0")` → `createSecp256k1SigningSession` → `toViemAccount`.
4. **"Crear una cuenta nueva"** (opción secundaria) primero muestra: "Si ya tenías una cuenta, ingresá con tu passkey anterior para acceder a tu saldo", con **Ingresar con mi passkey** como botón principal y **Crear cuenta** como secundario. Solo después llama a `createPasskeyWithPrfOutput({ rp: { id: "rewapp-app.vercel.app" }, user })`. Es un prompt.
5. **Nunca se crea una cuenta automáticamente.** Si el ingreso se cancela o falla (`PASSKEY_OPERATION_FAILED`, `PRF_UNAVAILABLE`), se ofrece reintentar o usar otro dispositivo (WebAuthn híbrido por QR).
6. La clave privada y la entropía viven **solo en memoria**. Nunca se persisten. `session.end()` pone en cero la clave de la sesión, y la app pone en cero los buffers de entropía y PRF que asignó.
7. El `credentialId` en localStorage es solo una pista opcional. Si falta, todo sigue funcionando.

#### Passkey de respaldo (antes del primer depósito)

Pasar la prueba de los apátridas no protege contra perder la passkey: borrar el storage se resuelve con la passkey, pero si se pierde la passkey se pierde la cuenta. Una segunda passkey creada sin más generaría **otra cuenta distinta**. Por eso el respaldo usa los [secret vaults de Mera](https://mera.category.xyz/concepts/secret-vaults/) para que las dos passkeys abran la misma cuenta:

1. Al tocar "Cargar saldo" por primera vez, la app propone agregar el respaldo.
2. `getPasskeyPrfOutput` con la passkey principal recupera la entropía de la cuenta (un prompt; se omite si la entropía sigue en memoria porque la cuenta se acaba de crear).
3. `createSecretVaultWithNewPasskey({ rp, user, secret: entropía })` crea la passkey de respaldo y cifra la entropía con su PRF (un prompt, o dos si el autenticador no evalúa PRF al crear). La app recomienda crearla en otro dispositivo o en una llave de seguridad, porque una copia en el mismo gestor no protege contra perderlo.
4. El vault (JSON con `credentialId`, `prfSalt`, `nonce` y `ciphertext`) se envía a `POST /api/backup-vaults` firmado por la cuenta, y se guarda en Postgres indexado por `credentialId`. El backend verifica la firma y no permite reemplazar un vault existente. Es **almacenamiento no confiable**: sin la passkey, el vault no sirve para nada.
5. La app registra que la cuenta tiene respaldo y deja de mostrar el aviso.

Límites conocidos:
- Si alguien pierde las dos passkeys, o cambia de dispositivo sin tener ninguna disponible, la app no puede saber que esa persona ya tenía una cuenta. Ningún identificador extra, ni siquiera el DNI, devolvería por sí solo el acceso.
- Si se borra el vault de Postgres, la passkey de respaldo deja de servir, pero la principal sigue funcionando. Para el MVP se acepta. Después del MVP, el vault puede replicarse fuera de Postgres.
- El mismo flujo aplica a las cuentas de comercio.

### 4.3 Diseño de la sesión

| Acción | ¿Prompt? | Razón |
|---|---|---|
| Pagar ≤ USD 20 (equivalente local) con sesión activa | No | Dentro del alcance |
| Cargar saldo simulado | No | No mueve fondos del usuario |
| Canjear RewPoints Customer | No | Dentro del alcance (typed data `RedeemIntent`). No mueve dinero |
| Pagar más que el tope por pago o superar el tope diario | Sí, huella | Fuera del alcance. El contrato también lo rechaza sin una firma nueva |
| Primera acción tras 15 min de inactividad, recarga o cierre de la app | Sí, un toque | Sesión expirada. Aviso: "Confirmá que sos vos" |
| Cerrar sesión | No | `session.end()` |

La policy del comercio solo firma `RedeemIntent` de RewPoints Commerce; las acciones del panel (crear cobros, cambiar reglas) piden huella la primera vez en la sesión. La policy del cliente solo firma typed data `PaymentIntent` y `RedeemIntent` del dominio EIP-712 de `RewAppPay`. Cualquier otra firma se rechaza.

### 4.4 Backend (Next.js API routes)

| Endpoint | Función |
|---|---|
| `POST /api/charges` | El comercio crea un cobro en su moneda: se convierte a `USDr` con la tabla FX y se guarda `Charge` con `pending` |
| `GET /api/charges/[id]` | Datos del cobro para la pantalla de pago (monto en la moneda del cliente, comercio, logo) |
| `POST /api/pay` | Recibe intent y firma. Verifica la firma, simula y envía `payWithSig` desde la wallet del relayer. Devuelve el receipt |
| `POST /api/onramp` | Mintea `USDr` a la dirección del usuario. Tiene rate limit por dirección |
| `GET /api/profile/[address]` | Alias, país y moneda preferida |
| `GET /api/rewards` | Catálogo de recompensas de la plataforma (metadatos) |
| `POST /api/backup-vaults` | Guarda el vault de la passkey de respaldo. Exige una firma de la cuenta sobre el `credentialId` y el hash del vault. No reemplaza vaults existentes (409) |
| `GET /api/backup-vaults/[credentialId]` | Devuelve el vault de esa passkey, o 404 si es una passkey principal |

- El relayer tiene un nonce manager propio y su clave en una variable de entorno de Vercel, nunca en el repo.
- Postgres en Neon o Vercel Postgres, con Prisma.

### 4.5 Datos off-chain (Prisma)

- `Merchant { id, name, logoUrl, category, country, currency, address }`
- `Charge { id, merchantId, localAmount, localCurrency, usdAmount, status, txHash, payer }`
- `Profile { address (PK), alias, country, currency }`
- `FxRate { currency, usdRate, updatedAt }`
- `BackupVault { credentialId (PK), accountAddress, vault (JSON de Mera), createdAt }`: vault cifrado de la passkey de respaldo. Sin la passkey no sirve
- `PlatformReward { id, audience (CUSTOMER | COMMERCE), title, description, imageUrl, pointsCost, active }`: metadatos de los dos catálogos. El costo en puntos y el público de cada recompensa también se registran onchain

Postgres es **almacenamiento no confiable**: si se borra, el saldo, los RewPoints Customer y Commerce, las visitas y las reglas de los comercios siguen onchain.

### 4.6 Contratos (Foundry, Solidity)

- **`USDr`**: ERC-20 con permit EIP-2612 (OpenZeppelin), 6 decimales. `mint` está restringido a `ONRAMP_ROLE`.
- **`RewAppPay`**:
  - `registerMerchant(addr)` (admin).
  - `setMerchantRule(ruleType, minAmount, valueBps, fixedAmount, visitsGoal, active)`: solo puede llamarla el comercio, sobre sus propias reglas. `ruleType` puede ser `CASHBACK` o `VISIT_BONUS`.
  - `payWithSig(PaymentIntent{payer, merchant, amount, chargeId, nonce, deadline}, sig, permit)`.
  - Validaciones: firma, `deadline`, `nonce`, `chargeId` de un solo uso, tope por pago y tope diario por usuario.
  - Split atómico:
    - `fee = amount × feeBps` (comisión de la plataforma, fija en el MVP)
    - `merchantReward`: se evalúan las reglas activas del comercio (cashback y bonus por visitas) y sale del neto del comercio
    - Resultado: el comercio recibe `amount − fee − merchantReward`, la plataforma `fee` y el cliente `merchantReward`.
  - RewPoints Customer: `customerPoints[payer] += amount × customerPointsPerUsd`.
  - RewPoints Commerce: `commercePoints[merchant] += amount × commercePointsPerUsd`.
  - Ninguno de los dos es un ERC-20, así que no se pueden transferir. Son dos saldos separados y no se pueden mezclar.
  - `setReward(rewardId, audience, pointsCost, active)` (admin): registra recompensas de cada catálogo.
  - `redeemWithSig(RedeemIntent{account, rewardId, nonce, deadline}, sig)`, enviada por el relayer: según el `audience` de la recompensa descuenta RewPoints Customer o Commerce, y emite `RewardRedeemed(account, rewardId, audience, pointsCost)`. Un comercio solo canjea recompensas `COMMERCE` y un cliente solo `CUSTOMER`. La entrega de la recompensa es off-chain y depende del catálogo (pendiente).
  - Estado: `customerPoints[user]`, `commercePoints[merchant]`, `visits[user][merchant]`, `rules[merchant]`, `rewards[rewardId]`.
  - Evento `PaymentSettled(payer, merchant, amount, merchantNet, platformFee, merchantReward, customerPointsEarned, commercePointsEarned)`. La UI lo lee para la animación.

---

## 5. Plan por fases

| Fase | Fechas | Trabajo | Criterio de salida |
|---|---|---|---|
| 0. Setup y prueba de PRF | 3–4 oct | Repo público, Next.js en Vercel con el dominio **rewapp-app.vercel.app**, Neon, Foundry, relayer con MON del faucet. Prueba de concepto: crear una passkey en un dispositivo y entrar en otro, y agregar una passkey de respaldo con secret vault | Misma dirección en 2 dispositivos y también con la passkey de respaldo. Dominio fijado (cambiar el rpId pierde las cuentas) |
| 1. Contratos | 4–6 oct | `USDr` y `RewAppPay` (reglas del comercio, RewPoints Customer y Commerce, y canje), tests y deploy verificado | `forge test` en verde, contratos verificados y un pago por script |
| 2. Cuenta, sesión y pago | 5–8 oct | Landing con dos botones, Mera, policy de sesión, `/api/onramp`, `/api/pay`, `/pagar/[id]`, FX y moneda local | Flujo completo en el celular, sin prompts dentro de la sesión |
| 3. Comercio y pulido | 7–9 oct | Panel del comercio, QR, cobros en vivo, configuración de recompensas por plantillas, pantallas de RewPoints Customer y Commerce con sus catálogos de canje, seed de comercios de 2 o 3 países (demo global), auditoría de jerga | Pagos entre países: cliente en ARS y comercio en USD o EUR |
| 4. Pruebas con usuarios | 9–11 oct | Al menos 5 personas no cripto y 2 o 3 comercios reales, con correcciones | Planilla de resultados completa |
| 5. Entregables | 11–13 oct | Logo, videos, README e instrucciones para jueces, envío | Envío hecho antes del 13 oct a las 20:00 |

---

## 6. Pruebas verificables

| # | Prueba | Criterio que cubre | Evidencia / pasa si |
|---|---|---|---|
| T1 | Tests Foundry: el split suma exactamente `amount`, cada plantilla de regla (con y sin cumplir la condición), acreditación y canje de RewPoints Customer y Commerce (incluido que un comercio no pueda canjear recompensas de clientes y viceversa), replay, deadline y topes | Technical Execution | `forge test` en verde en CI de GitHub |
| T2 | Contratos desplegados y verificados en Monad Testnet | Technical Execution, Live product | Links al explorer en el README |
| T3 | Time-to-first-tx con un usuario nuevo, cronometrado | Mera: time-to-first-transaction | ≤ 3 toques y < 20 s desde la landing hasta la tx confirmada |
| T4 | Prueba de los apátridas: borrar el storage o abrir en incógnito o en otro dispositivo, y tocar "Ingresar con mi passkey" | Mera: stateless test | Misma dirección, saldo, RewPoints e historial con un solo prompt |
| T5 | Sesión: 3 pagos sin prompt, un pago mayor al tope con prompt, expiración a los 15 min con prompt | Mera: session design | Video con el conteo de prompts y tests e2e de la policy |
| T6 | Gas patrocinado: la cuenta del usuario tiene 0 MON y aun así paga | Mera bonus (composability) | Balance de MON = 0 en el explorer y la tx enviada por el relayer |
| T7 | Un pago de USD 10 en un comercio con "10% de cashback en compras mayores a USD 5" reparte USD 1 al cliente y acredita los RewPoints Customer y Commerce esperados. Un pago de USD 4 no da cashback | Technical Execution (lógica condicional real) | Eventos `PaymentSettled` de los dos casos |
| T7b | El comercio cambia su regla desde el panel y el siguiente pago ya usa la regla nueva | Technical Execution | Tx `setMerchantRule` seguida del pago con el nuevo `merchantReward` |
| T8 | Moneda local: un cliente en ARS paga a un comercio en EUR y cada uno ve su moneda | Consumer track (global) | Capturas de las dos pantallas con montos coherentes según la tabla FX |
| T9 | Auditoría de jerga: no aparecen wallet, gas, token, MON, blockchain, 0x, firma ni seed en la UI | Design & Craft | Script de grep sobre los textos de UI con 0 resultados. Lo técnico va solo en "Comprobante > Detalles" |
| T10 | El comercio ve el cobro acreditado | DoD | Panel actualizado en menos de 3 s desde que el cliente confirma |
| T11 | Al menos 5 usuarios no cripto y 2 o 3 comercios reales | Traction, Design & Craft | Planilla con tiempo, % de flujos completados sin ayuda (meta: 100% en primer uso y pago), dudas detectadas y frases textuales |
| T12 | PWA instalable, probada en Safari iOS 18+ y Chrome Android | Design & Craft | Lighthouse "installable", Accessibility ≥ 90 y pruebas en los 2 dispositivos |
| T14 | Passkey de respaldo: agregar el respaldo antes del primer depósito, después ingresar solo con la passkey de respaldo (otro dispositivo o llave de seguridad) | Mera: recovery flows (bonus), protección contra pérdidas | Misma dirección y saldo con dos prompts (identificar la passkey y abrir el vault). Un vault adulterado falla con `DECRYPT_FAILED` |
| T15 | Sin cuentas duplicadas por error: cancelar el ingreso, que falle la lectura, y tocar "Crear una cuenta nueva" | Design & Craft | Ningún camino crea una cuenta sin pasar por el aviso. Cancelar o fallar solo ofrece reintentar o usar otro dispositivo |
| T13 | Repo público y accesible para `metropolis@hackathon.monad.xyz` | Deliverables | Abrir el repo en una ventana incógnito |

---

## 7. Entregables

| Entregable | Track | Contenido mínimo |
|---|---|---|
| Logo RewApp (PNG, menos de 3 MB) | Consumer | Ícono cuadrado, que también es el ícono de la PWA |
| Repo público en GitHub | Ambos | README con arquitectura, direcciones de los contratos, cómo correrlo e instrucciones para jueces |
| Demo técnica (≤ 3 min) | Consumer | Producto en vivo: crear cuenta, cargar saldo, el comercio configura su recompensa, pagar QR, recompensa y RewPoints acreditados, canje de RewPoints Customer, panel del comercio con sus RewPoints Commerce, pago entre monedas, prueba de los apátridas y tx en el explorer |
| Pitch (≤ 2 min) | Consumer | Equipo, problema, segmento inicial y visión global, modelo de negocio (comisión por pago y fidelización que el comercio paga solo cuando le traen una venta) y distribución |
| Link al producto | Ambos | URL de producción, dispositivos soportados y QR de comercios demo listos para escanear |
| Descripción de la integración de Mera | Mera | PRF → cuenta, sesión acotada, prueba de los apátridas y gas patrocinado |
| Video de Mera (≤ 2 min, opcional) | Mera | Contador de toques y segundos, sesión, expiración y borrado de storage |
| Ad (≤ 30 s, opcional) | Consumer | Clip en un comercio real |

### Instrucciones para jueces (borrador)

1. Abrir `https://rewapp-app.vercel.app` en un iPhone con iOS 18+ (Safari o Chrome) o en un Android con Chrome. En desktop: Chrome o Safari con la passkey guardada en iCloud Keychain o Google Password Manager.
2. Tocar **"Crear una cuenta nueva"**, después **"Crear cuenta"**, y confirmar con la huella o FaceID.
3. Tocar **"Cargar saldo"**. Ahí aparece la propuesta de agregar una passkey de respaldo: se puede probar o tocar "Ahora no".
4. Escanear uno de los QR de comercios demo del README.
5. Para la prueba de los apátridas: borrar los datos del sitio o abrir en otro dispositivo, y tocar **"Ingresar con mi passkey"**.

### Plan de distribución (para el pitch)

Cómo llegarían los próximos 100 usuarios:

1. **Comercio por comercio:** cada comercio adherido pone un QR en el mostrador con un bono de bienvenida para el cliente, que paga la plataforma.
2. **Primeros comercios:** 5 comercios ancla en el piloto, que se consiguen yendo a visitarlos en persona.
3. **Bucle de retención:** las recompensas del comercio hacen que el cliente vuelva a ese comercio. Los RewPoints Customer hacen que vuelva a la red y pruebe comercios nuevos. Los RewPoints Commerce hacen que el comercio cobre por RewApp en vez de otros medios.
4. **Expansión:** como la red es la misma en cualquier país, se puede replicar en otra ciudad sin integrar nada local, solo sumando comercios.

---

## 8. Decisiones pendientes

| Decisión | Estado | Supuesto mientras tanto |
|---|---|---|
| Catálogo de recompensas para clientes (RewPoints Customer) | Pendiente (Lautaro) | 2 o 3 recompensas de ejemplo con un costo en puntos, cargadas por seed. El contrato ya soporta `redeem` |
| Catálogo de recompensas para comercios (RewPoints Commerce) | Pendiente (Lautaro), a futuro | 1 o 2 recompensas de ejemplo (por ejemplo, un mes sin comisión) |
| Tasa de RewPoints Customer (`customerPointsPerUsd`) | Pendiente | 10 puntos por cada USD 1 pagado |
| Tasa de RewPoints Commerce (`commercePointsPerUsd`) | Pendiente | 10 puntos por cada USD 1 cobrado |
| Comisión de la plataforma (`feeBps`) | Pendiente | 1,5% |

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Chrome de escritorio con passkeys en el perfil local no devuelve PRF (según la documentación de Mera, junio 2026) | Documentarlo en las instrucciones para jueces. Probar el flujo con QR entre dispositivos y mostrar un mensaje claro si el dispositivo no es compatible |
| Las passkeys quedan atadas al dominio (rpId) | Fijar el dominio en la fase 0 y no cambiarlo |
| Mera está en preview (0.2.0) y la API puede cambiar | Fijar la versión exacta |
| Que se acabe el MON del relayer o haya conflictos de nonce | Monitorear el balance, cargar desde el faucet con tiempo y usar un nonce manager con cola |
| Que un usuario cree otra cuenta por error y deje dinero en la anterior | "Ingresar con mi passkey" como opción principal, aviso antes de crear, nunca crear automáticamente tras un error, y passkey de respaldo antes del primer depósito |
| Que alguien pierda la passkey con saldo adentro | Passkey de respaldo con secret vault de Mera, propuesta antes del primer depósito |
| Que los secret vaults cambien de API (Mera está en preview) | Versión fija `0.2.0`; validar el flujo completo de respaldo en la fase 0 |
| Que el FX simulado no sea creíble | Tabla con tipos de cambio reales cargados a mano y nota de que es simulado |
