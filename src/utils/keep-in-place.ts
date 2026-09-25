import { flushSync } from "react-dom";

/**
 * Runs an update that grows or shrinks the content above an element, and scrolls so the
 * element stays where it was on screen
 */
export function keepInPlace(element: Element, update: () => void) {
  const before = element.getBoundingClientRect().top;
  flushSync(update);
  window.scrollBy(0, element.getBoundingClientRect().top - before);
}
