import {
  ChatSession,
  useAccessStore,
  useAppConfig,
  useChatStore,
} from "../store";
import { useMaskStore } from "../store/mask";
import { usePromptStore } from "../store/prompt";
import { StoreKey } from "../constant";
import { merge } from "./merge";
import { deepClone } from "./clone";

type NonFunctionKeys<T> = {
  [K in keyof T]: T[K] extends (...args: any[]) => any ? never : K;
}[keyof T];
type NonFunctionFields<T> = Pick<T, NonFunctionKeys<T>>;

export function getNonFunctionFileds<T extends object>(obj: T) {
  const ret: any = {};

  Object.entries(obj).map(([k, v]) => {
    if (typeof v !== "function") {
      ret[k] = v;
    }
  });

  return ret as NonFunctionFields<T>;
}

export type GetStoreState<T> = T extends { getState: () => infer U }
  ? NonFunctionFields<U>
  : never;

const LocalStateSetters = {
  [StoreKey.Chat]: useChatStore.setState,
  [StoreKey.Access]: useAccessStore.setState,
  [StoreKey.Config]: useAppConfig.setState,
  [StoreKey.Mask]: useMaskStore.setState,
  [StoreKey.Prompt]: usePromptStore.setState,
} as const;

const LocalStateGetters = {
  [StoreKey.Chat]: () => getNonFunctionFileds(useChatStore.getState()),
  [StoreKey.Access]: () => getNonFunctionFileds(useAccessStore.getState()),
  [StoreKey.Config]: () => getNonFunctionFileds(useAppConfig.getState()),
  [StoreKey.Mask]: () => getNonFunctionFileds(useMaskStore.getState()),
  [StoreKey.Prompt]: () => getNonFunctionFileds(usePromptStore.getState()),
} as const;

const LocalStatePersistOptions = {
  [StoreKey.Chat]: () => useChatStore.persist.getOptions(),
  [StoreKey.Access]: () => useAccessStore.persist.getOptions(),
  [StoreKey.Config]: () => useAppConfig.persist.getOptions(),
  [StoreKey.Mask]: () => useMaskStore.persist.getOptions(),
  [StoreKey.Prompt]: () => usePromptStore.persist.getOptions(),
} as const;

// the persist version of every store, saved next to their state
const STORE_VERSIONS_KEY = "store-versions";

export type AppState = {
  [k in keyof typeof LocalStateGetters]: ReturnType<
    (typeof LocalStateGetters)[k]
  >;
};

type Merger<T extends keyof AppState, U = AppState[T]> = (
  localState: U,
  remoteState: U,
  preferRemote: boolean,
) => U;

type StateMerger = {
  [K in keyof AppState]: Merger<K>;
};

// we merge remote state to local state
const MergeStates: StateMerger = {
  [StoreKey.Chat]: (localState, remoteState) => {
    const currentSessionId =
      localState.sessions[localState.currentSessionIndex]?.id;

    // merge sessions
    const localSessions: Record<string, ChatSession> = {};
    localState.sessions.forEach((s) => (localSessions[s.id] = s));

    (remoteState.sessions ?? []).forEach((remoteSession) => {
      // older messages may have been moved to `archivedMessages`
      const remoteMessages = [
        ...(remoteSession.archivedMessages ?? []),
        ...(remoteSession.messages ?? []),
      ];
      // skip empty chats
      if (remoteMessages.length === 0) return;

      const localSession = localSessions[remoteSession.id];
      if (!localSession) {
        // if remote session is new, just merge it
        localState.sessions.push(remoteSession);
        localSessions[remoteSession.id] = remoteSession;
      } else {
        // if both have the same session id, merge the messages
        const localMessageIds = new Set(
          [
            ...localSession.messages,
            ...(localSession.archivedMessages ?? []),
          ].map((v) => v.id),
        );
        const newMessages = remoteMessages.filter(
          (m) => !localMessageIds.has(m.id),
        );
        if (newMessages.length === 0) return;
        newMessages.forEach((m) => localSession.messages.push(m));

        // sort local messages with date field in asc order
        localSession.messages.sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        localSession.lastUpdate = Math.max(
          localSession.lastUpdate,
          remoteSession.lastUpdate ?? 0,
        );
      }
    });

    // sort local sessions with date field in desc order
    localState.sessions.sort(
      (a, b) =>
        new Date(b.lastUpdate).getTime() - new Date(a.lastUpdate).getTime(),
    );

    // keep the same session open after sorting
    localState.currentSessionIndex = Math.max(
      0,
      localState.sessions.findIndex((s) => s.id === currentSessionId),
    );

    return localState;
  },
  [StoreKey.Prompt]: (localState, remoteState) => {
    localState.prompts = {
      ...remoteState.prompts,
      ...localState.prompts,
    };
    return localState;
  },
  [StoreKey.Mask]: (localState, remoteState) => {
    localState.masks = {
      ...remoteState.masks,
      ...localState.masks,
    };
    return localState;
  },
  [StoreKey.Config]: mergeWithUpdate<AppState[StoreKey.Config]>,
  [StoreKey.Access]: mergeWithUpdate<AppState[StoreKey.Access]>,
};

export function getLocalAppState() {
  const appState = Object.fromEntries(
    Object.entries(LocalStateGetters).map(([key, getter]) => {
      return [key, getter()];
    }),
  ) as AppState;

  return appState;
}

export function setLocalAppState(appState: AppState) {
  Object.entries(LocalStateSetters).forEach(([key, setter]) => {
    setter(appState[key as keyof AppState]);
  });
}

function isStoreState(value: unknown): value is object {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Whether `value` looks like an exported `AppState`, i.e. has the state of at
 * least one store.
 */
function isAppState(value: unknown): value is Partial<AppState> {
  return (
    isStoreState(value) &&
    Object.keys(LocalStateGetters).some((key) =>
      isStoreState((value as Record<string, unknown>)[key]),
    )
  );
}

/**
 * Serializes `appState` for a backup file or cloud sync, together with the
 * persist version of every store so that `parseAppState` can migrate it.
 */
export function serializeAppState(appState: AppState) {
  const versions = Object.fromEntries(
    Object.entries(LocalStatePersistOptions).map(([key, getOptions]) => [
      key,
      getOptions().version ?? 0,
    ]),
  );

  return JSON.stringify({ ...appState, [STORE_VERSIONS_KEY]: versions });
}

/**
 * Parses state saved by `serializeAppState` and runs the stores' migrations on
 * the state saved by an older version, like rehydration does. State saved
 * without versions (by earlier releases, or by NextChat) is taken to be at the
 * current versions, running every migration on it could break it. Throws if
 * `text` isn't an exported state.
 */
export async function parseAppState(text: string) {
  const parsed: unknown = JSON.parse(text);
  if (!isAppState(parsed)) {
    throw new Error("not an exported app state");
  }

  const { [STORE_VERSIONS_KEY]: versions, ...appState } = parsed as Record<
    string,
    unknown
  >;
  for (const [key, getOptions] of Object.entries(LocalStatePersistOptions)) {
    const version = isStoreState(versions)
      ? (versions as Record<string, unknown>)[key]
      : undefined;
    const { version: currentVersion = 0, migrate } = getOptions();
    if (
      !isStoreState(appState[key]) ||
      typeof version !== "number" ||
      version >= currentVersion ||
      !migrate
    ) {
      continue;
    }
    appState[key] = await migrate(appState[key], version);
  }

  return appState as Partial<AppState>;
}

/**
 * Merges `remoteState` into `localState` and returns the result. Stores
 * missing from `remoteState` are left as they are. With `preferRemote`, the
 * remote config and access settings override the local ones even if they are
 * older, which is what restoring a backup file means.
 */
export function mergeAppState(
  localState: AppState,
  remoteState: Partial<AppState>,
  preferRemote = false,
) {
  Object.keys(localState).forEach(<T extends keyof AppState>(k: string) => {
    const key = k as T;
    const remoteStoreState = remoteState[key];
    if (!isStoreState(remoteStoreState)) return;

    // `_hasHydrated` belongs to this page, a stale `false` would stop the
    // merged state from being persisted
    const { _hasHydrated, ...remoteData } = remoteStoreState as AppState[T];
    localState[key] = MergeStates[key](
      localState[key],
      remoteData as AppState[T],
      preferRemote,
    );
  });

  return localState;
}

/**
 * Merge state with `lastUpdateTime`, older state will be override
 */
export function mergeWithUpdate<T extends { lastUpdateTime?: number }>(
  localState: T,
  remoteState: T,
  preferRemote = false,
): T {
  const localUpdateTime = localState.lastUpdateTime ?? 0;
  const remoteUpdateTime = remoteState.lastUpdateTime ?? 0;

  const [older, newer] =
    preferRemote || localUpdateTime < remoteUpdateTime
      ? [localState, remoteState]
      : [remoteState, localState];
  const merged = deepClone(older);
  merge(merged, newer);
  return merged;
}
