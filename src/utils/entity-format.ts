import type { EntityClass, EntityKey } from "../data/types";

/** The design name, or the C++ class for entities that can't be created by name */
export function entityLabel(e: EntityClass): string {
  return e.designName ?? e.class;
}

/** FIELD_FLOAT32 → float32 */
export function formatKeyType(type: string): string {
  return type.replace(/^FIELD_/, "").toLowerCase();
}

/** Expands printf-style patterns like Case%02d for one index */
export function formatKeyPattern(pattern: string, index: number): string {
  return pattern.replace(/%(0?)(\d*)d/g, (_, zero: string, width: string) =>
    String(index).padStart(width ? Number(width) : 0, zero ? "0" : " "),
  );
}

/** Array keys show their first and last name, like Case01 … Case16 */
export function formatKeyName(
  key: Pick<EntityKey, "name" | "arrayStart" | "arrayCount" | "procedural">,
): string {
  if (key.arrayCount == null) return key.name;
  const start = key.arrayStart ?? 0;
  const first = formatKeyPattern(key.name, start);
  if (key.arrayCount <= 1) return first;
  return `${first} … ${formatKeyPattern(key.name, start + key.arrayCount - 1)}`;
}

/** Pulse descriptions use <br> for line breaks */
export function formatDescription(text: string): string {
  return text.replace(/<br\s*\/?>/gi, "\n");
}

export type Entry = { name: string };

export type InheritedGroup<T extends Entry> = {
  entity: EntityClass;
  entries: { entry: T; overriddenBy?: EntityClass }[];
  count: number;
};

/**
 * Entries of each base, nearest first. A name redeclared by a nearer class wins and the
 * inherited one is marked as overridden. Names are case-insensitive in the entity system.
 */
export function buildInheritedGroups<T extends Entry>(
  entity: EntityClass,
  chain: EntityClass[],
  pick: (e: EntityClass) => T[],
): InheritedGroup<T>[] {
  const declaredBy = new Map<string, EntityClass>();
  for (const entry of pick(entity)) declaredBy.set(entry.name.toLowerCase(), entity);

  const groups: InheritedGroup<T>[] = [];
  for (const base of chain) {
    const entries = pick(base).map((entry) => ({
      entry,
      overriddenBy: declaredBy.get(entry.name.toLowerCase()),
    }));
    for (const { entry } of entries) {
      if (!declaredBy.has(entry.name.toLowerCase())) declaredBy.set(entry.name.toLowerCase(), base);
    }
    const count = entries.filter((e) => !e.overriddenBy).length;
    if (entries.length > 0) groups.push({ entity: base, entries, count });
  }
  return groups;
}
