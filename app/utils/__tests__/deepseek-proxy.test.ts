/** @jest-environment node */
import { jest } from "@jest/globals";
import { NextRequest } from "next/server";

const SERVER_KEY = "sk-server";
const BASE_ENV = { CODE: "secret", DEEPSEEK_API_KEY: SERVER_KEY };

type Upstream = { url: string; authorization: string };

// The route reads its server config when the module loads, so every case
// imports it afresh under its own env
async function callProxy(
  env: Record<string, string>,
  path: string,
  authorization: string,
) {
  const savedEnv = process.env;
  process.env = { ...savedEnv, ...env };
  const upstream: Upstream[] = [];
  global.fetch = jest.fn(async (url: any, init: any) => {
    upstream.push({ url, authorization: init.headers.Authorization });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  try {
    jest.resetModules();
    const { handle } = await import("@/app/api/deepseek");
    const req = new NextRequest(`http://localhost${path}`, {
      method: "GET",
      headers: { Authorization: authorization },
    });
    const res = await handle(req, { params: { path: [] } });
    return { status: res.status, upstream };
  } finally {
    process.env = savedEnv;
  }
}

beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
});

describe("DeepSeek proxy balance query", () => {
  test.each([
    ["an access code", "Bearer nk-secret"],
    // auth() strips every "Bearer ", so this is still the access code
    ["an access code behind a repeated Bearer", "Bearer Bearer nk-secret"],
    ["no key", ""],
  ])(
    "refuses the server key's balance for %s",
    async (_name, authorization) => {
      const res = await callProxy(
        BASE_ENV,
        "/api/deepseek/user/balance",
        authorization,
      );
      expect(res.status).toBe(403);
      expect(res.upstream).toEqual([]);
    },
  );

  test("forwards the user's own key", async () => {
    const res = await callProxy(
      BASE_ENV,
      "/api/deepseek/user/balance",
      "Bearer sk-user",
    );
    expect(res.status).toBe(200);
    expect(res.upstream).toEqual([
      {
        url: "https://api.deepseek.com/user/balance",
        authorization: "Bearer sk-user",
      },
    ]);
  });

  test("answers with the server key when ENABLE_BALANCE_QUERY is set", async () => {
    const res = await callProxy(
      { ...BASE_ENV, ENABLE_BALANCE_QUERY: "1" },
      "/api/deepseek/user/balance",
      "Bearer nk-secret",
    );
    expect(res.status).toBe(200);
    expect(res.upstream).toEqual([
      {
        url: "https://api.deepseek.com/user/balance",
        authorization: `Bearer ${SERVER_KEY}`,
      },
    ]);
  });
});

describe("DeepSeek proxy upstream URL", () => {
  test.each([
    ["https://api.deepseek.com", "https://api.deepseek.com/v1/tools/search"],
    ["https://api.deepseek.com/v1", "https://api.deepseek.com/v1/tools/search"],
    ["api.deepseek.com/v1/", "https://api.deepseek.com/v1/tools/search"],
  ])("DEEPSEEK_URL %s", async (deepseekUrl, expected) => {
    const res = await callProxy(
      { ...BASE_ENV, DEEPSEEK_URL: deepseekUrl },
      "/api/deepseek/v1/tools/search",
      "Bearer sk-user",
    );
    expect(res.upstream.map((u) => u.url)).toEqual([expected]);
  });

  test("keeps chat under a /v1 base URL", async () => {
    const res = await callProxy(
      { ...BASE_ENV, DEEPSEEK_URL: "https://api.deepseek.com/v1" },
      "/api/deepseek/chat/completions",
      "Bearer sk-user",
    );
    expect(res.upstream.map((u) => u.url)).toEqual([
      "https://api.deepseek.com/v1/chat/completions",
    ]);
  });
});
