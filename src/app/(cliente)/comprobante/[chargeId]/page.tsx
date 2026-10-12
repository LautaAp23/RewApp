"use client";
import { Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { isReceiptKind } from "@/lib/api/receipt";
import { ReceiptContent } from "@/components/receipt-content";
import { ReceiptSkeleton } from "@/components/receipt-skeleton";
function StandaloneReceipt() {
  const { chargeId } = useParams<{ chargeId: string }>();
  const kind = useSearchParams().get("tipo") ?? "payment";
  return <ReceiptContent chargeId={chargeId} kind={isReceiptKind(kind) ? kind : undefined} />;
}
export default function ReceiptPage() { return <Suspense fallback={<ReceiptSkeleton />}><StandaloneReceipt /></Suspense>; }
