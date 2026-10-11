import type { EnumValue, SchemaEnumMember } from "../data/types";

// BigInt throughout: 64-bit enums have flags past bit 31, which number bitwise operators drop

function isPowerOf2(n: EnumValue): boolean {
  const big = BigInt(n);
  return big > 0n && (big & (big - 1n)) === 0n;
}

/**
 * Heuristically detect whether an enum's members represent bit flags.
 * Requires enough powers-of-2 members AND at least one composite member
 * that fully decomposes into those base flags.
 */
export function isFlagEnum(members: SchemaEnumMember[]): boolean {
  if (members.length < 3) return false;

  const baseFlags: EnumValue[] = [];
  const composites: EnumValue[] = [];

  for (const m of members) {
    if (isPowerOf2(m.value)) baseFlags.push(m.value);
    else if (m.value > 0) composites.push(m.value);
  }

  if (baseFlags.length < 3) return false;

  // In real flag enums, powers of 2 jump beyond the member count
  // (e.g., 1, 2, 4, 8, 256, 512...). In sequential enums (0,1,2,3,4),
  // the powers of 2 are just small values that happen to be sequential.
  if (!baseFlags.some((f) => f >= members.length)) return false;

  // Check that at least one composite fully decomposes into base flags
  let baseMask = 0n;
  for (const f of baseFlags) baseMask |= BigInt(f);
  return composites.some((v) => (BigInt(v) & baseMask) === BigInt(v));
}

/** Precomputed base flags for a flag enum, sorted largest-first. */
export type BaseFlags = { name: string; value: EnumValue }[];

/**
 * Extract the power-of-2 members from a flag enum, sorted largest-first.
 * Call once per enum and pass the result to decomposeFlags.
 */
export function getBaseFlags(members: SchemaEnumMember[]): BaseFlags {
  const flags: BaseFlags = [];
  for (const m of members) {
    if (isPowerOf2(m.value)) flags.push(m);
  }
  flags.sort((a, b) => (a.value < b.value ? 1 : a.value > b.value ? -1 : 0));
  return flags;
}

/**
 * For a composite (non-power-of-2) enum value, decompose it into constituent
 * base flag member names. Returns null for base flags / zero / if decomposition
 * doesn't fully cover the value.
 */
export function decomposeFlags(value: EnumValue, baseFlags: BaseFlags): string[] | null {
  if (value <= 0 || isPowerOf2(value)) return null;

  const flags: string[] = [];
  let remaining = BigInt(value);

  for (const flag of baseFlags) {
    const fv = BigInt(flag.value);
    if ((remaining & fv) === fv) {
      flags.push(flag.name);
      remaining &= ~fv;
    }
  }

  if (remaining !== 0n) return null;

  flags.reverse();
  return flags;
}
