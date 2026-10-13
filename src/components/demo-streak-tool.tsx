"use client";

import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { DEMO_STREAK_PRESETS, type DemoStreakPreset } from "@/lib/streak";
import { BottomSheet } from "./bottom-sheet";
import { secondaryButton } from "./ui";

const presets = Object.keys(DEMO_STREAK_PRESETS) as DemoStreakPreset[];

/** Development only (the parent renders it behind NODE_ENV): seeds the streak of this account on testnet. */
export function DemoStreakTool({ address, onSeeded }: { address: string; onSeeded: () => void }) {
  const t = useTranslations("demoStreak");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<DemoStreakPreset>();
  const [result, setResult] = useState<"done" | "error">();
  const pending = useRef(false);

  async function seed(preset: DemoStreakPreset) {
    if (pending.current) return;
    pending.current = true;
    setBusy(preset);
    setResult(undefined);
    try {
      const response = await fetch("/api/dev/streak", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, preset }),
      });
      setResult(response.ok ? "done" : "error");
      if (response.ok) onSeeded();
    } catch {
      setResult("error");
    } finally {
      pending.current = false;
      setBusy(undefined);
    }
  }

  return <>
    <button className={`${secondaryButton} gap-2 border-dashed`} onClick={() => setOpen(true)}>{t("button")}</button>
    <BottomSheet open={open} title={t("title")} description={t("description")} onClose={() => setOpen(false)}>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-6 pb-6">
        {presets.map((preset) => (
          <button key={preset} className={`${secondaryButton} flex-col items-start gap-0.5 text-left`} disabled={busy !== undefined} onClick={() => void seed(preset)}>
            <span>{t(`presets.${preset}.label`)}</span>
            <span className="text-xs font-normal text-muted">{busy === preset ? t("seeding") : t(`presets.${preset}.hint`)}</span>
          </button>
        ))}
        {result ? <p role={result === "error" ? "alert" : "status"} className={`text-sm ${result === "error" ? "text-error" : "text-success"}`}>{t(result)}</p> : null}
      </div>
    </BottomSheet>
  </>;
}
