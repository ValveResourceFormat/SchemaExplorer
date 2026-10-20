import React, { useEffect, useState } from "react";

/** The first row of the static list at the top of the window, and where its top is */
export interface RowPosition {
  index: number;
  top: number;
}

function topVisibleRow(list: HTMLUListElement | null): RowPosition | null {
  if (!list || list.children.length === 0) return null;
  const rows = list.children;
  // The rows are in order down the page, so halving finds the first one still in view
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (rows[mid].getBoundingClientRect().bottom > 0) high = mid;
    else low = mid + 1;
  }
  return { index: low, top: rows[low].getBoundingClientRect().top };
}

/** What a reader does first. After that, the virtualized list replaces the full list */
const INTERACTION_EVENTS = ["scroll", "wheel", "keydown"] as const;

/**
 * Whether the reader has scrolled, pressed a key or clicked since hydration, with where the static
 * list was then. A click switches after its click event, so a link in the static list still works
 */
export function useFirstInteraction(
  hydrated: boolean,
  listRef: React.RefObject<HTMLUListElement | null>,
) {
  const [interaction, setInteraction] = useState<{ position: RowPosition | null } | null>(null);
  const interacted = interaction != null;

  useEffect(() => {
    if (!hydrated || interacted) return;
    let position: RowPosition | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const switchList = () => {
      position = topVisibleRow(listRef.current) ?? position;
      setInteraction({ position });
    };
    const onPointerUp = () => {
      timer = setTimeout(switchList, 0);
    };
    const onPointerDown = () => {
      position = topVisibleRow(listRef.current);
      window.addEventListener("pointerup", onPointerUp, { once: true });
    };
    const options = { passive: true, capture: true };
    for (const type of INTERACTION_EVENTS) window.addEventListener(type, switchList, options);
    window.addEventListener("pointerdown", onPointerDown, options);
    return () => {
      for (const type of INTERACTION_EVENTS) window.removeEventListener(type, switchList, options);
      window.removeEventListener("pointerdown", onPointerDown, options);
      window.removeEventListener("pointerup", onPointerUp);
      clearTimeout(timer);
    };
  }, [hydrated, interacted, listRef]);

  return interaction;
}
