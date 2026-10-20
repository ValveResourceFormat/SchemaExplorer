import { useEffect, type RefObject } from "react";
import type { useWindowVirtualizer } from "@tanstack/react-virtual";

const USER_SCROLL_EVENTS = ["wheel", "touchstart", "keydown", "mousedown"] as const;

// Rows above are estimates until measured and scroll restoration runs after mount, so a
// single scrollToIndex can land off target. The code retries briefly until the row stays in
// place. Rows near either end can't be centered. Any user scroll input stops the retries
export function useScrollToRow(
  listRef: RefObject<HTMLElement | null>,
  virtualizer: ReturnType<typeof useWindowVirtualizer>,
  nameIndex: number,
) {
  useEffect(() => {
    if (nameIndex < 0) return;
    let attempts = 0;
    let lastTop: number | null = null;
    let timer: ReturnType<typeof setTimeout>;
    const stop = () => {
      clearTimeout(timer);
      for (const type of USER_SCROLL_EVENTS) window.removeEventListener(type, stop);
    };
    const scroll = () => {
      const rect = listRef.current
        ?.querySelector(`[data-index="${nameIndex}"]`)
        ?.getBoundingClientRect();
      const centered =
        rect != null && Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2) < 50;
      const settled = rect != null && lastTop != null && Math.abs(rect.top - lastTop) < 1;
      lastTop = rect?.top ?? null;
      const done = centered || settled;
      if (!done) virtualizer.scrollToIndex(nameIndex, { align: "center" });
      if (++attempts < 15 && (!done || attempts < 6)) timer = setTimeout(scroll, 100);
      else stop();
    };
    for (const type of USER_SCROLL_EVENTS) window.addEventListener(type, stop, { passive: true });
    timer = setTimeout(scroll, 0);
    return stop;
  }, [nameIndex, virtualizer]);
}
