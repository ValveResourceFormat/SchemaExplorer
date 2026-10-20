import {
  countShowFilters,
  SHOW_FILTERS,
  type ShowFilter,
  type ShowLookups,
} from "../data/show-filters";
import type { Declaration, SchemaClass } from "../data/types";
import { resultDeclarations } from "./search-rows";
import {
  isFuzzyRow,
  type InheritedSide,
  type PairableHit,
  type SearchResult,
  type SearchRow,
  type SimilarHit,
  type SimilarRow,
} from "./search-types";

/**
 * Whether a hit passes a show filter: its declaration does, except for networked, which a field
 * row passes by being networked itself. Enum members never are
 */
function hitPasses(hit: PairableHit | SimilarHit, show: ShowFilter, lookups: ShowLookups): boolean {
  if (show === "networked") {
    if (hit.kind === "field") return hit.field.network != null;
    if (hit.kind === "member") return false;
  }
  return SHOW_FILTERS[show].test(hit.declaration, lookups);
}

/**
 * The classes of an inherited field that pass a show filter. Networked tests the field, which
 * every class that has it passes with
 */
function inheritedClassesPassing(
  side: InheritedSide,
  show: ShowFilter,
  lookups: ShowLookups,
): SchemaClass[] {
  if (show === "networked") return side.field.network != null ? side.classes : [];

  const { test } = SHOW_FILTERS[show];
  return side.classes.filter((c) => test(c, lookups));
}

/** The side with the classes that pass the filter, null when none does */
function filterSide(
  side: InheritedSide,
  show: ShowFilter,
  lookups: ShowLookups,
): InheritedSide | null {
  const classes = inheritedClassesPassing(side, show, lookups);
  if (classes.length === 0) return null;
  if (classes.length === side.classes.length) return side;
  return { ...side, classes };
}

/**
 * The row with the sides that `keep` keeps, null when it keeps neither. A side that is kept alone
 * leads the row
 */
function filterRow<T extends { declaration: Declaration }>(
  row: SearchRow<T>,
  keep: (hit: T) => T | null,
): SearchRow<T> | null {
  const hit = keep(row.hit);
  if (!row.paired) {
    if (hit === null) return null;
    return hit === row.hit ? row : { hit };
  }

  const paired = keep(row.paired);
  if (hit && paired) return hit === row.hit && paired === row.paired ? row : { hit, paired };
  if (hit) return { hit };
  if (paired) return { hit: paired };
  return null;
}

function filterRows<T extends { declaration: Declaration }>(
  rows: SearchRow<T>[],
  keep: (hit: T) => T | null,
): SearchRow<T>[] {
  const kept: SearchRow<T>[] = [];
  for (const row of rows) {
    const filtered = filterRow(row, keep);
    if (filtered) kept.push(filtered);
  }

  return kept;
}

/**
 * The result narrowed to a show filter. A paired row keeps the side that passes, an inherited
 * field the classes that pass, and the declarations are those of the rows left
 */
export function filterSearchResult(
  result: SearchResult,
  show: ShowFilter,
  lookups: ShowLookups,
): SearchResult {
  if (show === "all") return result;

  const keepHit = <T extends PairableHit>(hit: T): T | null => {
    return hitPasses(hit, show, lookups) ? hit : null;
  };
  const names = filterRows(result.names, keepHit);
  const fields = filterRows(result.fields, keepHit);
  const inherited = filterRows(result.inherited, (side) => filterSide(side, show, lookups));
  const similar: SimilarRow[] = [];
  for (const row of result.similar) {
    if (isFuzzyRow(row)) {
      if (hitPasses(row.hit, show, lookups)) similar.push(row);
      continue;
    }
    const filtered = filterRow(row, keepHit);
    if (filtered) similar.push(filtered);
  }

  const declarations = resultDeclarations(names, fields, inherited);
  return { names, fields, inherited, similar, declarations };
}

/**
 * How many declarations each show filter leaves a row of, each counted once. Similar names
 * aren't results and don't count. Same as the size of `filterSearchResult(...).declarations`,
 * for every filter in one pass
 */
export function countSearchShowFilters(
  result: SearchResult,
  lookups: ShowLookups,
): Map<ShowFilter, number> {
  // Every filter but networked passes a row by its declaration, so the declarations tell
  const counts = countShowFilters(result.declarations, lookups, ["networked"]);
  counts.set("networked", filterSearchResult(result, "networked", lookups).declarations.size);
  return counts;
}
