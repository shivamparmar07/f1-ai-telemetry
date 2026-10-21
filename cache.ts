/**
 * Advanced In-Memory Cache with Stale-While-Revalidate (SWR) and LRU Eviction
 * Provides sub-millisecond response latency, deduplicated background revalidation,
 * and comprehensive observability metrics.
 */

import { SingleFlight } from './server/concurrency/SingleFlight';

export interface CacheEntry<T> {
  data: T;
  freshUntil: number; // Monotonic ms until which data is considered completely fresh
  staleUntil: number; // Monotonic ms until which data can be served as stale while revalidating
  createdAt: number;
  lastAccessedAt: number;
  accessIndex: number;
}

export type CacheLookupResult<T> =
  | { status: 'FRESH'; data: T; ageSeconds: number }
  | { status: 'STALE'; data: T; ageSeconds: number }
  | { status: 'MISS'; data: null; ageSeconds: null };

export interface CacheStats {
  size: number;
  maxEntries: number;
  freshHits: number;
  swrHits: number;
  misses: number;
  evictions: number;
  totalLookups: number;
  hitRatio: number; // 0.0 to 1.0
  keys: string[];
}

export class APICache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private singleFlight: SingleFlight = new SingleFlight();
  private maxEntries: number;

  private accessCounter = 0;

  // Observability metrics
  private freshHits = 0;
  private swrHits = 0;
  private misses = 0;
  private evictions = 0;

  constructor(maxEntries: number = 500) {
    this.maxEntries = maxEntries;
  }

  /**
   * Get value from cache with status (FRESH, STALE, MISS)
   */
  getWithStatus<T>(key: string): CacheLookupResult<T> {
    const entry = this.cache.get(key);
    const now = Date.now();

    if (!entry) {
      this.misses++;
      return { status: 'MISS', data: null, ageSeconds: null };
    }

    // Refresh LRU access timestamp and monotonic index
    entry.lastAccessedAt = now;
    entry.accessIndex = ++this.accessCounter;
    const ageSeconds = Math.round((now - entry.createdAt) / 1000);

    // Case 1: Entry is still fresh
    if (now <= entry.freshUntil) {
      this.freshHits++;
      return { status: 'FRESH', data: entry.data as T, ageSeconds };
    }

    // Case 2: Entry is stale, but within stale-while-revalidate window
    if (now <= entry.staleUntil) {
      this.swrHits++;
      return { status: 'STALE', data: entry.data as T, ageSeconds };
    }

    // Case 3: Entry is completely expired
    this.cache.delete(key);
    this.misses++;
    return { status: 'MISS', data: null, ageSeconds: null };
  }

  /**
   * Backward-compatible simple get: returns data if fresh or stale, null if miss
   */
  get<T>(key: string): T | null {
    const result = this.getWithStatus<T>(key);
    return result.data;
  }

  /**
   * Set value in cache with fresh TTL and stale TTL
   * @param key Cache key
   * @param data Payload to store
   * @param freshTtlSeconds Time in seconds during which data is fresh (default: 300s = 5m)
   * @param staleTtlSeconds Additional time in seconds during which stale data can be served (default: 900s = 15m)
   */
  set<T>(key: string, data: T, freshTtlSeconds: number = 300, staleTtlSeconds: number = 900): void {
    const now = Date.now();
    const freshUntil = now + freshTtlSeconds * 1000;
    const staleUntil = freshUntil + staleTtlSeconds * 1000;

    // LRU eviction if size limit reached
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictLeastRecentlyUsed();
    }

    this.cache.set(key, {
      data,
      freshUntil,
      staleUntil,
      createdAt: now,
      lastAccessedAt: now,
      accessIndex: ++this.accessCounter,
    });
  }

  /**
   * Stale-While-Revalidate resolver:
   * - If Fresh: returns cached data immediately
   * - If Stale: returns cached data immediately AND executes background revalidation (coalesced)
   * - If Miss: awaits fetcher, caches, and returns data
   */
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    freshTtlSeconds: number = 300,
    staleTtlSeconds: number = 900,
    onBackgroundRevalidated?: (revalidatedData: T) => void
  ): Promise<T> {
    const lookup = this.getWithStatus<T>(key);

    if (lookup.status === 'FRESH') {
      return lookup.data;
    }

    if (lookup.status === 'STALE') {
      // Revalidate in background using SingleFlight to avoid duplicate upstream fetches
      this.singleFlight
        .execute(`revalidate_${key}`, async () => {
          try {
            const freshData = await fetcher();
            this.set(key, freshData, freshTtlSeconds, staleTtlSeconds);
            if (onBackgroundRevalidated) {
              onBackgroundRevalidated(freshData);
            }
            return freshData;
          } catch (err) {
            console.warn(`[APICache] Background revalidation failed for ${key}:`, err);
            return lookup.data;
          }
        })
        .catch(() => {});

      // Return stale data immediately for zero latency
      return lookup.data;
    }

    // Cache MISS: synchronous coalesced fetch
    return this.singleFlight.execute(`fetch_${key}`, async () => {
      // Double check cache in case a previous coalesced request just populated it
      const secondCheck = this.getWithStatus<T>(key);
      if (secondCheck.status !== 'MISS' && secondCheck.data !== null) {
        return secondCheck.data;
      }

      const freshData = await fetcher();
      this.set(key, freshData, freshTtlSeconds, staleTtlSeconds);
      return freshData;
    });
  }

  /**
   * Evict the least recently used entry
   */
  private evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let minAccessIndex = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessIndex < minAccessIndex) {
        minAccessIndex = entry.accessIndex;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.evictions++;
    }
  }

  /**
   * Delete specific key from cache
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get comprehensive cache statistics
   */
  getStats(): CacheStats {
    const totalLookups = this.freshHits + this.swrHits + this.misses;
    const hitRatio = totalLookups > 0 ? (this.freshHits + this.swrHits) / totalLookups : 0;

    return {
      size: this.cache.size,
      maxEntries: this.maxEntries,
      freshHits: this.freshHits,
      swrHits: this.swrHits,
      misses: this.misses,
      evictions: this.evictions,
      totalLookups,
      hitRatio: Math.round(hitRatio * 1000) / 1000,
      keys: Array.from(this.cache.keys()),
    };
  }

  /**
   * Reset observability metrics
   */
  resetMetrics(): void {
    this.freshHits = 0;
    this.swrHits = 0;
    this.misses = 0;
    this.evictions = 0;
  }
}
