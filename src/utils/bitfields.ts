import type { SchemaField } from "../data/types";

export interface BitfieldInfo {
  bitOffset: number;
  bitCount: number;
  padding: number; // padding bits after this field (only set on last bitfield in a group)
  totalBits: number; // total bits in the group (only set on last bitfield in a group)
}

export function computeBitfieldInfo(fields: SchemaField[]): Map<SchemaField, BitfieldInfo> {
  const result = new Map<SchemaField, BitfieldInfo>();
  let i = 0;
  while (i < fields.length) {
    const field = fields[i];
    if (field.type.category !== "bitfield") {
      i++;
      continue;
    }

    // Collect consecutive bitfields at the same offset
    const groupOffset = field.offset;
    let bitPos = 0;
    while (
      i < fields.length &&
      fields[i].type.category === "bitfield" &&
      fields[i].offset === groupOffset
    ) {
      const f = fields[i];
      const count = (f.type as { category: "bitfield"; count: number }).count;
      result.set(f, { bitOffset: bitPos, bitCount: count, padding: 0, totalBits: 0 });
      bitPos += count;
      i++;
    }

    // Compute padding to next byte boundary
    const lastField = fields[i - 1];
    const info = result.get(lastField)!;
    const remainder = bitPos % 8;
    info.totalBits = bitPos;
    if (remainder !== 0) {
      info.padding = 8 - remainder;
    }
  }
  return result;
}
