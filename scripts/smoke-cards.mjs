import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:3001");
const database = new URL(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
if (![base.hostname, database.hostname].every((host) => ["localhost", "127.0.0.1"].includes(host))) throw new Error("Local smoke test only");
const db = new PrismaClient();
const owner = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const domain = { name: "RewApp", version: "1", chainId: 10143 };
const listTypes = { ListCards: [{ name: "account", type: "address" }, { name: "deadline", type: "uint256" }] };
const addTypes = { AddCard: [
  { name: "account", type: "address" }, { name: "brand", type: "string" },
  { name: "last4", type: "string" }, { name: "holder", type: "string" },
  { name: "expiryMonth", type: "uint256" }, { name: "expiryYear", type: "uint256" },
  { name: "deadline", type: "uint256" },
] };
const card = { brand: "Visa", last4: "1234", holder: "Metadata Smoke", expiryMonth: 12, expiryYear: new Date().getFullYear() + 2 };
const post = (path, body) => fetch(new URL(path, base), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
async function proof(signer, metadata) {
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
  const signature = await signer.signTypedData({ domain, types: metadata ? addTypes : listTypes,
    primaryType: metadata ? "AddCard" : "ListCards", message: { account: signer.address, ...(metadata ?? {}), deadline } });
  return { accountAddress: signer.address, ...(metadata ?? {}), deadline: deadline.toString(), signature };
}
try {
  const registration = await proof(owner, card);
  assert.equal((await post("/api/cards", { ...registration, cvv: "123" })).status, 400);
  assert.equal((await post("/api/cards", { ...registration, providerMethodId: "untrusted" })).status, 400);
  assert.equal((await post("/api/cards", { ...registration, accountAddress: other.address })).status, 401);
  const added = await post("/api/cards", registration);
  assert.equal(added.status, 201, await added.text());
  assert.equal((await post("/api/cards", registration)).status, 409);
  assert.equal((await post("/api/cards/list", { accountAddress: owner.address })).status, 401);
  const ownList = await post("/api/cards/list", await proof(owner));
  assert.equal(ownList.status, 200);
  assert.equal(ownList.headers.get("cache-control"), "no-store");
  const { cards } = await ownList.json();
  assert.equal(cards.length, 1);
  assert.equal(cards[0].last4, card.last4);
  assert.equal(cards[0].status, "pending_provider");
  assert.equal("holder" in cards[0], false);
  assert.equal("providerMethodId" in cards[0], false);
  const othersList = await post("/api/cards/list", await proof(other));
  assert.deepEqual((await othersList.json()).cards, []);
  const stored = await db.savedCard.findUniqueOrThrow({ where: { id: cards[0].id }, include: { user: true } });
  assert.equal(stored.user.address, owner.address);
  assert.equal(stored.providerMethodId, null);
  await db.profile.delete({ where: { address: owner.address } });
  assert.equal(await db.savedCard.count({ where: { userId: owner.address } }), 0);
  console.log("Card API smoke passed: persistence, FK/cascade, duplicates, isolation, signatures and sensitive-field rejection.");
} finally {
  await db.profile.deleteMany({ where: { address: owner.address } });
  await db.$disconnect();
}
