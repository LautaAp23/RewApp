import { getAddress, isAddress } from "viem";
import { db } from "@/lib/db";

/**
 * Which identities of one passkey exist. Public and unsigned, like the profile
 * GET: it only returns what is already public, and NEVER the email.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const person = params.get("person");
  const merchant = params.get("merchant");
  if (!person || !isAddress(person) || !merchant || !isAddress(merchant)) {
    return Response.json({ error: "invalid_address" }, { status: 400 });
  }
  const [profile, row] = await Promise.all([
    db.profile.findUnique({ where: { address: getAddress(person) } }),
    db.merchant.findUnique({ where: { address: getAddress(merchant) } }),
  ]);
  return Response.json(
    {
      profile: profile
        ? {
            address: profile.address,
            alias: profile.alias,
            hasEmail: Boolean(profile.email),
            country: profile.country,
            currency: profile.currency,
          }
        : null,
      merchant: row
        ? {
            address: row.address,
            name: row.name,
            category: row.category,
            city: row.city,
            currency: row.currency,
          }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
