"use client";

import Link from "next/link";
import { createContext, useContext, useState, type ComponentProps, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { isReceiptKind, type ReceiptKind } from "@/lib/api/receipt";
import { BottomSheet } from "./bottom-sheet";
import { ReceiptContent } from "./receipt-content";

const ReceiptOverlayContext = createContext<((href: string) => boolean) | null>(null);

/** Leaves the current screen mounted, including its scroll and payment state. */
export function ReceiptOverlayProvider({ children }: { children: ReactNode }) {
  const t = useTranslations("receipt");
  const [operation, setOperation] = useState<{ id: string; kind: ReceiptKind }>();
  function open(href: string) {
    const url = new URL(href, window.location.origin);
    const match = url.pathname.match(/^\/comprobante\/([^/]+)$/);
    const kind = url.searchParams.get("tipo") ?? "payment";
    if (!match || !isReceiptKind(kind)) return false;
    setOperation({ id: decodeURIComponent(match[1]), kind });
    return true;
  }
  return <ReceiptOverlayContext.Provider value={open}>
    {children}
    {operation ? <BottomSheet className="receipt-overlay" title={t("title")} onClose={() => setOperation(undefined)}>
      <div className="min-h-0 overflow-y-auto overscroll-contain px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <ReceiptContent key={`${operation.kind}-${operation.id}`} chargeId={operation.id} kind={operation.kind} overlay />
      </div>
    </BottomSheet> : null}
  </ReceiptOverlayContext.Provider>;
}

export function ReceiptLink({ onClick, ...props }: ComponentProps<typeof Link>) {
  const open = useContext(ReceiptOverlayContext);
  return <Link {...props} onClick={(event) => {
    onClick?.(event);
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (typeof props.href === "string" && open?.(props.href)) event.preventDefault();
  }} />;
}
