import { jest } from "@jest/globals";

const idb = new Map<string, string>();
const set = jest.fn(async (key: string, value: string) => {
  idb.set(key, value);
});

let storage: typeof import("../indexedDB-storage").indexedDBPersistStorage;
let indexedDBStorage: typeof import("../indexedDB-storage").indexedDBStorage;

beforeAll(async () => {
  jest.unstable_mockModule("idb-keyval", () => ({
    get: async (key: string) => idb.get(key),
    set: (key: string, value: string) => set(key, value),
    del: async (key: string) => {
      idb.delete(key);
    },
    clear: async () => idb.clear(),
  }));

  const storageModule = await import("../indexedDB-storage");
  storage = storageModule.indexedDBPersistStorage;
  indexedDBStorage = storageModule.indexedDBStorage;
});

const hydrated = (value: number) => ({
  state: { _hasHydrated: true, value },
  version: 1,
});

// flush pending promise callbacks after advancing fake timers
const settle = async () => {
  await jest.runAllTimersAsync();
};

describe("indexedDBPersistStorage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    idb.clear();
    set.mockClear();
  });

  afterEach(async () => {
    // let any write scheduled on this test's fake clock complete
    await settle();
    jest.useRealTimers();
  });

  test("never persists state before rehydration finished", async () => {
    storage.setItem("store", { state: { _hasHydrated: false }, version: 1 });
    await settle();

    expect(set).not.toHaveBeenCalled();
  });

  test("coalesces a burst of writes into one write of the latest state", async () => {
    for (let i = 1; i <= 20; i++) {
      storage.setItem("store", hydrated(i));
    }
    await settle();

    expect(set).toHaveBeenCalledTimes(1);
    expect(JSON.parse(idb.get("store")!)).toEqual(hydrated(20));
  });

  test("throttles continuous writes instead of writing on every update", async () => {
    storage.setItem("store", hydrated(1));
    await settle();
    expect(set).toHaveBeenCalledTimes(1);

    // updates arriving every 50ms (like a streaming reply) for 1 second
    for (let i = 2; i <= 21; i++) {
      storage.setItem("store", hydrated(i));
      await jest.advanceTimersByTimeAsync(50);
    }
    await settle();

    expect(set.mock.calls.length).toBeLessThanOrEqual(4);
    expect(JSON.parse(idb.get("store")!)).toEqual(hydrated(21));
  });

  test("reads return a pending write before it is flushed", async () => {
    idb.set("store", JSON.stringify(hydrated(1)));
    storage.setItem("store", hydrated(2));
    storage.setItem("store", hydrated(3));

    expect(await storage.getItem("store")).toEqual(hydrated(3));
  });

  test("reads fall back to the stored value", async () => {
    idb.set("store", JSON.stringify(hydrated(7)));

    expect(await storage.getItem("store")).toEqual(hydrated(7));
    expect(await storage.getItem("missing")).toBeNull();
  });

  test("removing an item drops its pending write", async () => {
    storage.setItem("store", hydrated(1));
    await storage.removeItem("store");
    await settle();

    expect(idb.has("store")).toBe(false);
  });

  test("clearing storage drops pending writes", async () => {
    storage.setItem("a", hydrated(1));
    storage.setItem("b", hydrated(2));
    await indexedDBStorage.clear();
    await settle();

    expect(idb.size).toBe(0);
  });

  test("flushes immediately when the page is hidden", async () => {
    storage.setItem("store", hydrated(1));
    await settle();
    set.mockClear();

    // inside the throttle window, so this write would normally wait
    storage.setItem("store", hydrated(2));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "hidden",
    });
    document.dispatchEvent(new Event("visibilitychange"));

    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][1]).toBe(JSON.stringify(hydrated(2)));

    // restore the prototype getter
    delete (document as { visibilityState?: unknown }).visibilityState;
  });
});
