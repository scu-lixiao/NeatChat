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
// How much page content one reply reads in all (three full pages): every
// later round of the reply sends the pages again
export const FETCH_TOTAL_MAX_CHARS = 3 * FETCH_CONTENT_MAX_CHARS;
// How long a Search or Fetch call may take before it fails as a tool error
export const DEEPSEEK_TOOL_TIMEOUT_MS = 60 * 1000;

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
      `Only URLs from the user's messages or from earlier ${DEEPSEEK_WEB_SEARCH_TOOL_NAME} and ${DEEPSEEK_WEB_FETCH_TOOL_NAME} results can be read; search for any other page first. ` +
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

const IPV4_OCTET = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`^${IPV4_OCTET}(\\.${IPV4_OCTET}){3}$`);

/**
 * The setting as the Search API's localization, an IPv4 or IPv6 address whose
 * region the results are localized to. Left out when it isn't an address,
 * since the API would fail every search for it.
 */
export function getSearchLocalization(value?: string) {
  const ip = (value ?? "").trim();
  if (IPV4.test(ip)) return ip;
  // The URL parser checks IPv6 syntax; anything but hex digits, colons and
  // dots (a bracket, a port, a zone ID) isn't a bare address
  if (ip.includes(":") && /^[\da-f:.]+$/i.test(ip)) {
    try {
      new URL(`http://[${ip}]/`);
      return ip;
    } catch {}
  }
  return undefined;
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
 * The URL to send the Fetch API, as the URL parser normalizes it (the string
 * that was checked), or why the API won't read it: it takes http and https
 * URLs with a host and no credentials, of up to 8192 characters
 */
export function getFetchableUrl(
  url: string,
): { url: string } | { error: string } {
  const trimmed = url.trim();
  if (!trimmed) return { error: "url must not be empty" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { error: "url must be an absolute URL" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { error: "url must be an http or https URL" };
  }
  if (!parsed.hostname) return { error: "url must have a host" };
  if (parsed.username || parsed.password) {
    return { error: "url must not contain credentials" };
  }
  if (parsed.href.length > FETCH_URL_MAX_CHARS) {
    return { error: `url must be at most ${FETCH_URL_MAX_CHARS} characters` };
  }
  return { url: parsed.href };
}

/**
 * Whether a URL appears in the sources (the user's messages, earlier search
 * and fetch results). Reading only those keeps an injected instruction from
 * sending conversation data out in a URL the model makes up. Any part of a
 * source counts, so a URL typed without its scheme, with text right after
 * it, or encoded differently still matches.
 */
export function isUrlInSources(
  url: string,
  normalizedUrl: string,
  sources: string[],
) {
  const forms = new Set<string>();
  for (const form of [url, normalizedUrl, safeDecodeURI(normalizedUrl)]) {
    const bare = form
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/\/+$/, "")
      .toLowerCase();
    if (bare) forms.add(bare);
  }
  const text = sources.join("\n").toLowerCase();
  return [...forms].some((form) => text.includes(form));
}

function safeDecodeURI(url: string) {
  try {
    return decodeURI(url);
  } catch {
    return url;
  }
}

/**
 * The tool result the model reads, cut to maxChars without splitting a
 * surrogate pair
 */
export function formatFetchedPage(
  number: number,
  url: string,
  page: DeepSeekFetchResult,
  maxChars = FETCH_CONTENT_MAX_CHARS,
) {
  const content = (page.content ?? "").trim();
  let shown = content.slice(0, maxChars);
  if (/[\uD800-\uDBFF]$/.test(shown)) {
    shown = shown.slice(0, -1);
  }
  const truncated = shown.length < content.length;

  return [
    `[${number}] ${page.title || url}`,
    `URL: ${url}`,
    "",
    shown,
    truncated
      ? `\n[Truncated: the first ${shown.length} of ${content.length} characters]`
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
