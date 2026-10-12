export function slideProgress(distance: number, travel: number) {
  return travel > 0 ? Math.max(0, Math.min(1, distance / travel)) : 0;
}
export function slideReachedEnd(progress: number) { return progress >= 0.96; }
