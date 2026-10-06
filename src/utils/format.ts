import type { SchemaFieldType, SchemaMetadataValue } from "../data/types";

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
    text = JSON.stringify(value, null, "\t");
    metadataTextCache.set(value, text);
  }
  return text;
}

/** "1 field", "2 fields" */
export function plural(n: number, word: string): string {
  return `${n} ${word}${n !== 1 ? "s" : ""}`;
}

export function formatHexOffset(value: number): string {
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

export function formatEnumHex(value: number, alignment: string): string | null {
  if (value >= 0) {
    return formatHexOffset(value);
  }

  const bits = alignmentBits[alignment];
  if (!bits) {
    return null;
  }

  if (bits <= 32) {
    const unsigned = bits === 32 ? value >>> 0 : (value >>> 0) & ((1 << bits) - 1);
    return formatHexOffset(unsigned);
  }

  // For 64-bit, use BigInt
  const unsigned = BigInt(value) & ((1n << BigInt(bits)) - 1n);
  const hexDigits = unsigned.toString(16).toUpperCase();
  const paddedHex = hexDigits.length % 2 !== 0 ? `0${hexDigits}` : hexDigits;
  return `0x${paddedHex}`;
}
