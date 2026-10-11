import type { EnumValue, SchemaFieldType, SchemaMetadataValue } from "../data/types";

/** A type as C++ text, like CUtlVector< CHandle< CBaseEntity > > */
export function formatFieldType(type: SchemaFieldType): string {
  switch (type.category) {
    case "builtin":
    case "declared_class":
    case "declared_enum":
      return type.name;
    case "ptr":
      return `${formatFieldType(type.inner)}*`;
    case "fixed_array":
      return `${formatFieldType(type.inner)}[${type.count}]`;
    case "atomic": {
      const args = [type.inner, type.inner2].filter((t) => t != null).map(formatFieldType);
      if (type.count != null) args.push(String(type.count));
      return args.length > 0 ? `${type.name}< ${args.join(", ")} >` : type.name;
    }
    case "bitfield":
      return `bitfield:${type.count}`;
  }
}

const metadataTextCache = new WeakMap<object, string>();

/** Metadata values as display and search text, objects as indented JSON (cached per object) */
export function metadataValueText(value: SchemaMetadataValue | undefined): string | undefined {
  if (value === undefined || typeof value === "string") return value;
  let text = metadataTextCache.get(value);
  if (text === undefined) {
    text = stringifyKV3(value, "\t");
    metadataTextCache.set(value, text);
  }
  return text;
}

/** "1 field", "2 fields" */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * An enum value in its one form: a number when it's a safe integer, a bigint past ±(2^53 − 1).
 * The dump writes those as decimal strings, since JSON numbers that large lose digits when parsed
 */
export function toEnumValue(value: number | bigint | string): EnumValue {
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  const big = BigInt(value);
  return big >= -MAX_SAFE && big <= MAX_SAFE ? Number(big) : big;
}

/**
 * KV3 default integers past ±(2^53 − 1), which the dump writes as decimal strings. A string field
 * holding only such digits would look the same, but no default does
 */
export function isBigIntString(value: string): boolean {
  return /^-?\d+$/.test(value) && !Number.isSafeInteger(Number(value));
}

/** JSON text of KV3 defaults, the big integers the dump writes as strings back as numbers */
export function stringifyKV3(value: unknown, space?: string): string {
  return JSON.stringify(value, null, space).replace(/"(-?\d+)"(?!\s*:)/g, (match, digits) =>
    isBigIntString(digits) ? digits : match,
  );
}

export function formatHexOffset(value: number | bigint): string {
  const hexDigits = value.toString(16).toUpperCase();
  const paddedHex = hexDigits.length % 2 !== 0 ? `0${hexDigits}` : hexDigits;
  return `0x${paddedHex}`;
}

/** Pads a formatted 0x value to a number of hex digits, so a column of them lines up */
export function padHex(hex: string, digits: number): string {
  return `0x${hex.slice(2).padStart(digits, "0")}`;
}

const alignmentBits: Record<string, number> = {
  uint8_t: 8,
  uint16_t: 16,
  uint32_t: 32,
  uint64_t: 64,
};

/** Negative values as the unsigned bits of the enum's underlying type */
export function formatEnumHex(value: EnumValue, alignment: string): string | null {
  if (value >= 0) {
    return formatHexOffset(value);
  }

  const bits = alignmentBits[alignment];
  if (!bits) {
    return null;
  }

  return formatHexOffset(BigInt.asUintN(bits, BigInt(value)));
}
