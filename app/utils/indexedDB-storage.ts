import type {
  PersistStorage,
  StateStorage,
  StorageValue,
} from "zustand/middleware";
import { get, set, del, clear } from "idb-keyval";

const isServer = typeof window === "undefined";

// zustand's persist middleware writes on every `set`. While a reply is
// streaming that is ~20 times per second, and each write used to serialize the
// whole store (all sessions, including base64 images). Writes are coalesced so
// at most one serialization per key happens in this window.
const PERSIST_THROTTLE_MS = 500;

// Deliberately not using safeLocalStorage from "@/app/utils": that module
// transitively imports the stores, which import this file, and the cycle would
// leave `indexedDBPersistStorage` uninitialized when the stores are created.
function getLocalStorage(): Storage | null {
  try {
    return isServer ? null : window.localStorage;
  } catch {
    return null;
  }
}

const pendingWrites = new Map<string, StorageValue<unknown>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushTime = 0;

class IndexedDBStorage implements StateStorage {
  public async getItem(name: string): Promise<string | null> {
    if (isServer) return null;

    try {
      return (await get(name)) || getLocalStorage()?.getItem(name) || null;
    } catch (error) {
      console.error("[IndexedDB] getItem error:", error);
      return getLocalStorage()?.getItem(name) ?? null;
    }
  }

  public async setItem(name: string, value: string): Promise<void> {
    if (isServer) return;

    try {
      await set(name, value);
    } catch (error) {
      console.error("[IndexedDB] setItem error:", error);
      // IndexedDB can be unavailable (e.g. some private browsing modes)
      try {
        getLocalStorage()?.setItem(name, value);
      } catch {
        // localStorage is ~5MB; nothing more we can do
      }
    }
  }

  public async removeItem(name: string): Promise<void> {
    if (isServer) return;
    pendingWrites.delete(name);

    try {
      await del(name);
    } catch (error) {
      console.error("[IndexedDB] removeItem error:", error);
    }
    getLocalStorage()?.removeItem(name);
  }

  public async clear(): Promise<void> {
    if (isServer) return;
    pendingWrites.clear();

    try {
      await clear();
    } catch (error) {
      console.error("[IndexedDB] clear error:", error);
    }
    getLocalStorage()?.clear();
  }
}

export const indexedDBStorage = new IndexedDBStorage();

async function flushPendingWrites() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  lastFlushTime = Date.now();

  const writes = Array.from(pendingWrites);
  pendingWrites.clear();

  await Promise.all(
    writes.map(([name, value]) =>
      indexedDBStorage.setItem(name, JSON.stringify(value)),
    ),
  );
}

function scheduleFlush() {
  if (flushTimer) return;
  const wait = Math.max(0, lastFlushTime + PERSIST_THROTTLE_MS - Date.now());
  flushTimer = setTimeout(flushPendingWrites, wait);
}

if (!isServer) {
  // Don't lose the last coalesced write when the tab is hidden or closed.
  window.addEventListener("pagehide", () => void flushPendingWrites());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushPendingWrites();
    }
  });
}

/**
 * zustand `PersistStorage` backed by IndexedDB. Serialization is deferred to
 * flush time, so it always writes the latest state and runs at most once per
 * `PERSIST_THROTTLE_MS` per key.
 */
export const indexedDBPersistStorage: PersistStorage<unknown> = {
  async getItem(name) {
    const pending = pendingWrites.get(name);
    if (pending) return pending;

    const str = await indexedDBStorage.getItem(name);
    return str ? (JSON.parse(str) as StorageValue<unknown>) : null;
  },
  setItem(name, value) {
    // Never persist the default state that exists before rehydration finishes,
    // otherwise it would overwrite the user's stored data.
    if (!(value.state as { _hasHydrated?: boolean })?._hasHydrated) return;

    pendingWrites.set(name, value);
    scheduleFlush();
  },
  removeItem(name) {
    return indexedDBStorage.removeItem(name);
  },
};
