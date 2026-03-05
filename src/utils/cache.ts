/**
 * Cache utility for storing and retrieving data with expiration
 * Uses localStorage for persistence across sessions
 * Includes smart size management and cleanup to prevent quota exceeded errors
 */

interface CacheItem<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

interface CacheOptions {
  ttl?: number; // Time to live in milliseconds (default: 5 minutes)
  keyPrefix?: string; // Prefix for cache keys
  maxSize?: number; // Maximum size in bytes for this entry (default: 2MB)
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes default
const CACHE_PREFIX = 'epms_cache_';
const MAX_ENTRY_SIZE = 2 * 1024 * 1024; // 2MB per entry default
const MAX_TOTAL_CACHE_SIZE = 8 * 1024 * 1024; // 8MB total cache limit (leaves room for other localStorage)

/**
 * Generate cache key with prefix
 */
const getCacheKey = (key: string, prefix?: string): string => {
  return `${prefix || CACHE_PREFIX}${key}`;
};

/**
 * Get size of a string in bytes
 */
const getStringSize = (str: string): number => {
  return new Blob([str]).size;
};

/**
 * Get total size of all cache entries
 */
const getTotalCacheSize = (prefix: string = CACHE_PREFIX): number => {
  let totalSize = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const value = localStorage.getItem(key);
        if (value) {
          totalSize += getStringSize(value);
        }
      }
    }
  } catch (error) {
    console.warn('Failed to calculate cache size:', error);
  }
  return totalSize;
};

/**
 * Clean up expired and old cache entries to free up space
 */
const cleanupCache = (prefix: string = CACHE_PREFIX, targetSize?: number): void => {
  try {
    const now = Date.now();
    const cacheEntries: Array<{ key: string; size: number; expiresAt: number; timestamp: number }> = [];
    const keysToRemove: string[] = [];

    // First pass: collect all cache entries and remove expired ones
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        try {
          const value = localStorage.getItem(key);
          if (value) {
            const cacheItem: CacheItem<any> = JSON.parse(value);
            const size = getStringSize(value);
            
            // Remove expired entries
            if (now > cacheItem.expiresAt) {
              keysToRemove.push(key);
            } else {
              // Keep track of valid entries
              cacheEntries.push({
                key,
                size,
                expiresAt: cacheItem.expiresAt,
                timestamp: cacheItem.timestamp
              });
            }
          }
        } catch (e) {
          // Invalid cache entry, remove it
          keysToRemove.push(key);
        }
      }
    }

    // Remove expired entries
    keysToRemove.forEach(key => localStorage.removeItem(key));

    // If target size specified, remove oldest entries until we're under target
    if (targetSize !== undefined) {
      const currentSize = cacheEntries.reduce((sum, entry) => sum + entry.size, 0);
      if (currentSize > targetSize) {
        // Sort by timestamp (oldest first)
        cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
        
        let sizeToFree = currentSize - targetSize;
        for (const entry of cacheEntries) {
          if (sizeToFree <= 0) break;
          localStorage.removeItem(entry.key);
          sizeToFree -= entry.size;
        }
      }
    }
  } catch (error) {
    console.warn('Failed to cleanup cache:', error);
  }
};

/**
 * Set data in cache with expiration and size management
 */
export const setCache = <T>(key: string, data: T, options: CacheOptions = {}): void => {
  try {
    const { ttl = DEFAULT_TTL, maxSize = MAX_ENTRY_SIZE } = options;
    const cacheKey = getCacheKey(key, options.keyPrefix);
    const now = Date.now();
    const expiresAt = now + ttl;

    const cacheItem: CacheItem<T> = {
      data,
      timestamp: now,
      expiresAt,
    };

    const serialized = JSON.stringify(cacheItem);
    const dataSize = getStringSize(serialized);

    // Check if individual entry is too large
    if (dataSize > maxSize) {
      console.warn(`⚠️ Cache entry too large (${(dataSize / 1024 / 1024).toFixed(2)}MB), not caching. Key: ${cacheKey}`);
      return;
    }

    // Check total cache size and cleanup if needed
    const currentCacheSize = getTotalCacheSize(options.keyPrefix || CACHE_PREFIX);
    if (currentCacheSize + dataSize > MAX_TOTAL_CACHE_SIZE) {
      // Clean up to make room (target 70% of max size)
      cleanupCache(options.keyPrefix || CACHE_PREFIX, MAX_TOTAL_CACHE_SIZE * 0.7);
    }

    // Try to set the cache
    localStorage.setItem(cacheKey, serialized);
  } catch (error: any) {
    // If quota exceeded, try aggressive cleanup
    if (error?.name === 'QuotaExceededError' || error?.code === 22) {
      console.warn('⚠️ Storage quota exceeded, cleaning up cache...');
      cleanupCache(options.keyPrefix || CACHE_PREFIX, MAX_TOTAL_CACHE_SIZE * 0.5);
      
      // Try again after cleanup
      try {
        const { ttl = DEFAULT_TTL } = options;
        const cacheKey = getCacheKey(key, options.keyPrefix);
        const now = Date.now();
        const expiresAt = now + ttl;
        const cacheItem: CacheItem<T> = {
          data,
          timestamp: now,
          expiresAt,
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
      } catch (retryError) {
        console.warn('❌ Still failed after cleanup, cache not saved:', retryError);
      }
    } else {
      console.warn('Failed to set cache:', error);
    }
  }
};

/**
 * Get data from cache if not expired
 */
export const getCache = <T>(key: string, options: CacheOptions = {}): T | null => {
  try {
    const cacheKey = getCacheKey(key, options.keyPrefix);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const cacheItem: CacheItem<T> = JSON.parse(cached);
    const now = Date.now();

    // Check if cache is expired
    if (now > cacheItem.expiresAt) {
      // Remove expired cache
      localStorage.removeItem(cacheKey);
      return null;
    }

    return cacheItem.data;
  } catch (error) {
    console.warn('Failed to get cache:', error);
    return null;
  }
};

/**
 * Get data from cache even if expired (for fallback use)
 * Returns null only if cache doesn't exist or is invalid
 */
export const getCacheEvenIfExpired = <T>(key: string, options: CacheOptions = {}): T | null => {
  try {
    const cacheKey = getCacheKey(key, options.keyPrefix);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const cacheItem: CacheItem<T> = JSON.parse(cached);
    return cacheItem.data;
  } catch (error) {
    console.warn('Failed to get cache (even if expired):', error);
    return null;
  }
};

/**
 * Check if cache exists and is valid
 */
export const hasCache = (key: string, options: CacheOptions = {}): boolean => {
  const cached = getCache(key, options);
  return cached !== null;
};

/**
 * Remove specific cache item
 */
export const removeCache = (key: string, options: CacheOptions = {}): void => {
  try {
    const cacheKey = getCacheKey(key, options.keyPrefix);
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.warn('Failed to remove cache:', error);
  }
};

/**
 * Clear all cache items with the prefix, but preserve critical caches
 * Critical caches (never cleared):
 * - SUMMARY_STATS (main tabs counter, summary cards)
 * - EQUIPMENT_standalone (standalone equipment cache)
 */
export const clearCache = (prefix?: string): void => {
  try {
    const cachePrefix = prefix || CACHE_PREFIX;
    const keysToRemove: string[] = [];
    
    // Critical cache keys to preserve (never clear)
    const criticalKeyPatterns = [
      CACHE_KEYS.SUMMARY_STATS,
      CACHE_KEYS.TAB_COUNTERS, // Tab counters - NEVER CLEAR
      `${CACHE_KEYS.EQUIPMENT}_standalone`, // Preserve standalone equipment cache
    ];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(cachePrefix)) {
        // Check if this is a critical cache key
        const isCritical = criticalKeyPatterns.some(criticalPattern => {
          const fullCriticalKey = getCacheKey(criticalPattern);
          return key === fullCriticalKey || key.includes(criticalPattern);
        });
        
        // Only remove non-critical caches
        if (!isCritical) {
          keysToRemove.push(key);
        }
      }
    }
    
    keysToRemove.forEach(key => localStorage.removeItem(key));
    // console.log(`🧹 [Cache] Cleared ${keysToRemove.length} cache entries (preserved critical caches)`);
  } catch (error) {
    console.warn('Failed to clear cache:', error);
  }
};

/**
 * Get cache age in milliseconds
 */
export const getCacheAge = (key: string, options: CacheOptions = {}): number | null => {
  try {
    const cacheKey = getCacheKey(key, options.keyPrefix);
    const cached = localStorage.getItem(cacheKey);

    if (!cached) {
      return null;
    }

    const cacheItem: CacheItem<any> = JSON.parse(cached);
    return Date.now() - cacheItem.timestamp;
  } catch (error) {
    return null;
  }
};

/**
 * Cache keys constants
 */
export const CACHE_KEYS = {
  SUMMARY_STATS: 'summary_stats', // Active projects count, total equipment count
  PROJECT_CARDS: 'project_cards', // Project cards metadata (main overview page)
  EQUIPMENT: 'equipment', // Per-project equipment data (prefix, will append projectId)
  TAB_COUNTERS: 'tab_counters', // Tab counters (Projects, Standalone Equipment, Completion Certificates) - NEVER CLEAR
  COMPANY_HIGHLIGHTS_PRODUCTION: 'company_highlights_production',
  COMPANY_HIGHLIGHTS_EQUIPMENT: 'company_highlights_equipment',
  COMPANY_HIGHLIGHTS_DOCUMENTATION: 'company_highlights_documentation',
  COMPANY_HIGHLIGHTS_TIMELINE: 'company_highlights_timeline',
  COMPANY_HIGHLIGHTS_MILESTONE: 'company_highlights_milestone',
} as const;

/**
 * Initialize cache cleanup on app startup
 * Call this once when the app loads
 */
export const initializeCacheCleanup = (): void => {
  // Clean up expired entries on startup
  cleanupCache();
  // console.log('🧹 [Cache] Initialized cache cleanup');
};

/**
 * Prefetch data with caching
 * Returns cached data if available and fresh, otherwise fetches and caches new data
 */
export const prefetchWithCache = async <T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> => {
  // Try to get from cache first
  const cached = getCache<T>(key, options);
  if (cached !== null) {
    // Return cached data immediately
    // Then fetch fresh data in background (fire and forget)
    fetchFn()
      .then(freshData => {
        setCache(key, freshData, options);
      })
      .catch(error => {
        console.warn(`Background refresh failed for ${key}:`, error);
      });
    
    return cached;
  }

  // No cache, fetch fresh data
  const freshData = await fetchFn();
  setCache(key, freshData, options);
  return freshData;
};

