import { jest } from "@jest/globals";
import { createWebDavClient } from "../cloud/webdav";
import type { SyncStore } from "@/app/store/sync";

const fetchMock = global.fetch as jest.Mock<any>;

function setBuildMode(buildMode: string) {
  document.head.innerHTML = `<meta name="config" content='${JSON.stringify({
    buildMode,
  })}'>`;
}

function createClient(sync: Partial<SyncStore> = {}) {
  return createWebDavClient({
    useProxy: true,
    proxyUrl: "",
    webdav: { endpoint: "/dav/home", username: "u", password: "p" },
    ...sync,
  } as SyncStore);
}

// answers each request with the next status
function replyWith(...statuses: number[]) {
  fetchMock.mockImplementation(async () => {
    const status = statuses.shift() ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: String(status),
      text: async () => (status === 200 ? "{}" : "error page"),
    };
  });
}

function calls() {
  return fetchMock.mock.calls.map(([url, init]: any[]) => [init.method, url]);
}

beforeEach(() => fetchMock.mockReset());

describe("webdav client in export builds", () => {
  beforeEach(() => setBuildMode("export"));

  it("talks to a relative endpoint directly with real methods", async () => {
    replyWith(201, 404, 201);
    const client = createClient();

    expect(await client.check()).toBe(true);
    expect(await client.get("k")).toBe("");
    await client.set("k", "{}");

    expect(calls()).toEqual([
      ["MKCOL", "http://localhost/dav/home/chatgpt-next-web"],
      ["GET", "http://localhost/dav/home/chatgpt-next-web/backup.json"],
      ["PUT", "http://localhost/dav/home/chatgpt-next-web/backup.json"],
    ]);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { authorization: `Basic ${btoa("u:p")}` },
    });
  });

  it("creates the backup folder when the first upload has nowhere to go", async () => {
    replyWith(409, 201, 201);
    const client = createClient({
      webdav: {
        endpoint: "http://192.168.31.172:5005/home/",
        username: "u",
        password: "p",
      },
    });

    await client.set("k", "{}");

    expect(calls()).toEqual([
      ["PUT", "http://192.168.31.172:5005/home/chatgpt-next-web/backup.json"],
      ["MKCOL", "http://192.168.31.172:5005/home/chatgpt-next-web"],
      ["PUT", "http://192.168.31.172:5005/home/chatgpt-next-web/backup.json"],
    ]);
  });

  it("reports failed requests instead of parsing the error page", async () => {
    replyWith(401, 403);
    const client = createClient();

    await expect(client.get("k")).rejects.toThrow("401");
    await expect(client.set("k", "{}")).rejects.toThrow("403");
  });

  it("still goes through a configured proxy server", async () => {
    replyWith(200);
    const client = createClient({ proxyUrl: "https://chat.example.com" });

    await client.get("k");

    expect(calls()).toEqual([
      [
        "GET",
        "https://chat.example.com/api/webdav/chatgpt-next-web/backup.json?endpoint=%2Fdav%2Fhome",
      ],
    ]);
  });
});

describe("webdav client in standalone builds", () => {
  beforeEach(() => setBuildMode("standalone"));

  it("goes through the built-in /api/webdav proxy", async () => {
    replyWith(201, 200, 201);
    const client = createClient();

    await client.check();
    await client.get("k");
    await client.set("k", "{}");

    expect(calls()).toEqual([
      [
        "GET",
        "/api/webdav/chatgpt-next-web?endpoint=/dav/home&proxy_method=MKCOL",
      ],
      ["GET", "/api/webdav/chatgpt-next-web/backup.json?endpoint=/dav/home"],
      ["PUT", "/api/webdav/chatgpt-next-web/backup.json?endpoint=/dav/home"],
    ]);
  });
});
