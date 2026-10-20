import { jest } from "@jest/globals";
import { RETIRED_XAI_MODEL_REPLACEMENT, StoreKey } from "@/app/constant";
import type { ChatMessage, ChatSession } from "@/app/store/chat";
import type { AppState } from "../sync";

const idb = new Map<string, string>();

let sync: typeof import("../sync");
let merge: typeof import("../merge").merge;
let useChatStore: typeof import("@/app/store/chat").useChatStore;
let useSyncStore: typeof import("@/app/store/sync").useSyncStore;

beforeAll(async () => {
  jest.unstable_mockModule("idb-keyval", () => ({
    get: async (key: string) => idb.get(key),
    // like IndexedDB, the write completes in a later task
    set: (key: string, value: string) =>
      new Promise<void>((res) =>
        setTimeout(() => {
          idb.set(key, value);
          res();
        }, 10),
      ),
    del: async (key: string) => {
      idb.delete(key);
    },
    clear: async () => idb.clear(),
  }));
  // builtin prompts and plugins the stores fetch when they rehydrate
  (global.fetch as jest.Mock<any>).mockImplementation(async (url: any) => ({
    json: async () =>
      String(url).includes("prompts") ? { en: [], tw: [], cn: [] } : [],
  }));

  sync = await import("../sync");
  merge = (await import("../merge")).merge;
  useChatStore = (await import("@/app/store/chat")).useChatStore;
  useSyncStore = (await import("@/app/store/sync")).useSyncStore;

  // writes before rehydration are skipped
  while (!useChatStore.getState()._hasHydrated) {
    await new Promise((res) => setTimeout(res, 0));
  }
});

const message = (id: string, date: string): ChatMessage => ({
  id,
  date,
  role: "user",
  content: id,
});

const session = (
  id: string,
  messages: ChatMessage[],
  overrides: Partial<ChatSession> = {},
) =>
  ({
    id,
    topic: id,
    messages,
    lastUpdate: 1,
    ...overrides,
  }) as ChatSession;

const localState = () =>
  JSON.parse(JSON.stringify(sync.getLocalAppState())) as AppState;

describe("merge", () => {
  test("merges nested objects and replaces arrays", () => {
    const target = { a: { b: 1, c: 2 }, list: ["a", "b", "c"] };
    merge(target, { a: { b: 3 }, list: ["x"] });
    expect(target).toEqual({ a: { b: 3, c: 2 }, list: ["x"] });
  });

  test("replaces a non-object value with an object", () => {
    const target: any = { a: "text", b: ["x"] };
    merge(target, { a: { b: 1 }, b: { c: 1 } });
    expect(target).toEqual({ a: { b: 1 }, b: { c: 1 } });
  });

  test("does not pollute Object.prototype", () => {
    merge({}, JSON.parse('{"__proto__": {"polluted": true}}'));
    merge({}, JSON.parse('{"constructor": {"prototype": {"polluted": 1}}}'));
    expect(({} as any).polluted).toBeUndefined();
  });
});

describe("mergeWithUpdate", () => {
  test("the newer state wins", () => {
    const older = { lastUpdateTime: 100, theme: "light", fontSize: 12 };
    const newer = { lastUpdateTime: 200, theme: "dark" };

    expect(sync.mergeWithUpdate<any>(newer, older)).toEqual({
      lastUpdateTime: 200,
      theme: "dark",
      fontSize: 12,
    });
    expect(sync.mergeWithUpdate<any>(older, newer)).toEqual({
      lastUpdateTime: 200,
      theme: "dark",
      fontSize: 12,
    });
  });

  test("preferRemote applies an older remote state", () => {
    const local = { lastUpdateTime: 200, theme: "dark" };
    const remote = { lastUpdateTime: 100, theme: "light" };
    expect(sync.mergeWithUpdate(local, remote, true).theme).toBe("light");
  });

  test("does not modify its inputs", () => {
    const local = { lastUpdateTime: 200, nested: { a: 1 } };
    const remote = { lastUpdateTime: 100, nested: { a: 2, b: 3 } };
    sync.mergeWithUpdate<any>(local, remote);
    expect(local).toEqual({ lastUpdateTime: 200, nested: { a: 1 } });
    expect(remote).toEqual({ lastUpdateTime: 100, nested: { a: 2, b: 3 } });
  });
});

describe("mergeAppState", () => {
  test("applies config by update time", () => {
    const local = localState();
    local[StoreKey.Config].lastUpdateTime = 500;
    local[StoreKey.Config].fontSize = 14;

    const newer = localState();
    newer[StoreKey.Config].lastUpdateTime = 900;
    newer[StoreKey.Config].fontSize = 20;
    expect(
      sync.mergeAppState(localState(), newer)[StoreKey.Config].fontSize,
    ).toBe(20);

    const older = localState();
    older[StoreKey.Config].lastUpdateTime = 100;
    older[StoreKey.Config].fontSize = 20;
    expect(sync.mergeAppState(local, older)[StoreKey.Config].fontSize).toBe(14);
  });

  test("preferRemote restores older config and access", () => {
    const local = localState();
    local[StoreKey.Config].lastUpdateTime = 500;
    local[StoreKey.Config].fontSize = 14;
    local[StoreKey.Access].lastUpdateTime = 500;

    const remote = localState();
    remote[StoreKey.Config].lastUpdateTime = 100;
    remote[StoreKey.Config].fontSize = 20;
    remote[StoreKey.Access].lastUpdateTime = 100;
    remote[StoreKey.Access].openaiApiKey = "sk-backup";

    const merged = sync.mergeAppState(local, remote, true);
    expect(merged[StoreKey.Config].fontSize).toBe(20);
    expect(merged[StoreKey.Access].openaiApiKey).toBe("sk-backup");
  });

  test("replaces arrays instead of merging them by index", () => {
    const local = localState();
    local[StoreKey.Config].hiddenModelsByProvider = { OpenAI: ["a", "b", "c"] };

    const remote = localState();
    remote[StoreKey.Config].hiddenModelsByProvider = { OpenAI: ["x"] };

    expect(
      sync.mergeAppState(local, remote, true)[StoreKey.Config]
        .hiddenModelsByProvider,
    ).toEqual({ OpenAI: ["x"] });
  });

  test("ignores _hasHydrated from the remote state", () => {
    const remote: any = localState();
    remote[StoreKey.Config]._hasHydrated = false;

    expect(
      sync.mergeAppState(localState(), remote, true)[StoreKey.Config]
        ._hasHydrated,
    ).toBe(true);
  });

  test("keeps stores missing from the remote state", () => {
    const local = localState();
    local[StoreKey.Config].fontSize = 17;
    const remote = {
      [StoreKey.Prompt]: {
        prompts: { p1: { id: "p1", title: "t", content: "c", createdAt: 1 } },
      },
    } as any;

    const merged = sync.mergeAppState(local, remote, true);
    expect(merged[StoreKey.Config].fontSize).toBe(17);
    expect(merged[StoreKey.Prompt].prompts.p1.title).toBe("t");
  });

  test("merges chat sessions and messages", () => {
    const local = localState();
    local[StoreKey.Chat].sessions = [
      session("a", [message("a1", "2026/10/01 10:00:00")], { lastUpdate: 10 }),
      session("b", [message("b2", "2026/10/02 10:00:00")], {
        lastUpdate: 20,
        archivedMessages: [message("b1", "2026/10/01 10:00:00")],
      }),
    ];
    local[StoreKey.Chat].currentSessionIndex = 1; // "b"

    const remote = localState();
    remote[StoreKey.Chat].sessions = [
      session("c", [message("c1", "2026/10/03 10:00:00")], { lastUpdate: 30 }),
      session("empty", [], { lastUpdate: 40 }),
      session(
        "a",
        [
          message("a1", "2026/10/01 10:00:00"),
          message("a2", "2026/10/05 10:00:00"),
        ],
        { lastUpdate: 50 },
      ),
      // "b1" is archived locally, it isn't new
      session("b", [message("b1", "2026/10/01 10:00:00")], { lastUpdate: 5 }),
    ];

    const chat = sync.mergeAppState(local, remote)[StoreKey.Chat];
    expect(chat.sessions.map((s) => s.id)).toEqual(["a", "c", "b"]);
    expect(chat.sessions[0].messages.map((m) => m.id)).toEqual(["a1", "a2"]);
    expect(chat.sessions[0].lastUpdate).toBe(50);
    expect(chat.sessions[2].messages.map((m) => m.id)).toEqual(["b2"]);
    expect(chat.sessions[2].lastUpdate).toBe(20);
    // still "b"
    expect(chat.currentSessionIndex).toBe(2);
  });
});

// A state saved when the chat store was at 3.3 and the config at 4.2, before
// retired xAI models were replaced and the WebGPU setting was removed
const RETIRED_XAI_MODEL = "grok-3-latest";
const oldState = () => {
  const state = localState();
  state[StoreKey.Chat].sessions = [
    session("old", [message("o1", "2026/10/01 10:00:00")], {
      lastUpdate: Date.now() + 1000,
      mask: {
        modelConfig: { model: RETIRED_XAI_MODEL, providerName: "XAI" },
      } as ChatSession["mask"],
    }),
  ];
  Object.assign(state[StoreKey.Config], { webgpuAcceleration: "auto" });
  return state;
};
const withVersions = (state: AppState, versions: Record<string, number>) => {
  const saved = JSON.parse(sync.serializeAppState(state));
  saved["store-versions"] = { ...saved["store-versions"], ...versions };
  return JSON.stringify(saved);
};
const OLD_VERSIONS = { [StoreKey.Chat]: 3.3, [StoreKey.Config]: 4.2 };

describe("serializeAppState / parseAppState", () => {
  test("saves the version of every store", async () => {
    const { useAppConfig } = await import("@/app/store/config");
    const saved = JSON.parse(sync.serializeAppState(localState()));

    expect(saved["store-versions"][StoreKey.Chat]).toBe(
      useChatStore.persist.getOptions().version,
    );
    expect(saved["store-versions"][StoreKey.Config]).toBe(
      useAppConfig.persist.getOptions().version,
    );
  });

  test("round-trips the state without the versions", async () => {
    const state = localState();
    const parsed = await sync.parseAppState(sync.serializeAppState(state));
    expect(parsed).toEqual(state);
  });

  test("migrates stores saved by an older version", async () => {
    const parsed = await sync.parseAppState(
      withVersions(oldState(), OLD_VERSIONS),
    );

    expect(parsed[StoreKey.Chat]!.sessions[0].mask.modelConfig.model).toBe(
      RETIRED_XAI_MODEL_REPLACEMENT,
    );
    expect(parsed[StoreKey.Config]).not.toHaveProperty("webgpuAcceleration");
  });

  test("doesn't migrate state saved without or with newer versions", async () => {
    const unversioned = await sync.parseAppState(JSON.stringify(oldState()));
    const newer = await sync.parseAppState(
      withVersions(oldState(), { [StoreKey.Chat]: 99, [StoreKey.Config]: 99 }),
    );

    for (const parsed of [unversioned, newer]) {
      expect(parsed[StoreKey.Chat]!.sessions[0].mask.modelConfig.model).toBe(
        RETIRED_XAI_MODEL,
      );
      expect(parsed[StoreKey.Config]).toHaveProperty("webgpuAcceleration");
    }
  });

  test("rejects other JSON files", async () => {
    for (const text of [
      "not json",
      "null",
      JSON.stringify([{ id: "mask" }]),
      JSON.stringify({ name: "mask", context: [] }),
      JSON.stringify({ [StoreKey.Chat]: "text" }),
    ]) {
      await expect(sync.parseAppState(text)).rejects.toThrow();
    }
  });
});

describe("useSyncStore.import", () => {
  let fileContent = "";
  let clickSpy: jest.SpiedFunction<typeof HTMLInputElement.prototype.click>;

  beforeAll(() => {
    // stand in for the user picking a file
    clickSpy = jest
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(function (this: HTMLInputElement) {
        const file = new File([fileContent], "backup.json", {
          type: "application/json",
        });
        Object.defineProperty(this, "files", { value: [file] });
        this.dispatchEvent(new Event("change"));
      });
  });

  afterAll(() => clickSpy.mockRestore());

  test("persists the migrated backup before reloading", async () => {
    fileContent = withVersions(oldState(), OLD_VERSIONS);

    // jsdom can't navigate, it reports location.reload() as not implemented
    let persistedOnReload: string | undefined;
    const errorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((...args: any[]) => {
        if (String(args[0]?.message ?? args[0]).includes("navigation")) {
          persistedOnReload = idb.get(StoreKey.Chat);
        }
      });

    try {
      await useSyncStore.getState().import();
    } finally {
      errorSpy.mockRestore();
    }

    expect(persistedOnReload).toBeDefined();
    const { sessions } = JSON.parse(persistedOnReload!).state;
    const imported = sessions.find((s: ChatSession) => s.id === "old");
    expect(imported.mask.modelConfig.model).toBe(RETIRED_XAI_MODEL_REPLACEMENT);
  });

  test("rejects a file that isn't a backup", async () => {
    fileContent = JSON.stringify([{ id: "mask", name: "mask" }]);
    const before = useChatStore.getState().sessions.length;
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    try {
      await useSyncStore.getState().import();
      expect(errorSpy).toHaveBeenCalledWith("[Import]", expect.any(Error));
    } finally {
      errorSpy.mockRestore();
    }
    expect(useChatStore.getState().sessions.length).toBe(before);
  });
});
