/**
 * React Hooks for Memory Management
 *
 * Purpose: Integrate memory management with React components
 */

import { useEffect, useState } from "react";
import {
  type MemoryInfo,
  type MemoryPressureLevel,
  MemoryMonitor,
  getMemoryInfo,
  detectMemoryPressure,
  formatBytes,
} from "../utils/memory-manager";

/**
 * Hook to monitor memory usage
 */
export function useMemoryMonitor(intervalMs = 5000) {
  const [memoryInfo, setMemoryInfo] = useState<MemoryInfo | null>(null);
  const [pressure, setPressure] = useState<MemoryPressureLevel | null>(null);

  useEffect(() => {
    const monitor = new MemoryMonitor(intervalMs);

    // Initial check
    setMemoryInfo(getMemoryInfo());
    setPressure(detectMemoryPressure());

    // Monitor pressure changes
    const unsubscribe = monitor.onPressure((newPressure) => {
      setPressure(newPressure);
      setMemoryInfo(getMemoryInfo());
    });

    monitor.start();

    return () => {
      monitor.stop();
      unsubscribe();
    };
  }, [intervalMs]);

  return { memoryInfo, pressure };
}

/**
 * Hook for lazy image loading
 */
export function useLazyImage(
  ref: React.RefObject<HTMLImageElement>,
  src: string,
  placeholder?: string,
) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const img = ref.current;
    if (!img || loaded) return;

    // Set placeholder
    if (placeholder) {
      img.src = placeholder;
    }

    // Create intersection observer
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            img.src = src;
            img.onload = () => {
              setLoaded(true);
            };
            observer.disconnect();
          }
        });
      },
      {
        root: null,
        rootMargin: "100px",
        threshold: 0.01,
      },
    );

    observer.observe(img);

    return () => {
      observer.disconnect();
    };
  }, [ref, src, placeholder, loaded]);

  return loaded;
}

/**
 * Hook to get formatted memory info string
 */
export function useFormattedMemory(): string {
  const { memoryInfo, pressure } = useMemoryMonitor();

  if (!memoryInfo || !pressure) {
    return "Memory info unavailable";
  }

  return `${formatBytes(memoryInfo.usedJSHeapSize)} / ${formatBytes(
    memoryInfo.jsHeapSizeLimit,
  )} (${pressure.level})`;
}

/**
 * Hook to auto-prune messages based on memory pressure
 */
export function useMessagePruning<
  T extends { id: string; date: string; role?: string },
>(
  messages: T[],
  options: {
    maxMessages?: number;
    checkMemoryPressure?: boolean;
  } = {},
): T[] {
  const { pressure } = useMemoryMonitor();
  const [prunedMessages, setPrunedMessages] = useState(messages);

  useEffect(() => {
    const { maxMessages = 100, checkMemoryPressure = true } = options;

    let limit = maxMessages;

    if (checkMemoryPressure && pressure) {
      limit = Math.min(limit, pressure.recommendedMessageLimit);
    }

    if (messages.length > limit) {
      // Keep system messages and recent messages
      const systemMessages = messages.filter((m) => m.role === "system");
      const otherMessages = messages.filter((m) => m.role !== "system");
      const recentMessages = otherMessages.slice(
        -(limit - systemMessages.length),
      );

      setPrunedMessages([...systemMessages, ...recentMessages]);

      if (process.env.NODE_ENV === "development") {
        console.log("[Memory] Pruned messages:", {
          original: messages.length,
          pruned: systemMessages.length + recentMessages.length,
          limit,
        });
      }
    } else {
      setPrunedMessages(messages);
    }
  }, [messages, pressure, options]);

  return prunedMessages;
}
