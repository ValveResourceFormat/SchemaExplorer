import { matchesNetworkWords } from "../data/network";
import type {
  Declaration,
  SchemaEnumMember,
  SchemaField,
  SchemaMetadataEntry,
} from "../data/types";
import {
  matchesMetadataKeys,
  matchesMetadataValues,
  namesMatching,
  type ParsedSearch,
} from "./filtering";
import { metadataValueText } from "./format";
import type { SearchEntry } from "./search-index";
import { NO_TAGS, type SearchContext, type TagMatch } from "./search-types";

export function hasMetadataFilter(parsed: ParsedSearch): boolean {
  return parsed.metadataKeys.length > 0 || parsed.metadataValues.length > 0;
}

function metadataSatisfied(metadata: SchemaMetadataEntry[], parsed: ParsedSearch): boolean {
  if (!hasMetadataFilter(parsed)) return true;
  const { metadataKeys, metadataValues } = parsed;
  if (metadataKeys.length > 0 && !matchesMetadataKeys(metadata, metadataKeys)) return false;
  if (metadataValues.length > 0 && !matchesMetadataValues(metadata, metadataValues)) return false;
  return true;
}

/** The entries with a metadata: key or a metadatavalue: value in them */
function matchingMetadata(
  metadata: SchemaMetadataEntry[],
  keys: string[],
  values: string[],
): SchemaMetadataEntry[] {
  return metadata.filter((entry) => {
    const name = entry.name.toLowerCase();
    if (keys.some((key) => name.includes(key))) return true;
    const text = metadataValueText(entry.value)?.toLowerCase();
    return text !== undefined && values.some((value) => text.includes(value));
  });
}

/**
 * Adds the tag of the metadata: and metadatavalue: filters for metadata that has what they ask
 * for, nothing without such filters. False when the metadata misses one
 */
function addMetadataTag(
  tags: TagMatch[],
  metadata: SchemaMetadataEntry[],
  parsed: ParsedSearch,
): boolean {
  if (!metadataSatisfied(metadata, parsed)) return false;
  if (!hasMetadataFilter(parsed)) return true;

  const { metadataKeys, metadataValues } = parsed;
  const entries = matchingMetadata(metadata, metadataKeys, metadataValues);
  tags.push({ kind: "metadata", entries });
  return true;
}

export function hasEntityFilter(parsed: ParsedSearch): boolean {
  return (
    parsed.entityWords.length > 0 || parsed.inputWords.length > 0 || parsed.outputWords.length > 0
  );
}

/** The entity: and input:/output: filters of a declaration, null when it doesn't pass them */
export function entityTags(
  context: SearchContext,
  entry: SearchEntry,
  parsed: ParsedSearch,
): readonly TagMatch[] | null {
  if (!hasEntityFilter(parsed)) return NO_TAGS;

  const { entityWords, inputWords, outputWords } = parsed;
  const tags: TagMatch[] = [];

  // OR across entity: words, like module:
  if (entityWords.length > 0) {
    const matching: string[] = [];
    for (const designName of entry.designNames) {
      if (entityWords.some((w) => designName.lower.includes(w))) matching.push(designName.name);
    }
    if (matching.length === 0) return null;
    tags.push({ kind: "entity", designNames: matching });
  }

  if (inputWords.length > 0 || outputWords.length > 0) {
    const entities = context.entitiesByDeclaration.get(entry.declaration);
    if (!entities) return null;
    // Only the entity's own inputs/outputs, inherited ones would match every entity
    const inputs = namesMatching(
      entities.map((e) => e.inputs),
      inputWords,
    );
    const outputs = namesMatching(
      entities.map((e) => e.outputs),
      outputWords,
    );
    if (inputWords.length > 0 && inputs.length === 0) return null;
    if (outputWords.length > 0 && outputs.length === 0) return null;
    tags.push({ kind: "io", inputs, outputs });
  }

  return tags;
}

/**
 * The metadata: and network: filters a declaration satisfies itself, as tags. Null when it
 * misses one. Enums have no network data
 */
export function declarationTags(
  declaration: Declaration,
  parsed: ParsedSearch,
): readonly TagMatch[] | null {
  const { networkWords } = parsed;
  if (!hasMetadataFilter(parsed) && networkWords.length === 0) return NO_TAGS;
  const tags: TagMatch[] = [];

  if (!addMetadataTag(tags, declaration.metadata, parsed)) return null;

  if (networkWords.length > 0) {
    const network = declaration.kind === "class" ? declaration.network : undefined;
    if (!network || !matchesNetworkWords(network, networkWords)) return null;
    tags.push({ kind: "network", words: networkWords });
  }

  return tags;
}

/**
 * The offset:, metadata: and network: filters of a field, null when it misses one. A field has no
 * enum value
 */
export function fieldTags(field: SchemaField, parsed: ParsedSearch): readonly TagMatch[] | null {
  const { offsets, enumValues, networkWords } = parsed;
  if (enumValues.size > 0) return null;
  if (offsets.size === 0 && !hasMetadataFilter(parsed) && networkWords.length === 0) {
    return NO_TAGS;
  }
  const tags: TagMatch[] = [];

  if (offsets.size > 0) {
    if (field.offset === undefined || !offsets.has(field.offset)) return null;
    tags.push({ kind: "offset", offset: field.offset });
  }

  if (!addMetadataTag(tags, field.metadata, parsed)) return null;

  if (networkWords.length > 0) {
    if (!field.network || !matchesNetworkWords(field.network, networkWords)) return null;
    tags.push({ kind: "network", words: networkWords });
  }

  return tags;
}

/** The enumvalue: and metadata: filters of a member, null when it misses one. It has no offset */
export function memberTags(
  member: SchemaEnumMember,
  parsed: ParsedSearch,
): readonly TagMatch[] | null {
  const { offsets, enumValues, networkWords } = parsed;
  if (offsets.size > 0 || networkWords.length > 0) return null;
  if (enumValues.size === 0 && !hasMetadataFilter(parsed)) return NO_TAGS;
  const tags: TagMatch[] = [];

  if (enumValues.size > 0) {
    if (!enumValues.has(member.value)) return null;
    tags.push({ kind: "enumValue", value: member.value });
  }

  if (!addMetadataTag(tags, member.metadata, parsed)) return null;

  return tags;
}

/**
 * The metadata: and network: tags a declaration satisfies itself, for its fields and members to
 * list by name words alone. Null without name words, without such filters, or when it misses one
 */
export function sharedItemTags(
  own: readonly TagMatch[] | null,
  parsed: ParsedSearch,
): readonly TagMatch[] | null {
  if (parsed.nameWords.length === 0) return null;
  if (!hasMetadataFilter(parsed) && parsed.networkWords.length === 0) return null;
  return own;
}

/** The tags of a field that has the declaration's metadata and network tags, the offset: its own */
export function fieldTagsWithShared(
  field: SchemaField,
  parsed: ParsedSearch,
  shared: readonly TagMatch[],
): readonly TagMatch[] | null {
  const { offsets, enumValues } = parsed;
  if (enumValues.size > 0) return null;
  if (offsets.size === 0) return shared;
  if (field.offset === undefined || !offsets.has(field.offset)) return null;
  return [{ kind: "offset", offset: field.offset }, ...shared];
}

/** The tags of a member that has the declaration's metadata tags, the enumvalue: its own */
export function memberTagsWithShared(
  member: SchemaEnumMember,
  parsed: ParsedSearch,
  shared: readonly TagMatch[],
): readonly TagMatch[] | null {
  const { offsets, enumValues } = parsed;
  if (offsets.size > 0) return null;
  if (enumValues.size === 0) return shared;
  if (!enumValues.has(member.value)) return null;
  return [{ kind: "enumValue", value: member.value }, ...shared];
}
