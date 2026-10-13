import type { Address, Hex } from "viem";
export const workspaceActions = [
  "access",
  "alias.set",
  "personal.create",
  "personal.cancel",
  "personal.read",
  "contact.save",
  "contact.remove",
  "contact.removeMany",
  "contact.requests",
  "group.addMembers",
  "group.save",
  "group.remove",
  "charge.split",
  "reward.update",
  "redemption.deliver",
] as const;
export type WorkspaceAction = (typeof workspaceActions)[number];
export const workspaceActionTypes = {
  WorkspaceAction: [
    { name: "account", type: "address" },
    { name: "action", type: "string" },
    { name: "payload", type: "string" },
    { name: "requestId", type: "string" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
export type WorkspaceRequest = {
  account: Address;
  action: WorkspaceAction;
  payload: string;
  requestId: string;
  deadline: string;
  signature: Hex;
};
export type WorkspaceContact = { id: string; address: string; label: string; createdAt?: string | null; handle?: string | null; requestsBlocked?: boolean };
export type WorkspaceView = {
  account: string;
  handle: string | null;
  personalCharges: import("./personal-types").PersonalView[];
  contacts: WorkspaceContact[];
  groups: { id: string; name: string; kind: string; members: string[] }[];
  splits: {
    id: string;
    merchant: { name: string };
    status: string;
    localAmount: string;
    localCurrency: string;
    parts: {
      id: string;
      expectedPayer: string | null;
      status: string;
      localAmount: string;
      usdAmount: string;
    }[];
  }[];
  redemptions: RedemptionView[];
  merchant: { id: string; name: string; address: string; derivationIndex: number | null } | null;
  merchantRewards: {
    id: number;
    title: string;
    description: string;
    active: boolean;
    pointsCost: number;
  }[];
  deliveries: RedemptionView[];
  commerceRedemptions: RedemptionView[];
};
export type RedemptionView = {
  id: string;
  title: string;
  status: string;
  pointsCost: number;
  pickupCode: string;
  createdAt: string;
  deliveredAt: string | null;
  txHash: string | null;
  account?: string;
  rewardId?: number;
  merchantId?: string | null;
};
