import { ApiPath, STORAGE_KEY, StoreKey } from "../constant";
import { createPersistStore } from "../utils/store";
import {
  AppState,
  getLocalAppState,
  GetStoreState,
  mergeAppState,
  parseAppState,
  serializeAppState,
  setLocalAppState,
} from "../utils/sync";
import { downloadAs, readFromFile } from "../utils";
import { deepClone } from "../utils/clone";
import { flushPersist } from "../utils/indexedDB-storage";
import { showToast } from "../components/ui-lib";
import Locale from "../locales";
import { createSyncClient, ProviderType } from "../utils/cloud";

export interface WebDavConfig {
  server: string;
  username: string;
  password: string;
}

export type SyncStore = GetStoreState<typeof useSyncStore>;

const DEFAULT_SYNC_STATE = {
  provider: ProviderType.WebDAV,
  useProxy: true,
  proxyUrl: ApiPath.Cors as string,

  webdav: {
    endpoint: "",
    username: "",
    password: "",
  },

  upstash: {
    endpoint: "",
    username: STORAGE_KEY,
    apiKey: "",
  },

  lastSyncTime: 0,
  lastProvider: "",
};

export const useSyncStore = createPersistStore(
  DEFAULT_SYNC_STATE,
  (set, get) => ({
    cloudSync() {
      const config = get()[get().provider];
      return Object.values(config).every((c) => c.toString().length > 0);
    },

    markSyncTime() {
      set({ lastSyncTime: Date.now(), lastProvider: get().provider });
    },

    export() {
      const state = getLocalAppState();
      // "/" and ":" from the locale date aren't allowed in file names
      const datePart =
        `${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`.replace(
          /[\\/:*?"<>|,]/g,
          "_",
        );

      const fileName = `Backup-${datePart}.json`;
      downloadAs(serializeAppState(state), fileName);
    },

    async import() {
      try {
        const remoteState = await parseAppState(await readFromFile());
        // merge into a copy, so a bad file can't leave the stores half merged
        const localState = deepClone(getLocalAppState()) as AppState;
        setLocalAppState(mergeAppState(localState, remoteState, true));
        // writes are coalesced, they must land before the page goes away
        await flushPersist();
        location.reload();
      } catch (e) {
        console.error("[Import]", e);
        showToast(Locale.Settings.Sync.ImportFailed);
      }
    },

    getClient() {
      const provider = get().provider;
      const client = createSyncClient(provider, get());
      return client;
    },

    async sync() {
      const localState = deepClone(getLocalAppState()) as AppState;
      const provider = get().provider;
      const config = get()[provider];
      const client = this.getClient();

      try {
        const remoteState = await client.get(config.username);
        if (!remoteState || remoteState === "") {
          await client.set(config.username, serializeAppState(localState));
          console.log(
            "[Sync] Remote state is empty, using local state instead.",
          );
          this.markSyncTime();
          return;
        } else {
          const parsedRemoteState = await parseAppState(remoteState);
          mergeAppState(localState, parsedRemoteState);
          setLocalAppState(localState);
        }
      } catch (e) {
        console.log("[Sync] failed to get remote state", e);
        throw e;
      }

      await client.set(config.username, serializeAppState(localState));

      this.markSyncTime();
    },

    async check() {
      const client = this.getClient();
      return await client.check();
    },
  }),
  {
    name: StoreKey.Sync,
    version: 1.2,

    migrate(persistedState, version) {
      const newState = persistedState as typeof DEFAULT_SYNC_STATE;

      if (version < 1.1) {
        newState.upstash.username = STORAGE_KEY;
      }

      if (version < 1.2) {
        if (
          (persistedState as typeof DEFAULT_SYNC_STATE).proxyUrl ===
          "/api/cors/"
        ) {
          newState.proxyUrl = "";
        }
      }

      return newState as any;
    },
  },
);
