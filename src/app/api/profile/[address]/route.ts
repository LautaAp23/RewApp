import { getAddress, isAddress, isHex } from "viem";
import { verifySignedRequest } from "@/lib/api/signed-request";
import { profileUpdateTypes } from "@/lib/api/typed-data";
import { mergeBirthdate } from "@/lib/birthdate";
import { isEmailShaped, MAX_EMAIL } from "@/lib/profile-form";
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
    exists: !!profile,
    alias: profile?.alias ?? null,
    handle: profile?.handle ?? null,
    // The email is never exposed: this route is public and addresses are
    // enumerable from the chain.
    hasEmail: Boolean(profile?.email),
    country: profile?.country ?? null,
    currency: profile?.currency ?? "USD",
    birthDay: profile?.birthDay ?? null,
    birthMonth: profile?.birthMonth ?? null,
  });
}

/** Body: { alias, country, currency, birthDay, birthMonth, deadline, signature } signed as ProfileUpdate. */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { address } = await params;
  if (!isAddress(address)) return Response.json({ error: "invalid_address" }, { status: 400 });
  const account = getAddress(address);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const alias = typeof body?.alias === "string" ? body.alias.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const country = typeof body?.country === "string" ? body.country.toUpperCase() : "";
  const currency = body?.currency;
  const birthDay = typeof body?.birthDay === "string" ? body.birthDay : "";
  const birthMonth = typeof body?.birthMonth === "string" ? body.birthMonth : "";
  const signature = body?.signature;
  let deadline: bigint;
  try {
    deadline = BigInt(String(body?.deadline));
  } catch {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  if (
    alias.length > MAX_ALIAS ||
    email.length > MAX_EMAIL ||
    (email !== "" && !isEmailShaped(email)) ||
    (country !== "" && !COUNTRY.test(country)) ||
    !isCurrency(currency) ||
    !isHex(signature)
  ) {
    return Response.json({ error: "invalid_request" }, { status: 400 });
  }
  const checked = await verifySignedRequest({
    signer: account,
    types: profileUpdateTypes,
    primaryType: "ProfileUpdate",
    message: { account, alias, email, country, currency, birthDay, birthMonth, deadline },
    deadline,
    signature,
    fresh: true,
    chainId: chainId(),
  });
  if (checked === "expired_signature") {
    return Response.json({ error: "expired_signature" }, { status: 400 });
  }
  if (checked !== "ok") return Response.json({ error: "invalid_signature" }, { status: 401 });

  const existing = await db.profile.findUnique({ where: { address: account } });
  const merged = mergeBirthdate(existing, birthDay, birthMonth);
  if (!merged.ok) {
    return Response.json(
      { error: merged.error === "locked" ? "birthdate_locked" : "invalid_request" },
      { status: merged.error === "locked" ? 409 : 400 },
    );
  }

  const data = {
    alias: alias || null,
    email: email || null,
    country: country || null,
    currency,
    birthDay: merged.day,
    birthMonth: merged.month,
  };
  const profile = await db.profile.upsert({
    where: { address: account },
    create: { address: account, ...data },
    update: { ...data, ...(body?.email === undefined ? { email: undefined } : {}) },
  });
  if (!existing && process.env.NODE_ENV === "development") {
    const { addLocalDemoContacts } = await import("@/lib/server/demo-contacts");
    await addLocalDemoContacts(account);
  }
  return Response.json({
    address: profile.address,
    alias: profile.alias,
    hasEmail: Boolean(profile.email),
    country: profile.country,
    currency: profile.currency,
    birthDay: profile.birthDay,
    birthMonth: profile.birthMonth,
  });
}
