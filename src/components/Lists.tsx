import React, { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

interface Props<T> {
  data: T[];
  render(element: T): React.ReactNode;
}

export function LazyList<T>({ data, render }: Props<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current?.parentElement ?? null,
    estimateSize: () => 80,
    overscan: 10,
  });

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
              transform: `translateY(${virtualRow.start}px)`,
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
