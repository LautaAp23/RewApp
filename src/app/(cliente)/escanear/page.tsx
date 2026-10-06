"use client";

import type { IScannerControls } from "@zxing/browser";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { primaryButton } from "@/components/ui";
import { chargeFromQr } from "@/lib/qr";

export default function ScanPage() {
  const t = useTranslations("scan");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<"denied" | "unavailable">();
  const [notRewApp, setNotRewApp] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let controls: IScannerControls | undefined;
    let stopped = false;
    setError(undefined);
    void (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const video = videoRef.current;
        if (!video || stopped) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          video,
          (result, _error, scanner) => {
            if (!result) return;
            const charge = chargeFromQr(result.getText(), window.location.origin);
            if (!charge) {
              setNotRewApp(true);
              return;
            }
            scanner.stop();
            navigator.vibrate?.(30);
            router.push(`/pagar/${charge}`);
          },
        );
        if (stopped) controls.stop();
      } catch (caught) {
        const name = caught instanceof DOMException ? caught.name : "";
        setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
    };
  }, [router, attempt]);

  return (
    <main className="flex flex-1 flex-col gap-5 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <div className="relative aspect-square w-full overflow-hidden rounded-modal bg-surface">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline aria-label={t("camera")} />
        <div className="pointer-events-none absolute inset-10 rounded-card border-4 border-primary/80" aria-hidden />
      </div>
      {notRewApp && !error ? <p className="text-sm text-error">{t("notRewApp")}</p> : null}
      {error ? (
        <div role="alert" className="flex flex-col gap-3">
          <p className="text-sm text-error">{t(`errors.${error}`)}</p>
          <button className={primaryButton} onClick={() => setAttempt((n) => n + 1)}>
            {t("retry")}
          </button>
        </div>
      ) : null}
    </main>
  );
}
