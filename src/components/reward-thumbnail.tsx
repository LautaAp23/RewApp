"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { BottomSheet } from "./bottom-sheet";

export function RewardThumbnail({ src, title }: { src: string | null; title: string }) {
  const t = useTranslations("rewards");
  const [failedSource, setFailedSource] = useState<string>();
  const [openedSource, setOpenedSource] = useState<string>();
  if (!src || src === failedSource) return null;
  return <>
    <button type="button" className="pressable h-18 w-18 shrink-0 overflow-hidden rounded-card bg-elevated"
      aria-label={t("viewImage", { name: title })} aria-haspopup="dialog" aria-expanded={openedSource === src}
      onClick={() => setOpenedSource(src)}>
      <Image src={src} alt="" width={72} height={72} unoptimized
        className="h-full w-full object-cover" onError={() => setFailedSource(src)} />
    </button>
    {openedSource === src ? <BottomSheet title={title} onClose={() => setOpenedSource(undefined)}>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <Image src={src} alt={title} width={768} height={768} unoptimized
          className="max-h-[70dvh] w-full rounded-card object-contain" />
      </div>
    </BottomSheet> : null}
  </>;
}
