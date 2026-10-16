import { render } from "@testing-library/react";
import type { Citation } from "@/app/store/chat";

type CitationLinks = typeof import("@/app/utils/citation-links");

// react-markdown and the remark plugins are ESM-only, so load them the same
// way the other ESM tests load their modules
let ReactMarkdown: typeof import("react-markdown").default;
let REMARK_PLUGINS: any[];
let remarkCitationLinks: CitationLinks["remarkCitationLinks"];
let getCitationTooltip: CitationLinks["getCitationTooltip"];

const CITATIONS: Citation[] = [
  { title: "First source", url: "https://example.com/1" },
  { title: "https://www.second.org/page", url: "https://www.second.org/page" },
  { title: "", url: "https://third.net/a?b=c" },
];

function renderMarkdown(content: string, citations?: Citation[]) {
  const { container } = render(
    <ReactMarkdown
      remarkPlugins={[...REMARK_PLUGINS, [remarkCitationLinks, { citations }]]}
    >
      {content}
    </ReactMarkdown>,
  );
  return container;
}

const citationLinks = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLAnchorElement>("a.citation-ref"));

// [text, href] of each citation link
const describeLinks = (container: HTMLElement) =>
  citationLinks(container).map((a) => [a.textContent, a.getAttribute("href")]);

describe("remarkCitationLinks", () => {
  beforeAll(async () => {
    ReactMarkdown = (await import("react-markdown")).default;
    // The remark plugins app/components/markdown.tsx uses, in the same order
    REMARK_PLUGINS = [
      (await import("remark-math")).default,
      (await import("remark-gfm")).default,
      (await import("remark-breaks")).default,
    ];
    const plugin = await import("@/app/utils/citation-links");
    remarkCitationLinks = plugin.remarkCitationLinks;
    getCitationTooltip = plugin.getCitationTooltip;
  });

  test("links [1] and [1][3] to the 1-based citation", () => {
    const container = renderMarkdown(
      "Fact one [1]. Facts [1][3] here.",
      CITATIONS,
    );
    const links = citationLinks(container);

    expect(links.map((a) => a.textContent)).toEqual(["[1]", "[1]", "[3]"]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "https://example.com/1",
      "https://example.com/1",
      "https://third.net/a?b=c",
    ]);
    for (const link of links) {
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
    expect(container.textContent).toBe("Fact one [1]. Facts [1][3] here.");
  });

  test("links each index of [1, 3] and [1,2]", () => {
    const container = renderMarkdown("See [1, 3] and [1,2].", CITATIONS);

    expect(describeLinks(container)).toEqual([
      ["[1]", "https://example.com/1"],
      ["[3]", "https://third.net/a?b=c"],
      ["[1]", "https://example.com/1"],
      ["[2]", "https://www.second.org/page"],
    ]);
  });

  test("links markers inside emphasis, lists and tables", () => {
    const container = renderMarkdown(
      "**bold [1]**\n\n- item [2]\n\n| a |\n| - |\n| cell [3] |",
      CITATIONS,
    );
    expect(citationLinks(container).map((a) => a.textContent)).toEqual([
      "[1]",
      "[2]",
      "[3]",
    ]);
  });

  test("tooltip is the citation title, else its domain", () => {
    const container = renderMarkdown("[1] [2] [3]", CITATIONS);

    expect(citationLinks(container).map((a) => a.title)).toEqual([
      "First source",
      "second.org",
      "third.net",
    ]);
    expect(getCitationTooltip({ title: "  ", url: "not a url" })).toBe(
      "not a url",
    );
  });

  test("skips inline code and fenced code", () => {
    const container = renderMarkdown(
      "Use `arr[1]` here.\n\n```js\nconst x = list[2];\n```\n\n    indented [3]",
      CITATIONS,
    );

    expect(citationLinks(container)).toHaveLength(0);
    expect(container.querySelectorAll("a")).toHaveLength(0);
    expect(container.textContent).toContain("arr[1]");
    expect(container.textContent).toContain("list[2]");
    expect(container.textContent).toContain("indented [3]");
  });

  test("leaves out-of-range and zero markers as text", () => {
    const container = renderMarkdown(
      "Out [9], zero [0], mixed [1, 9], year [2024].",
      CITATIONS.slice(0, 2),
    );

    expect(citationLinks(container)).toHaveLength(0);
    expect(container.textContent).toBe(
      "Out [9], zero [0], mixed [1, 9], year [2024].",
    );
  });

  test("leaves markdown links, link references and footnotes as they are", () => {
    const container = renderMarkdown(
      [
        "A [docs](https://docs.dev) link, a ref [1] and a note[^1].",
        "",
        "[1]: https://defined.dev",
        "",
        "[^1]: The note [2].",
      ].join("\n"),
      CITATIONS,
    );

    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => [
      a.textContent,
      a.getAttribute("href"),
      a.className,
    ]);
    expect(hrefs).toContainEqual(["docs", "https://docs.dev", ""]);
    // [1] has a definition, so it's a link reference to it
    expect(hrefs).toContainEqual(["1", "https://defined.dev", ""]);
    expect(container.querySelector("a[data-footnote-ref]")).not.toBeNull();
    // Text inside the footnote itself is still linked
    expect(citationLinks(container).map((a) => a.textContent)).toEqual(["[2]"]);
  });

  test("styles provider-written citation links but keeps their URL", () => {
    const container = renderMarkdown(
      "Grok [[1]](https://example.com/1) and [2](https://elsewhere.dev).",
      CITATIONS,
    );
    const links = citationLinks(container);

    expect(describeLinks(container)).toEqual([
      ["[1]", "https://example.com/1"],
      ["2", "https://elsewhere.dev"],
    ]);
    expect(links[0].title).toBe("First source");
    // Not a known citation: no tooltip, but the same look
    expect(links[1].title).toBe("");
    expect(links[1].getAttribute("rel")).toBe("noopener noreferrer");
  });

  test("does nothing without citations", () => {
    for (const citations of [undefined, []]) {
      const container = renderMarkdown(
        "Fact [1] and [[1]](https://example.com/1).",
        citations,
      );
      expect(citationLinks(container)).toHaveLength(0);
      expect(container.textContent).toBe("Fact [1] and [1].");
    }
  });
});
