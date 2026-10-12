/** Local integration smoke: starts no on-chain transactions, removes only its own fixtures. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
const base = process.argv[2] ?? "http://localhost:3000";
if (
  !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base) ||
  !/127\.0\.0\.1:5434/.test(process.env.DATABASE_URL ?? "")
)
  throw new Error(
    "This smoke runs only against the documented local database and localhost server.",
  );
const db = new PrismaClient();
const seed = randomUUID();
const a = privateKeyToAccount(keccak256(toBytes(`smoke-a-${seed}`))),
  b = privateKeyToAccount(keccak256(toBytes(`smoke-b-${seed}`)));
const merchant = privateKeyToAccount(
  keccak256(toBytes("rewapp.smoke.merchant")),
);
const types = {
  WorkspaceAction: [
    { name: "account", type: "address" },
    { name: "action", type: "string" },
    { name: "payload", type: "string" },
    { name: "requestId", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
};
const requests = [],
  sessionHashes = [];
const fixtureCharges = [],
  fixtureRedemptions = [];
async function signed(account, action, payload = {}) {
  const message = {
    account: account.address,
    action,
    payload: JSON.stringify(payload),
    requestId: randomUUID(),
    deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
  };
  requests.push(message.requestId);
  return {
    ...message,
    deadline: message.deadline.toString(),
    signature: await account.signTypedData({
      domain: { name: "RewApp", version: "1", chainId: 10143 },
      types,
      primaryType: "WorkspaceAction",
      message,
    }),
  };
}
async function post(body) {
  const response = await fetch(`${base}/api/workspace`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify(body),
  });
  const cookie = response.headers.get("set-cookie")?.split(";")[0];
  if (cookie)
    sessionHashes.push(
      createHash("sha256")
        .update(cookie.slice(cookie.indexOf("=") + 1))
        .digest("hex"),
    );
  return { status: response.status, body: await response.json(), cookie };
}
async function action(account, name, payload, status = 200) {
  const result = await post(await signed(account, name, payload));
  assert.equal(result.status, status, JSON.stringify(result.body));
  return result;
}
let originalReward;
try {
  assert.equal((await fetch(`${base}/api/workspace`)).status, 401);
  const profileTypes = {
    ProfileUpdate: [
      { name: "account", type: "address" },
      { name: "alias", type: "string" },
      { name: "country", type: "string" },
      { name: "currency", type: "string" },
      { name: "deadline", type: "uint256" },
    ],
  };
  const details = {
    account: a.address,
    alias: "Smoke profile",
    country: "AR",
    currency: "EUR",
    deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
  };
  const signature = await a.signTypedData({
    domain: { name: "RewApp", version: "1", chainId: 10143 },
    types: profileTypes,
    primaryType: "ProfileUpdate",
    message: details,
  });
  const profileBody = {
    alias: details.alias,
    country: details.country,
    currency: details.currency,
    deadline: details.deadline.toString(),
    signature,
  };
  const writeProfile = (address, body) =>
    fetch(`${base}/api/profile/${address}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (await writeProfile(b.address, profileBody)).status,
    401,
    "profile bound to signer",
  );
  assert.equal(
    (await writeProfile(a.address, { ...profileBody, alias: "Tampered" }))
      .status,
    401,
    "signed profile cannot be altered",
  );
  assert.equal((await writeProfile(a.address, profileBody)).status, 200);
  const savedProfile = await (
    await fetch(`${base}/api/profile/${a.address}`)
  ).json();
  assert.equal(savedProfile.alias, details.alias);
  assert.equal(savedProfile.currency, "EUR");
  assert.equal(savedProfile.exists, true);
  const contactBody = await signed(a, "contact.save", {
    address: b.address,
    label: "Smoke friend",
  });
  const contact = await post(contactBody);
  assert.equal(contact.status, 200);
  assert.equal((await post(contactBody)).status, 409, "signature replay");
  const tampered = await signed(a, "contact.save", {
    address: b.address,
    label: "Original",
  });
  tampered.payload = JSON.stringify({ address: b.address, label: "Forged" });
  assert.equal((await post(tampered)).status, 401, "tampered payload");
  const group = await action(a, "group.save", {
    name: "Smoke family",
    kind: "family",
    members: [a.address, b.address],
  });
  assert.equal(group.body.groups[0].kind, "family");
  const bill = await db.charge.create({
    data: {
      merchantId: "demo-cafe-ars",
      localAmount: "100.01",
      localCurrency: "ARS",
      usdAmount: 100001n,
      expiresAt: new Date(Date.now() + 60000),
    },
  });
  fixtureCharges.push(bill.id);
  const splitBodies = await Promise.all([
    signed(a, "charge.split", {
      charge: bill.id,
      members: [a.address, b.address],
    }),
    signed(a, "charge.split", {
      charge: bill.id,
      members: [a.address, b.address],
    }),
  ]);
  const splitResults = await Promise.all(splitBodies.map(post));
  assert.deepEqual(
    splitResults.map((r) => r.status).sort(),
    [200, 409],
    "concurrent split race",
  );
  const children = await db.charge.findMany({ where: { parentId: bill.id } });
  assert.equal(children.length, 2);
  assert.equal(
    children.reduce((n, p) => n + p.usdAmount, 0n),
    100001n,
  );
  assert.equal(
    children.reduce(
      (n, p) => n + BigInt(p.localAmount.mul(100).toFixed(0)),
      0n,
    ),
    10001n,
  );
  await action(
    b,
    "charge.split",
    { charge: children[0].id, members: [a.address, b.address] },
    409,
  );
  const ownView = await fetch(`${base}/api/workspace`, {
    headers: { Cookie: contact.cookie },
  });
  assert.equal(ownView.status, 200);
  assert.equal((await ownView.json()).account, a.address);
  const fakePay = (part) => ({
    charge: part.id,
    intent: {
      payer: b.address,
      merchant: merchant.address,
      amount: part.usdAmount.toString(),
      chargeId: keccak256(toBytes(part.id)),
      nonce: "0",
      deadline: String(Math.floor(Date.now() / 1000) + 300),
    },
    signature: "0x00",
    permit: {
      value: part.usdAmount.toString(),
      deadline: "0",
      v: 27,
      r: "0x00",
      s: "0x00",
    },
  });
  const assigned = children.find((c) => c.expectedPayer === a.address);
  const wrong = await fetch(`${base}/api/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakePay(assigned)),
  });
  assert.equal(wrong.status, 403, "wrong participant");
  const parentPay = await fetch(`${base}/api/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakePay(bill)),
  });
  assert.equal(parentPay.status, 409);
  assert.equal((await parentPay.json()).error, "charge_split");
  originalReward = await db.platformReward.findUniqueOrThrow({
    where: { id: 1 },
  });
  await action(
    a,
    "reward.update",
    { id: 1, title: "Hijack", description: "No", active: true },
    409,
  );
  await action(merchant, "reward.update", {
    id: 1,
    title: originalReward.title,
    description: originalReward.description,
    active: true,
    pointsCost: 1,
  });
  assert.equal(
    (await db.platformReward.findUniqueOrThrow({ where: { id: 1 } }))
      .pointsCost,
    300,
  );
  const pending = await db.redemption.create({
    data: {
      account: a.address,
      nonce: `smoke-${seed}`,
      rewardId: 1,
      title: "Smoke reward",
      pointsCost: 300,
      merchantId: "demo-cafe-ars",
      pickupCode: `smoke-${seed}`,
    },
  });
  fixtureRedemptions.push(pending.id);
  await action(
    merchant,
    "redemption.deliver",
    { pickupCode: pending.pickupCode },
    409,
  );
  await db.redemption.update({
    where: { id: pending.id },
    data: { status: "READY" },
  });
  await action(
    a,
    "redemption.deliver",
    { pickupCode: pending.pickupCode },
    409,
  );
  await action(merchant, "redemption.deliver", {
    pickupCode: pending.pickupCode,
  });
  await action(
    merchant,
    "redemption.deliver",
    { pickupCode: pending.pickupCode },
    409,
  );
  assert.equal(
    (await db.redemption.findUniqueOrThrow({ where: { id: pending.id } }))
      .status,
    "DELIVERED",
  );
  console.log(
    "PASS: authenticated contacts/groups, replay and tamper rejection, concurrent split, exact sums, participant binding, original bill lock, merchant ownership and single fulfillment.",
  );
} finally {
  if (originalReward)
    await db.platformReward.update({
      where: { id: 1 },
      data: {
        title: originalReward.title,
        description: originalReward.description,
        active: originalReward.active,
      },
    });
  await db.redemption.deleteMany({ where: { id: { in: fixtureRedemptions } } });
  await db.charge.deleteMany({ where: { parentId: { in: fixtureCharges } } });
  await db.charge.deleteMany({ where: { id: { in: fixtureCharges } } });
  await db.contact.deleteMany({
    where: { owner: { in: [a.address, b.address] } },
  });
  await db.socialGroup.deleteMany({
    where: { owner: { in: [a.address, b.address] } },
  });
  await db.apiAuthorization.deleteMany({ where: { id: { in: requests } } });
  await db.workspaceSession.deleteMany({
    where: { tokenHash: { in: sessionHashes } },
  });
  await db.profile.deleteMany({
    where: { address: { in: [a.address, b.address] } },
  });
  await db.$disconnect();
}
