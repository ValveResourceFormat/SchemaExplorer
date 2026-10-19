import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWindowVirtualizer, type VirtualItem } from "@tanstack/react-virtual";

/** How far above the top of the list it scrolls back to, so the content above shows a little */
const SCROLL_BACK_MARGIN = 80;

/** How many rows are rendered beyond the ones in view */
const OVERSCAN = 10;

/**
 * A virtualized list inside the window's scroll. Its scroll margin is where the list starts on the
 * page, measured again when the window or the content above the list changes size, and when
 * `listKey` changes. The list scrolls back to its top once `listKey` changes while the page is
 * scrolled further down. `itemTop` is where a virtual item goes inside the list
 */
export function useWindowList<T extends HTMLElement>({
  listKey,
  count,
  estimateSize,
  getItemKey,
}: {
  listKey: unknown;
  count: number;
  estimateSize: (index: number) => number;
  getItemKey: (index: number) => string;
}) {
  const listRef = useRef<T>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => setScrollMargin(list.getBoundingClientRect().top + window.scrollY);
    measure();

    const observer = new ResizeObserver(measure);
    if (list.parentElement) observer.observe(list.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [listKey]);

  const previousKey = useRef(listKey);
  useEffect(() => {
    if (previousKey.current === listKey) return;
    previousKey.current = listKey;
    if (window.scrollY > scrollMargin) {
      window.scrollTo(0, Math.max(0, scrollMargin - SCROLL_BACK_MARGIN));
    }
  }, [listKey, scrollMargin]);

  const virtualizer = useWindowVirtualizer({
    count,
    estimateSize,
    getItemKey,
    overscan: OVERSCAN,
    scrollMargin,
    // The window still has the previous page's scroll when the list mounts, which the virtualizer
    // would scroll back to after scroll restoration has moved the new page to the top
    initialOffset: 0,
  });

  const itemTop = (item: VirtualItem) => item.start - scrollMargin;
  return { listRef, virtualizer, itemTop };
}
