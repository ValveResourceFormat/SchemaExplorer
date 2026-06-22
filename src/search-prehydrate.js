/**
 * Pre-hydration script to sync the search input with the URL hash.
 * Runs before React hydrates to provide immediate interactivity.
 *
 * Plain JS (not TS) on purpose: it is shipped verbatim as a standalone
 * `?url` asset, so it must be valid browser JavaScript without transpilation.
 */
(() => {
  const syncSearchInput = () => {
    const input = document.getElementById("main-search");
    if (!input) return;
    const search = new URLSearchParams(location.hash.slice(1)).get("search");
    if (search) input.value = search;
    input.addEventListener("input", () => {
      const value = input.value;
      const hash = value ? `#search=${encodeURIComponent(value)}` : "";
      history.replaceState(null, "", location.pathname + location.search + hash);
    });
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncSearchInput);
  } else {
    syncSearchInput();
  }
})();
