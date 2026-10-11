# RewApp — modelo de funcionamiento

Las bases del producto: qué es RewApp, cómo se mueve la plata y qué decisiones ya están tomadas.
Si vas a escribir código o a contar el producto, esto es lo primero que hay que leer.

- Alcance, flujos y decisiones de producto: [PLAN.md](PLAN.md)
- Cómo está construido y qué falta: [ARCHITECTURE.md](ARCHITECTURE.md)
- Qué piden los jueces: [HACKATHON.md](HACKATHON.md)
- Marca, tono y paleta: [BRAND.md](BRAND.md)

> **Este documento manda sobre PLAN.md donde se contradigan.** PLAN.md se escribió antes de las
> decisiones del 10 de octubre que están acá abajo, y partes de él quedaron viejas (sobre todo el
> encuadre *Loyalty-as-a-Service* y la carga de saldo manual).

---

## 1. El objetivo, en una línea

Que pagar en el comercio de la esquina te devuelva algo, **sin que ni el que paga ni el que cobra
tengan que entender nada de lo que pasa abajo.**

## 2. Los tres roles

| Quién | Qué hace | Qué ve |
| --- | --- | --- |
| **El que paga** | Vincula su tarjeta una vez. Después escanea y paga. | Su recompensa y sus puntos, en su moneda. Nunca una carga, un token, un gas ni una dirección. |
| **El comercio** | Arma su regla desde una plantilla, cobra generando un QR. | El cobro acreditado al instante. No integra ni mantiene nada. |
| **RewApp** | **Es el intermediario.** Convierte fiat a dólar onchain pocas veces y en montos grandes; liquida pagos muchas veces y casi gratis. | — |

## 3. Los tres momentos de plata

1. **Fondeo** — poco frecuente, es donde vive el costo fiat.
   Tarjeta → PSP → tesorería → se acredita saldo onchain. El usuario lo configura **una vez** y no
   lo vuelve a tocar: se recarga solo cuando baja de un umbral que fija la app.
2. **Pago** — frecuente y barato. **Una sola transacción** reparte comercio / plataforma /
   recompensa del comercio y acredita los RewPoints. La condición del comercio se evalúa ahí mismo.
3. **Canje** — los puntos se queman onchain y el premio se entrega fuera de la cadena.

## 4. Los dos circuitos de valor

Dos, no tres. El tercero (plataforma → comercio, los *RewPoints Commerce*) está cortado: tres
monedas de fidelización era una de más y el concepto queda más nítido con dos.

- **Comercio → cliente:** la recompensa condicional (cashback % o bonus por visitas), que paga el
  comercio de su neto y se evalúa onchain.
- **Plataforma → cliente:** los RewPoints por usar la red, que se canjean en el catálogo.

## 5. Decisiones tomadas (10 oct 2026)

### 5.1 Consumidor primero

La app del cliente es el producto. El panel del comercio es la herramienta que lo hace posible, no
el producto. **Consecuencia:** cuando haya que elegir dónde poner esfuerzo, gana la superficie del
cliente.

### 5.2 La tarjeta fondea, la cadena liquida

El usuario vincula una tarjeta y el saldo se recarga en silencio. **El pago sigue liquidando
onchain**, con la recompensa evaluada en la misma transacción.

**Por qué el saldo sigue existiendo** — es la pregunta que va a hacer todo el mundo, así que queda
escrita:

- **Economía unitaria.** El interchange de tarjeta es 1,5% a 3,5% *por transacción*, más un fijo.
  Nuestro fee es 1,5%. Si cobráramos la tarjeta en cada pago, pagaríamos más de lo que cobramos.
  El saldo existe para **amortizar un on-ramp caro sobre muchos pagos casi gratis**.
- **El motivo del comercio.** Nuestra promesa es "cobrás al instante y sin comisión alta". Arriba
  de rieles de tarjeta, RewApp *sería* la comisión alta y el comercio esperaría nuestra
  liquidación. Reconstruiríamos lo que venimos a reemplazar.
- **El puntaje.** *Technical Execution* (20%) pide lógica condicional **y liquidación** onchain, no
  simulada. Mover la liquidación a tarjeta regala ese criterio.
- **El mostrador.** La autorización de tarjeta tarda segundos y puede rechazar. Un "declinada" en
  la caja con cola atrás es exactamente la friction que *Design & Craft* castiga con dureza.

Lo que esto **no** resuelve: la licencia de dinero almacenado, que es por mercado. Es un problema
real y posterior al piloto, y se cuenta con nombre y plan — no se esconde.

**Lo que NO somos:** no damos crédito. Si la recarga falla, el pago se bloquea con un mensaje
humano y un reintento de un toque. El saldo nunca queda en negativo.

### 5.3 El foco está en los premios de uso

La recompensa es el producto; el pago es el sustrato. **Consecuencia directa en la UI:** si el
saldo se recarga solo, el usuario ya no lo administra, y dedicarle el lugar más grande de la
pantalla a un número que nadie toca grita "billetera prepaga". El protagonista de la pantalla de
inicio es **cuánto te falta para tu próximo premio**; el saldo baja a un renglón de "estás
cubierto".

### 5.4 La wallet externa va escondida

Para el usuario que sabe lo que es una wallet, la conexión externa existe pero vive detrás de una
fila en el perfil. Nunca en el camino principal: contradice "nadie ve cripto", que es el criterio
central del track.

## 6. Qué no es RewApp

- No es una billetera. Si la pantalla principal parece una billetera, está mal.
- No es un producto de trading ni de mercado.
- No da crédito, cuotas ni BNPL.
- No es un sistema de puntos con pagos pegados al costado: el pago y la recompensa son **la misma
  transacción**. Si se separan, perdemos lo único que nos hace distintos.

## 7. La prueba de que el modelo se sostiene

Un usuario nuevo vincula su tarjeta, paga un QR sin ninguna aprobación extra, ve acreditada la
recompensa del comercio en su moneda y sus RewPoints, y el comercio ve el cobro acreditado al
instante. Ninguno de los dos vio un mensaje cripto, y si un juez le borra el almacenamiento a
mitad del demo, todo vuelve con la huella.
