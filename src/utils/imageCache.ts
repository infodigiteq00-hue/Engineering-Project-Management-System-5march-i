/**
 * Image cache utility with LRU (Least Recently Used) eviction
 * Max 50 images cached, removes oldest when limit reached
 */

interface CachedImage {
  url: string;
  blob: Blob;
  timestamp: number;
  size: number;
}

const MAX_CACHED_IMAGES = 50;
const IMAGE_CACHE_PREFIX = 'epms_image_cache_';

/**
 * Get cache key for image
 */
const getImageCacheKey = (imageUrl: string): string => {
  // Use a hash of the URL as the key to avoid issues with special characters
  return `${IMAGE_CACHE_PREFIX}${btoa(imageUrl).replace(/[+/=]/g, '_')}`;
};

/**
 * Get all cached image keys
 */
const getCachedImageKeys = (): Array<{ key: string; timestamp: number; size: number }> => {
  const keys: Array<{ key: string; timestamp: number; size: number }> = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(IMAGE_CACHE_PREFIX)) {
      try {
        const cached = localStorage.getItem(key);
        if (cached) {
          const data: CachedImage = JSON.parse(cached);
          keys.push({
            key,
            timestamp: data.timestamp,
            size: data.size
          });
        }
      } catch (e) {
        // Invalid entry, skip
      }
    }
  }
  
  return keys;
};

/**
 * Evict oldest images if we're at the limit
 */
const evictOldestImages = (): void => {
  const cachedKeys = getCachedImageKeys();
  
  if (cachedKeys.length >= MAX_CACHED_IMAGES) {
    // Sort by timestamp (oldest first)
    cachedKeys.sort((a, b) => a.timestamp - b.timestamp);
    
    // Remove oldest 10% (or at least 5) to make room
    const toRemove = Math.max(5, Math.ceil(cachedKeys.length * 0.1));
    
    for (let i = 0; i < toRemove; i++) {
      localStorage.removeItem(cachedKeys[i].key);
    }
    
    // console.log(`🧹 [ImageCache] Evicted ${toRemove} oldest images`);
  }
};

/**
 * Convert blob to base64 for localStorage storage
 */
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

/**
 * Convert base64 to blob
 */
const base64ToBlob = (base64: string): Blob => {
  const [header, data] = base64.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bytes = atob(data);
  const array = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    array[i] = bytes.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
};

/**
 * Cache an image
 */
export const cacheImage = async (imageUrl: string): Promise<void> => {
  try {
    const cacheKey = getImageCacheKey(imageUrl);
    
    // Check if already cached
    const existing = localStorage.getItem(cacheKey);
    if (existing) {
      // Update timestamp to mark as recently used
      const cached: CachedImage = JSON.parse(existing);
      cached.timestamp = Date.now();
      localStorage.setItem(cacheKey, JSON.stringify(cached));
      return;
    }
    
    // Evict oldest if needed
    evictOldestImages();
    
    // Fetch and cache the image
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);
    
    const cachedImage: CachedImage = {
      url: imageUrl,
      blob: blob, // Store base64 in localStorage, but keep blob reference for return
      timestamp: Date.now(),
      size: blob.size
    };
    
    // Store base64 in localStorage (blob can't be stored directly)
    const storageData = {
      url: imageUrl,
      base64: base64,
      timestamp: cachedImage.timestamp,
      size: cachedImage.size
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(storageData));
    // console.log(`💾 [ImageCache] Cached image: ${(blob.size / 1024).toFixed(2)}KB`);
  } catch (error) {
    console.warn('Failed to cache image:', error);
  }
};

/**
 * Get cached image as blob URL
 */
export const getCachedImage = (imageUrl: string): string | null => {
  try {
    const cacheKey = getImageCacheKey(imageUrl);
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }
    
    const storageData = JSON.parse(cached);
    const blob = base64ToBlob(storageData.base64);
    const blobUrl = URL.createObjectURL(blob);
    
    // Update timestamp to mark as recently used
    storageData.timestamp = Date.now();
    localStorage.setItem(cacheKey, JSON.stringify(storageData));
    
    return blobUrl;
  } catch (error) {
    console.warn('Failed to get cached image:', error);
    return null;
  }
};

/**
 * Check if image is cached
 */
export const isImageCached = (imageUrl: string): boolean => {
  const cacheKey = getImageCacheKey(imageUrl);
  return localStorage.getItem(cacheKey) !== null;
};

/**
 * Clear all cached images
 */
export const clearImageCache = (): void => {
  const keysToRemove: string[] = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(IMAGE_CACHE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key);
  });
  
  // console.log(`🧹 [ImageCache] Cleared ${keysToRemove.length} cached images`);
};

/**
 * Get cache stats
 */
export const getImageCacheStats = (): { count: number; totalSize: number } => {
  const cachedKeys = getCachedImageKeys();
  const totalSize = cachedKeys.reduce((sum, item) => sum + item.size, 0);
  
  return {
    count: cachedKeys.length,
    totalSize: totalSize
  };
};

