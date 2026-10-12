import { getAddress, isAddress } from "viem";
/** Split in integer base units; the first participants receive remainder units. */
export function divideExactly(total: bigint, count: number): bigint[] {
  if (
    !Number.isInteger(count) ||
    count < 2 ||
    count > 12 ||
    total < BigInt(count)
  )
    throw new Error("invalid_split");
  const n = BigInt(count);
  return Array.from(
    { length: count },
    (_, i) => total / n + (BigInt(i) < total % n ? 1n : 0n),
  );
}
export function normalizeParticipants(input: unknown, owner: string): string[] {
  if (
    !Array.isArray(input) ||
    input.length < 2 ||
    input.length > 12 ||
    input.some((a) => typeof a !== "string" || !isAddress(a))
  )
    throw new Error("invalid_participants");
  const list = input.map((a) => getAddress(a));
  if (new Set(list).size !== list.length || !list.includes(getAddress(owner)))
    throw new Error("invalid_participants");
  return list;
}
