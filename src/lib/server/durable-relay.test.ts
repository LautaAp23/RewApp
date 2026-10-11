import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mock = vi.hoisted(() => ({
  prepare: vi.fn(),
  sign: vi.fn(),
  send: vi.fn(),
}));
vi.mock("@/lib/server/relayer", () => ({
  getRelayer: () => ({
    account: {},
    wallet: {
      prepareTransactionRequest: mock.prepare,
      signTransaction: mock.sign,
      sendRawTransaction: mock.send,
    },
  }),
  relay: (send: (n: number) => Promise<unknown>) => send(0),
}));
import { durableRelay } from "./durable-relay";
const address = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.resetAllMocks();
  mock.prepare.mockResolvedValue({});
  mock.sign.mockResolvedValue("0x1234");
});
describe("durable relay", () => {
  it("persists the deterministic hash before sending", async () => {
    const order: string[] = [];
    mock.send.mockImplementation(async () => {
      order.push("send");
      return "hash";
    });
    await durableRelay(address, "0x00", async (hash) => {
      expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
      order.push("persist");
    });
    expect(order).toEqual(["persist", "send"]);
  });
  it("never sends if persisting the hash failed", async () => {
    await expect(
      durableRelay(address, "0x00", async () => {
        throw new Error("database unavailable");
      }),
    ).rejects.toThrow();
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("retains a known hash when broadcasting times out", async () => {
    const save = vi.fn();
    mock.send.mockRejectedValue(new Error("timeout"));
    await expect(durableRelay(address, "0x00", save)).rejects.toThrow(
      "timeout",
    );
    expect(save).toHaveBeenCalledOnce();
  });
});
