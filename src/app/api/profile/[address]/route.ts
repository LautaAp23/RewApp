import { getAddress, isAddress, isHex, verifyTypedData } from "viem";
import {
  isFreshDeadline,
  profileUpdateTypes,
  rewAppApiDomain,
} from "@/lib/api/typed-data";
import { db } from "@/lib/db";
import { isCurrency } from "@/lib/money";

type Params = { params: Promise<{ address: string }> };

const COUNTRY = /^[A-Z]{2}$/;
const MAX_ALIAS = 40;

function chainId() {
  return Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
}

export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "invalid_address" }, { status: 400 });
  const account = getAddress(address);
  const profile = await db.profile.findUnique({ where: { address: account } });
  return Response.json({
    address: account,
    alias: profile?.alias ?? null,
    country: profile?.country ?? null,
    currency: profile?.currency ?? "USD",
  });
}

/** Body: { alias, country, currency, deadline, signature } signed as ProfileUpdate. */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "invalid_address" }, { status: 400 });
  const account = getAddress(address);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const alias = typeof body?.alias === "string" ? body.alias.trim() : "";
  const country = typeof body?.country === "string" ? body.country.toUpperCase() : "";
  const currency = body?.currency;
  const signature = body?.signature;
  let deadline: bigint;
  try {
    deadline = BigInt(String(body?.deadline));
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (
    alias.length > MAX_ALIAS ||
    (country !== "" && !COUNTRY.test(country)) ||
    !isCurrency(currency) ||
    !isHex(signature)
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!isFreshDeadline(deadline)) {
    return Response.json({ error: "expired_signature" }, { status: 400 });
  }

  const valid = await verifyTypedData({
    address: account,
    domain: rewAppApiDomain(chainId()),
    types: profileUpdateTypes,
    primaryType: "ProfileUpdate",
    message: { account, alias, country, currency, deadline },
    signature,
  }).catch(() => false);
  if (!valid) return Response.json({ error: "invalid_signature" }, { status: 401 });

  const data = { alias: alias || null, country: country || null, currency };
  const profile = await db.profile.upsert({
    where: { address: account },
    create: { address: account, ...data },
    update: data,
  });
  return Response.json({
    address: profile.address,
    alias: profile.alias,
    country: profile.country,
    currency: profile.currency,
  });
}
