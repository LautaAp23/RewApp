#!/usr/bin/env node
// Pasa el rol de administrador (DEFAULT_ADMIN_ROLE) de los tres contratos a una
// cuenta que controle el equipo, sin volver a desplegar nada (tarjeta #80).
// El orden es la única regla: OTORGAR a la cuenta nueva, VERIFICAR que lo
// tenga, y recién entonces REVOCAR a la vieja. Al revés deja a todos afuera y
// sin vuelta atrás, por eso este script se niega a revocar mientras la cuenta
// nueva no sea admin en los tres, y la revocación la firma la cuenta NUEVA:
// así, además de leer el rol, se prueba que el equipo de verdad la controla.
//
// Estado y plan, sin firmar nada:
//   node --env-file=.env.local scripts/admin-handover.mjs <cuenta-nueva>
// Otorgar (firma la cuenta vieja) y verificar:
//   ADMIN_PRIVATE_KEY=0x… node --env-file=.env.local scripts/admin-handover.mjs <cuenta-nueva>
// Revocar a la vieja (firma la cuenta nueva), solo después de lo anterior:
//   NEW_ADMIN_PRIVATE_KEY=0x… node --env-file=.env.local scripts/admin-handover.mjs <cuenta-nueva> --revoke
//
// La cuenta vieja se toma de ADMIN_PRIVATE_KEY si está, si no de --old, si no
// del deployer registrado en contracts/deployments/10143.json.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createPublicClient, createWalletClient, getAddress, http, zeroHash } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

const ADMIN_ROLE = zeroHash; // DEFAULT_ADMIN_ROLE de AccessControl
const abi = [
  { type: "function", name: "hasRole", stateMutability: "view", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "grantRole", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [] },
  { type: "function", name: "revokeRole", stateMutability: "nonpayable", inputs: [{ type: "bytes32" }, { type: "address" }], outputs: [] },
];

/**
 * Qué hacer en cada contrato, a partir de quién tiene el rol hoy. Puro: no lee
 * ni escribe nada, y es lo que cubre scripts/admin-handover.test.mjs.
 *
 * Sin `revoke`: "grant" donde la cuenta nueva no es admin, "skip" donde ya lo es.
 * Con `revoke`: tira si la cuenta nueva no es admin en TODOS; si no, "revoke"
 * donde la vieja sigue siendo admin y "done" donde ya no lo es.
 */
export function planHandover({ newAdmin, oldAdmin, contracts }, { revoke }) {
  if (newAdmin.toLowerCase() === oldAdmin.toLowerCase()) {
    throw new Error("la cuenta nueva es la misma que la vieja: no hay nada que pasar");
  }
  if (revoke) {
    const missing = contracts.filter((contract) => !contract.newIsAdmin).map((contract) => contract.name);
    if (missing.length) {
      throw new Error(`no se revoca: la cuenta nueva todavía no es admin en ${missing.join(", ")}. Primero otorgá y verificá.`);
    }
    return contracts.map(({ name, address, oldIsAdmin }) => ({
      name,
      address,
      action: oldIsAdmin ? "revoke" : "done",
    }));
  }
  return contracts.map(({ name, address, newIsAdmin }) => ({
    name,
    address,
    action: newIsAdmin ? "skip" : "grant",
  }));
}

function parseArgs(argv) {
  const positional = [];
  const options = { revoke: false, old: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--revoke") options.revoke = true;
    else if (argv[i] === "--old") options.old = argv[++i];
    else positional.push(argv[i]);
  }
  return { newAdmin: positional[0], options };
}

async function main() {
  const { newAdmin: newRaw, options } = parseArgs(process.argv.slice(2));
  if (!newRaw) {
    console.error("uso: scripts/admin-handover.mjs <cuenta-nueva> [--revoke] [--old <cuenta-vieja>]");
    process.exit(2);
  }
  const newAdmin = getAddress(newRaw);
  const rpc = http(process.env.NEXT_PUBLIC_RPC_URL);
  const publicClient = createPublicClient({ chain: monadTestnet, transport: rpc });

  const oldSigner = process.env.ADMIN_PRIVATE_KEY ? privateKeyToAccount(process.env.ADMIN_PRIVATE_KEY) : undefined;
  const newSigner = process.env.NEW_ADMIN_PRIVATE_KEY ? privateKeyToAccount(process.env.NEW_ADMIN_PRIVATE_KEY) : undefined;
  if (newSigner && newSigner.address !== newAdmin) {
    throw new Error(`NEW_ADMIN_PRIVATE_KEY corresponde a ${newSigner.address}, no a ${newAdmin}`);
  }
  const deployment = JSON.parse(readFileSync(new URL("../contracts/deployments/10143.json", import.meta.url), "utf8"));
  const oldAdmin = getAddress(oldSigner?.address ?? options.old ?? deployment.relayer);

  const contracts = [
    { name: "USDr", address: getAddress(process.env.NEXT_PUBLIC_USDR_ADDRESS) },
    { name: "RewAppPay", address: getAddress(process.env.NEXT_PUBLIC_REWAPP_PAY_ADDRESS) },
    { name: "RewAppPay vieja", address: getAddress(deployment.RewAppPay) },
  ];
  const isAdmin = (address, account) =>
    publicClient.readContract({ address, abi, functionName: "hasRole", args: [ADMIN_ROLE, account] });
  const readState = async () => {
    const state = [];
    for (const contract of contracts) {
      state.push({ ...contract, newIsAdmin: await isAdmin(contract.address, newAdmin), oldIsAdmin: await isAdmin(contract.address, oldAdmin) });
    }
    return state;
  };
  const show = (state, title) => {
    console.log(`\n${title}`);
    for (const c of state) console.log(`  ${c.name.padEnd(16)} ${c.address}  nueva=${c.newIsAdmin ? "admin" : "-"}  vieja=${c.oldIsAdmin ? "admin" : "-"}`);
  };

  console.log(`cuenta nueva: ${newAdmin}\ncuenta vieja: ${oldAdmin}`);
  let state = await readState();
  show(state, "estado actual");
  const plan = planHandover({ newAdmin, oldAdmin, contracts: state }, { revoke: options.revoke });
  console.log("\nplan");
  for (const step of plan) console.log(`  ${step.name.padEnd(16)} ${step.action}`);

  const signer = options.revoke ? newSigner : oldSigner;
  const pending = plan.filter((step) => step.action === "grant" || step.action === "revoke");
  if (!pending.length) {
    console.log("\nnada que firmar.");
    return;
  }
  if (!signer) {
    console.log(`\nsin ${options.revoke ? "NEW_ADMIN_PRIVATE_KEY" : "ADMIN_PRIVATE_KEY"}: solo se mostró el plan, no se firmó nada.`);
    return;
  }
  const wallet = createWalletClient({ account: signer, chain: monadTestnet, transport: rpc });
  for (const step of pending) {
    const args = step.action === "grant" ? [ADMIN_ROLE, newAdmin] : [ADMIN_ROLE, oldAdmin];
    const { request } = await publicClient.simulateContract({ account: signer, address: step.address, abi, functionName: `${step.action}Role`, args });
    const hash = await wallet.writeContract(request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`${step.action}Role en ${step.name} revirtió: ${hash}`);
    console.log(`  ${step.name.padEnd(16)} ${step.action} ok  https://testnet.monadexplorer.com/tx/${hash}`);
  }

  state = await readState();
  show(state, "verificación");
  const expected = options.revoke
    ? state.every((c) => c.newIsAdmin && !c.oldIsAdmin)
    : state.every((c) => c.newIsAdmin && c.oldIsAdmin);
  if (!expected) throw new Error("la verificación no da lo esperado: revisá el estado de arriba antes de seguir");
  console.log(options.revoke
    ? "\n✅ la cuenta nueva administra los tres contratos y la vieja ya no."
    : "\n✅ la cuenta nueva ya es admin en los tres (la vieja también). Cuando el equipo confirme que controla la nueva, corré de nuevo con --revoke y NEW_ADMIN_PRIVATE_KEY.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("FALLO:", error.message ?? error);
    process.exit(1);
  });
}
