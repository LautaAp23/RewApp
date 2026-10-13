import "server-only";
import { Prisma } from "@prisma/client";
import { getAddress, isAddress } from "viem";
import { db } from "@/lib/db";
import { divideExactly, normalizeParticipants } from "@/lib/split";
import { normalizeHandle } from "@/lib/user-handle";
import { decodeAccountCode, accountCode } from "@/lib/account-code";
import { personalView } from "./personal-view";
import { localToUsdr, isCurrency, parseDecimal } from "@/lib/money";
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
  const [profile, personalCharges] = await Promise.all([
    db.profile.findUnique({ where: { address: account }, select: { handle: true } }),
    db.personalCharge.findMany({ where: { OR: [{ recipient: account }, { expectedPayer: account }, { payer: account }] }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  const [contactProfiles, blocks] = await Promise.all([
    db.profile.findMany({ where: { address: { in: contacts.map(c => c.address) } }, select: { address: true, handle: true } }),
    db.paymentRequestBlock.findMany({ where: { owner: account }, select: { sender: true } }),
  ]);
  return {
    account,
    handle: profile?.handle ?? null,
    personalCharges: personalCharges.map(personalView),
    contacts: contacts.map(c => ({ ...c, createdAt: c.createdAt?.toISOString() ?? null, handle: contactProfiles.find(p => p.address === c.address)?.handle ?? null, requestsBlocked: blocks.some(b => b.sender === c.address) })),
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
  if (action === "alias.set") {
    const handle = normalizeHandle(p.handle);
    if (!handle) throw new Error("invalid_handle");
    const collision = await tx.profile.findUnique({ where: { handle } });
    if (collision && collision.address !== account) throw new Error("handle_taken");
    return tx.profile.update({ where: { address: account }, data: { handle } });
  }
  if (action === "contact.save") {
    const identifier = typeof p.identifier === "string" ? p.identifier.trim() : p.address;
    const decoded = typeof identifier === "string" ? decodeAccountCode(identifier) : null;
    const address = decoded ?? (typeof identifier === "string" && isAddress(identifier) ? getAddress(identifier) : null);
    const handle = normalizeHandle(identifier);
    const target = address ? await tx.profile.findUnique({ where: { address } }) : handle ? await tx.profile.findUnique({ where: { handle } }) : null;
    if (!target) throw new Error("unknown_contact");
    if (target.address === account) throw new Error("invalid_request");
    const label = typeof p.label === "string" && p.label.trim() ? text(p.label, 60) : target.alias || (target.handle ? "@" + target.handle : accountCode(getAddress(target.address)));
    return tx.contact.upsert({
      where: { owner_address: { owner: account, address: target.address } },
      create: { owner: account, address: target.address, label }, update: { label },
    });
  }
  if (action === "personal.create") {
    const profile = await tx.profile.findUnique({ where: { address: account } });
    if (!profile || !isCurrency(p.currency) || (p.kind !== "DIRECT" && p.kind !== "REQUEST") || typeof p.id !== "string" || !/^[a-f0-9-]{36}$/.test(p.id)) throw new Error("invalid_request");
    const contact = typeof p.contact === "string" && p.contact ? await tx.contact.findFirst({ where: { owner: account, address: p.contact } }) : null;
    if ((p.kind === "DIRECT" || p.contact) && !contact) throw new Error("unknown_contact");
    const target = contact ? await tx.profile.findUnique({ where: { address: contact.address } }) : null;
    if (contact && !target) throw new Error("unknown_contact");
    if (p.kind === "REQUEST" && target) {
      // Serialize request creation against blocking by the intended payer.
      await tx.$queryRaw`SELECT "address" FROM "Profile" WHERE "address" = ${target.address} FOR UPDATE`;
      if (await tx.paymentRequestBlock.findUnique({ where: { owner_sender: { owner: target.address, sender: account } } })) throw new Error("requests_blocked");
    }
    const amount = text(p.amount, 20).replace(",", ".");
    let cents: bigint;
    try { cents = parseDecimal(amount, 2); } catch { throw new Error("invalid_request"); }
    if (cents <= 0n || cents > 100000000000n) throw new Error("invalid_request");
    const rate = await tx.fxRate.findUnique({ where: { currency: p.currency } });
    if (!rate) throw new Error("invalid_request");
    const usdAmount = localToUsdr(amount, rate.usdRate.toString());
    if (usdAmount <= 0n || usdAmount > 1000000000000n) throw new Error("invalid_request");
    const recent = await tx.personalCharge.count({ where: { OR: [{ kind: "REQUEST", recipient: account }, { kind: "DIRECT", expectedPayer: account }], createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent >= 10) throw new Error("too_many_requests");
    return tx.personalCharge.create({ data: {
      id: p.id, kind: p.kind, recipient: p.kind === "DIRECT" ? target!.address : account,
      recipientName: (p.kind === "DIRECT" ? target!.alias : profile.alias) || (p.kind === "DIRECT" ? target!.handle : profile.handle) || accountCode(getAddress(p.kind === "DIRECT" ? target!.address : account)),
      expectedPayer: p.kind === "DIRECT" ? account : target?.address,
      localAmount: amount, localCurrency: p.currency, usdAmount,
      note: typeof p.note === "string" ? p.note.trim().slice(0, 120) : "",
      expiresAt: new Date(Date.now() + (p.kind === "DIRECT" ? 15 * 60_000 : 24 * 60 * 60_000)),
    } });
  }
  if (action === "personal.cancel") {
    const row = await tx.personalCharge.findUnique({ where: { id: text(p.id, 60) } });
    if (!row || (row.kind === "DIRECT" ? row.expectedPayer !== account : row.recipient !== account)) throw new Error("not_found");
    const changed = await tx.personalCharge.updateMany({ where: { id: row.id, status: "PENDING" }, data: { status: "CANCELLED" } });
    if (!changed.count) throw new Error("charge_unavailable");
    return;
  }
  if (action === "personal.read") {
    return tx.personalCharge.updateMany({ where: { expectedPayer: account, id: text(p.id, 60), readAt: null }, data: { readAt: new Date() } });
  }
  if (action === "contact.remove")
    return tx.contact.deleteMany({
      where: { id: text(p.id, 100), owner: account },
    });
  if (action === "contact.removeMany") {
    if (!Array.isArray(p.ids) || !p.ids.length || p.ids.length > 100 || p.ids.some(id => typeof id !== "string" || id.length > 100)) throw new Error("invalid_request");
    return tx.contact.deleteMany({ where: { owner: account, id: { in: p.ids as string[] } } });
  }
  if (action === "contact.requests") {
    if (typeof p.blocked !== "boolean") throw new Error("invalid_request");
    const contact = await tx.contact.findFirst({ where: { owner: account, id: text(p.id, 100) } });
    if (!contact) throw new Error("unknown_contact");
    await tx.$queryRaw`SELECT "address" FROM "Profile" WHERE "address" = ${account} FOR UPDATE`;
    const pair = { owner: account, sender: contact.address };
    if (p.blocked) {
      await tx.paymentRequestBlock.upsert({ where: { owner_sender: pair }, create: pair, update: {} });
      await tx.personalCharge.updateMany({ where: { kind: "REQUEST", expectedPayer: account, recipient: contact.address, status: "PENDING" }, data: { status: "CANCELLED" } });
    } else await tx.paymentRequestBlock.deleteMany({ where: pair });
    return;
  }
  if (action === "group.addMembers") {
    const group = await tx.socialGroup.findFirst({ where: { id: text(p.id, 100), owner: account } });
    if (!group || !Array.isArray(p.members)) throw new Error("invalid_group");
    const members = normalizeParticipants([...new Set([...(group.members as string[]), ...p.members])], account);
    const known = await tx.contact.count({ where: { owner: account, address: { in: members.filter(a => a !== account) } } });
    if (known !== members.length - 1) throw new Error("unknown_contact");
    return tx.socialGroup.updateMany({ where: { id: group.id, owner: account }, data: { members } });
  }
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
