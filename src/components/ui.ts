// Primitivas del sistema de diseño. Las reglas están en docs/BRAND.md.
// `gradient-primary`, `glass` y `pressable` se definen en app/globals.css.

export const primaryButton =
  "pressable flex min-h-12 w-full items-center justify-center rounded-button gradient-primary px-6 py-3 font-bold text-on-primary shadow-glow active:brightness-90 disabled:opacity-50 disabled:shadow-none";
export const secondaryButton =
  "pressable flex min-h-12 w-full items-center justify-center rounded-button border border-elevated px-6 py-3 font-semibold text-text active:bg-surface disabled:opacity-50";
export const card = "glass rounded-card p-4";
