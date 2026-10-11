"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";

/** Native top layer: covers navigation, traps focus and makes the page inert. */
export function BottomSheet({
  open = true,
  title,
  description,
  onClose,
  children,
}: {
  open?: boolean;
  title: string;
  description: string;
  onClose(): void;
  children: ReactNode;
}) {
  const t = useTranslations("cardSelector");
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropPointer = useRef(false);
  const previousFocus = useRef<Element | null>(null);
  const previousOverflow = useRef("");
  const ownsModal = useRef(false);

  const finishClose = useCallback(() => {
    if (!ownsModal.current) return;
    dialogRef.current?.close();
    document.body.style.overflow = previousOverflow.current;
    ownsModal.current = false;
    if (previousFocus.current instanceof HTMLElement && previousFocus.current.isConnected) {
      previousFocus.current.focus({ preventScroll: true });
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) {
        previousFocus.current = document.activeElement;
        previousOverflow.current = document.body.style.overflow;
        dialog.dataset.state = "open";
        dialog.showModal();
        document.body.style.overflow = "hidden";
        ownsModal.current = true;
      }
      dialog.dataset.state = "open";
      return;
    }
    if (!dialog.open) return;
    dialog.dataset.state = "closing";
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishClose();
      return;
    }
    const onEnd = (event: AnimationEvent) => {
      if (event.target === dialog && event.animationName === "sheet-down") finishClose();
    };
    dialog.addEventListener("animationend", onEnd);
    const fallback = window.setTimeout(finishClose, 320);
    return () => {
      dialog.removeEventListener("animationend", onEnd);
      window.clearTimeout(fallback);
    };
  }, [open, finishClose]);

  useEffect(() => finishClose, [finishClose]);

  function isBackdrop(event: React.PointerEvent<HTMLDialogElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right ||
      event.clientY < rect.top || event.clientY > rect.bottom;
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-modal="true"
      className="bottom-sheet fixed inset-x-0 top-auto bottom-0 m-0 mx-auto h-fit max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-hidden rounded-t-modal border border-elevated bg-surface p-0 text-text"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => {
        if (event.key !== "Tab" || event.altKey || event.ctrlKey || event.metaKey) return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          "button, a[href], input, select, textarea, [tabindex]",
        )).filter((element) => element.tabIndex >= 0 && !element.hasAttribute("disabled") && element.getClientRects().length > 0);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onPointerDown={(event) => { backdropPointer.current = isBackdrop(event); }}
      onPointerUp={(event) => {
        if (backdropPointer.current && isBackdrop(event)) onClose();
        backdropPointer.current = false;
      }}
    >
      <div className="flex max-h-[calc(100dvh-1rem-2px)] flex-col">
        <header className="flex shrink-0 items-start gap-4 px-6 pt-6 pb-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-2xl font-semibold">{title}</h2>
            <p id={descriptionId} className="mt-2 text-sm text-muted">{description}</p>
          </div>
          <button
            type="button"
            autoFocus
            className="-mt-2 -mr-2 flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-muted hover:bg-elevated active:bg-elevated focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            onClick={onClose}
            aria-label={t("close")}
          >
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
