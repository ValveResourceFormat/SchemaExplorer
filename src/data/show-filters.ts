import { declarationKey, isNetworkedClass, type GameContext } from "./derived";
import type { Declaration } from "./types";

type Lookups = Pick<GameContext, "entitiesByDeclaration" | "componentOf" | "exclusive">;

interface ShowFilterDef {
  label: string;
  title: string;
  test: (d: Declaration, lookups: Lookups) => boolean;
}

/** Which declarations the sidebar can be narrowed to, in the order it lists them */
export const SHOW_FILTERS = {
  all: { label: "All", title: "Every class and enum", test: () => true },
  classes: { label: "Classes", title: "Only classes", test: (d) => d.kind === "class" },
  enums: { label: "Enums", title: "Only enums", test: (d) => d.kind === "enum" },
  entities: {
    label: "Entities",
    title: "Entity classes, the ones entities are created from",
    test: (d, l) => l.entitiesByDeclaration.has(d),
  },
  components: {
    label: "Components",
    title: "Classes that entities have as a component",
    test: (d, l) => l.componentOf.has(declarationKey(d.module, d.name)),
  },
  networked: {
    label: "Networked",
    title: "Classes with network data of their own or networked fields",
    test: isNetworkedClass,
  },
  vdata: {
    label: "VData",
    title: "The classes at the root of a VData file, marked MVDataRoot",
    test: (d) => d.metadata?.some((m) => m.name === "MVDataRoot") ?? false,
  },
  exclusive: {
    label: "Exclusive",
    title: "Classes and enums whose name no other game has",
    test: (d, l) => l.exclusive.has(d),
  },
} satisfies Record<string, ShowFilterDef>;

export type ShowFilter = keyof typeof SHOW_FILTERS;

export const SHOW_FILTER_NAMES = Object.keys(SHOW_FILTERS) as ShowFilter[];

/** How many of the declarations each filter keeps */
export function countShowFilters(
  declarations: Iterable<Declaration>,
  lookups: Lookups,
): Map<ShowFilter, number> {
  const counts = new Map<ShowFilter, number>(SHOW_FILTER_NAMES.map((f) => [f, 0]));
  for (const d of declarations) {
    for (const filter of SHOW_FILTER_NAMES) {
      if (SHOW_FILTERS[filter].test(d, lookups)) counts.set(filter, counts.get(filter)! + 1);
    }
  }
  return counts;
}
