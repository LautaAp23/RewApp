# Identidad visual de RewApp

Una "fintech de barrio" en modo oscuro cálido: cercana, confiable y dinámica. Nada de estética cripto, hacker o casino. La app es **solo modo oscuro**.

## Tono de voz

Rioplatense, con "vos", de igual a igual: como el panadero o el kiosquero hablándote desde el celular.

| Momento          | Texto                                                                                       |
| ---------------- | ------------------------------------------------------------------------------------------- |
| Pago exitoso     | "¡Listo! Pago enviado a La Panadería. Sumaste 50 RewPoints."                                |
| Recompensa       | "¡Epa! Te ganaste un café gratis. Mostrale esta pantalla a Juan."                           |
| Error de escaneo | "Uy, el QR no se deja leer. Acercá el celu un poquito más y probá de nuevo."                |
| Sin puntos       | "Todavía no tenés puntos. ¡Date una vuelta por tus locales favoritos para empezar a sumar!" |

## Colores

Los tokens están en `src/app/globals.css` (`@theme`) y se usan como clases de Tailwind (`bg-surface`, `text-reward`, etc.). La paleta por defecto de Tailwind está desactivada para que solo se usen estos colores.

| Token             | HEX       | Uso                                               |
| ----------------- | --------- | ------------------------------------------------- |
| `background`      | `#0F172A` | Fondo de la app                                   |
| `surface`         | `#1E293B` | Tarjetas, modales, navegación inferior            |
| `elevated`        | `#334155` | Bordes de tarjetas, botones secundarios, hover    |
| `primary`         | `#22C55E` | Botones principales, íconos activos, logo         |
| `primary-pressed` | `#16A34A` | Estado presionado del primario                    |
| `on-primary`      | `#0F172A` | Texto sobre `primary`                             |
| `reward`          | `#FBBF24` | RewPoints, estrellas, recompensas, notificaciones |
| `text`            | `#F8FAFC` | Títulos, saldos, texto principal                  |
| `muted`           | `#94A3B8` | Subtítulos, fechas, labels                        |
| `success`         | `#34D399` | Confirmaciones de pago                            |
| `error`           | `#F87171` | Errores y acciones destructivas                   |

**Contraste:** el texto blanco sobre `primary` da 2,3:1 y no cumple WCAG AA. Por eso el texto de los botones verdes es `on-primary`, que da 7,8:1. La "R" blanca del ícono es un gráfico, no texto, así que puede quedar blanca.

## Tipografía

Plus Jakarta Sans (Google Fonts, cargada con `next/font`).

| Estilo           | Peso | Tamaño                             | Color         |
| ---------------- | ---- | ---------------------------------- | ------------- |
| Display (saldos) | 700  | 32 px                              | `text`        |
| H1               | 600  | 24 px                              | `text`        |
| H2               | 500  | 18 px                              | `text`        |
| Body             | 400  | 16 px                              | `muted`       |
| Body strong      | 500  | 16 px                              | `text`        |
| Labels           | 500  | 14 px                              | `muted`       |
| Tags             | 700  | 12 px, mayúsculas, tracking amplio | según el caso |

## Logo e ícono

Cuadrado muy redondeado verde (`primary`), con una "R" blanca en el centro y una estrella de 4 puntas mango (`reward`) arriba a la derecha. Combina la estructura del QR, la inicial de la marca y la chispa de la recompensa.

- Fuentes vectoriales en `brand/`: `rewapp-icon.svg` (redondeado), `rewapp-icon-square.svg` (sin redondeo, para iOS, que redondea solo) y `rewapp-icon-maskable.svg` (símbolo al 70% para que Android no recorte la estrella).
- Exportados: `public/logo.png` (1024 px), `public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-512.png`, `src/app/apple-icon.png` (180 px) y `src/app/icon.svg` (favicon).

## Interfaz

- **Bordes:** botones `rounded-button` (24 px), modales `rounded-modal` (32 px), tarjetas de comercio `rounded-card` (16 px), etiquetas de RewPoints `rounded-full`.
- **Profundidad:** sin sombras. Las tarjetas se separan del fondo con `border border-elevated`. Lo que necesita mucha jerarquía, como el botón de escanear QR, lleva `shadow-glow`.
- **Íconos:** lineales, trazo de 2 px y esquinas redondeadas. El ícono activo de la navegación lleva un punto `reward`.
- **Espacio:** base 8, con padding de 16 y 24 px.
