import { STORAGE_KEY } from "@/app/constant";
import { SyncStore } from "@/app/store/sync";
import { getClientConfig } from "@/app/config/client";
import { fetch as directFetch } from "@/app/utils/stream";

export type WebDAVConfig = SyncStore["webdav"];
export type WebDavClient = ReturnType<typeof createWebDavClient>;

export function createWebDavClient(store: SyncStore) {
  const folder = STORAGE_KEY;
  const fileName = `${folder}/backup.json`;
  const config = store.webdav;
  const proxyUrl =
    store.useProxy && store.proxyUrl.length > 0 ? store.proxyUrl : undefined;
  // export builds (static hosting, Tauri) ship without the /api/webdav proxy,
  // so unless a proxy server is set they talk to the endpoint directly
  const direct = getClientConfig()?.buildMode === "export" && !proxyUrl;

  return {
    async check() {
      try {
        const res = await this.request(folder, "MKCOL");
        const success = [201, 200, 404, 405, 301, 302, 307, 308].includes(
          res.status,
        );
        console.log(
          `[WebDav] check ${success ? "success" : "failed"}, ${res.status} ${
            res.statusText
          }`,
        );
        return success;
      } catch (e) {
        console.error("[WebDav] failed to check", e);
      }

      return false;
    },

    async get(key: string) {
      const res = await this.request(fileName, "GET");

      console.log("[WebDav] get key = ", key, res.status, res.statusText);

      if (404 == res.status) {
        return "";
      }
      if (!res.ok) {
        throw new Error(`[WebDav] get failed, ${res.status} ${res.statusText}`);
      }

      return await res.text();
    },

    async set(key: string, value: string) {
      let res = await this.request(fileName, "PUT", value);
      // the backup folder doesn't exist yet
      if (res.status === 409 || res.status === 404) {
        await this.request(folder, "MKCOL");
        res = await this.request(fileName, "PUT", value);
      }

      console.log("[WebDav] set key = ", key, res.status, res.statusText);

      if (!res.ok) {
        throw new Error(`[WebDav] set failed, ${res.status} ${res.statusText}`);
      }
    },

    request(path: string, method: string, body?: string) {
      if (direct) {
        // goes through tauri in the app, so it isn't bound by CORS there
        return directFetch(this.directPath(path), {
          method,
          headers: this.headers(),
          body,
        });
      }

      // the proxy route only takes GET and PUT, others ride on proxy_method
      const proxied = method === "GET" || method === "PUT";
      return fetch(this.path(path, proxyUrl, proxied ? "" : method), {
        method: proxied ? method : "GET",
        headers: this.headers(),
        body,
      });
    },

    headers() {
      const auth = btoa(config.username + ":" + config.password);

      return {
        authorization: `Basic ${auth}`,
      };
    },
    directPath(path: string) {
      const endpoint = config.endpoint.endsWith("/")
        ? config.endpoint
        : config.endpoint + "/";
      // a relative endpoint (e.g. /dav/ behind the same nginx) is same-origin
      return new URL(path, new URL(endpoint, location.href)).toString();
    },
    path(path: string, proxyUrl: string = "", proxyMethod: string = "") {
      if (path.startsWith("/")) {
        path = path.slice(1);
      }

      if (proxyUrl.endsWith("/")) {
        proxyUrl = proxyUrl.slice(0, -1);
      }

      let url;
      const pathPrefix = "/api/webdav/";

      try {
        let u = new URL(proxyUrl + pathPrefix + path);
        // add query params
        u.searchParams.append("endpoint", config.endpoint);
        proxyMethod && u.searchParams.append("proxy_method", proxyMethod);
        url = u.toString();
      } catch (e) {
        url = pathPrefix + path + "?endpoint=" + config.endpoint;
        if (proxyMethod) {
          url += "&proxy_method=" + proxyMethod;
        }
      }

      return url;
    },
  };
}
