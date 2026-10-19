import { CITATION_SYSTEM_PROMPT } from "../constant";
import type { Citation } from "../store/chat";

// POST /v1/tools/search, https://api-docs.deepseek.com/api/search
export interface DeepSeekSearchResult {
  // 0 to 3, 1.5 and above is high quality
  rerank_score: number;
  title: string;
  url: string;
  // ~100-200 characters, for display
  snippet: string;
  // ~600-800 characters, for the model to read
  summary: string;
  // empty unless need_content is set
  content: string;
  site_name: string | null;
  site_icon: string | null;
  // RFC 3339, UTC
  date: string | null;
  // -1 (unknown) to 4
  authority: number;
}

// POST /v1/tools/fetch, https://api-docs.deepseek.com/api/fetch
export interface DeepSeekFetchResult {
  // empty when the page has none
  title: string;
  // the page as Markdown
  content: string;
}

// GET /user/balance, https://api-docs.deepseek.com/api/get-user-balance
export interface DeepSeekBalance {
  // whether the balance covers API calls
  is_available: boolean;
  balance_infos: Array<{
    currency: string;
    // granted + topped up
    total_balance: string;
    granted_balance: string;
    topped_up_balance: string;
  }>;
}

export const DEEPSEEK_WEB_SEARCH_TOOL_NAME = "web_search";
export const DEEPSEEK_WEB_FETCH_TOOL_NAME = "web_fetch";

// The Search API takes query and ori_question of 1 to 128 Unicode characters
const SEARCH_TEXT_MAX_CHARS = 128;
// The Fetch API takes URLs of up to 8192 characters
const FETCH_URL_MAX_CHARS = 8192;
// How much of a fetched page the model reads, so one long page doesn't
// crowd out the rest of the context
export const FETCH_CONTENT_MAX_CHARS = 20000;

// Function tools the client runs against the Search and Fetch APIs. Results
// are numbered for the reply's [n] citation markers (see citeSource).
export const DEEPSEEK_WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: DEEPSEEK_WEB_SEARCH_TOOL_NAME,
    description:
      "Search the web for current information: recent events, facts that may have changed, or anything you are unsure about. " +
      'The query supports site:example.com, -site:, "exact phrase", -term, lang:en, after:2026-01-01 and before: operators. ' +
      `Results are numbered and summarized; read one in full with ${DEEPSEEK_WEB_FETCH_TOOL_NAME}. ` +
      CITATION_SYSTEM_PROMPT,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: `Search query, at most ${SEARCH_TEXT_MAX_CHARS} characters`,
        },
      },
      required: ["query"],
    },
  },
};

export const DEEPSEEK_WEB_FETCH_TOOL = {
  type: "function",
  function: {
    name: DEEPSEEK_WEB_FETCH_TOOL_NAME,
    description:
      "Read a web page and get its title and content as Markdown: a search result in full, or a page the user links to. " +
      "Some sites refuse to be read. The page is numbered like search results; cite it inline by its number.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The http or https URL of the page",
        },
      },
      required: ["url"],
    },
  },
};

/** A search query cut to the length the Search API accepts */
export function clampSearchQuery(query: string) {
  return Array.from(query.trim())
    .slice(0, SEARCH_TEXT_MAX_CHARS)
    .join("")
    .trim();
}

/**
 * The user's question as the Search API's ori_question, which helps it
 * understand the query. Left out when it's longer than the API accepts, since
 * the start of a long message (a pasted document, say) rarely is the question.
 */
export function getSearchQuestion(text: string) {
  const question = text.trim();
  const length = Array.from(question).length;
  return length > 0 && length <= SEARCH_TEXT_MAX_CHARS ? question : undefined;
}

/**
 * The number of a source for citing. A URL already in `citations` (from an
 * earlier search or fetch in the same reply) keeps its number, a new one is
 * appended, so source [n] is citations[n - 1], which is what [n] in the reply
 * links to.
 */
export function citeSource(citations: Citation[], url: string, title: string) {
  let index = citations.findIndex((c) => c.url === url);
  if (index === -1) {
    index = citations.push({ title: title || url, url }) - 1;
  }
  return index + 1;
}

/** Number search results for citing, see citeSource */
export function addSearchCitations(
  citations: Citation[],
  results: DeepSeekSearchResult[],
) {
  const numbered: Array<{ number: number; result: DeepSeekSearchResult }> = [];

  for (const result of results) {
    if (!result.url) continue;

    const number = citeSource(
      citations,
      result.url,
      result.title || result.site_name || "",
    );
    if (!numbered.some((item) => item.number === number)) {
      numbered.push({ number, result });
    }
  }

  return numbered;
}

/** The tool result the model reads */
export function formatSearchResults(
  query: string,
  numbered: ReturnType<typeof addSearchCitations>,
) {
  if (numbered.length === 0) {
    return `No results found for "${query}".`;
  }

  return numbered
    .map(({ number, result }) =>
      [
        `[${number}] ${result.title || result.url}`,
        `URL: ${result.url}`,
        [result.site_name, result.date?.slice(0, 10)]
          .filter(Boolean)
          .join(" · "),
        result.summary || result.snippet,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n\n");
}

/**
 * A URL the Fetch API accepts (http or https, with a host, no credentials),
 * or undefined
 */
export function getFetchableUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed || trimmed.length > FETCH_URL_MAX_CHARS) return undefined;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return undefined;
  }

  const fetchable =
    (parsed.protocol === "http:" || parsed.protocol === "https:") &&
    !!parsed.hostname &&
    !parsed.username &&
    !parsed.password;
  return fetchable ? trimmed : undefined;
}

/** The tool result the model reads, cut to FETCH_CONTENT_MAX_CHARS */
export function formatFetchedPage(
  number: number,
  url: string,
  page: DeepSeekFetchResult,
) {
  const content = (page.content ?? "").trim();
  const truncated = content.length > FETCH_CONTENT_MAX_CHARS;

  return [
    `[${number}] ${page.title || url}`,
    `URL: ${url}`,
    "",
    truncated ? content.slice(0, FETCH_CONTENT_MAX_CHARS) : content,
    truncated
      ? `\n[Truncated: the first ${FETCH_CONTENT_MAX_CHARS} of ${content.length} characters]`
      : "",
  ]
    .join("\n")
    .trim();
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
};

export function formatBalanceAmount(currency: string, amount: string) {
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
}

/**
 * An endpoint under a DeepSeek base URL. The Search and Fetch paths start with
 * v1/, so a base URL given as https://api.deepseek.com/v1 (which chat accepts)
 * would otherwise end up at /v1/v1/tools/search.
 */
export function joinDeepSeekUrl(baseUrl: string, path: string) {
  const base = baseUrl.replace(/\/+$/, "");
  let rest = path.replace(/^\/+/, "");
  if (base.endsWith("/v1") && rest.startsWith("v1/")) {
    rest = rest.slice("v1/".length);
  }
  return `${base}/${rest}`;
}

/**
 * The message of an error body: DeepSeek's `{ error: { message } }`, or the
 * proxy's `{ error: true, message | msg }`
 */
export function getDeepSeekErrorMessage(body: string) {
  try {
    const json = JSON.parse(body);
    return json?.error?.message ?? json?.message ?? json?.msg ?? body;
  } catch {
    return body;
  }
}
