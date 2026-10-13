import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { accountCode } from "../account-code";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));
import { workspaceMutation } from "./workspace";
const owner = "0x1111111111111111111111111111111111111111", target = "0x2222222222222222222222222222222222222222";
const mock = { $queryRaw: vi.fn(), paymentRequestBlock: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() }, profile: { findUnique: vi.fn(), update: vi.fn() }, contact: { findFirst: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn() }, socialGroup: { findFirst: vi.fn(), updateMany: vi.fn() }, fxRate: { findUnique: vi.fn() }, personalCharge: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() } };
const tx = mock as unknown as Prisma.TransactionClient;
const id = "12345678-1234-1234-1234-123456789abc";
beforeEach(() => { vi.resetAllMocks(); mock.personalCharge.count.mockResolvedValue(0); mock.fxRate.findUnique.mockResolvedValue({ usdRate: { toString: () => "1000" } }); });
describe("persistent contacts and personal requests", () => {
  it("rejects targeted requests when the intended payer has blocked the sender", async () => {
    mock.profile.findUnique.mockImplementation(async ({ where }) => ({ address: where.address, alias: "Ana" }));
    mock.contact.findFirst.mockResolvedValue({ address: target });
    mock.paymentRequestBlock.findUnique.mockResolvedValue({ owner: target, sender: owner });
    await expect(workspaceMutation(tx, owner, "personal.create", { id, kind: "REQUEST", amount: "5000", currency: "ARS", contact: target })).rejects.toThrow("requests_blocked");
    expect(mock.paymentRequestBlock.findUnique).toHaveBeenCalledWith({ where: { owner_sender: { owner: target, sender: owner } } });
    expect(mock.$queryRaw).toHaveBeenCalled();
    expect(mock.personalCharge.create).not.toHaveBeenCalled();
  });
  it("blocks only an owned contact and cancels pending requests, never in-flight payments", async () => {
    mock.contact.findFirst.mockResolvedValue({ address: target });
    await workspaceMutation(tx, owner, "contact.requests", { id: "contact", blocked: true });
    expect(mock.contact.findFirst).toHaveBeenCalledWith({ where: { owner, id: "contact" } });
    expect(mock.paymentRequestBlock.upsert).toHaveBeenCalledWith({ where: { owner_sender: { owner, sender: target } }, create: { owner, sender: target }, update: {} });
    expect(mock.personalCharge.updateMany).toHaveBeenCalledWith({ where: { kind: "REQUEST", expectedPayer: owner, recipient: target, status: "PENDING" }, data: { status: "CANCELLED" } });
    mock.contact.findFirst.mockResolvedValue(null);
    await expect(workspaceMutation(tx, owner, "contact.requests", { id: "other", blocked: false })).rejects.toThrow("unknown_contact");
    expect(mock.paymentRequestBlock.deleteMany).not.toHaveBeenCalled();
  });
  it("removes contacts in one owned batch without removing request blocks", async () => {
    await workspaceMutation(tx, owner, "contact.removeMany", { ids: ["first", "second"] });
    expect(mock.contact.deleteMany).toHaveBeenCalledWith({ where: { owner, id: { in: ["first", "second"] } } });
    expect(mock.paymentRequestBlock.deleteMany).not.toHaveBeenCalled();
    await expect(workspaceMutation(tx, owner, "contact.removeMany", { ids: [] })).rejects.toThrow("invalid_request");
  });
  it("adds contacts to an owned group without duplicates and rejects another owner's group", async () => {
    mock.socialGroup.findFirst.mockResolvedValue({ id: "group", members: [owner, target] });
    mock.contact.count.mockResolvedValue(1);
    await workspaceMutation(tx, owner, "group.addMembers", { id: "group", members: [target] });
    expect(mock.socialGroup.updateMany).toHaveBeenCalledWith({ where: { id: "group", owner }, data: { members: [owner, target] } });
    mock.socialGroup.findFirst.mockResolvedValue(null);
    await expect(workspaceMutation(tx, owner, "group.addMembers", { id: "other", members: [target] })).rejects.toThrow("invalid_group");
  });
  it("resolves a registered contact by canonical alias", async () => {
    mock.profile.findUnique.mockResolvedValue({ address: target, alias: "Ana" });
    await workspaceMutation(tx, owner, "contact.save", { identifier: "@ANA", label: "" });
    expect(mock.profile.findUnique).toHaveBeenCalledWith({ where: { handle: "ana" } });
    expect(mock.contact.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: { owner, address: target, label: "Ana" } }));
  });
  it("resolves a registered contact by account code, preserving a personal label", async () => {
    mock.profile.findUnique.mockResolvedValue({ address: target });
    await workspaceMutation(tx, owner, "contact.save", { identifier: accountCode(target), label: "Mi amiga" });
    expect(mock.profile.findUnique).toHaveBeenCalledWith({ where: { address: target } });
    expect(mock.contact.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { label: "Mi amiga" } }));
  });
  it("rejects unregistered accounts and self contacts", async () => {
    mock.profile.findUnique.mockResolvedValue(null);
    await expect(workspaceMutation(tx, owner, "contact.save", { identifier: accountCode(target) })).rejects.toThrow("unknown_contact");
    mock.profile.findUnique.mockResolvedValue({ address: owner });
    await expect(workspaceMutation(tx, owner, "contact.save", { identifier: accountCode(owner) })).rejects.toThrow("invalid_request");
    expect(mock.contact.upsert).not.toHaveBeenCalled();
  });
  it("rejects an alias owned by another person", async () => {
    mock.profile.findUnique.mockResolvedValue({ address: target });
    await expect(workspaceMutation(tx, owner, "alias.set", { handle: "@ANA" })).rejects.toThrow("handle_taken");
    expect(mock.profile.update).not.toHaveBeenCalled();
  });
  it("snapshots the conversion and assigns a contact payment request", async () => {
    mock.profile.findUnique.mockImplementation(async ({ where }) => ({ address: where.address, alias: where.address === owner ? "Santi" : "Ana" }));
    mock.contact.findFirst.mockResolvedValue({ address: target });
    await workspaceMutation(tx, owner, "personal.create", { id, kind: "REQUEST", amount: "5000.00", currency: "ARS", contact: target, note: "Cena" });
    expect(mock.personalCharge.create).toHaveBeenCalledWith({ data: expect.objectContaining({ id, recipient: owner, expectedPayer: target, recipientName: "Santi", usdAmount: 5000000n, note: "Cena" }) });
  });
  it("creates direct transfers in the opposite direction and requires a saved contact", async () => {
    mock.profile.findUnique.mockImplementation(async ({ where }) => ({ address: where.address, alias: "Ana" }));
    mock.contact.findFirst.mockResolvedValue({ address: target });
    await workspaceMutation(tx, owner, "personal.create", { id, kind: "DIRECT", amount: "5000", currency: "ARS", contact: target });
    expect(mock.personalCharge.create).toHaveBeenCalledWith({ data: expect.objectContaining({ recipient: target, expectedPayer: owner, usdAmount: 5000000n }) });
    await expect(workspaceMutation(tx, owner, "personal.create", { id, kind: "DIRECT", amount: "5000", currency: "ARS" })).rejects.toThrow("unknown_contact");
  });
  it("allows an open QR and rejects zero or invalid monetary input", async () => {
    mock.profile.findUnique.mockResolvedValue({ address: owner, alias: "Santi" });
    await workspaceMutation(tx, owner, "personal.create", { id, kind: "REQUEST", amount: "5000", currency: "ARS" });
    expect(mock.personalCharge.create).toHaveBeenCalledWith({ data: expect.objectContaining({ expectedPayer: undefined, recipient: owner }) });
    for (const amount of ["0", "-1", "1.001", "NaN"]) await expect(workspaceMutation(tx, owner, "personal.create", { id, kind: "REQUEST", amount, currency: "ARS" })).rejects.toThrow();
  });
  it("never cancels another person's request or a payment in progress", async () => {
    mock.personalCharge.findUnique.mockResolvedValue({ id, kind: "REQUEST", recipient: target });
    await expect(workspaceMutation(tx, owner, "personal.cancel", { id })).rejects.toThrow("not_found");
    mock.personalCharge.findUnique.mockResolvedValue({ id, kind: "REQUEST", recipient: owner });
    mock.personalCharge.updateMany.mockResolvedValue({ count: 0 });
    await expect(workspaceMutation(tx, owner, "personal.cancel", { id })).rejects.toThrow("charge_unavailable");
  });
});
