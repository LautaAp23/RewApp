# Hackathon Monad Metropolis — lineamientos de los envíos

Fuente: portal de la hackathon. Este archivo es la copia de trabajo del equipo: si hay
diferencia, manda el portal. Para el producto ver [PLAN.md](PLAN.md); para el estado del
código, [ARCHITECTURE.md](ARCHITECTURE.md).

**Deadline oficial: 14 oct 2026, 00:59 GMT-3.** Envío interno: **13 oct, 20:00 GMT-3.**

RewApp se presenta a **3 inscripciones** y **los premios se acumulan** — está escrito en el
bounty de comunidad: *"can win this in addition to any other bounty or prize it's eligible for"*.

| Inscripción | Premio | Qué la decide |
| --- | --- | --- |
| Consumer Products & Payments | USD 30.000 ÷ 3 ganadores (10.000 cada uno) | Los 5 criterios de abajo |
| Best Mera-Powered UX on Monad | USD 2.500, premio único | Que Mera sea **toda** la capa de cuentas |
| Best Community Team Project | USD 5.000, premio único | Administrativo: el campus group en el perfil |

---

## 1. Consumer Products & Payments (el premio principal)

> *"Consumer-facing financial products that use onchain rails as a design advantage, for users
> who don't identify as crypto users."*

Pregunta central del track: **¿cómo es un producto financiero cuando las rieles onchain se usan
como ventaja de diseño?**

Entra acá si el usuario principal es un consumidor que puede no identificarse como usuario de
cripto, y el valor central es una experiencia financiera — no un producto de trading.

### Criterios, con su peso

| Peso | Criterio | Lo que piden textual, y qué significa para nosotros |
| --- | --- | --- |
| **25%** | **Founder & Market Readiness** | *"is there a specific, named consumer segment this serves, and does the team show real understanding of that user's behavior or pain point — not just 'everyone needs payments'?"* — **Es el criterio más pesado y no se gana con código.** PLAN §1 ya separa visión global de beachhead con nombre (cafeterías y panaderías de Salta). Eso es lo que hay que defender. |
| **20%** | **Technical Execution** | *"do the payment/behavioral mechanics actually execute onchain with real conditional logic and settlement, not simulated?"* — Las dos palabras que importan son **conditional logic** y **settlement**. No alcanza con registrar algo onchain: la condición del comercio tiene que evaluarse onchain y la liquidación tiene que pasar ahí. |
| **20%** | **Design & Craft** | *"would a non-crypto user complete the core flow without confusion or help? This track's central bar is an invisible blockchain — **judge harshly** on any point of friction that reveals 'this is crypto.'"* — Dice *judge harshly*. Cada palabra de jerga en la UI cuesta plata. |
| **20%** | **Traction & Path Forward** | *"evidence of user testing (even five friends trying it), and a concrete distribution plan — how would the next 100 users actually find this?"* — **Son dos cosas, no una.** La prueba con usuarios y **un plan de distribución concreto**. |
| **15%** | **Originality & Track Insight** | *"is this a genuinely new consumer financial experience enabled by onchain rails, or a wallet/payments app with new branding?"* — La pregunta que hay que poder contestar sin titubear: ¿por qué esto no es una billetera con otro logo? |

### Entregables

- **Logo / gráfico del proyecto** — JPG, JPEG, PNG o WEBP, **máximo 3 MB**.
- **Repo público de GitHub** — accesible por `metropolis@hackathon.monad.xyz`.
- **Video de demo técnica** — **máximo 3 minutos**, en YouTube, Loom o Vimeo. Tiene que mostrar
  **el producto funcionando en vivo**: no slides, no walkthrough de código.
- **Video de pitch** — **máximo 2 minutos**: el equipo, el problema y por qué lo construyen.
- **Link al producto desplegado** — en Monad mainnet o testnet, **con instrucciones de acceso
  claras** y las credenciales de prueba que el juez necesite. Nuestro caso no tiene credenciales
  (es una passkey), así que las instrucciones tienen que decir explícitamente que se crea una
  cuenta nueva con la huella.
- **Publicidad del producto (opcional)** — máximo 30 s. **No se juzga**: es para promoción
  posterior. Es lo primero que se corta si falta tiempo.

---

## 2. Best Mera-Powered UX on Monad

> *"Build an app on Monad where Mera is the entire account layer. No seed phrase. No wallet
> extension. No custody backend. The winner is the app where the user never notices there's a
> blockchain underneath."*

### Criterios

- **Time-to-first-transaction** — *"taps and seconds from landing page to confirmed Monad
  transaction"*. Se mide en toques y en segundos, así que hay que medirlo y saber el número.
- **Session design** — *"sensible scoping of prompt-free vs. re-prompt actions, clean
  session-expiry UX"*. Qué pide huella y qué no, y qué pasa cuando la sesión expira.
- **The stateless test** — ver abajo.
- **Stack composability (bonus)** — crédito extra por combinar Mera con el resto del stack de
  cuentas: *gas sponsorship, intents, recovery flows, smart-account patterns, cross-chain
  accounts*. Ya tenemos gas patrocinado (relayer) y recuperación (passkey de respaldo).

### Requisitos duros

- Desplegado en testnet o mainnet, con transacciones reales y demo en vivo.
- **Onboarding de un solo prompt**: una sola ceremonia de passkey. Sin frase semilla, sin
  instalar extensión, sin vueltas de email u OTP.
- **Firma sin prompt** vía sesiones de firma de Mera, con un alcance claramente acotado.
- **Tiene que pasar el stateless test**: *"judges clear local storage or open the app on a fresh
  device mid-demo, and identity/access must fully reconstruct from the passkey (plus untrusted
  storage if used)"*. Lo hacen **en vivo y a mitad del demo**.

### Al enviar preguntan

- Cómo integra el proyecto a Mera como capa de cuentas completa.
- Video opcional de hasta 2 min enfocado en el UX de Mera.

---

## 3. Best Community Team Project

> *"Best project across all tracks built by a team from Metropolis community supporters."*

**No pide nada de producto.** Se juzga sobre el mismo envío del track: *"no separate criteria
beyond track fit and standard submission requirements"*. Lo único que lo habilita es
administrativo:

- El equipo tiene que indicar su **campus group** al completar el perfil en el portal.
- Ese grupo tiene que estar en **la lista de grupos onboardeados** (es un campo seleccionable).
- Al enviar preguntan: *"Which community does your team represent?"*

Al estar restringido a equipos de community supporters, el pool de competencia es mucho más chico
que el del track completo. Es la mejor relación probabilidad/esfuerzo de las tres.

---

## 4. Cómo se traduce al tablero

| Lo que piden | Dónde está |
| --- | --- |
| Segmento con nombre y entendimiento del usuario (25%) | PLAN §1 + el pitch (#22) |
| Lógica condicional y liquidación onchain (20%) | `RewAppPay.payWithSig` + migración a AUSD (#13 a #15) |
| Cero friction que revele cripto (20%) | Auditoría de jerga (#31), detector de PRF (#3) |
| Prueba con usuarios (parte de 20%) | 5 usuarios no cripto (#16), 2-3 comercios (#17) |
| Plan de distribución (la otra parte del 20%) | **sin tarjeta todavía** |
| Time-to-first-transaction | #6 |
| Stateless test | #4 |
| Campus group en el perfil | #1 |
| Checklist de los entregables | #2 |
| Logo < 3 MB, videos, README | #18, #19, #20, #21 |

---

## 5. Recursos oficiales

- Monad: [docs.monad.xyz](https://docs.monad.xyz) · [developers.monad.xyz](https://developers.monad.xyz)
- Mera: [getting started](https://mera.category.xyz/getting-started/) ·
  [github.com/category-labs/mera](https://github.com/category-labs/mera)
- Faucet de Monad: [faucet.monad.xyz](https://faucet.monad.xyz)
