"use client";

import { useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { useTranslations } from "next-intl";
import { slideProgress, slideReachedEnd } from "@/lib/slide-progress";

export function SlideToPay({ amount, disabled, busy, onConfirm }: {
  amount: string; disabled?: boolean; busy: boolean; onConfirm(): Promise<void>;
}) {
  const t = useTranslations("pay");
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointer: number; x: number; y: number; travel: number } | null>(null);
  const committed = useRef(false);
  const [progress, setProgress] = useState(0);
  const [travel, setTravel] = useState(0);
  const [dragging, setDragging] = useState(false);
  function move(value: number) { setProgress(value); }
  function reset() { gesture.current = null; setDragging(false); if (!committed.current) move(0); }
  async function confirm() {
    if (disabled || busy || committed.current) return;
    committed.current = true;
    gesture.current = null;
    setDragging(false);
    setTravel(Math.max(0, (track.current?.clientWidth ?? 0) - 70));
    move(1);
    try { await onConfirm(); }
    finally { committed.current = false; move(0); }
  }
  function start(event: PointerEvent<HTMLButtonElement>) {
    if (disabled || busy || committed.current || event.button !== 0 || gesture.current) return;
    const available = (track.current?.clientWidth ?? 0) - event.currentTarget.offsetWidth - 12;
    if (available <= 0) return;
    setTravel(available);
    gesture.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, travel: available };
    move(0);
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function drag(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (disabled || busy || Math.abs(event.clientY - active.y) > 64) { reset(); return; }
    move(slideProgress(event.clientX - active.x, active.travel));
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    const end = slideProgress(event.clientX - active.x, active.travel);
    if (Math.abs(event.clientY - active.y) <= 64 && slideReachedEnd(end)) void confirm();
    else reset();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return (
    <div ref={track} className="slide-pay" data-dragging={dragging} data-busy={busy} data-disabled={disabled || undefined}
      style={{ "--slide-offset": `${progress * travel}px`, "--slide-progress": progress } as CSSProperties}>
      <div className="slide-pay-fill" aria-hidden />
      <span className="slide-pay-label" style={{ opacity: busy ? 1 : 1 - progress }} aria-hidden>{busy ? t("paying") : t("slideToPay", { amount })}</span>
      <button type="button" className="slide-pay-thumb" disabled={disabled || busy}
        aria-label={t("confirmPayment", { amount })} aria-describedby="slide-pay-help"
        onPointerDown={start} onPointerMove={drag} onPointerUp={finish} onPointerCancel={reset} onLostPointerCapture={reset}
        onClick={(event) => { if (event.detail === 0) void confirm(); }}
        onKeyDown={(event) => {
          if (event.key === "Escape") reset();
          if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (!event.repeat) void confirm(); }
        }}>
        {busy ? <span className="slide-pay-spinner" aria-hidden /> : <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 5 7 7-7 7" /></svg>}
      </button>
      <span id="slide-pay-help" className="sr-only">{t("slideHelp")}</span>
      <span role="status" className="sr-only">{busy ? t("paying") : ""}</span>
    </div>
  );
}
