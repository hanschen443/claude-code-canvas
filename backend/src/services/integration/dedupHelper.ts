const FIVE_MINUTES_MS = 5 * 60 * 1000;
const MAX_DEDUP_MAP_SIZE = 10000;

export interface DedupTracker {
  isDuplicate(id: string): boolean;
}

export function createDedupTracker(): DedupTracker {
  const processedIds = new Map<string, number>();

  function cleanupExpired(): void {
    const now = Date.now();
    for (const [id, ts] of processedIds.entries()) {
      if (now - ts >= FIVE_MINUTES_MS) {
        processedIds.delete(id);
      }
    }
  }

  function isDuplicate(id: string): boolean {
    cleanupExpired();

    if (processedIds.has(id)) {
      return true;
    }

    if (processedIds.size >= MAX_DEDUP_MAP_SIZE) {
      const firstKey = processedIds.keys().next().value;
      if (firstKey) processedIds.delete(firstKey);
    }

    processedIds.set(id, Date.now());
    return false;
  }

  return { isDuplicate };
}
