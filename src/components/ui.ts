// Primitivas del sistema de diseño. Las reglas están en docs/BRAND.md.
// `gradient-primary`, `glass` y `pressable` se definen en app/globals.css.
//
// Cada variante de tarjeta lleva UNA sola clase de color de borde. No le
// agregues otra encima: `glass` no declara borde justamente para que la que
// pongas acá sea la única, pero dos clases de color entre sí sí compiten.

export const primaryButton =
  "pressable flex min-h-12 w-full items-center justify-center rounded-button gradient-primary px-6 py-3 font-bold text-on-primary shadow-glow active:brightness-90 disabled:opacity-50 disabled:shadow-none";
export const secondaryButton =
  "pressable flex min-h-12 w-full items-center justify-center rounded-button border border-elevated px-6 py-3 font-semibold text-text active:bg-surface disabled:opacity-50";

/** Tarjeta por defecto: vidrio con filo blanco. */
export const card = "glass rounded-card border border-white/10 p-4";
/** Tarjeta de recompensa: mismo vidrio, filo ámbar. */
export const cardReward = "glass rounded-card border border-reward p-4";
