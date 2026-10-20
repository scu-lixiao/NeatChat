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

// A paused store (see `pausePersist`) still gets written once its oldest
// unsaved change is this old, so a long reply can't leave it unsaved.
const PERSIST_MAX_DEFER_MS = 10_000;

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

type PendingWrite = {
  value: StorageValue<unknown>;
  // Set when queued while the store was paused: not written before this time
  heldUntil?: number;
};

const pendingWrites = new Map<string, PendingWrite>();
const pauseCounts = new Map<string, number>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushTimerDue = 0;
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

/**
 * Writes every pending value that isn't held back by a pause, or all of them
 * with `force`.
 */
async function flushPendingWrites(force = false) {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  const now = Date.now();

  const writes: [string, StorageValue<unknown>][] = [];
  pendingWrites.forEach(({ value, heldUntil }, name) => {
    if (force || heldUntil === undefined || heldUntil <= now) {
      writes.push([name, value]);
      pendingWrites.delete(name);
    }
  });
  if (writes.length > 0) lastFlushTime = now;
  // for writes that are still held
  scheduleFlush();

  await Promise.all(
    writes.map(([name, value]) =>
      indexedDBStorage.setItem(name, JSON.stringify(value)),
    ),
  );
}

function scheduleFlush() {
  let due = Infinity;
  pendingWrites.forEach(({ heldUntil }) => {
    const throttledUntil = lastFlushTime + PERSIST_THROTTLE_MS;
    due = Math.min(due, Math.max(throttledUntil, heldUntil ?? 0));
  });
  if (due === Infinity) return;

  if (flushTimer) {
    if (flushTimerDue <= due) return;
    clearTimeout(flushTimer);
  }
  flushTimerDue = due;
  flushTimer = setTimeout(
    () => void flushPendingWrites(),
    Math.max(0, due - Date.now()),
  );
}

if (!isServer) {
  // Don't lose the last coalesced write when the tab is hidden or closed,
  // including one held back by a pause.
  window.addEventListener("pagehide", () => void flushPendingWrites(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushPendingWrites(true);
    }
  });
}

/**
 * Holds back writes of the store persisted under `name` until the returned
 * `resume` is called. The chat store is paused while a reply streams in, so
 * that all sessions aren't serialized again for every few new tokens.
 *
 * Pauses nest (e.g. replies streaming in two sessions): writes resume when
 * every pause has been resumed, and the latest state is then written at once.
 * While paused, a write still happens when the page is hidden, or once the
 * oldest unsaved change is `PERSIST_MAX_DEFER_MS` old. A write queued before
 * the pause keeps its normal schedule. `resume` can safely be called twice.
 */
export function pausePersist(name: string): () => void {
  pauseCounts.set(name, (pauseCounts.get(name) ?? 0) + 1);

  let resumed = false;
  return () => {
    if (resumed) return;
    resumed = true;

    const count = pauseCounts.get(name)! - 1;
    if (count > 0) {
      pauseCounts.set(name, count);
      return;
    }
    pauseCounts.delete(name);

    const pending = pendingWrites.get(name);
    if (pending) {
      pending.heldUntil = undefined;
      void flushPendingWrites();
    }
  };
}

/**
 * Writes every pending store now, including paused ones. Await it before
 * reloading the page: writes started while the page unloads can be lost.
 */
export function flushPersist(): Promise<void> {
  return flushPendingWrites(true);
}

/**
 * zustand `PersistStorage` backed by IndexedDB. Serialization is deferred to
 * flush time, so it always writes the latest state and runs at most once per
 * `PERSIST_THROTTLE_MS` per key.
 */
export const indexedDBPersistStorage: PersistStorage<unknown> = {
  async getItem(name) {
    const pending = pendingWrites.get(name);
    if (pending) return pending.value;

    const str = await indexedDBStorage.getItem(name);
    return str ? (JSON.parse(str) as StorageValue<unknown>) : null;
  },
  setItem(name, value) {
    // Never persist the default state that exists before rehydration finishes,
    // otherwise it would overwrite the user's stored data.
    if (!(value.state as { _hasHydrated?: boolean })?._hasHydrated) return;

    const pending = pendingWrites.get(name);
    if (pending) {
      pending.value = value;
      return;
    }
    pendingWrites.set(name, {
      value,
      heldUntil: pauseCounts.has(name)
        ? Date.now() + PERSIST_MAX_DEFER_MS
        : undefined,
    });
    scheduleFlush();
  },
  removeItem(name) {
    return indexedDBStorage.removeItem(name);
  },
};
