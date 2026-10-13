"use client";

import { useTranslations } from "next-intl";
import { useStreakSound } from "@/lib/use-streak-sound";

/** Coins sound when claiming the streak pot. Saved on this device for this account. */
export function StreakSoundToggle({ address }: { address: string | undefined }) {
  const t = useTranslations("streak");
  const [enabled, setEnabled] = useStreakSound(address);
  return (
    <div className="flex min-h-12 items-center justify-between gap-3">
      <span id="streak-sound-label" className="text-sm text-muted">{t("soundLabel")}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-labelledby="streak-sound-label"
        onClick={() => setEnabled(!enabled)}
        className={`pressable relative h-8 w-14 shrink-0 rounded-full border border-white/10 transition-colors ${enabled ? "bg-primary" : "bg-elevated"}`}
      >
        <span
          aria-hidden
          className={`absolute top-1 left-1 h-6 w-6 rounded-full bg-white transition-transform ${enabled ? "translate-x-6" : ""}`}
        />
      </button>
    </div>
  );
}
