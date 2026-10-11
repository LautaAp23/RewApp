# Identidad visual de RewApp

Una fintech de barrio en modo oscuro, **líquida**: superficies de vidrio sobre un fondo de luz
violeta, botones con forma de píldora, movimiento que desacelera en vez de frenar de golpe. Cercana
y confiable, nunca estética cripto, hacker ni casino. La app es **solo modo oscuro**.

Los tokens viven en `src/app/globals.css` (`@theme`) y se usan como clases de Tailwind
(`bg-surface`, `text-reward`, `glass`, `pressable`). **La paleta por defecto de Tailwind está
desactivada**: si un color no está acá, no existe.

> **Cambio del 10 oct 2026:** la marca pasó de verde a púrpura, en la familia de Monad. Todo el
> código usa tokens, así que el cambio fue de `globals.css` y los logos — ninguna pantalla tuvo que
> tocarse. Si encontrás un hex escrito a mano en un componente, es un bug.

---

## Tono de voz

Rioplatense, con "vos", de igual a igual: como el panadero o el kiosquero hablándote desde el
celular. **Esto no cambió** y es tan parte de la marca como el color.

| Momento          | Texto                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Pago exitoso     | "¡Listo! Pago enviado a La Panadería. Sumaste 50 RewPoints."                                |
| Recompensa       | "¡Epa! Te ganaste un café gratis. Mostrale esta pantalla a Juan."                           |
| Error de escaneo | "Uy, el QR no se deja leer. Acercá el celu un poquito más y probá de nuevo."                |
| Sin puntos       | "Todavía no tenés puntos. ¡Date una vuelta por tus locales favoritos para empezar a sumar!" |

---

## Colores

| Token             | HEX       | Uso                                                      |
| ----------------- | --------- | -------------------------------------------------------- |
| `background`      | `#0D0820` | Fondo de la app (violeta-negro)                          |
| `surface`         | `#171032` | Base de las tarjetas, bajo el vidrio                     |
| `elevated`        | `#241A4F` | Bordes y botones secundarios                             |
| `primary`         | `#6E54FF` | Rellenos: botones principales, degradados, ícono activo  |
| `primary-pressed` | `#5B41E8` | Estado presionado                                        |
| `on-primary`      | `#FFFFFF` | Texto sobre `primary`                                    |
| `accent`          | `#A78BFA` | Lila: texto, íconos y progreso **sobre fondo oscuro**    |
| `reward`          | `#FFAE45` | RewPoints, montos ganados, la chispa del logo            |
| `text`            | `#F5F3FF` | Títulos, cifras, texto principal                         |
| `muted`           | `#A79BD4` | Subtítulos, fechas, labels                               |
| `success`         | `#3DDC97` | Confirmaciones                                           |
| `error`           | `#FF7A90` | Errores y acciones destructivas                          |

### La regla de los dos púrpuras

Es la que más se presta a error, porque invierte lo que hacíamos con el verde:

- **`primary` (#6E54FF) es para rellenar**, con texto blanco encima. Da **4.80:1**, y es el único
  de la familia que pasa AA con blanco: los lilas más claros obligan a texto negro, que en una app
  oscura se ve roto.
- **`accent` (#A78BFA) es para pintar texto e íconos sobre el fondo**, donde da **7.19:1**. Nunca
  se usa como relleno con texto encima: blanco sobre lila da 2.72:1 y es ilegible.

En la etapa verde era al revés (el verde era claro y pedía texto oscuro). Si copiás un patrón
viejo sin mirar, va a fallar el contraste.

### Contraste verificado

Todas las combinaciones que la app usa de verdad, calculadas con la fórmula de WCAG 2.1:

| Combinación | Ratio | Mínimo | |
| --- | --- | --- | --- |
| `text` sobre `background` | 17.85 | 4.5 | ✅ |
| `text` sobre `surface` | 16.55 | 4.5 | ✅ |
| `muted` sobre `background` | 7.72 | 4.5 | ✅ |
| `muted` sobre `surface` | 7.16 | 4.5 | ✅ |
| `accent` sobre `background` | 7.19 | 4.5 | ✅ |
| `reward` sobre `background` | 10.62 | 4.5 | ✅ |
| `success` sobre `background` | 11.08 | 4.5 | ✅ |
| `error` sobre `background` | 7.87 | 4.5 | ✅ |
| **`on-primary` sobre `primary`** | **4.80** | 4.5 | ✅ |
| `on-primary` sobre `primary-pressed` | 6.24 | 4.5 | ✅ |
| `primary` sobre `background` (no texto) | 4.08 | 3.0 | ✅ |

**El foco siempre usa `primary`.** `elevated` contra el fondo da 1.25:1: sirve como borde
decorativo y es invisible como indicador. El anillo de foco ya está definido globalmente en
`:focus-visible`, no lo redefinas por componente.

---

## Materiales

El sistema tiene tres y nada más:

1. **Vidrio** (`glass`, `glass-strong`) — el material por defecto. Superficie translúcida con
   `backdrop-filter`, borde de un pixel al 8% de blanco. Las tarjetas, la nav y los modales son
   vidrio. `glass-strong` es para lo que se apoya encima del contenido y necesita tapar.
2. **Degradado** (`gradient-primary`, `gradient-reward`) — para rellenos protagonistas: el botón
   principal, el logo, una cifra grande con `text-gradient`. Nunca en texto corrido.
3. **Luz** (`shadow-glow`, `shadow-glow-reward`, `shadow-lift`) — **no usamos sombras duras.** Lo
   que tiene jerarquía emite luz de su propio color; `shadow-lift` es la única sombra, y es para
   separar una hoja del contenido.

**El fondo no es plano.** `body` lleva tres manchas radiales fijas (púrpura, rosa, lila) que dan
profundidad y hacen que el vidrio tenga algo que refractar. No lo pises con un `bg-*` opaco a
pantalla completa.

### Formas

| Token | Valor | Dónde |
| --- | --- | --- |
| `rounded-button` | 999px | Botones: son **píldoras**, no rectángulos redondeados |
| `rounded-card` | 20px | Tarjetas de comercio, tarjetas de recompensa |
| `rounded-modal` | 28px | Modales y hojas |
| `rounded-full` | — | Chips de RewPoints, avatares, puntos de progreso |

Espacio base 8, con padding de 16 y 24. Íconos lineales, trazo de 2 px, esquinas redondeadas.

---

## Movimiento

El movimiento es parte de la identidad, no decoración. La regla general: **las cosas desaceleran,
no frenan.**

### Curvas

| Token | Curva | Cuándo |
| --- | --- | --- |
| `ease-fluid` | `cubic-bezier(.32,.72,0,1)` | Posición, tamaño, opacidad. Desacelera largo, sin rebote. Es la curva por defecto. |
| `ease-spring` | `cubic-bezier(.34,1.56,.64,1)` | Entradas y recompensas. Pasa de largo y vuelve. Solo para momentos de celebración. |

### Duraciones

`--dur-fast` 150 ms (respuesta al toque) · `--dur-base` 260 ms (transiciones) ·
`--dur-slow` 420 ms (entradas y celebraciones).

Más de 420 ms se siente lento en un mostrador con gente atrás.

### Animaciones disponibles

| Clase | Qué hace | Para qué |
| --- | --- | --- |
| `animate-pop` | Escala desde 0.4 con rebote | La recompensa al pagar. **El momento de la app.** |
| `animate-rise` | Sube 14 px y aparece, con 180 ms de demora | Lo que entra detrás del `pop` |
| `animate-float` | Sube y baja 5 px, 5 s, en loop | El héroe de inicio: respira, no se queda duro |
| `animate-breathe` | Pulso de opacidad y escala | El punto de "listo para pagar" |
| `shimmer` | Barrido de luz que cruza la superficie | Carga y vidrio vivo. **Es lo que hace que se lea como líquido.** |
| `pressable` | Se hunde a 0.97 al tocar | **Todo lo presionable lo lleva**, sin excepción |
| `transition-fluid` | `all` con `ease-fluid` | Lo que cambia de lugar o tamaño |

### Respeto por `prefers-reduced-motion`

Con movimiento reducido **se saca el movimiento, no la información**: las animaciones se apagan,
las transiciones bajan a 1 ms y el contenido aparece igual, en su lugar final. Está resuelto en
`globals.css` para todas las utilidades de arriba — si agregás una animación nueva, agregala
también al bloque de `@media (prefers-reduced-motion: reduce)`.

---

## Tipografía

**Plus Jakarta Sans** (Google Fonts, cargada con `next/font`). Se mantiene: es geométrica, moderna
y variable, aguanta bien las cifras grandes, y cambiarla ahora sería churn sin ganancia.

| Estilo           | Peso | Tamaño | Color |
| ---------------- | ---- | ------ | ----- |
| Display (cifras) | 700  | 32 px  | `text`, o `text-gradient` si es el protagonista |
| H1               | 600  | 24 px  | `text` |
| H2               | 500  | 18 px  | `text` |
| Body             | 400  | 16 px  | `muted` |
| Body strong      | 500  | 16 px  | `text` |
| Labels           | 500  | 14 px  | `muted` |
| Tags             | 700  | 12 px, mayúsculas, tracking amplio | según el caso |

---

## Logo

Squircle con degradado púrpura (`#8B6DFF → #6E54FF → #4C32D9`) en diagonal, un **brillo especular**
arriba a la izquierda que le da el aspecto de gota, la "R" blanca en el centro y una estrella de
cuatro puntas en `reward` arriba a la derecha. El brillo es lo que lo vuelve líquido: sin él es un
cuadrado violeta.

- Vectores en `brand/`: `rewapp-icon.svg` (redondeado), `rewapp-icon-square.svg` (sin redondeo,
  para iOS que redondea solo) y `rewapp-icon-maskable.svg` (símbolo al 70% para que Android no
  recorte la estrella).
- Exportados: `public/logo.png` (1024), `public/icon-192.png`, `public/icon-512.png`,
  `public/icon-maskable-512.png`, `src/app/apple-icon.png` (180) y `src/app/icon.svg`.
- Para regenerar los PNG en macOS sin dependencias:
  `qlmanage -t -s 1024 -o <dir> brand/rewapp-icon.svg` y después `sips -Z <tamaño>`.

El color de tema del manifest y del `<head>` es `#0D0820`: si cambia el fondo, cambian los tres.

---

## Qué no hacer

- **No escribas un hex en un componente.** Si falta un color, se agrega como token acá y en
  `globals.css`.
- **No uses sombras duras.** La jerarquía se hace con luz y con vidrio.
- **No pongas texto encima de `accent`** ni uses `primary` para texto chico sobre el fondo.
- **No animes sin `pressable` lo que se toca**, ni agregues animaciones fuera del bloque de
  movimiento reducido.
- **No uses el verde de la etapa anterior.** Si aparece `#22C55E` en un diff, es un resto.
