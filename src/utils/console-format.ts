import type { ConVar } from "../data/types";

/** A color default like "[136, 206, 245, 255]" as a CSS color */
export function parseColor(value: string): string | null {
  const m = /^\[(\d+), (\d+), (\d+)(?:, (\d+))?\]$/.exec(value);
  if (!m) return null;
  const alpha = m[4] != null ? Number(m[4]) / 255 : 1;
  return `rgb(${m[1]} ${m[2]} ${m[3]} / ${alpha})`;
}

/** String defaults are quoted so empty ones are visible */
export function formatDefault(item: ConVar): string | null {
  if (item.default == null) return null;
  return item.type === "string" ? JSON.stringify(item.default) : item.default;
}

export function formatRange(min?: string, max?: string): string | null {
  if (min != null && max != null) return `[${min} .. ${max}]`;
  if (min != null) return `[≥ ${min}]`;
  if (max != null) return `[≤ ${max}]`;
  return null;
}

/** Up to two modules, then the first one and how many more */
export function formatModules(modules: string[]): string {
  if (modules.length <= 2) return modules.join(", ");
  return `${modules[0]} +${modules.length - 1}`;
}
