import { jest } from "@jest/globals";

const idb = new Map<string, string>();
const set = jest.fn(async (key: string, value: string) => {
  idb.set(key, value);
});

let storage: typeof import("../indexedDB-storage").indexedDBPersistStorage;
let pausePersist: typeof import("../indexedDB-storage").pausePersist;

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
  pausePersist = storageModule.pausePersist;
});

// PERSIST_MAX_DEFER_MS in indexedDB-storage.ts
const MAX_DEFER_MS = 10_000;

const hydrated = (value: number) => ({
  state: { _hasHydrated: true, value },
  version: 1,
});

const lastWritten = () => {
  const [key, value] = set.mock.lastCall!;
  return { key, value: JSON.parse(value) };
};

// Pauses are module state shared by all tests: each test's pauses are
// resumed after it (resuming twice is a no-op)
const resumes: (() => void)[] = [];
const pause = (name = "chat") => {
  const resume = pausePersist(name);
  resumes.push(resume);
  return resume;
};

const hidePage = () => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  // restore the prototype getter
  delete (document as { visibilityState?: unknown }).visibilityState;
};

const unloadPage = () => {
  window.dispatchEvent(new Event("pagehide"));
};

let clock = Date.now();

describe("pausePersist", () => {
  beforeEach(() => {
    // well past the previous test's writes, so no throttle window is open
    clock += 60_000;
    jest.useFakeTimers({ now: clock });
    idb.clear();
    set.mockClear();
  });

  afterEach(async () => {
    resumes.splice(0).forEach((resume) => resume());
    await jest.runAllTimersAsync();
    jest.useRealTimers();
  });

  test("holds back writes while paused", async () => {
    pause();

    // a reply streaming in for 2 seconds
    for (let i = 1; i <= 20; i++) {
      storage.setItem("chat", hydrated(i));
      await jest.advanceTimersByTimeAsync(100);
    }

    expect(set).not.toHaveBeenCalled();
    // reads still see the latest state
    expect(await storage.getItem("chat")).toEqual(hydrated(20));
  });

  test("writes the latest state once, right away, on resume", async () => {
    const resume = pause();
    for (let i = 1; i <= 20; i++) {
      storage.setItem("chat", hydrated(i));
    }

    resume();
    expect(set).toHaveBeenCalledTimes(1);
    expect(lastWritten()).toEqual({ key: "chat", value: hydrated(20) });

    resume();
    await jest.runAllTimersAsync();
    expect(set).toHaveBeenCalledTimes(1);
  });

  test("resuming without a held write writes nothing", async () => {
    pause()();
    await jest.runAllTimersAsync();

    expect(set).not.toHaveBeenCalled();
  });

  test("stays paused until every pause is resumed", async () => {
    // replies streaming in two sessions
    const resumeFirst = pause();
    const resumeSecond = pause();
    storage.setItem("chat", hydrated(1));

    resumeFirst();
    // resuming the same pause again must not release the other one
    resumeFirst();
    storage.setItem("chat", hydrated(2));
    await jest.advanceTimersByTimeAsync(5_000);
    expect(set).not.toHaveBeenCalled();

    resumeSecond();
    expect(set).toHaveBeenCalledTimes(1);
    expect(lastWritten()).toEqual({ key: "chat", value: hydrated(2) });
  });

  test("writes a held change once it is the maximum deferral old", async () => {
    pause();

    // a long reply: a change every 100ms
    storage.setItem("chat", hydrated(0));
    for (let i = 1; i < 100; i++) {
      await jest.advanceTimersByTimeAsync(100);
      storage.setItem("chat", hydrated(i));
    }
    expect(set).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(MAX_DEFER_MS - 9_900);
    expect(set).toHaveBeenCalledTimes(1);
    expect(lastWritten()).toEqual({ key: "chat", value: hydrated(99) });

    // still paused: the next change is held again
    storage.setItem("chat", hydrated(100));
    await jest.advanceTimersByTimeAsync(MAX_DEFER_MS - 1);
    expect(set).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1);
    expect(set).toHaveBeenCalledTimes(2);
    expect(lastWritten()).toEqual({ key: "chat", value: hydrated(100) });
  });

  test.each([
    ["the page is hidden", hidePage],
    ["the page is unloaded", unloadPage],
  ])("writes held changes when %s", async (_, leavePage) => {
    pause();
    storage.setItem("chat", hydrated(1));

    leavePage();
    expect(set).toHaveBeenCalledTimes(1);
    expect(lastWritten()).toEqual({ key: "chat", value: hydrated(1) });

    // still paused afterwards
    storage.setItem("chat", hydrated(2));
    await jest.advanceTimersByTimeAsync(5_000);
    expect(set).toHaveBeenCalledTimes(1);
  });

  test("other stores keep their normal schedule", async () => {
    pause("chat");
    storage.setItem("chat", hydrated(1));
    storage.setItem("config", hydrated(2));
    await jest.advanceTimersByTimeAsync(500);

    expect(set.mock.calls.map(([key]) => key)).toEqual(["config"]);
    expect(lastWritten()).toEqual({ key: "config", value: hydrated(2) });
  });

  test("a write queued before the pause keeps its schedule", async () => {
    // e.g. the user's new message, saved just before the reply starts
    storage.setItem("chat", hydrated(1));
    pause();
    storage.setItem("chat", hydrated(2));
    await jest.advanceTimersByTimeAsync(500);

    expect(set).toHaveBeenCalledTimes(1);
    expect(lastWritten()).toEqual({ key: "chat", value: hydrated(2) });

    // later changes are held
    storage.setItem("chat", hydrated(3));
    await jest.advanceTimersByTimeAsync(5_000);
    expect(set).toHaveBeenCalledTimes(1);
  });
});
