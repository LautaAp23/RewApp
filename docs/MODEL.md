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

## 5. Qué hace el sistema

El producto son **tres capas**, y están en ese orden a propósito: cada una solo tiene sentido
apoyada en la de abajo.

### Capa 1 — Pagar (el núcleo, construido)

Vincular una tarjeta, que el saldo se recargue solo, escanear un QR y pagar. La liquidación es
onchain y en una sola transacción. Sin wallet, sin gas, sin frase semilla, y todo en la moneda
local de cada uno.

### Capa 2 — Fidelizar (a medio construir)

El comercio arma su regla desde una plantilla y se evalúa **en la misma transacción del pago**.
El cliente acumula RewPoints y los canja. Falta el panel del comercio y cerrar el canje.

### Capa 3 — Jugar y compartir (nueva, en diseño)

Lo que convierte pagar en algo que se hace **con otros**. Las mecánicas que están en el tablero,
agrupadas por lo que realmente hacen:

| Mecánica | De qué se trata | Tarjetas |
| --- | --- | --- |
| **Pagar con otros** | Una cuenta, varios que pagan su parte. Cada uno recibe su recompensa y sus puntos del mismo consumo. | #49 |
| **Metas de grupo** | Un objetivo compartido con evidencia: los que no cumplen financian la recompensa de los que sí. | #50 |
| **Competir** | Pronósticos y desafíos entre usuarios y entre comercios. | #51, #52 |
| **Constancia** | Premiar volver: rachas, niveles, experiencia. | #54, #56 |
| **Señales del mundo real** | Puntos por cosas que pasan fuera de la app: cercanía al comercio, pasos, metas en otras apps. | #53, #55, #57 |
| **Enterarse** | El NewsBoard y sus notificaciones: qué pasó, qué ganaste, qué hay cerca. | #39, #45, #48 |

### El filtro para esta capa

Es la regla que evita que la capa 3 se vuelva una pila de features sueltas:

> **Una mecánica social entra solo si termina en un pago en un comercio adherido.**

Si no termina ahí, es un juego con nuestra marca encima: no le da plata al comercio, no genera
liquidación onchain y no se defiende en el track, donde preguntan de frente si esto es *"una
experiencia financiera genuinamente nueva o una app de pagos con otro branding"*. Un prode que se
paga con puntos ganados pagando, sí. Un prode que se paga con nada, no.

### Decisiones abiertas de esta capa

Tres cosas del tablero contradicen documentación vigente y necesitan que alguien decida, no que se
construyan a ciegas:

1. **Niveles y experiencia (#56).** PLAN.md §2 los pone explícitamente en "No incluye": *"XP y
   niveles"*. O se revierte esa decisión por escrito, o la tarjeta se corta.
2. **Minijuegos de apuestas (#52).** BRAND.md abre diciendo que la estética nunca es *"cripto,
   hacker ni casino"*. Apostar entre usuarios tensiona eso de frente, y la marca es el criterio
   que más peso tiene en el track de diseño. Decidir si es apuesta o es desafío sin plata en juego.
3. **Geolocalización (#47, #48, #53).** Las tres la necesitan y **no existe**: el modelo
   `Merchant` tiene `address`, que es la dirección onchain, no una postal. Falta latitud y
   longitud, migración y cargar las coordenadas. Es un prerrequisito compartido, no tres trabajos
   separados.

## 6. Decisiones tomadas (10 oct 2026)

### 6.1 Consumidor primero

La app del cliente es el producto. El panel del comercio es la herramienta que lo hace posible, no
el producto. **Consecuencia:** cuando haya que elegir dónde poner esfuerzo, gana la superficie del
cliente.

### 6.2 La tarjeta fondea, la cadena liquida

El usuario vincula una tarjeta y el saldo se recarga en silencio. **El pago sigue liquidando
onchain**, con la recompensa evaluada en la misma transacción.

> **Reconfirmado el 11 oct 2026: el saldo se queda.** Se volvió a plantear sacarlo y la decisión
> es que sigue. El tema está cerrado; las tarjetas #35 y #36 son justamente la pantalla de
> fondeo con selector de tarjetas.

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

### 6.3 El foco está en los premios de uso

La recompensa es el producto; el pago es el sustrato. **Consecuencia directa en la UI:** si el
saldo se recarga solo, el usuario ya no lo administra, y dedicarle el lugar más grande de la
pantalla a un número que nadie toca grita "billetera prepaga". El protagonista de la pantalla de
inicio es **cuánto te falta para tu próximo premio**; el saldo baja a un renglón de "estás
cubierto".

### 6.4 La wallet externa va escondida

Para el usuario que sabe lo que es una wallet, la conexión externa existe pero vive detrás de una
fila en el perfil. Nunca en el camino principal: contradice "nadie ve cripto", que es el criterio
central del track.

## 7. Qué no es RewApp

- No es una billetera. Si la pantalla principal parece una billetera, está mal.
- No es un producto de trading ni de mercado.
- No da crédito, cuotas ni BNPL.
- No es un sistema de puntos con pagos pegados al costado: el pago y la recompensa son **la misma
  transacción**. Si se separan, perdemos lo único que nos hace distintos.

## 8. La prueba de que el modelo se sostiene

Un usuario nuevo vincula su tarjeta, paga un QR sin ninguna aprobación extra, ve acreditada la
recompensa del comercio en su moneda y sus RewPoints, y el comercio ve el cobro acreditado al
instante. Ninguno de los dos vio un mensaje cripto, y si un juez le borra el almacenamiento a
mitad del demo, todo vuelve con la huella.
