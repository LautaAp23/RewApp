"use client";

import type { IScannerControls } from "@zxing/browser";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { primaryButton, secondaryButton } from "@/components/ui";
import { chargeFromQr } from "@/lib/qr";
import { readQrImage } from "@/lib/qr-image";

export default function ScanPage() {
  const t = useTranslations("scan");
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const controlsRef = useRef<IScannerControls | undefined>(undefined);
  const navigating = useRef(false);
  const imageBusy = useRef(false);
  const mounted = useRef(true);
  const [readingImage, setReadingImage] = useState(false);
  const [imageError, setImageError] = useState<"imageInvalid" | "imageNoQr" | "notRewApp">();
  const [error, setError] = useState<"denied" | "unavailable">();
  const [notRewApp, setNotRewApp] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  function openQr(text: string) {
    const charge = chargeFromQr(text, window.location.origin);
    if (!charge || navigating.current) return false;
    navigating.current = true;
    controlsRef.current?.stop();
    navigator.vibrate?.(30);
    router.push(`/pagar/${charge}`);
    return true;
  }

  async function selectImage(file: File | undefined) {
    if (!file || imageBusy.current || navigating.current) return;
    imageBusy.current = true;
    setReadingImage(true);
    setImageError(undefined);
    setNotRewApp(false);
    try {
      const text = await readQrImage(file);
      if (mounted.current && !openQr(text)) setImageError("notRewApp");
    } catch (caught) {
      if (mounted.current) setImageError(caught instanceof Error && caught.message === "invalid_image" ? "imageInvalid" : "imageNoQr");
    } finally {
      imageBusy.current = false;
      if (mounted.current) setReadingImage(false);
    }
  }

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
            if (!result || imageBusy.current || navigating.current || stopped) return;
            const charge = chargeFromQr(result.getText(), window.location.origin);
            if (!charge) {
              setNotRewApp(true);
              return;
            }
            scanner.stop();
            navigating.current = true;
            navigator.vibrate?.(30);
            router.push(`/pagar/${charge}`);
          },
        );
        controlsRef.current = controls;
        if (stopped) controls.stop();
      } catch (caught) {
        const name = caught instanceof DOMException ? caught.name : "";
        setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      }
    })();
    return () => {
      stopped = true;
      controls?.stop();
      controlsRef.current = undefined;
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
      <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label={t("loadImage")} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void selectImage(file); }} />
      <button type="button" className={`${secondaryButton} gap-2`} disabled={readingImage} onClick={() => fileRef.current?.click()}>
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="8" cy="8" r="1" /><path d="m3 17 6-6 4 4 3-3 5 5" /></svg>
        {t(readingImage ? "readingImage" : "loadImage")}
      </button>
      {imageError ? <p role="alert" className="text-sm text-error">{t(imageError)}</p> : null}
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
