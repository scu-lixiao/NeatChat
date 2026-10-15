import { jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";

let Citations: typeof import("@/app/components/citations").Citations;
let getMessageView: typeof import("@/app/utils/chat-render").getMessageView;

const CITATIONS = [
  { title: "First source", url: "https://example.com/1" },
  { title: "Second source", url: "https://example.com/2" },
];

describe("Citations", () => {
  beforeAll(async () => {
    jest.unstable_mockModule("@/app/locales", () => ({
      default: {
        Chat: {
          Citations: {
            Title: "Citations",
            Expand: "Expand",
            Collapse: "Collapse",
          },
        },
      },
    }));
    // Local class names as they are, so the tests can check them
    jest.unstable_mockModule("@/app/components/citations.module.scss", () => ({
      default: new Proxy({}, { get: (_target, key) => key }),
    }));

    ({ Citations } = await import("@/app/components/citations"));
    ({ getMessageView } = await import("@/app/utils/chat-render"));
  });

  function header() {
    return screen.getByRole("button", { name: /Citations \(2\)/ });
  }

  function content(container: HTMLElement) {
    return container.querySelector("[data-expanded]") as HTMLElement;
  }

  // Collapsed: the CSS clips and hides the content (max-height: 0, overflow
  // and visibility hidden), which jsdom can't apply. These are the hooks it
  // hangs on, and what assistive technology sees.
  function expectCollapsed(container: HTMLElement) {
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(header()).toHaveTextContent("Expand");
    expect(content(container)).toHaveAttribute("data-expanded", "false");
    expect(content(container)).toHaveAttribute("aria-hidden", "true");
    expect(content(container)).toHaveClass("citations-content");
    expect(content(container)).not.toHaveClass("expanded");
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  }

  function expectExpanded(container: HTMLElement) {
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(header()).toHaveTextContent("Collapse");
    expect(content(container)).toHaveAttribute("data-expanded", "true");
    expect(content(container)).toHaveAttribute("aria-hidden", "false");
    expect(content(container)).toHaveClass("citations-content", "expanded");
    expect(
      screen.getAllByRole("link").map((link) => link.getAttribute("href")),
    ).toEqual(CITATIONS.map((citation) => citation.url));
  }

  test("starts collapsed and toggles open and closed", () => {
    const onToggle = jest.fn();
    const { container } = render(
      <Citations
        citations={CITATIONS}
        messageId="toggle"
        onToggle={onToggle}
      />,
    );

    expectCollapsed(container);
    // Still in the DOM, so expanding can animate
    expect(content(container)).toHaveTextContent("First source");

    fireEvent.click(header());
    expectExpanded(container);

    fireEvent.click(header());
    expectCollapsed(container);

    expect(onToggle.mock.calls).toEqual([[true], [false]]);
  });

  test("the header is a real button", () => {
    render(<Citations citations={CITATIONS} messageId="button" />);

    expect(header().tagName).toBe("BUTTON");
    expect(header()).toHaveAttribute("type", "button");
  });

  test("keeps its state when remounted for the same message", () => {
    const first = render(
      <Citations citations={CITATIONS} messageId="remount" />,
    );
    expectCollapsed(first.container);
    fireEvent.click(header());
    expectExpanded(first.container);
    first.unmount();

    const second = render(
      <Citations citations={CITATIONS} messageId="remount" />,
    );
    // Expanded from the first render, at full height: nothing is measured
    expectExpanded(second.container);
    expect(content(second.container).style.maxHeight).toBe("");

    // Collapsing is remembered too
    fireEvent.click(header());
    second.unmount();
    const third = render(
      <Citations citations={CITATIONS} messageId="remount" />,
    );
    expectCollapsed(third.container);
  });

  test("a forced remount through a key change keeps the state too", () => {
    const { rerender } = render(
      <Citations key="a" citations={CITATIONS} messageId="rekey" />,
    );
    fireEvent.click(header());

    rerender(<Citations key="b" citations={CITATIONS} messageId="rekey" />);
    expect(header()).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(header());
    rerender(<Citations key="c" citations={CITATIONS} messageId="rekey" />);
    expect(header()).toHaveAttribute("aria-expanded", "false");
  });

  test("each message has its own state", () => {
    const { container } = render(
      <>
        <Citations citations={CITATIONS} messageId="message-a" />
        <Citations citations={CITATIONS} messageId="message-b" />
      </>,
    );
    const [a, b] = screen.getAllByRole("button");
    const [contentA, contentB] = Array.from(
      container.querySelectorAll("[data-expanded]"),
    );

    fireEvent.click(a);
    expect(a).toHaveAttribute("aria-expanded", "true");
    expect(contentA).toHaveAttribute("data-expanded", "true");
    expect(b).toHaveAttribute("aria-expanded", "false");
    expect(contentB).toHaveAttribute("data-expanded", "false");
    expect(contentB).toHaveAttribute("aria-hidden", "true");
  });

  test("a message seen for the first time starts collapsed, whatever others do", () => {
    render(<Citations citations={CITATIONS} messageId="seen-before" />);
    fireEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "true");

    const { container } = render(
      <Citations citations={CITATIONS} messageId="never-seen" />,
    );
    expect(content(container)).toHaveAttribute("data-expanded", "false");
  });

  test("a header click doesn't reach the message around it", () => {
    const onMessageClick = jest.fn();
    render(
      <div onClick={onMessageClick}>
        <Citations citations={CITATIONS} messageId="bubble" />
      </div>,
    );

    fireEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(onMessageClick).not.toHaveBeenCalled();
  });

  test("without a message id it starts from `expanded` and forgets on remount", () => {
    const first = render(<Citations citations={CITATIONS} expanded />);
    expect(header()).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(header());
    first.unmount();

    render(<Citations citations={CITATIONS} expanded />);
    expect(header()).toHaveAttribute("aria-expanded", "true");
  });

  test("renders nothing without citations", () => {
    const { container } = render(<Citations citations={[]} messageId="empty" />);
    expect(container).toBeEmptyDOMElement();
  });

  // ChatMessageItem (app/components/chat.tsx) isn't exported, and rendering
  // it would take mocks for its ~40 SVG icons, the chat store and Markdown.
  // This follows its data path instead: the message view it renders from,
  // and the exact props it passes, without `expanded`.
  test("a bot message's citations, as the chat renders them, start collapsed", () => {
    const message = {
      id: "bot-message-1",
      role: "assistant" as const,
      content: "Answer",
      date: "",
      citations: CITATIONS,
    };
    const view = getMessageView(message);
    const onSectionToggle = jest.fn();

    const { container } = render(
      <Citations
        citations={view.citations!}
        messageId={message.id}
        onToggle={onSectionToggle}
      />,
    );

    expectCollapsed(container);
    fireEvent.click(header());
    expectExpanded(container);
    expect(onSectionToggle).toHaveBeenCalledWith(true);
  });
});
