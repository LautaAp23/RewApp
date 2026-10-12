import "server-only";
import { Prisma } from "@prisma/client";
import { getAddress, isAddress } from "viem";
import { db } from "@/lib/db";
import { divideExactly, normalizeParticipants } from "@/lib/split";
import { parseDecimal } from "@/lib/money";
import type { WorkspaceAction, WorkspaceView } from "@/lib/workspace-types";
const text = (v: unknown, max: number) => {
  if (typeof v !== "string" || !v.trim() || v.trim().length > max)
    throw new Error("invalid_request");
  return v.trim();
};
async function ownedMerchant(account: string, merchantAddress: string) {
  return db.merchant.findFirst({
    where: {
      address: getAddress(merchantAddress),
      OR: [{ ownerAddress: account }, { address: account }],
    },
  });
}

export async function workspaceView(account: string, focus?: string | null): Promise<WorkspaceView> {
  const merchant =
    focus && isAddress(focus) ? await ownedMerchant(account, focus) : null;
  const [contacts, groups, splits, redemptions, merchantRewards, deliveries] =
    await Promise.all([
      db.contact.findMany({
        where: { owner: account },
        orderBy: { label: "asc" },
      }),
      db.socialGroup.findMany({
        where: { owner: account },
        orderBy: { name: "asc" },
      }),
      db.charge.findMany({
        where: {
          parentId: null,
          OR: [
            { splitOwner: account },
            { parts: { some: { expectedPayer: account } } },
          ],
        },
        include: {
          merchant: { select: { name: true } },
          parts: { orderBy: { id: "asc" } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      db.redemption.findMany({
        where: { account },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      merchant
        ? db.platformReward.findMany({
            where: { merchantId: merchant.id, audience: "CUSTOMER" },
            orderBy: { id: "asc" },
          })
        : [],
      merchant
        ? db.redemption.findMany({
            where: {
              merchantId: merchant.id,
              status: { in: ["READY", "DELIVERED"] },
            },
            orderBy: { createdAt: "desc" },
            take: 50,
          })
        : [],
    ]);
  return {
    account,
    contacts,
    groups: groups.map((g) => ({ ...g, members: g.members as string[] })),
    splits: splits.map((c) => ({
      id: c.id,
      merchant: c.merchant,
      status: c.status,
      localAmount: c.localAmount.toFixed(2),
      localCurrency: c.localCurrency,
      parts: c.parts.map((p) => ({
        id: p.id,
        expectedPayer: p.expectedPayer,
        status: p.status,
        localAmount: p.localAmount.toFixed(2),
        usdAmount: p.usdAmount.toString(),
      })),
    })),
    redemptions: redemptions.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
    })),
    merchant: merchant
      ? {
          id: merchant.id,
          name: merchant.name,
          address: merchant.address,
          derivationIndex: merchant.derivationIndex,
        }
      : null,
    merchantRewards,
    deliveries: deliveries.map((r) => ({
      ...r,
      createdAt: r.createdAt.toISOString(),
      deliveredAt: r.deliveredAt?.toISOString() ?? null,
    })),
  };
}
export async function workspaceMutation(
  tx: Prisma.TransactionClient,
  account: string,
  action: WorkspaceAction,
  p: Record<string, unknown>,
) {
  if (action === "access") return;
  if (action === "contact.save") {
    if (
      typeof p.address !== "string" ||
      !isAddress(p.address) ||
      getAddress(p.address) === account
    )
      throw new Error("invalid_request");
    const address = getAddress(p.address),
      label = text(p.label, 60);
    return tx.contact.upsert({
      where: { owner_address: { owner: account, address } },
      create: { owner: account, address, label },
      update: { label },
    });
  }
  if (action === "contact.remove")
    return tx.contact.deleteMany({
      where: { id: text(p.id, 100), owner: account },
    });
  if (action === "group.remove")
    return tx.socialGroup.deleteMany({
      where: { id: text(p.id, 100), owner: account },
    });
  if (action === "group.save") {
    const members = normalizeParticipants(p.members, account);
    const known = await tx.contact.count({
      where: {
        owner: account,
        address: { in: members.filter((a) => a !== account) },
      },
    });
    if (known !== members.length - 1) throw new Error("unknown_contact");
    const data = {
      name: text(p.name, 60),
      kind: p.kind === "family" ? "family" : "friends",
      members,
    };
    if (p.id)
      return tx.socialGroup.updateMany({
        where: { id: text(p.id, 100), owner: account },
        data,
      });
    return tx.socialGroup.create({ data: { owner: account, ...data } });
  }
  if (action === "charge.split") {
    const id = text(p.charge, 100);
    const original = await tx.charge.findUnique({
      where: { id },
      include: { merchant: true },
    });
    if (
      !original ||
      original.parentId ||
      original.status !== "PENDING" ||
      original.expiresAt <= new Date()
    )
      throw new Error("charge_unavailable");
    const members = normalizeParticipants(p.members, account);
    if (members.includes(getAddress(original.merchant.address)))
      throw new Error("invalid_participants");
    const known = await tx.contact.count({
      where: {
        owner: account,
        address: { in: members.filter((a) => a !== account) },
      },
    });
    if (known !== members.length - 1) throw new Error("unknown_contact");
    if (p.groupId) {
      const group = await tx.socialGroup.findFirst({
        where: { id: text(p.groupId, 100), owner: account },
      });
      if (
        !group ||
        members.some((a) => !(group.members as string[]).includes(a))
      )
        throw new Error("invalid_group");
    }
    const local = divideExactly(
      parseDecimal(original.localAmount.toFixed(2), 2),
      members.length,
    );
    const usd = divideExactly(original.usdAmount, members.length);
    // Compare-and-set conflicts with payment reservation; never split an in-flight payment.
    const reserved = await tx.charge.updateMany({
      where: { id, status: "PENDING", expiresAt: { gt: new Date() } },
      data: {
        status: "SPLIT",
        splitOwner: account,
        groupId: typeof p.groupId === "string" ? p.groupId : null,
      },
    });
    if (!reserved.count) throw new Error("charge_unavailable");
    await tx.charge.createMany({
      data: members.map((address, i) => ({
        merchantId: original.merchantId,
        parentId: id,
        expectedPayer: address,
        localAmount: `${local[i] / 100n}.${(local[i] % 100n).toString().padStart(2, "0")}`,
        localCurrency: original.localCurrency,
        usdAmount: usd[i],
        expiresAt: original.expiresAt,
      })),
    });
    return { id };
  }
  const merchantAddress =
    typeof p.merchant === "string" && isAddress(p.merchant) ? getAddress(p.merchant) : account;
  const merchant = await tx.merchant.findFirst({
    where: {
      address: merchantAddress,
      OR: [{ ownerAddress: account }, { address: account }],
    },
  });
  if (!merchant) throw new Error("not_merchant");
  if (action === "reward.update") {
    if (!Number.isSafeInteger(p.id) || typeof p.active !== "boolean")
      throw new Error("invalid_request");
    const changed = await tx.platformReward.updateMany({
      where: {
        id: p.id as number,
        merchantId: merchant.id,
        audience: "CUSTOMER",
      },
      data: {
        title: text(p.title, 100),
        description: text(p.description, 500),
        active: p.active,
      },
    });
    if (!changed.count) throw new Error("not_found");
    return;
  }
  if (action === "redemption.deliver") {
    const changed = await tx.redemption.updateMany({
      where: {
        pickupCode: text(p.pickupCode, 100),
        merchantId: merchant.id,
        status: "READY",
      },
      data: { status: "DELIVERED", deliveredAt: new Date() },
    });
    if (!changed.count) throw new Error("not_ready");
  }
}
