import React, { useEffect, useRef } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";

interface Props<T> {
  data: T[];
  render(element: T): React.ReactNode;
}

export function LazyList<T>({ data, render }: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [parentOffset, setParentOffset] = React.useState(0);

  const virtualizer = useWindowVirtualizer({
    count: data.length,
    estimateSize: () => 80,
    overscan: 2,
    scrollMargin: parentOffset,
  });

  // Capture offset once on mount
  React.useLayoutEffect(() => {
    if (parentRef.current) {
      setParentOffset(parentRef.current.getBoundingClientRect().top + window.scrollY);
    }
  }, []);

  // Scroll to top when search results change (skip initial mount)
  const prevDataRef = useRef(data);
  useEffect(() => {
    if (prevDataRef.current !== data) {
      prevDataRef.current = data;
      window.scrollTo(0, 0);
    }
  }, [data]);

  return (
    <div ref={parentRef}>
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualRow.start - parentOffset}px)`,
            }}
          >
            {render(data[virtualRow.index])}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ScrollableList<T>({ data, render }: Props<T>) {
  return <div>{data.map((x) => render(x))}</div>;
}
