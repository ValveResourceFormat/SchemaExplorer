import { pushTo } from "../data/derived";
import type {
  Declaration,
  SchemaClass,
  SchemaEnum,
  SchemaEnumMember,
  SchemaField,
} from "../data/types";
import { matchesModule, type ParsedSearch } from "./filtering";
import {
  combineMatches,
  joinedWordForms,
  matchTypoWords,
  shortestTypoTarget,
  TIER_FUZZY,
  TYPO_MAX_RESULTS,
  typoMatch,
  type NameMatch,
} from "./match-score";
import { getSearchIndex, type ItemName, type SearchEntry, type SearchIndex } from "./search-index";
import { collectInherited, finishInherited, type InheritedSearch } from "./search-inherited";
import {
  matchClassJoined,
  matchClassWords,
  matchItemWords,
  nameHitWords,
  scoreDeclarationName,
  scoreItem,
  wordMatch,
  type ItemWords,
} from "./search-names";
import {
  compareSimilarRows,
  pairHits,
  pairSimilarHits,
  resultDeclarations,
  sortRows,
} from "./search-rows";
import {
  declarationTags,
  entityTags,
  fieldTags,
  fieldTagsWithShared,
  hasEntityFilter,
  hasMetadataFilter,
  memberTags,
  memberTagsWithShared,
  sharedItemTags,
} from "./search-tags";
import {
  NO_TAGS,
  NO_WORDS,
  type FieldHit,
  type MatchSource,
  type MemberHit,
  type NameHit,
  type SearchContext,
  type SearchResult,
  type SimilarHit,
  type TagMatch,
  type WordMatch,
} from "./search-types";

function hasSearchFilters(parsed: ParsedSearch): boolean {
  return (
    parsed.nameWords.length > 0 ||
    parsed.moduleWords.length > 0 ||
    parsed.offsets.size > 0 ||
    parsed.enumValues.size > 0 ||
    parsed.metadataKeys.length > 0 ||
    parsed.metadataValues.length > 0 ||
    parsed.networkWords.length > 0 ||
    parsed.entityWords.length > 0 ||
    parsed.inputWords.length > 0 ||
    parsed.outputWords.length > 0
  );
}

/** What the fields or members of a declaration are matched with. Reused for every declaration */
interface ItemQuery {
  parsed: ParsedSearch;
  /** The words joined into one name, none unless there are two or more words */
  forms: readonly string[];
  /** Words that only the declaration matches are its name hit, not a field or member hit */
  needItemWord: boolean;
  classWords: (WordMatch | null)[];
  classMatchesAll: boolean;
  /** The metadata and network tags of the declaration, which its items list by name words alone */
  shared: readonly TagMatch[] | null;
}

function fieldHit(
  declaration: SchemaClass,
  name: ItemName<SchemaField>,
  matched: ItemWords,
  tags: readonly TagMatch[],
): FieldHit {
  return {
    kind: "field",
    declaration,
    field: name.item,
    tier: matched.tier,
    score: matched.score,
    nameWords: matched.classSide,
    tags,
    fieldWords: matched.itemSide,
  };
}

function memberHit(
  declaration: SchemaEnum,
  name: ItemName<SchemaEnumMember>,
  matched: ItemWords,
  tags: readonly TagMatch[],
): MemberHit {
  return {
    kind: "member",
    declaration,
    member: name.item,
    tier: matched.tier,
    score: matched.score,
    nameWords: matched.classSide,
    tags,
    fieldWords: matched.itemSide,
  };
}

/**
 * Adds the hits of the fields of a class. A field passes the filters with its own tags, or else
 * with the declaration's when a name word matches it
 */
function collectFieldHits(
  declaration: SchemaClass,
  fields: ItemName<SchemaField>[],
  query: ItemQuery,
  groups: Map<Declaration, (FieldHit | MemberHit)[]>,
) {
  const { parsed, forms, classWords, classMatchesAll, shared } = query;
  const words = parsed.nameWords;

  for (const name of fields) {
    let tags = fieldTags(name.item, parsed);
    let needWord = query.needItemWord;
    if (tags === null && shared !== null) {
      tags = fieldTagsWithShared(name.item, parsed, shared);
      needWord = true;
    }
    if (tags === null) continue;

    const matched = matchItemWords(
      words,
      forms,
      classWords,
      classMatchesAll,
      name,
      "field",
      needWord,
    );
    if (matched === null) continue;

    pushTo(groups, declaration, fieldHit(declaration, name, matched, tags));
  }
}

/**
 * Adds the hits of the members of an enum. A member passes the filters with its own tags, or else
 * with the declaration's when a name word matches it
 */
function collectMemberHits(
  declaration: SchemaEnum,
  members: ItemName<SchemaEnumMember>[],
  query: ItemQuery,
  groups: Map<Declaration, (FieldHit | MemberHit)[]>,
) {
  const { parsed, forms, classWords, classMatchesAll, shared } = query;
  const words = parsed.nameWords;

  for (const name of members) {
    let tags = memberTags(name.item, parsed);
    let needWord = query.needItemWord;
    if (tags === null && shared !== null) {
      tags = memberTagsWithShared(name.item, parsed, shared);
      needWord = true;
    }
    if (tags === null) continue;

    const matched = matchItemWords(
      words,
      forms,
      classWords,
      classMatchesAll,
      name,
      "member",
      needWord,
    );
    if (matched === null) continue;

    pushTo(groups, declaration, memberHit(declaration, name, matched, tags));
  }
}

/**
 * Searches a game's classes, enums, fields and enum members. The hits point at the declarations,
 * fields and members themselves.
 *
 * A declaration's name and its fields are matched independently. A word has to be in the
 * field name, or else in the declaration name or an entity design name (a split hit), and
 * every word has to be somewhere. Fields also match by their name without the type prefix.
 * Fields and members only match as a substring, declaration names fuzzily too. Two or more
 * words also match one name joined, a space standing for an underscore or nothing.
 *
 * A word like Class::member or Class.member that finds nothing is searched again as two words,
 * a class and a field.
 */
export function searchSchemas(
  context: SearchContext,
  parsed: ParsedSearch,
  options: SearchOptions = {},
): SearchResult {
  const { similar = true } = options;
  const split = splitMemberWords(parsed.nameWords);
  if (split === null) return searchWords(context, parsed, similar);

  // The similar names are only looked for in the search that is returned
  const result = searchWords(context, parsed, false);
  if (!hasSchemaHits(result)) {
    const retried = searchWords(context, { ...parsed, nameWords: split }, similar);
    if (hasSchemaHits(retried)) return retried;
  }
  return similar ? searchWords(context, parsed, true) : result;
}

interface SearchOptions {
  /** Whether to look for similar names, which are not results. On unless it's false */
  similar?: boolean;
}

export function hasSchemaHits(result: SearchResult): boolean {
  return result.names.length > 0 || result.fields.length > 0 || result.inherited.length > 0;
}

/** The last :: or . of a word, where Class::member and Class.member are split, null without one */
function memberSeparator(word: string): { at: number; length: number } | null {
  const scope = word.lastIndexOf("::");
  const dot = word.lastIndexOf(".");
  if (scope > dot) return { at: scope, length: 2 };
  if (dot >= 0) return { at: dot, length: 1 };
  return null;
}

/** The words with every Class::member and Class.member split in two, null when none is */
function splitMemberWords(words: string[]): string[] | null {
  const split: string[] = [];
  let changed = false;
  for (const word of words) {
    const separator = memberSeparator(word);
    const left = separator ? word.slice(0, separator.at) : "";
    const right = separator ? word.slice(separator.at + separator.length) : "";
    if (left === "" || right === "") {
      split.push(word);
      continue;
    }
    split.push(left, right);
    changed = true;
  }

  return changed ? split : null;
}

function searchWords(
  context: SearchContext,
  parsed: ParsedSearch,
  withSimilar: boolean,
): SearchResult {
  const result: SearchResult = {
    names: [],
    fields: [],
    inherited: [],
    similar: [],
    declarations: new Set(),
  };
  if (!hasSearchFilters(parsed)) return result;

  const { nameWords: words, moduleWords, offsets, enumValues, networkWords } = parsed;
  const hasFieldTag =
    offsets.size > 0 || enumValues.size > 0 || hasMetadataFilter(parsed) || networkWords.length > 0;
  const hasFieldFilter = words.length > 0 || hasFieldTag;
  // Offsets and enum values are the fields' and members', a declaration has neither
  const declarationsMatch = offsets.size === 0 && enumValues.size === 0;

  const nameGroups = new Map<Declaration, NameHit[]>();
  const fieldGroups = new Map<Declaration, (FieldHit | MemberHit)[]>();
  const similar: SimilarHit[] = [];
  const classWords: (WordMatch | null)[] = [];
  const fuzzyWords: WordMatch[] = [];
  const forms = words.length >= 2 ? joinedWordForms(words) : [];
  const query: ItemQuery = {
    parsed,
    forms,
    needItemWord: words.length > 0 && !hasFieldTag,
    classWords,
    classMatchesAll: false,
    shared: null,
  };

  const index = getSearchIndex(context);
  // Only words split between a class and a field have fields to find in the bases
  const inherited: InheritedSearch | null =
    words.length >= 2 && !hasFieldTag
      ? { matches: new Map(), hits: new Map(), fieldIndexes: new Map(), bestClasses: new Map() }
      : null;

  for (const entry of index.entries) {
    const { declaration } = entry;
    if (!matchesModule(declaration.module, moduleWords)) continue;

    const entity = entityTags(context, entry, parsed);
    if (entity === null) continue;

    const own = declarationTags(declaration, parsed);
    const listsDeclaration = declarationsMatch && own !== null;

    classWords.length = words.length;
    const allWordsMatch = matchClassWords(
      words,
      entry,
      withSimilar && listsDeclaration,
      classWords,
      fuzzyWords,
    );

    const classJoined = forms.length > 0 ? matchClassJoined(words, forms, entry) : null;
    const classMatchesAll = allWordsMatch || classJoined !== null;

    if (listsDeclaration) {
      const tags = entity.length === 0 ? own : [...entity, ...own];

      if (classMatchesAll) {
        const matched = words.length === 0 ? NO_WORDS : nameHitWords(classWords, classJoined);
        const { tier, score } = combineMatches(matched);
        const hit: NameHit = { kind: "name", declaration, tier, score, nameWords: matched, tags };
        pushTo(nameGroups, declaration, hit);
      } else if (fuzzyWords.length === words.length) {
        const fuzzy = fuzzyWords.slice();
        const { tier, score } = combineMatches(fuzzy);
        similar.push({ kind: "fuzzy", declaration, tier, score, nameWords: fuzzy, tags });
      }
    }

    if (!hasFieldFilter) continue;

    query.classMatchesAll = classMatchesAll;
    query.shared = sharedItemTags(own, parsed);

    if ("fields" in entry) {
      collectFieldHits(entry.declaration, entry.fields, query, fieldGroups);
      if (inherited) collectInherited(index, inherited, entry, words, classWords);
    } else {
      collectMemberHits(entry.declaration, entry.members, query, fieldGroups);
    }
  }

  const { crossModuleLookup } = context;
  const nameRows = pairHits(index, nameGroups, crossModuleLookup);
  const fieldRows = pairHits(index, fieldGroups, crossModuleLookup);
  result.names = sortRows(index, nameRows);
  result.fields = sortRows(index, fieldRows);
  if (inherited) result.inherited = finishInherited(context, index, inherited);
  result.declarations = resultDeclarations(result.names, result.fields, result.inherited);

  if (!withSimilar) return result;

  const resultCount = result.names.length + result.fields.length + result.inherited.length;
  const looksForTypos = !hasFieldTag && !hasEntityFilter(parsed) && resultCount < TYPO_MAX_RESULTS;
  const typos = looksForTypos ? collectTypoHits(index, parsed) : [];

  const typoClasses = new Set<Declaration>();
  for (const hit of typos) {
    if (hit.kind === "fuzzy") typoClasses.add(hit.declaration);
  }

  const kept: SimilarHit[] = [];
  for (const hit of typos) {
    if (!result.declarations.has(hit.declaration)) kept.push(hit);
  }

  for (const hit of similar) {
    const isTypoClass = hit.kind === "fuzzy" && typoClasses.has(hit.declaration);
    if (!isTypoClass && !result.declarations.has(hit.declaration)) kept.push(hit);
  }
  result.similar = pairSimilarHits(index, kept, crossModuleLookup);
  result.similar.sort(compareSimilarRows);
  return result;
}

function scoreEntryWord(word: string, entry: SearchEntry): NameMatch | null {
  if (word.startsWith("m_")) return null;
  return scoreDeclarationName(word, entry, false);
}

function typoEntryWord(word: string, entry: SearchEntry): NameMatch | null {
  return typoMatch(word, entry.declaration.name, entry.lower);
}

function typoItemWord<T>(word: string, name: ItemName<T>): NameMatch | null {
  return typoMatch(word, name.name, name.lower);
}

/** The matches of the words as the matches of a name, one per word */
function nameWordMatches(
  words: readonly string[],
  source: MatchSource,
  text: string,
  matches: readonly NameMatch[],
): WordMatch[] {
  const matched: WordMatch[] = [];
  for (let i = 0; i < words.length; i++) {
    matched.push(wordMatch(words[i], source, text, matches[i]));
  }
  return matched;
}

/**
 * Classes, enums, fields and members whose name has every word, one of them as a typo of a word of
 * the name: one letter added, left out, changed or swapped with the next. Fields are compared by
 * their words, which include the name without its type prefix
 */
function collectTypoHits(index: SearchIndex, parsed: ParsedSearch): SimilarHit[] {
  const { nameWords: words, moduleWords } = parsed;
  // A name without a word this long has no typo of any word
  const shortestTarget = shortestTypoTarget(words);
  if (shortestTarget === 0) return [];

  const hits: SimilarHit[] = [];
  for (const entry of index.entries) {
    const { declaration } = entry;
    if (!matchesModule(declaration.module, moduleWords)) continue;

    if (entry.longestWord >= shortestTarget) {
      const matches = matchTypoWords(words, entry, scoreEntryWord, typoEntryWord);
      if (matches !== null) {
        const matched = nameWordMatches(words, "name", declaration.name, matches);
        const { score } = combineMatches(matched);
        hits.push({
          kind: "fuzzy",
          declaration,
          tier: TIER_FUZZY,
          score,
          nameWords: matched,
          tags: NO_TAGS,
        });
      }
    }

    if ("fields" in entry) {
      for (const field of entry.fields) {
        if (field.longestWord < shortestTarget) continue;
        const fieldMatched = matchTypoItem(words, "field", field);
        if (fieldMatched === null) continue;
        hits.push(similarFieldHit(entry.declaration, field, fieldMatched));
      }
    } else {
      for (const member of entry.members) {
        if (member.longestWord < shortestTarget) continue;
        const memberMatched = matchTypoItem(words, "member", member);
        if (memberMatched === null) continue;
        hits.push(similarMemberHit(entry.declaration, member, memberMatched));
      }
    }
  }

  return hits;
}

function matchTypoItem<T>(
  words: string[],
  source: MatchSource,
  name: ItemName<T>,
): WordMatch[] | null {
  const matches = matchTypoWords(words, name, scoreItem, typoItemWord);
  if (matches === null) return null;
  return nameWordMatches(words, source, name.name, matches);
}

function similarWords(matched: WordMatch[]): ItemWords {
  const { score } = combineMatches(matched);
  return { classSide: NO_WORDS, itemSide: matched, tier: TIER_FUZZY, score };
}

function similarFieldHit(
  declaration: SchemaClass,
  name: ItemName<SchemaField>,
  matched: WordMatch[],
): FieldHit {
  return fieldHit(declaration, name, similarWords(matched), NO_TAGS);
}

function similarMemberHit(
  declaration: SchemaEnum,
  name: ItemName<SchemaEnumMember>,
  matched: WordMatch[],
): MemberHit {
  return memberHit(declaration, name, similarWords(matched), NO_TAGS);
}
