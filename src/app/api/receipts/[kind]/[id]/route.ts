import { handleReceiptRequest } from "@/lib/server/receipts";

export async function POST(request: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await params;
  return handleReceiptRequest(request, kind, id);
}
