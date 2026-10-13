import "server-only";
import { db } from "../db";
import contacts from "../demo-contacts.json";

/** Fixtures only for newly registered local development accounts. Removals stay removed. */
export async function addLocalDemoContacts(owner: string) {
  if (process.env.NODE_ENV !== "development" || !process.env.DATABASE_URL) return;
  const host = new URL(process.env.DATABASE_URL).hostname;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host) || Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143) !== 10143) return;
  await db.$transaction(async tx => {
    for (const contact of contacts) {
      await tx.profile.upsert({ where: { address: contact.address }, create: contact, update: {} });
    }
    await tx.contact.createMany({
      data: contacts.filter(contact => contact.address !== owner).map(contact => ({ owner, address: contact.address, label: contact.alias })),
      skipDuplicates: true,
    });
  });
}
