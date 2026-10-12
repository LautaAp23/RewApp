import { Prisma } from "@prisma/client";
import { getAddress, isAddress } from "viem";
import { db } from "@/lib/db";
import { isCurrency } from "@/lib/money";
import { summarizeRegisters } from "@/lib/register-stats";
import { workspaceAccount } from "@/lib/server/workspace-auth";

const fail = (error: string, status: number) => Response.json({ error }, { status });
const MAX_REGISTERS = 20;
const MAX_NAME = 40;

async function ownedMerchant(account: string, address: string) {
  if (!isAddress(address)) return null;
  return db.merchant.findFirst({
    where: {
      address: getAddress(address),
      OR: [{ ownerAddress: account }, { address: account }],
    },
  });
}

/** Dashboard of one business the signed-in person owns. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<Response> {
  const account = await workspaceAccount();
  if (!account) return fail("unauthorized", 401);
  const { address } = await params;
  const merchant = await ownedMerchant(account, address);
  if (!merchant || !isCurrency(merchant.currency)) return fail("not_merchant", 403);

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - 6);
  const [registers, charges] = await Promise.all([
    db.register.findMany({ where: { merchantId: merchant.id }, orderBy: { number: "asc" } }),
    db.charge.findMany({
      where: { merchantId: merchant.id, status: "PAID", createdAt: { gte: since } },
      select: { registerId: true, payer: true, localAmount: true, createdAt: true },
    }),
  ]);
  const stats = summarizeRegisters(
    registers,
    charges.map((charge) => ({ ...charge, localAmount: charge.localAmount.toFixed(2) })),
  );

  return Response.json(
    {
      address: merchant.address,
      name: merchant.name,
      city: merchant.city,
      currency: merchant.currency,
      derivationIndex: merchant.derivationIndex,
      weekCustomers: stats.weekCustomers,
      weekSales: stats.weekSales,
      registers: registers.map((register) => {
        const stat = stats.registers.find((item) => item.id === register.id);
        return {
          id: register.id,
          number: register.number,
          name: register.name,
          days: stat?.days ?? [],
          weekCustomers: stat?.weekCustomers ?? 0,
          weekSales: stat?.weekSales ?? "0.00",
        };
      }),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** Opens the next caja. The name defaults to "Caja N". */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ address: string }> },
): Promise<Response> {
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail("forbidden", 403);
  const account = await workspaceAccount();
  if (!account) return fail("unauthorized", 401);
  const { address } = await params;
  const merchant = await ownedMerchant(account, address);
  if (!merchant) return fail("not_merchant", 403);

  const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
  const requested = typeof body?.name === "string" ? body.name.trim() : "";
  if (requested.length > MAX_NAME) return fail("invalid_request", 400);

  const last = await db.register.findFirst({
    where: { merchantId: merchant.id },
    orderBy: { number: "desc" },
  });
  const number = (last?.number ?? 0) + 1;
  if (number > MAX_REGISTERS) return fail("limit", 409);
  try {
    const register = await db.register.create({
      data: {
        merchantId: merchant.id,
        number,
        name: requested || `Caja ${number}`,
      },
    });
    return Response.json({ id: register.id, number: register.number, name: register.name }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return fail("limit", 409);
    throw error;
  }
}
