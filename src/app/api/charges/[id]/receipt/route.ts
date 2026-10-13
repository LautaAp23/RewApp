import { handleReceiptRequest } from "@/lib/server/receipts";

/** Compatibility route for existing QR payment links. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return handleReceiptRequest(request, "payment", id);
}
