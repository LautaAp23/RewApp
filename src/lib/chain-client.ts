"use client";

import { createPublicClient, http } from "viem";
import { monadTestnet } from "viem/chains";

/** Read-only client for the browser (public RPC, no keys). */
export const chainClient = createPublicClient({
  chain: monadTestnet,
  transport: http(process.env.NEXT_PUBLIC_RPC_URL ?? monadTestnet.rpcUrls.default.http[0]),
});
