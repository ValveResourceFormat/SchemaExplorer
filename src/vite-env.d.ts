/// <reference types="vite/client" />

// Minimal CloseWatcher typings; not yet in this TypeScript's lib.dom.
// https://developer.mozilla.org/en-US/docs/Web/API/CloseWatcher
interface CloseWatcher extends EventTarget {
  onclose: ((this: CloseWatcher, ev: Event) => unknown) | null;
  oncancel: ((this: CloseWatcher, ev: Event) => unknown) | null;
  close(): void;
  destroy(): void;
  requestClose(): void;
}

declare const CloseWatcher: {
  prototype: CloseWatcher;
  new (options?: { signal?: AbortSignal }): CloseWatcher;
};
