/**
 * remark plugin that turns inline citation markers in a reply, like [1],
 * [1][3] or [1, 3], into links to the message's citations (1-based, in the
 * order the Citations panel lists them).
 *
 * How providers number their citations (`ChatMessage.citations`):
 * - xAI (Responses API, xai.ts collectCitations): the url_citation
 *   annotations of the output text, in order of appearance, deduped by URL.
 *   Grok writes its inline citations as markdown links, `[[1]](url)`, with
 *   its own numbering, which can differ from the panel's after deduping.
 * - OpenAI Responses (openai.ts): url_citation annotations, in the same order
 *   and deduped the same way. The annotated text is usually an inline link
 *   such as `([example.com](url))`, not a number.
 * - Gemini (google.ts): the web groundingChunks in chunk order, deduped by
 *   URL. That order is the index groundingSupports refer to, but the text
 *   carries no markers by default.
 * - DeepSeek (deepseek.ts, the client-side web_search and web_fetch tools):
 *   every result of every search and every page read in the reply, deduped
 *   by URL. The tool results number each one as its position in that list,
 *   so DeepSeek's [n] markers match it.
 * So no provider but DeepSeek puts bare [n] markers in the text itself. The
 * system prompt (CITATION_SYSTEM_PROMPT) asks for them, and mapping [n] to
 * citations[n - 1] is best effort, since the model numbers the sources it has
 * seen itself.
 * Links that providers already write (`[[1]](url)`, `[1](url)`) keep their
 * own URL and only get the same styling.
 *
 * Only text nodes are rewritten, so code, inline code, math, existing links
 * and link references, and footnote references ([^1]) are left alone. Without
 * a definition, remark parses `[1]` as plain text. With one (`[1]: url`) it's
 * a linkReference and stays as the model wrote it.
 */
import type { Citation } from "../store/chat";

export const CITATION_LINK_CLASS = "citation-ref";

// [1], [12], [1, 3], [1,2]
const MARKER = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
// Text of a citation link a provider already wrote: [[1]](url), [1](url)
const LINK_MARKER = /^\[?\d+\]?$/;

// The few mdast fields this plugin reads and writes
interface MdastNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdastNode[];
  data?: { hProperties?: Record<string, unknown> };
}

/** Tooltip for a citation link: its title, or else the site's domain. */
export function getCitationTooltip(citation: Citation) {
  const title = citation.title?.trim();
  // Providers fall back to the URL when a source has no title
  if (title && title !== citation.url) return title;
  try {
    return new URL(citation.url).hostname.replace(/^www\./, "");
  } catch {
    return citation.url;
  }
}

function linkProperties() {
  return {
    className: [CITATION_LINK_CLASS],
    target: "_blank",
    rel: ["noopener", "noreferrer"],
  };
}

function citationLink(n: number, citation: Citation): MdastNode {
  return {
    type: "link",
    url: citation.url,
    title: getCitationTooltip(citation),
    children: [{ type: "text", value: `[${n}]` }],
    data: { hProperties: linkProperties() },
  };
}

// The nodes replacing a text node, or undefined when it has no marker that
// points to a citation. A marker with any index out of range stays text.
function splitText(value: string, citations: Citation[]) {
  const nodes: MdastNode[] = [];
  let last = 0;
  for (const match of value.matchAll(MARKER)) {
    const indexes = match[1].split(",").map(Number);
    if (!indexes.every((n) => n >= 1 && n <= citations.length)) continue;
    if (match.index! > last) {
      nodes.push({ type: "text", value: value.slice(last, match.index) });
    }
    indexes.forEach((n) => nodes.push(citationLink(n, citations[n - 1])));
    last = match.index! + match[0].length;
  }
  if (last === 0) return undefined;
  if (last < value.length) {
    nodes.push({ type: "text", value: value.slice(last) });
  }
  return nodes;
}

function styleExistingLink(link: MdastNode, citations: Citation[]) {
  const text = link.children?.length === 1 ? link.children[0] : undefined;
  if (text?.type !== "text" || !LINK_MARKER.test(text.value ?? "")) return;
  link.data = {
    ...link.data,
    hProperties: { ...link.data?.hProperties, ...linkProperties() },
  };
  const citation = citations.find((c) => c.url === link.url);
  if (citation && !link.title) link.title = getCitationTooltip(citation);
}

function visit(node: MdastNode, citations: Citation[]) {
  const children = node.children;
  if (!children) return;
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (child.type === "text") {
      const nodes = splitText(child.value ?? "", citations);
      if (nodes) {
        children.splice(i, 1, ...nodes);
        i += nodes.length - 1;
      }
    } else if (child.type === "link") {
      styleExistingLink(child, citations);
    } else if (child.type !== "linkReference") {
      visit(child, citations);
    }
  }
}

export function remarkCitationLinks(options: { citations?: Citation[] } = {}) {
  const citations = options.citations ?? [];
  return (tree: MdastNode) => {
    if (citations.length > 0) visit(tree, citations);
  };
}
