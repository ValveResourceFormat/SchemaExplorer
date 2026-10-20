import type { GameContext } from "../data/derived";
import type {
  Declaration,
  EnumValue,
  EntityInput,
  EntityOutput,
  SchemaClass,
  SchemaEnum,
  SchemaEnumMember,
  SchemaField,
  SchemaMetadataEntry,
} from "../data/types";
import type { NameMatch } from "./match-score";

export type SearchContext = Pick<
  GameContext,
  "declarations" | "entitiesByDeclaration" | "designNamesByDeclaration" | "crossModuleLookup"
>;

/** Where a matched name comes from */
export type MatchSource = "name" | "designName" | "field" | "member";

/** One name word matched against one name. The ranges index into `text` */
export interface WordMatch extends NameMatch {
  word: string;
  source: MatchSource;
  /** The matched name as shown: the declaration, an entity design name, a field or a member */
  text: string;
  /** For an entity design name that won: the tier the declaration name matched with, if it did */
  nameTier?: number;
}

/** Why a declaration, field or member matched besides its name */
export type TagMatch =
  | { kind: "entity"; designNames: string[] }
  | { kind: "io"; inputs: EntityInput[]; outputs: EntityOutput[] }
  | { kind: "metadata"; entries: SchemaMetadataEntry[] }
  | { kind: "network"; words: string[] }
  | { kind: "offset"; offset: number }
  | { kind: "enumValue"; value: EnumValue };

interface HitBase {
  declaration: Declaration;
  /** The worst tier of the name words, TIER_EXACT without any */
  tier: number;
  /** The sum of the scores of the name words */
  score: number;
  /** Name words that matched the declaration name or an entity design name */
  nameWords: readonly WordMatch[];
  tags: readonly TagMatch[];
}

/** A class or enum, found by its name, an entity design name, or only by tags */
export interface NameHit extends HitBase {
  kind: "name";
}

export interface FieldHit extends HitBase {
  kind: "field";
  declaration: SchemaClass;
  field: SchemaField;
  /** Name words that matched the field name, the rest are in nameWords */
  fieldWords: readonly WordMatch[];
}

export interface MemberHit extends HitBase {
  kind: "member";
  declaration: SchemaEnum;
  member: SchemaEnumMember;
  /** Name words that matched the member name, the rest are in nameWords */
  fieldWords: readonly WordMatch[];
}

/** A class or enum whose name only matches in order, not next to each other. Not a result */
export interface FuzzyHit extends HitBase {
  kind: "fuzzy";
}

/**
 * A field the classes of a split query have from a base: the class side words match the classes
 * and the other words match the field. One per declaring field
 */
export interface InheritedSide {
  /** The base class that declares the field */
  declaration: SchemaClass;
  field: SchemaField;
  /** Name words that matched the field name */
  fieldWords: readonly WordMatch[];
  /** The classes whose name matches the class side of the query and that have the field */
  classes: SchemaClass[];
  /** The worst tier of the field and the best class, set when the hits are ordered */
  tier: number;
  /** The summed score of the field words and the best class */
  score: number;
}

export type PairableHit = NameHit | FieldHit | MemberHit;

/**
 * A name that is only close to a query: a class or enum matching in order or by a typo, or a
 * field or member matching by a typo. They have the tier TIER_FUZZY
 */
export type SimilarHit = FuzzyHit | FieldHit | MemberHit;

/**
 * A hit, or two in one when the client and server class (see crossModuleLookup) hit the same
 * way. `hit` is the side whose name matched better, the server on a tie. For inherited fields it
 * is the server side
 */
export interface SearchRow<T extends { declaration: Declaration }> {
  hit: T;
  paired?: T;
}

export type SimilarRow = SearchRow<FuzzyHit> | SearchRow<FieldHit | MemberHit>;

export function isFuzzyRow(row: SimilarRow): row is SearchRow<FuzzyHit> {
  return row.hit.kind === "fuzzy";
}

export interface SearchResult {
  /** Classes and enums, sorted */
  names: SearchRow<NameHit>[];
  /** Fields and enum members, sorted */
  fields: SearchRow<FieldHit | MemberHit>[];
  /** Fields of base classes, by declaring class with the bases first, then by declaration order */
  inherited: SearchRow<InheritedSide>[];
  /** Fuzzy and typo hits of declarations without any other hit, typos first, sorted */
  similar: SimilarRow[];
  /** Declarations with at least one hit besides fuzzy ones, each once, the inherited classes too */
  declarations: Set<Declaration>;
}

export const NO_TAGS: readonly TagMatch[] = [];
export const NO_WORDS: readonly WordMatch[] = [];

/** The field or member name of a hit */
export function itemName(hit: FieldHit | MemberHit): string {
  return hit.kind === "field" ? hit.field.name : hit.member.name;
}

/** The hit of a row, and the paired one when it has one */
export function rowSides<T extends { declaration: Declaration }>(row: SearchRow<T>): T[] {
  return row.paired ? [row.hit, row.paired] : [row.hit];
}
