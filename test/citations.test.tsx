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
    // Local class names as they are, so the tests can check them
    jest.unstable_mockModule("@/app/components/citations.module.scss", () => ({
      default: new Proxy({}, { get: (_target, key) => key }),
    }));
    ({ Citations } = await import("@/app/components/citations"));
  });

  const content = (container: HTMLElement) =>
    container.querySelector(".citations-content") as HTMLElement;

  test("starts collapsed by default", () => {
    const { container } = render(<Citations citations={CITATIONS} />);
    expect(screen.getByText("Expand")).toBeTruthy();
    expect(content(container).classList.contains("expanded")).toBe(false);
    expect(content(container).style.maxHeight).toBe("0px");
  });

  test("clicking the header toggles it open and closed", () => {
    const onToggle = jest.fn();
    const { container } = render(
      <Citations citations={CITATIONS} onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByText("Expand"));
    expect(content(container).classList.contains("expanded")).toBe(true);
    expect(content(container).style.maxHeight).not.toBe("0px");
    expect(onToggle).toHaveBeenLastCalledWith(true);

    fireEvent.click(screen.getByText("Collapse"));
    expect(content(container).classList.contains("expanded")).toBe(false);
    expect(content(container).style.maxHeight).toBe("0px");
    expect(onToggle).toHaveBeenLastCalledWith(false);
  });

  test("renders nothing without citations", () => {
    const { container } = render(<Citations citations={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
