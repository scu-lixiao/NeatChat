// Distance (px) from the bottom within which the chat counts as "at the bottom"
export const AT_BOTTOM_THRESHOLD_PX = 24;

export function isNearBottom(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold: number = AT_BOTTOM_THRESHOLD_PX,
) {
  return scrollHeight - (scrollTop + clientHeight) <= threshold;
}

/**
 * Whether auto-scroll should keep following the bottom after a scroll event.
 * Reaching the bottom attaches and scrolling up detaches. Anything else keeps
 * the previous state: content that grows between a programmatic scroll and
 * its scroll event leaves the view short of the bottom even though the user
 * never scrolled away.
 */
export function shouldFollowBottom(
  following: boolean,
  prevScrollTop: number,
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  threshold: number = AT_BOTTOM_THRESHOLD_PX,
) {
  if (isNearBottom(scrollTop, clientHeight, scrollHeight, threshold)) {
    return true;
  }
  if (scrollTop < prevScrollTop) {
    return false;
  }
  return following;
}
