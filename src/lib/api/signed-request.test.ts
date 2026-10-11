import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { verifySignedRequest } from "./signed-request";
import { rewAppApiDomain } from "./typed-data";

const signer = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const types = {
  Ping: [
    { name: "account", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
const fresh = () => BigInt(Math.floor(Date.now() / 1000) + 300);

async function sign(deadline: bigint) {
  return signer.signTypedData({
    domain: rewAppApiDomain(10143),
    types,
    primaryType: "Ping",
    message: { account: signer.address, deadline },
  });
}

describe("verificación de peticiones firmadas", () => {
  it("acepta una firma fresca del firmante correcto", async () => {
    const deadline = fresh();
    const result = await verifySignedRequest({
      signer: signer.address, types, primaryType: "Ping", chainId: 10143,
      message: { account: signer.address, deadline }, deadline, signature: await sign(deadline), fresh: true,
    });
    expect(result).toBe("ok");
  });

  it("rechaza un vencimiento viejo cuando nadie más lo hace cumplir", async () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) - 1);
    const result = await verifySignedRequest({
      signer: signer.address, types, primaryType: "Ping", chainId: 10143,
      message: { account: signer.address, deadline }, deadline, signature: await sign(deadline), fresh: true,
    });
    expect(result).toBe("expired_signature");
  });

  it("con fresh:false no mira el vencimiento, porque lo hace el contrato", async () => {
    const deadline = BigInt(Math.floor(Date.now() / 1000) - 1);
    const result = await verifySignedRequest({
      signer: signer.address, types, primaryType: "Ping", chainId: 10143,
      message: { account: signer.address, deadline }, deadline, signature: await sign(deadline), fresh: false,
    });
    expect(result).toBe("ok");
  });

  it("rechaza la firma de otra cuenta", async () => {
    const deadline = fresh();
    const other = privateKeyToAccount("0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba");
    const result = await verifySignedRequest({
      signer: other.address, types, primaryType: "Ping", chainId: 10143,
      message: { account: signer.address, deadline }, deadline, signature: await sign(deadline), fresh: true,
    });
    expect(result).toBe("invalid_signature");
  });
});
