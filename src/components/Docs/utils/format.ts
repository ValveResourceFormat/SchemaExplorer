export function formatHexOffset(value: number): string {
  const hexDigits = value.toString(16).toUpperCase();
  const paddedHex = hexDigits.length % 2 !== 0 ? `0${hexDigits}` : hexDigits;
  return `0x${paddedHex}`;
}
