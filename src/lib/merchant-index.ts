/** One passkey can register this many businesses. Index 0 is the original merchant path. */
const MAX_MERCHANTS = 10;

function isDerivationIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < MAX_MERCHANTS;
}

/** Next free HD index, or null when the account already has MAX_MERCHANTS businesses. */
function nextDerivationIndex(used: Iterable<number | null | undefined>): number | null {
  const taken = new Set<number>();
  for (const index of used) {
    if (typeof index === "number") taken.add(index);
  }
  for (let index = 0; index < MAX_MERCHANTS; index++) {
    if (!taken.has(index)) return index;
  }
  return null;
}

export { isDerivationIndex, MAX_MERCHANTS, nextDerivationIndex };
