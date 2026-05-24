/**
 * Pre-hydration script to sync search input with URL hash.
 * Runs before React takes control to provide immediate interactivity.
 */
function syncSearchInput() {
  const input = document.getElementById("main-search") as HTMLInputElement | null;
  if (!input) return;
  const search = new URLSearchParams(location.hash.slice(1)).get("search");
  if (search) input.value = search;
  input.addEventListener("input", function () {
    const value = (this as HTMLInputElement).value;
    const hash = value ? `#search=${encodeURIComponent(value)}` : "";
    history.replaceState(null, "", location.pathname + location.search + hash);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", syncSearchInput);
} else {
  syncSearchInput();
}
