// End-to-end check of self-service merchant sign-up: a brand new merchant
// registers itself, issues a charge and gets paid, cashback included.
// Usage: node --env-file=.env.local scripts/smoke-merchant.mjs [base-url]
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  keccak256,
  parseSignature,
  stringToHex,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const base = process.argv[2] ?? "http://localhost:3000";
const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
const usdr = getAddress(process.env.NEXT_PUBLIC_USDR_ADDRESS);
const rewAppPay = getAddress(process.env.NEXT_PUBLIC_REWAPP_PAY_ADDRESS);
const client = createPublicClient({ chain: monadTestnet, transport: http(process.env.NEXT_PUBLIC_RPC_URL) });

const api = { name: "RewApp", version: "1", chainId };
const payDomain = { name: "RewAppPay", version: "1", chainId, verifyingContract: rewAppPay };
const permitDomain = { name: "RewApp Dollar", version: "1", chainId, verifyingContract: usdr };
const abi = [
  { type: "function", name: "nonces", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isMerchant", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
];
const types = {
  MerchantProfile: [
    { name: "merchant", type: "address" }, { name: "name", type: "string" }, { name: "category", type: "string" },
    { name: "city", type: "string" }, { name: "streetAddress", type: "string" }, { name: "country", type: "string" },
    { name: "currency", type: "string" }, { name: "email", type: "string" }, { name: "placeId", type: "string" },
    { name: "lat", type: "string" }, { name: "lng", type: "string" }, { name: "deadline", type: "uint256" },
  ],
  MerchantIntent: [{ name: "merchant", type: "address" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" }],
  ProfileUpdate: [
    { name: "account", type: "address" }, { name: "alias", type: "string" }, { name: "email", type: "string" },
    { name: "country", type: "string" }, { name: "currency", type: "string" }, { name: "deadline", type: "uint256" },
  ],
  CreateCharge: [
    { name: "merchant", type: "address" }, { name: "localAmount", type: "string" },
    { name: "currency", type: "string" }, { name: "deadline", type: "uint256" },
  ],
  PaymentIntent: [
    { name: "payer", type: "address" }, { name: "merchant", type: "address" }, { name: "amount", type: "uint256" },
    { name: "chargeId", type: "bytes32" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
  ],
  Permit: [
    { name: "owner", type: "address" }, { name: "spender", type: "address" }, { name: "value", type: "uint256" },
    { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint256" },
  ],
};

const post = async (path, body) => {
  const response = await fetch(new URL(path, base), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};
const put = async (path, body) => {
  const response = await fetch(new URL(path, base), {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { status: response.status, json: await response.json().catch(() => null) };
};
const fatal = (message, extra) => {
  console.error("FALLO:", message, extra ?? "");
  process.exit(1);
};
const usd = (value) => `${formatUnits(BigInt(value), 6)} USDr`;

const merchant = privateKeyToAccount(generatePrivateKey());
const payer = privateKeyToAccount(generatePrivateKey());
const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);
console.log("comercio nuevo:", merchant.address, "| pagador:", payer.address);

// 1. Alta autoservicio
const profile = {
  name: "Café Smoke", category: "cafe", city: "Salta", streetAddress: "Balcarce 123",
  country: "AR", currency: "ARS", email: "", placeId: "", lat: "", lng: "",
};
const nonce = await client.readContract({ address: rewAppPay, abi, functionName: "nonces", args: [merchant.address] });
const signed = {
  ...profile, merchant: merchant.address, nonce: nonce.toString(), deadline: deadline.toString(),
  profileSignature: await merchant.signTypedData({
    domain: api, types: { MerchantProfile: types.MerchantProfile }, primaryType: "MerchantProfile",
    message: { merchant: merchant.address, ...profile, deadline },
  }),
  intentSignature: await merchant.signTypedData({
    domain: payDomain, types: { MerchantIntent: types.MerchantIntent }, primaryType: "MerchantIntent",
    message: { merchant: merchant.address, nonce, deadline },
  }),
};
const created = await post("/api/merchants", signed);
if (created.status !== 201) fatal("POST /api/merchants", `${created.status} ${JSON.stringify(created.json)}`);
console.log("1. alta OK:", created.json.name);

// 2. Quedó habilitado onchain, firmado por el propio comercio
if (!(await client.readContract({ address: rewAppPay, abi, functionName: "isMerchant", args: [merchant.address] }))) {
  fatal("el comercio no quedó habilitado onchain");
}
console.log("2. habilitado onchain OK");

// 3. Idempotencia de verdad: doble toque CONCURRENTE sobre un comercio nuevo.
//    Reenviar el mismo cuerpo en secuencia solo prueba la guarda de Postgres;
//    el Review Focus 1 pide el caso de dos pedidos en vuelo, donde los dos
//    pasan las guardas y uno pierde la carrera del nonce onchain. Ninguna de
//    las dos respuestas puede ser un 5xx, y el estado final tiene que ser uno.
const twin = privateKeyToAccount(generatePrivateKey());
const twinDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);
const twinNonce = await client.readContract({ address: rewAppPay, abi, functionName: "nonces", args: [twin.address] });
const twinBody = {
  ...profile, merchant: twin.address, nonce: twinNonce.toString(), deadline: twinDeadline.toString(),
  profileSignature: await twin.signTypedData({
    domain: api, types: { MerchantProfile: types.MerchantProfile }, primaryType: "MerchantProfile",
    message: { merchant: twin.address, ...profile, deadline: twinDeadline },
  }),
  intentSignature: await twin.signTypedData({
    domain: payDomain, types: { MerchantIntent: types.MerchantIntent }, primaryType: "MerchantIntent",
    message: { merchant: twin.address, nonce: twinNonce, deadline: twinDeadline },
  }),
};
const [first, second] = await Promise.all([post("/api/merchants", twinBody), post("/api/merchants", twinBody)]);
const codes = [first.status, second.status];
if (codes.some((code) => code >= 500)) {
  fatal("el doble toque devolvió un 5xx", JSON.stringify([first, second]));
}
if (!codes.includes(201)) fatal("ninguna de las dos altas concurrentes salió bien", JSON.stringify([first, second]));
if (!(await client.readContract({ address: rewAppPay, abi, functionName: "isMerchant", args: [twin.address] }))) {
  fatal("el comercio del doble toque no quedó habilitado onchain");
}
const third = await post("/api/merchants", twinBody);
if (third.status !== 409) fatal("un tercer intento debería dar 409", `${third.status} ${JSON.stringify(third.json)}`);
console.log(`3. doble toque concurrente OK: ${codes.join(" y ")}, habilitado onchain, tercer intento 409`);

// 4. Cobra
const chargeDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);
const chargeMessage = { merchant: merchant.address, localAmount: "10000.00", currency: "ARS", deadline: chargeDeadline };
const charge = await post("/api/charges", {
  ...chargeMessage, deadline: chargeDeadline.toString(),
  signature: await merchant.signTypedData({
    domain: api, types: { CreateCharge: types.CreateCharge }, primaryType: "CreateCharge", message: chargeMessage,
  }),
});
if (charge.status !== 201) fatal("POST /api/charges", `${charge.status} ${JSON.stringify(charge.json)}`);
console.log("4. cobro creado OK:", charge.json.localAmount, charge.json.localCurrency, "=", usd(charge.json.usdAmount));

// 5. El cliente carga saldo y paga
const funded = await post("/api/onramp", { address: payer.address, localAmount: "15000.00", currency: "ARS" });
if (funded.status !== 200) fatal("POST /api/onramp", `${funded.status} ${JSON.stringify(funded.json)}`);
const amount = BigInt(charge.json.usdAmount);
const payNonce = await client.readContract({ address: rewAppPay, abi, functionName: "nonces", args: [payer.address] });
const permitNonce = await client.readContract({ address: usdr, abi, functionName: "nonces", args: [payer.address] });
const payDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);
const intent = {
  payer: payer.address, merchant: merchant.address, amount,
  chargeId: keccak256(stringToHex(charge.json.id)), nonce: payNonce, deadline: payDeadline,
};
const permitSignature = await payer.signTypedData({
  domain: permitDomain, types: { Permit: types.Permit }, primaryType: "Permit",
  message: { owner: payer.address, spender: rewAppPay, value: amount, nonce: permitNonce, deadline: payDeadline },
});
const { v, r, s } = parseSignature(permitSignature);
const paid = await post("/api/pay", {
  charge: charge.json.id,
  intent: { ...intent, amount: amount.toString(), nonce: payNonce.toString(), deadline: payDeadline.toString() },
  signature: await payer.signTypedData({
    domain: payDomain, types: { PaymentIntent: types.PaymentIntent }, primaryType: "PaymentIntent", message: intent,
  }),
  permit: { value: amount.toString(), deadline: payDeadline.toString(), v: Number(v), r, s },
});
if (paid.status !== 200) fatal("POST /api/pay", `${paid.status} ${JSON.stringify(paid.json)}`);
console.log("5. pago OK:", usd(amount), "| puntos:", paid.json.customerPoints, "| cashback:", usd(paid.json.merchantReward));
console.log("   tx:", `https://testnet.monadexplorer.com/tx/${paid.json.txHash}`);

// 6. Una dirección que ya es identidad de persona no puede registrarse como comercio.
//    El pagador todavía no tiene Profile (pagar no crea uno), así que primero se
//    le escribe el perfil: sin eso la guarda del servidor no se dispara y este
//    paso no probaría nada.
const personDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);
const personProfile = { account: payer.address, alias: "Persona Smoke", email: "", country: "AR", currency: "ARS", deadline: personDeadline };
const profileWritten = await put(`/api/profile/${payer.address}`, {
  ...personProfile, deadline: personDeadline.toString(),
  signature: await payer.signTypedData({
    domain: api, types: { ProfileUpdate: types.ProfileUpdate }, primaryType: "ProfileUpdate", message: personProfile,
  }),
});
if (profileWritten.status !== 200) fatal("PUT /api/profile del pagador", `${profileWritten.status} ${JSON.stringify(profileWritten.json)}`);

const rejectedDeadline = BigInt(Math.floor(Date.now() / 1000) + 300);
const payerNonce = await client.readContract({ address: rewAppPay, abi, functionName: "nonces", args: [payer.address] });
const rejected = await post("/api/merchants", {
  ...signed, merchant: payer.address, nonce: payerNonce.toString(), deadline: rejectedDeadline.toString(),
  profileSignature: await payer.signTypedData({
    domain: api, types: { MerchantProfile: types.MerchantProfile }, primaryType: "MerchantProfile",
    message: { merchant: payer.address, ...profile, deadline: rejectedDeadline },
  }),
  intentSignature: await payer.signTypedData({
    domain: payDomain, types: { MerchantIntent: types.MerchantIntent }, primaryType: "MerchantIntent",
    message: { merchant: payer.address, nonce: payerNonce, deadline: rejectedDeadline },
  }),
});
if (rejected.status !== 409 || rejected.json?.error !== "person_address") {
  fatal("una dirección que ya es identidad de persona debería dar 409 person_address", `${rejected.status} ${JSON.stringify(rejected.json)}`);
}
console.log("6. identidad de persona rechazada con 409 person_address OK");

console.log("\n✅ el comercio se registra solo, queda habilitado y cobra");
