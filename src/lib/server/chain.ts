import "server-only";
import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? monadTestnet.rpcUrls.default.http[0]),
});

export { publicClient };
