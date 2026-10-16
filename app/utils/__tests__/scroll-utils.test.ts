import {
  AT_BOTTOM_THRESHOLD_PX,
  isNearBottom,
  shouldFollowBottom,
} from "@/app/utils/scroll";

describe("isNearBottom", () => {
  // A 1000px tall list in a 400px viewport: the bottom is at scrollTop 600
  const clientHeight = 400;
  const scrollHeight = 1000;

  test("is true at the very bottom", () => {
    expect(isNearBottom(600, clientHeight, scrollHeight)).toBe(true);
  });

  test("is true within the default threshold", () => {
    expect(AT_BOTTOM_THRESHOLD_PX).toBe(24);
    expect(isNearBottom(600 - 24, clientHeight, scrollHeight)).toBe(true);
  });

  test("is false beyond the default threshold", () => {
    expect(isNearBottom(600 - 25, clientHeight, scrollHeight)).toBe(false);
    expect(isNearBottom(0, clientHeight, scrollHeight)).toBe(false);
  });

  test("honours a custom threshold", () => {
    expect(isNearBottom(596, clientHeight, scrollHeight, 4)).toBe(true);
    expect(isNearBottom(595, clientHeight, scrollHeight, 4)).toBe(false);
  });

  test("is true when overscrolled past the bottom", () => {
    expect(isNearBottom(650, clientHeight, scrollHeight)).toBe(true);
  });

  test("is true when the content fits the viewport", () => {
    expect(isNearBottom(0, 400, 300)).toBe(true);
  });
});

describe("shouldFollowBottom", () => {
  const clientHeight = 400;

  test("attaches when the user scrolls back to the bottom", () => {
    expect(shouldFollowBottom(false, 300, 600, clientHeight, 1000)).toBe(true);
  });

  test("detaches when the user scrolls up away from the bottom", () => {
    expect(shouldFollowBottom(true, 600, 500, clientHeight, 1000)).toBe(false);
  });

  test("stays attached when content grew past a programmatic scroll", () => {
    // Scrolled down to the old bottom (600) but the list has since grown by 200px
    expect(shouldFollowBottom(true, 300, 600, clientHeight, 1200)).toBe(true);
  });

  test("stays detached while scrolling down short of the bottom", () => {
    expect(shouldFollowBottom(false, 100, 300, clientHeight, 1000)).toBe(false);
  });

  test("small upward moves near the bottom keep following", () => {
    expect(shouldFollowBottom(true, 600, 590, clientHeight, 1000)).toBe(true);
  });
});
