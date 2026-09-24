import { useEffect, type RefObject } from "react";

/** A keydown listener that closes on an Escape nothing else handled, and cancels it */
export function closeOnEscape(close: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    close();
  };
}

/**
 * Calls close on a mousedown outside of ref or on Escape, while open. Escape is handled in the
 * capture phase and canceled, so an outer drawer (and its CloseWatcher) stays open.
 */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    }
    const onKeyDown = closeOnEscape(close);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [ref, open, close]);
}
