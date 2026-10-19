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

// The Search API takes query and ori_question of 1 to 128 Unicode characters
const SEARCH_TEXT_MAX_CHARS = 128;

// A function tool the client runs against the Search API. Results are
// numbered for the reply's [n] citation markers (see addSearchCitations).
export const DEEPSEEK_WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: DEEPSEEK_WEB_SEARCH_TOOL_NAME,
    description:
      "Search the web for current information: recent events, facts that may have changed, or anything you are unsure about. " +
      'The query supports site:example.com, -site:, "exact phrase", -term, lang:en, after:2026-01-01 and before: operators. ' +
      "Results are numbered. " +
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
 * Number search results for citing. A URL already in `citations` (from an
 * earlier search in the same reply) keeps its number, a new one is appended,
 * so result [n] is citations[n - 1], which is what [n] in the reply links to.
 */
export function addSearchCitations(
  citations: Citation[],
  results: DeepSeekSearchResult[],
) {
  const numbered: Array<{ number: number; result: DeepSeekSearchResult }> = [];

  for (const result of results) {
    if (!result.url) continue;

    let index = citations.findIndex((c) => c.url === result.url);
    if (index === -1) {
      index =
        citations.push({
          title: result.title || result.site_name || result.url,
          url: result.url,
        }) - 1;
    }

    if (!numbered.some((item) => item.number === index + 1)) {
      numbered.push({ number: index + 1, result });
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

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
};

export function formatBalanceAmount(currency: string, amount: string) {
  const symbol = CURRENCY_SYMBOLS[currency];
  return symbol ? `${symbol}${amount}` : `${amount} ${currency}`;
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
