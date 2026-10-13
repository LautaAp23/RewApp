"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { primaryButton } from "./ui";

const PARTICLES = 28;

/** Golden-angle spread: even, organic, and the same on every render (no randomness in render). */
const particles = Array.from({ length: PARTICLES }, (_, i) => {
  const angle = (i * 137.508 * Math.PI) / 180;
  const distance = 110 + ((i * 47) % 90);
  return {
    dx: `${Math.round(Math.cos(angle) * distance)}px`,
    dy: `${Math.round(Math.sin(angle) * distance)}px`,
    rot: `${(i * 53) % 360}deg`,
    delay: `${(i % 7) * 35}ms`,
    size: 22 + ((i * 7) % 14),
  };
});

/**
 * RewPoints explosion after claiming the pot. With reduced motion there are no particles: the same
 * message and the same points, still.
 */
export function StreakCelebration({ points, onClose }: { points: number; onClose: () => void }) {
  const t = useTranslations("streak");
  const locale = useLocale();
  const [motion, setMotion] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMotion(!window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    button.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="streak-celebration-title"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background/90 px-6 text-center backdrop-blur-sm"
      onKeyDown={(event) => event.key === "Escape" && onClose()}
    >
      <div className="relative flex h-40 w-40 items-center justify-center" aria-hidden>
        {motion
          ? particles.map((p, i) => (
              <span
                key={i}
                data-streak-particle
                className="streak-burst-particle flex items-center justify-center rounded-full bg-reward font-bold text-background"
                style={{
                  width: p.size,
                  height: p.size,
                  fontSize: p.size * 0.55,
                  ["--dx" as string]: p.dx,
                  ["--dy" as string]: p.dy,
                  ["--rot" as string]: p.rot,
                  ["--delay" as string]: p.delay,
                }}
              >
                R
              </span>
            ))
          : null}
        <span className="animate-pop flex h-24 w-24 items-center justify-center rounded-full bg-reward text-4xl font-bold text-background shadow-glow">
          R
        </span>
      </div>
      <div className="flex flex-col gap-2" aria-live="assertive">
        <h2 id="streak-celebration-title" className="text-2xl font-bold">
          {t("celebrationTitle")}
        </h2>
        <p className="reward-points-badge animate-rise mx-auto text-xl font-bold text-reward">
          {t("celebrationPoints", { points: points.toLocaleString(locale) })}
        </p>
        <p className="text-sm text-muted">{t("celebrationNext")}</p>
      </div>
      <button ref={button} className={`${primaryButton} max-w-xs`} onClick={onClose}>
        {t("celebrationDone")}
      </button>
    </div>
  );
}
