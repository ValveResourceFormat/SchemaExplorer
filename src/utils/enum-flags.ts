import type { SchemaEnumMember } from "../data/types";

const isPowerOf2 = (n: number) => n > 0 && (n & (n - 1)) === 0;

/**
 * Heuristically detect whether an enum's members represent bit flags.
 * Requires enough powers-of-2 members AND at least one composite member
 * that fully decomposes into those base flags.
 */
export function isFlagEnum(members: SchemaEnumMember[]): boolean {
  if (members.length < 3) return false;

  const baseFlags: number[] = [];
  const composites: number[] = [];

  for (const m of members) {
    if (isPowerOf2(m.value)) baseFlags.push(m.value);
    else if (m.value > 0) composites.push(m.value);
  }

  if (baseFlags.length < 3) return false;

  // In real flag enums, powers of 2 jump beyond the member count
  // (e.g., 1, 2, 4, 8, 256, 512...). In sequential enums (0,1,2,3,4),
  // the powers of 2 are just small values that happen to be sequential.
  const maxFlag = Math.max(...baseFlags);
  if (maxFlag < members.length) return false;

  // Check that at least one composite fully decomposes into base flags
  const baseMask = baseFlags.reduce((a, b) => a | b, 0);
  return composites.some((v) => (v & baseMask) === v && v !== 0);
}

/** Precomputed base flags for a flag enum, sorted largest-first. */
export type BaseFlags = { name: string; value: number }[];

/**
 * Extract the power-of-2 members from a flag enum, sorted largest-first.
 * Call once per enum and pass the result to decomposeFlags.
 */
export function getBaseFlags(members: SchemaEnumMember[]): BaseFlags {
  const flags: BaseFlags = [];
  for (const m of members) {
    if (isPowerOf2(m.value)) flags.push(m);
  }
  flags.sort((a, b) => b.value - a.value);
  return flags;
}

/**
 * For a composite (non-power-of-2) enum value, decompose it into constituent
 * base flag member names. Returns null for base flags / zero / if decomposition
 * doesn't fully cover the value.
 */
export function decomposeFlags(value: number, baseFlags: BaseFlags): string[] | null {
  if (value === 0 || isPowerOf2(value)) return null;

  const flags: string[] = [];
  let remaining = value;

  for (const flag of baseFlags) {
    if ((remaining & flag.value) === flag.value) {
      flags.push(flag.name);
      remaining &= ~flag.value;
    }
  }

  if (remaining !== 0) return null;

  flags.reverse();
  return flags;
}
