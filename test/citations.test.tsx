import { jest } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react";

let Citations: typeof import("@/app/components/citations").Citations;

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

    ({ Citations } = await import("@/app/components/citations"));
  });

  function header() {
    return screen.getByRole("button", { name: /Citations \(2\)/ });
  }

  function content(container: HTMLElement) {
    // Jest's CSS-modules proxy does not always put local names on the DOM;
    // data-expanded is the stable signal for open/closed.
    return container.querySelector("[data-expanded]") as HTMLElement;
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

    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(header()).toHaveTextContent("Expand");
    expect(content(container)).toHaveAttribute("data-expanded", "false");

    fireEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(header()).toHaveTextContent("Collapse");
    expect(content(container)).toHaveAttribute("data-expanded", "true");

    fireEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "false");
    expect(content(container)).toHaveAttribute("data-expanded", "false");

    expect(onToggle.mock.calls).toEqual([[true], [false]]);
  });

  test("keeps its state when remounted for the same message", () => {
    const first = render(
      <Citations citations={CITATIONS} messageId="remount" />,
    );
    fireEvent.click(header());
    expect(header()).toHaveAttribute("aria-expanded", "true");
    first.unmount();

    const { container } = render(
      <Citations citations={CITATIONS} messageId="remount" />,
    );
    // Expanded from the first render, at full height: nothing is measured
    expect(header()).toHaveAttribute("aria-expanded", "true");
    expect(content(container)).toHaveAttribute("data-expanded", "true");
    expect(content(container).style.maxHeight).toBe("");
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
    render(
      <>
        <Citations citations={CITATIONS} messageId="message-a" />
        <Citations citations={CITATIONS} messageId="message-b" />
      </>,
    );
    const [a, b] = screen.getAllByRole("button");

    fireEvent.click(a);
    expect(a).toHaveAttribute("aria-expanded", "true");
    expect(b).toHaveAttribute("aria-expanded", "false");
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
});
