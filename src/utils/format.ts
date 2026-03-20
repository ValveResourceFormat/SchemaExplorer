export function formatHexOffset(value: number): string {
  const hexDigits = value.toString(16).toUpperCase();
  const paddedHex = hexDigits.length % 2 !== 0 ? `0${hexDigits}` : hexDigits;
  return `0x${paddedHex}`;
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
