/**
 * Pre-hydration script to sync the search input with the URL hash.
 * Runs before React hydrates to provide immediate interactivity.
 *
 * Plain JS (not TS) on purpose: it is shipped verbatim as a standalone
 * `?url` asset, so it must be valid browser JavaScript without transpilation.
 */
(() => {
  // SearchBox calls this once hydrated, React owns the input and the history from then on
  const controller = new AbortController();
  window.stopSearchPrehydrate = () => controller.abort();

  const syncSearchInput = () => {
    const input = document.getElementById("main-search");
    if (!input) return;
    const search = new URLSearchParams(location.hash.slice(1)).get("search");
    if (search) input.value = search;
    input.addEventListener(
      "input",
      () => {
        // Other hash params, like the convars page kind filter, are kept
        const params = [];
        for (const [key, value] of new URLSearchParams(location.hash.slice(1))) {
          if (key !== "search" && key !== "name") {
            params.push(`${key}=${encodeURIComponent(value)}`);
          }
        }
        if (input.value) params.push(`search=${encodeURIComponent(input.value)}`);
        const hash = params.length > 0 ? `#${params.join("&")}` : "";
        history.replaceState(null, "", location.pathname + location.search + hash);
      },
      { signal: controller.signal },
    );
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncSearchInput, { signal: controller.signal });
  } else {
    syncSearchInput();
  }
})();
