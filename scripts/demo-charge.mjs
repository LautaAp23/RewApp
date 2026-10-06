// Creates a charge as a demo merchant and prints its payment link and QR.
// Usage: npm run demo:charge -- <amount> [ars|eur] [base-url]
//   npm run demo:charge -- 5000            (ARS 5.000 at Café Demo, 10% cashback over USD 5)
//   npm run demo:charge -- 12.50 eur       (EUR 12,50 at Bistro Demo)
// The merchant keys are public testnet-only keys (see the seed_demo_merchants migration).
import QRCode from "qrcode";
import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const MERCHANTS = {
  ars: { seed: "rewapp.smoke.merchant", currency: "ARS" },
  eur: { seed: "rewapp.demo.merchant.eur", currency: "EUR" },
};

const [amount, which = "ars", base = "https://rewapp-app.vercel.app"] = process.argv.slice(2);
const merchant = MERCHANTS[which];
if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount) || !merchant) {
  console.error("Usage: npm run demo:charge -- <amount, e.g. 5000 or 12.50> [ars|eur] [base-url]");
  process.exit(1);
}

const account = privateKeyToAccount(keccak256(toBytes(merchant.seed)));
const deadline = BigInt(Math.floor(Date.now() / 1000) + 5 * 60);
const message = { merchant: account.address, localAmount: amount, currency: merchant.currency, deadline };
const signature = await account.signTypedData({
  domain: { name: "RewApp", version: "1", chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143) },
  types: {
    CreateCharge: [
      { name: "merchant", type: "address" },
      { name: "localAmount", type: "string" },
      { name: "currency", type: "string" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "CreateCharge",
  message,
});

const response = await fetch(new URL("/api/charges", base), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...message, deadline: deadline.toString(), signature }),
});
const body = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error(`POST /api/charges failed (${response.status}):`, body.error ?? body);
  process.exit(1);
}

console.log(await QRCode.toString(body.url, { type: "terminal", small: true }));
console.log(`${merchant.currency} ${body.localAmount} = ${Number(body.usdAmount) / 1e6} USDr`);
console.log(`Link: ${body.url}`);
console.log(`Expires: ${new Date(body.expiresAt).toLocaleTimeString()}`);
