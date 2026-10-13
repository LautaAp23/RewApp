// Local PostgreSQL only. Public testnet fixtures, never funded by this script.
import { PrismaClient } from "@prisma/client";
import contacts from "../src/lib/demo-contacts.json" with { type: "json" };

const host = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "";
if (!["localhost", "127.0.0.1", "[::1]"].includes(host) || Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143) !== 10143) {
  throw new Error("Demo contacts require local PostgreSQL and Monad Testnet.");
}
const db = new PrismaClient();
try {
  const result = await db.$transaction(async tx => {
    for (const contact of contacts) {
      await tx.profile.upsert({ where: { address: contact.address }, create: contact, update: {} });
    }
    const owners = await tx.profile.findMany({ select: { address: true } });
    const rows = owners.flatMap(owner => contacts.filter(contact => contact.address !== owner.address)
      .map(contact => ({ owner: owner.address, address: contact.address, label: contact.alias })));
    const inserted = await tx.contact.createMany({ data: rows, skipDuplicates: true });
    return { accounts: owners.length, inserted: inserted.count };
  });
  console.log(`Demo contacts ready in ${result.accounts} local accounts; ${result.inserted} contacts added.`);
  console.log("Ana Demo: @ana.demo | Bruno Demo: @bruno.demo");
} finally {
  await db.$disconnect();
}
