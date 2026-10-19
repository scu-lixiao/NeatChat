import { jest } from "@jest/globals";
import type { Citation } from "../../store/chat";
import {
  addSearchCitations,
  clampSearchQuery,
  DEEPSEEK_WEB_SEARCH_TOOL,
  formatBalanceAmount,
  formatSearchResults,
  getDeepSeekErrorMessage,
  getSearchQuestion,
  type DeepSeekSearchResult,
} from "../deepseek";

function result(
  url: string,
  extra: Partial<DeepSeekSearchResult> = {},
): DeepSeekSearchResult {
  return {
    rerank_score: 2,
    title: `Title of ${url}`,
    url,
    snippet: `Snippet of ${url}`,
    summary: `Summary of ${url}`,
    content: "",
    site_name: null,
    site_icon: null,
    date: null,
    authority: 3,
    ...extra,
  };
}

describe("DeepSeek search helpers", () => {
  test("clamps a query to 128 characters, counting code points", () => {
    expect(clampSearchQuery("  deepseek  ")).toBe("deepseek");
    expect(Array.from(clampSearchQuery("搜".repeat(200)))).toHaveLength(128);
    expect(Array.from(clampSearchQuery("😀".repeat(130)))).toHaveLength(128);
    expect(clampSearchQuery("   ")).toBe("");
  });

  test("passes the user's question only when it fits", () => {
    expect(getSearchQuestion("  今天的新闻？ ")).toBe("今天的新闻？");
    expect(getSearchQuestion("问".repeat(128))).toBe("问".repeat(128));
    expect(getSearchQuestion("问".repeat(129))).toBeUndefined();
    expect(getSearchQuestion("  ")).toBeUndefined();
  });

  test("numbers results by their place in the reply's citations", () => {
    const citations: Citation[] = [];

    const first = addSearchCitations(citations, [
      result("https://a.example"),
      result("https://b.example", { title: "", site_name: "B Site" }),
    ]);
    expect(first.map((item) => item.number)).toEqual([1, 2]);

    // A second search: a known URL keeps its number, duplicates and results
    // without a URL are dropped
    const second = addSearchCitations(citations, [
      result("https://c.example"),
      result("https://a.example"),
      result("https://c.example"),
      result(""),
    ]);
    expect(second.map((item) => item.number)).toEqual([3, 1]);

    expect(citations).toEqual([
      { title: "Title of https://a.example", url: "https://a.example" },
      { title: "B Site", url: "https://b.example" },
      { title: "Title of https://c.example", url: "https://c.example" },
    ]);
  });

  test("formats numbered results for the model", () => {
    const citations: Citation[] = [];
    const numbered = addSearchCitations(citations, [
      result("https://a.example", {
        site_name: "A News",
        date: "2026-10-17T08:30:00Z",
      }),
      result("https://b.example", { summary: "" }),
    ]);

    expect(formatSearchResults("q", numbered)).toBe(
      [
        "[1] Title of https://a.example",
        "URL: https://a.example",
        "A News · 2026-10-17",
        "Summary of https://a.example",
        "",
        "[2] Title of https://b.example",
        "URL: https://b.example",
        "Snippet of https://b.example",
      ].join("\n"),
    );
    expect(formatSearchResults("nothing", [])).toBe(
      'No results found for "nothing".',
    );
  });

  test("asks for inline [n] markers in the tool description", () => {
    expect(DEEPSEEK_WEB_SEARCH_TOOL.function.description).toContain("[1]");
    expect(DEEPSEEK_WEB_SEARCH_TOOL.function.parameters.required).toEqual([
      "query",
    ]);
  });
});

describe("DeepSeek balance helpers", () => {
  test("formats amounts with the currency symbol", () => {
    expect(formatBalanceAmount("CNY", "110.00")).toBe("¥110.00");
    expect(formatBalanceAmount("USD", "5.20")).toBe("$5.20");
    expect(formatBalanceAmount("EUR", "1.00")).toBe("1.00 EUR");
  });

  test("reads error messages from DeepSeek and proxy bodies", () => {
    expect(
      getDeepSeekErrorMessage(
        JSON.stringify({ error: { message: "Insufficient Balance" } }),
      ),
    ).toBe("Insufficient Balance");
    expect(
      getDeepSeekErrorMessage(
        JSON.stringify({ error: true, msg: "empty access code" }),
      ),
    ).toBe("empty access code");
    expect(getDeepSeekErrorMessage("Bad Gateway")).toBe("Bad Gateway");
  });
});

// The streamed chat goes through a mocked fetchEventSource; the Search and
// balance requests through the global fetch mock (jest.setup.ts).
const fetchEventSourceMock = jest.fn<(url: string, init: any) => any>();

let DeepSeekApi: any;
let useChatStore: any;

// Streams a fake chat completions response for one request
function replyWith(chunks: object[]) {
  return async (_url: string, init: any) => {
    const response = {
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "text/event-stream" }),
      clone: () => response,
      text: async () => "",
      json: async () => ({}),
    };
    await init.onopen?.(response);
    chunks.forEach(
      (chunk) => init.onmessage?.({ data: JSON.stringify(chunk) }),
    );
    init.onmessage?.({ data: "[DONE]" });
    init.onclose?.();
  };
}

const delta = (d: object, finish_reason: string | null = null) => ({
  choices: [{ index: 0, delta: d, finish_reason }],
});

const searchRound = [
  delta({ reasoning_content: "Need fresh news." }),
  delta({
    tool_calls: [
      {
        index: 0,
        id: "call_1",
        type: "function",
        function: { name: "web_search", arguments: '{"query":' },
      },
    ],
  }),
  delta({ tool_calls: [{ index: 0, function: { arguments: '"V4.1"}' } }] }),
  delta({}, "tool_calls"),
];

const answerRound = [
  delta({ reasoning_content: "Found it." }),
  delta({ content: "V4.1 shipped [1]." }),
  delta({}, "stop"),
];

const fetchMock = global.fetch as jest.Mock<any>;
const defaultFetch = fetchMock.getMockImplementation();

// Answers requests to `path` (other requests, like the access store's
// /api/config, get the default mock)
function respondTo(path: string, status: number, body: unknown) {
  fetchMock.mockImplementation((url: string, init: RequestInit) =>
    String(url).endsWith(path)
      ? Promise.resolve({
          ok: status < 300,
          status,
          statusText: "",
          text: () => Promise.resolve(JSON.stringify(body)),
        } as Response)
      : defaultFetch?.(url, init),
  );
}

function fetchCall(path: string) {
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith(path));
  if (!call) throw new Error(`no request to ${path}`);
  const [url, init] = call as [string, RequestInit];
  return { url, init };
}

async function waitFor(condition: () => boolean, timeoutMs = 2000) {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("DeepSeek web search tool loop", () => {
  const originalRequestAnimationFrame = global.requestAnimationFrame;
  const originalCancelAnimationFrame = global.cancelAnimationFrame;

  beforeAll(async () => {
    jest.unstable_mockModule("@fortaine/fetch-event-source", () => ({
      EventStreamContentType: "text/event-stream",
      fetchEventSource: fetchEventSourceMock,
    }));

    ({ DeepSeekApi } = await import("@/app/client/platforms/deepseek"));
    ({ useChatStore } = await import("@/app/store/chat"));

    global.requestAnimationFrame = ((callback: FrameRequestCallback) =>
      setTimeout(
        () => callback(performance.now()),
        0,
      ) as unknown as number) as typeof requestAnimationFrame;
    global.cancelAnimationFrame = ((id: number) =>
      clearTimeout(
        id as unknown as ReturnType<typeof setTimeout>,
      )) as typeof cancelAnimationFrame;
  });

  afterAll(() => {
    global.requestAnimationFrame = originalRequestAnimationFrame;
    global.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  beforeEach(() => {
    fetchEventSourceMock.mockReset();
    fetchMock.mockClear();
  });

  afterEach(() => {
    fetchMock.mockImplementation(defaultFetch!);
  });

  const history = [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "Hello!", thinkingContent: "Greet back." },
    { role: "user", content: "Any DeepSeek news?" },
    { role: "assistant", content: "From another model." },
    { role: "user", content: "最新的 DeepSeek 模型是什么？" },
  ];

  // Runs one chat with the session's model config patched
  async function chat(modelConfig: Record<string, unknown>) {
    const sessionConfig = useChatStore.getState().currentSession()
      .mask.modelConfig;
    const saved = { ...sessionConfig };
    Object.assign(sessionConfig, modelConfig);

    const options = {
      messages: history,
      config: {
        model: "deepseek-flash",
        providerName: "DeepSeek",
        stream: true,
      },
      onUpdate: jest.fn(),
      onThinkingUpdate: jest.fn(),
      onCitations: jest.fn(),
      onBeforeTool: jest.fn(),
      onAfterTool: jest.fn(),
      onFinish: jest.fn(),
      onError: jest.fn(),
    };
    try {
      await new DeepSeekApi().chat(options);
      await waitFor(() => options.onFinish.mock.calls.length > 0);
    } finally {
      Object.assign(sessionConfig, saved);
    }
    const requests = fetchEventSourceMock.mock.calls.map(([, init]) =>
      JSON.parse(init.body),
    );
    return { options, requests };
  }

  test("searches, numbers the sources and sends the reasoning back", async () => {
    fetchEventSourceMock
      .mockImplementationOnce(replyWith(searchRound))
      .mockImplementationOnce(replyWith(answerRound));
    respondTo("v1/tools/search", 200, {
      results: [result("https://news.example/v41", { title: "V4.1 released" })],
    });

    const { options, requests } = await chat({
      enableWebSearch: true,
      reasoningEffort: "high",
    });

    expect(options.onError).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);
    const [first, second] = requests;

    expect(first.tools.map((t: any) => t.function.name)).toEqual([
      "web_search",
    ]);
    // Every assistant message carries reasoning, a placeholder if it has none
    expect(
      first.messages.map((m: any) => [m.role, m.reasoning_content]),
    ).toEqual([
      ["user", undefined],
      ["assistant", "Greet back."],
      ["user", undefined],
      ["assistant", " "],
      ["user", undefined],
    ]);

    const search = fetchCall("v1/tools/search");
    expect(search.url).toBe("/api/deepseek/v1/tools/search");
    expect(JSON.parse(search.init.body as string)).toEqual({
      query: "V4.1",
      ori_question: "最新的 DeepSeek 模型是什么？",
    });

    // The tool round goes back with its reasoning, then the numbered results
    const toolCall = second.messages[5];
    expect(toolCall.role).toBe("assistant");
    expect(toolCall.reasoning_content).toBe("Need fresh news.");
    expect(toolCall.tool_calls[0].function).toEqual({
      name: "web_search",
      arguments: '{"query":"V4.1"}',
    });
    expect(second.messages[6]).toMatchObject({
      role: "tool",
      tool_call_id: "call_1",
    });
    expect(second.messages[6].content).toContain(
      "[1] V4.1 released\nURL: https://news.example/v41",
    );

    expect(options.onCitations).toHaveBeenLastCalledWith([
      { title: "V4.1 released", url: "https://news.example/v41" },
    ]);
    expect(options.onFinish.mock.calls[0][0]).toBe("V4.1 shipped [1].");
  });

  test("hands a failed search to the model as a tool error", async () => {
    fetchEventSourceMock
      .mockImplementationOnce(replyWith(searchRound))
      .mockImplementationOnce(replyWith(answerRound));
    respondTo("v1/tools/search", 402, {
      error: { message: "Insufficient Balance" },
    });

    const { options, requests } = await chat({
      enableWebSearch: true,
      reasoningEffort: "high",
    });

    expect(requests[1].messages[6].content).toBe("Insufficient Balance");
    expect(options.onAfterTool).toHaveBeenCalledWith(
      expect.objectContaining({ isError: true }),
    );
    expect(options.onCitations).not.toHaveBeenCalled();
  });

  test("sends no tools and no reasoning with web search off", async () => {
    fetchEventSourceMock.mockImplementationOnce(replyWith(answerRound));

    const { requests } = await chat({ enableWebSearch: false });

    expect(requests[0]).not.toHaveProperty("tools");
    expect(
      requests[0].messages.some((m: any) => "reasoning_content" in m),
    ).toBe(false);
  });

  test("sends no reasoning when thinking is off", async () => {
    fetchEventSourceMock.mockImplementationOnce(replyWith(answerRound));

    const { requests } = await chat({
      enableWebSearch: true,
      reasoningEffort: "none",
    });

    expect(requests[0].tools).toHaveLength(1);
    expect(
      requests[0].messages.some((m: any) => "reasoning_content" in m),
    ).toBe(false);
  });

  test("reads the balance with the DeepSeek key", async () => {
    const balance = {
      is_available: true,
      balance_infos: [
        {
          currency: "CNY",
          total_balance: "110.00",
          granted_balance: "10.00",
          topped_up_balance: "100.00",
        },
      ],
    };
    respondTo("user/balance", 200, balance);

    await expect(new DeepSeekApi().balance()).resolves.toEqual(balance);
    const { url, init } = fetchCall("user/balance");
    expect(url).toBe("/api/deepseek/user/balance");
    expect(init.method).toBe("GET");
  });

  test("reports a failed balance query", async () => {
    respondTo("user/balance", 403, {
      error: true,
      message: "balance query is disabled on this server",
    });

    await expect(new DeepSeekApi().balance()).rejects.toThrow(
      "balance query is disabled on this server",
    );
  });
});
