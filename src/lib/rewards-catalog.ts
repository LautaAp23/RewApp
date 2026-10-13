/** Partición del catálogo de `/canjear` por origen del premio (G1 contra G2). */

export type CatalogReward = {
  id: number;
  title: string;
  pointsCost: string;
  available: boolean;
  merchant: { name: string } | null;
};

/** Un premio es de RewApp (G1) cuando no tiene comercio asignado. */
export function isAppReward(reward: Pick<CatalogReward, "merchant">): boolean {
  return reward.merchant === null;
}

/** Participación de sorteo (id 201): tiene llamado y textos propios. */
export const RAFFLE_REWARD_ID = 201;

/** Un premio es participación de sorteo cuando es el 201. */
export function isRaffleReward(reward: Pick<CatalogReward, "id">): boolean {
  return reward.id === RAFFLE_REWARD_ID;
}

/** Divide el catálogo en premios App y premios de comercios, conservando el orden. */
export function splitCatalog<T extends Pick<CatalogReward, "merchant">>(
  rewards: T[],
): {
  app: T[];
  merchant: T[];
} {
  return {
    app: rewards.filter(isAppReward),
    merchant: rewards.filter((r) => !isAppReward(r)),
  };
}

function costOf(reward: Pick<CatalogReward, "pointsCost">): bigint | null {
  try {
    return BigInt(reward.pointsCost);
  } catch {
    return null;
  }
}

/**
 * Ordena una lista por costo en puntos ascendente. Los costos inválidos van
 * últimos para no romper el orden del tab De RewApp (90, 201, 202, 203).
 */
export function sortByCost<T extends Pick<CatalogReward, "pointsCost">>(
  rewards: T[],
): T[] {
  const rank = (reward: T): bigint | null => {
    try {
      return BigInt(reward.pointsCost);
    } catch {
      return null;
    }
  };
  return [...rewards].sort((a, b) => {
    const costA = rank(a);
    const costB = rank(b);
    if (costA === null && costB === null) return 0;
    if (costA === null) return 1;
    if (costB === null) return -1;
    return costA < costB ? -1 : costA > costB ? 1 : 0;
  });
}

/**
 * Progreso dentro de una pestaña: el premio disponible más barato ya alcanzable,
 * o el más cercano cuando a ninguno se llega. Nulo sin saldo o sin premios.
 */
export function nextInTab<T extends Pick<CatalogReward, "pointsCost" | "available">>(
  rewards: T[],
  points: bigint | undefined,
): { reachable: T | null; missing: T | null } {
  if (points === undefined) return { reachable: null, missing: null };
  let reachable: T | null = null;
  let missing: T | null = null;
  for (const reward of rewards) {
    if (!reward.available) continue;
    const cost = costOf(reward);
    if (cost === null) continue;
    if (cost <= points) {
      if (!reachable || cost < costOf(reachable)!) reachable = reward;
    } else {
      if (!missing || cost < costOf(missing)!) missing = reward;
    }
  }
  return { reachable, missing };
}
