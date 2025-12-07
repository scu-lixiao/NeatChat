/**
 * Memory Management Utilities for iPadOS
 *
 * Purpose: Monitor and optimize memory usage for long chat conversations
 * Features:
 * - Message history pruning
 * - Memory pressure detection
 * - Smart cache management
 * - Image lazy loading
 */

export interface MemoryInfo {
  usedJSHeapSize: number;
  totalJSHeapSize: number;
  jsHeapSizeLimit: number;
  usagePercentage: number;
}

export interface MemoryPressureLevel {
  level: "normal" | "moderate" | "critical";
  shouldPrune: boolean;
  recommendedMessageLimit: number;
}

/**
 * Get current memory usage (Safari/Chromium only)
 */
export function getMemoryInfo(): MemoryInfo | null {
  if ("memory" in performance && (performance as any).memory) {
    const memory = (performance as any).memory;
    const usagePercentage =
      (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100;

    return {
      usedJSHeapSize: memory.usedJSHeapSize,
      totalJSHeapSize: memory.totalJSHeapSize,
      jsHeapSizeLimit: memory.jsHeapSizeLimit,
      usagePercentage,
    };
  }

  return null;
}

/**
 * Detect memory pressure level
 */
export function detectMemoryPressure(): MemoryPressureLevel {
  const memoryInfo = getMemoryInfo();

  if (!memoryInfo) {
    // Conservative defaults when memory API unavailable
    return {
      level: "moderate",
      shouldPrune: true,
      recommendedMessageLimit: 100,
    };
  }

  const { usagePercentage } = memoryInfo;

  if (usagePercentage > 85) {
    return {
      level: "critical",
      shouldPrune: true,
      recommendedMessageLimit: 50,
    };
  } else if (usagePercentage > 70) {
    return {
      level: "moderate",
      shouldPrune: true,
      recommendedMessageLimit: 100,
    };
  } else {
    return {
      level: "normal",
      shouldPrune: false,
      recommendedMessageLimit: 200,
    };
  }
}

/**
 * Prune old messages from conversation history
 */
export function pruneMessages<T extends { id: string; date: string }>(
  messages: T[],
  limit: number,
  keepRecent = true,
): T[] {
  if (messages.length <= limit) {
    return messages;
  }

  if (keepRecent) {
    // Keep most recent messages
    return messages.slice(-limit);
  } else {
    // Keep oldest messages (for context)
    return messages.slice(0, limit);
  }
}

/**
 * Smart message pruning based on memory pressure
 */
export function smartPruneMessages<
  T extends { id: string; date: string; role?: string },
>(
  messages: T[],
  options: {
    maxMessages?: number;
    keepSystemMessages?: boolean;
    checkMemoryPressure?: boolean;
  } = {},
): T[] {
  const {
    maxMessages = 100,
    keepSystemMessages = true,
    checkMemoryPressure = true,
  } = options;

  let targetLimit = maxMessages;

  // Adjust limit based on memory pressure
  if (checkMemoryPressure) {
    const pressure = detectMemoryPressure();
    targetLimit = Math.min(targetLimit, pressure.recommendedMessageLimit);
  }

  // Separate system messages if needed
  if (keepSystemMessages) {
    const systemMessages = messages.filter((m) => m.role === "system");
    const otherMessages = messages.filter((m) => m.role !== "system");

    const prunedOthers = pruneMessages(
      otherMessages,
      targetLimit - systemMessages.length,
    );
    return [...systemMessages, ...prunedOthers];
  }

  return pruneMessages(messages, targetLimit);
}

/**
 * Clear browser caches
 */
export async function clearCaches(cacheNames?: string[]): Promise<void> {
  if ("caches" in window) {
    try {
      if (cacheNames) {
        // Clear specific caches
        await Promise.all(cacheNames.map((name) => caches.delete(name)));
      } else {
        // Clear all caches
        const names = await caches.keys();
        await Promise.all(names.map((name) => caches.delete(name)));
      }
      console.log("[Memory] Caches cleared");
    } catch (error) {
      console.error("[Memory] Failed to clear caches:", error);
    }
  }
}

/**
 * Memory pressure monitor
 */
export class MemoryMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private listeners: Array<(pressure: MemoryPressureLevel) => void> = [];

  constructor(private intervalMs = 5000) {}

  start() {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => {
      const pressure = detectMemoryPressure();

      if (pressure.level !== "normal") {
        console.warn("[Memory] Memory pressure detected:", pressure);
        this.listeners.forEach((listener) => listener(pressure));
      }
    }, this.intervalMs);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  onPressure(callback: (pressure: MemoryPressureLevel) => void) {
    this.listeners.push(callback);

    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  getMemoryInfo(): MemoryInfo | null {
    return getMemoryInfo();
  }
}

/**
 * Intersection Observer for lazy image loading
 */
export function createLazyImageObserver(
  onIntersect: (element: HTMLElement) => void,
  options: IntersectionObserverInit = {},
): IntersectionObserver {
  const defaultOptions: IntersectionObserverInit = {
    root: null,
    rootMargin: "100px", // Load images 100px before they enter viewport
    threshold: 0.01,
    ...options,
  };

  return new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        onIntersect(entry.target as HTMLElement);
      }
    });
  }, defaultOptions);
}

/**
 * Lazy load image helper
 */
export function lazyLoadImage(
  img: HTMLImageElement,
  src: string,
  placeholder?: string,
): void {
  if (placeholder) {
    img.src = placeholder;
  }

  const observer = createLazyImageObserver((element) => {
    const imgElement = element as HTMLImageElement;
    imgElement.src = src;
    imgElement.onload = () => {
      imgElement.classList.add("loaded");
    };
    observer.unobserve(element);
  });

  observer.observe(img);
}

/**
 * Calculate approximate object size in bytes
 */
export function estimateObjectSize(obj: any): number {
  const seen = new WeakSet();

  function sizeOf(obj: any): number {
    if (obj === null || obj === undefined) return 0;

    // Primitive types
    if (typeof obj === "string") return obj.length * 2; // UTF-16
    if (typeof obj === "number") return 8;
    if (typeof obj === "boolean") return 4;

    // Check for circular references
    if (typeof obj === "object") {
      if (seen.has(obj)) return 0;
      seen.add(obj);
    }

    // Arrays
    if (Array.isArray(obj)) {
      return obj.reduce((sum, item) => sum + sizeOf(item), 0);
    }

    // Objects
    if (typeof obj === "object") {
      return Object.keys(obj).reduce(
        (sum, key) => sum + key.length * 2 + sizeOf(obj[key]),
        0,
      );
    }

    return 0;
  }

  return sizeOf(obj);
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
