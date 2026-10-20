import type { EnumValue, SchemaEnumMember } from "../data/types";

// This file uses BigInt throughout. 64-bit enums have flags past bit 31, and number bitwise
// operators drop those bits

function isPowerOf2(n: EnumValue): boolean {
  const big = BigInt(n);
  return big > 0n && (big & (big - 1n)) === 0n;
}

/**
 * Heuristically detects whether the members of an enum are bit flags.
 * The enum needs enough power-of-2 members, and at least one composite member
 * that fully decomposes into those base flags
 */
export function isFlagEnum(members: SchemaEnumMember[]): boolean {
  if (members.length < 3) return false;

  const baseFlags: EnumValue[] = [];
  const composites: EnumValue[] = [];

  for (const m of members) {
    if (isPowerOf2(m.value)) {
      baseFlags.push(m.value);
    } else if (m.value > 0) {
      composites.push(m.value);
    }
  }

  if (baseFlags.length < 3) return false;

  // In real flag enums, powers of 2 jump beyond the member count
  // (e.g., 1, 2, 4, 8, 256, 512...). In sequential enums (0,1,2,3,4),
  // the powers of 2 are just small values that happen to be sequential.
  if (!baseFlags.some((f) => f >= members.length)) return false;

  let baseMask = 0n;
  for (const f of baseFlags) baseMask |= BigInt(f);
  return composites.some((v) => (BigInt(v) & baseMask) === BigInt(v));
}

/** Precomputed base flags for a flag enum, sorted largest-first. */
export type BaseFlags = { name: string; value: EnumValue }[];

/**
 * Extracts the power-of-2 members of a flag enum, sorted largest-first.
 * Call it once per enum, and pass the result to decomposeFlags
 */
export function getBaseFlags(members: SchemaEnumMember[]): BaseFlags {
  const flags: BaseFlags = [];
  for (const m of members) {
    if (isPowerOf2(m.value)) flags.push(m);
  }
  flags.sort((a, b) => {
    if (a.value < b.value) return 1;
    if (a.value > b.value) return -1;
    return 0;
  });

  return flags;
}

/**
 * Splits a composite (non-power-of-2) enum value into the names of its base
 * flag members. Returns null for a base flag, for zero, and when the base flags
 * don't fully cover the value
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
