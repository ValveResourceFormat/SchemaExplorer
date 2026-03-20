import { describe, it, expect } from "vitest";
import { formatHexOffset, formatEnumHex } from "./format";

describe("formatHexOffset", () => {
  it("formats zero", () => {
    expect(formatHexOffset(0)).toBe("0x00");
  });

  it("pads single hex digit to two", () => {
    expect(formatHexOffset(1)).toBe("0x01");
    expect(formatHexOffset(15)).toBe("0x0F");
  });

  it("does not pad even-length hex", () => {
    expect(formatHexOffset(16)).toBe("0x10");
    expect(formatHexOffset(255)).toBe("0xFF");
  });

  it("pads odd-length hex digits", () => {
    expect(formatHexOffset(256)).toBe("0x0100");
    expect(formatHexOffset(0xfffff)).toBe("0x0FFFFF");
  });

  it("formats large values", () => {
    expect(formatHexOffset(0xffffffff)).toBe("0xFFFFFFFF");
    expect(formatHexOffset(0xdeadbeef)).toBe("0xDEADBEEF");
  });
});

describe("formatEnumHex", () => {
  describe("non-negative values", () => {
    it("returns hex regardless of alignment", () => {
      expect(formatEnumHex(0, "uint32_t")).toBe("0x00");
      expect(formatEnumHex(1, "uint8_t")).toBe("0x01");
      expect(formatEnumHex(255, "uint16_t")).toBe("0xFF");
      expect(formatEnumHex(0xdead, "uint64_t")).toBe("0xDEAD");
    });
  });

  describe("negative values with uint8_t", () => {
    it("converts -1 to 0xFF", () => {
      expect(formatEnumHex(-1, "uint8_t")).toBe("0xFF");
    });

    it("converts -128 to 0x80", () => {
      expect(formatEnumHex(-128, "uint8_t")).toBe("0x80");
    });
  });

  describe("negative values with uint16_t", () => {
    it("converts -1 to 0xFFFF", () => {
      expect(formatEnumHex(-1, "uint16_t")).toBe("0xFFFF");
    });

    it("converts -32768 to 0x8000", () => {
      expect(formatEnumHex(-32768, "uint16_t")).toBe("0x8000");
    });
  });

  describe("negative values with uint32_t", () => {
    it("converts -1 to 0xFFFFFFFF", () => {
      expect(formatEnumHex(-1, "uint32_t")).toBe("0xFFFFFFFF");
    });

    it("converts -2 to 0xFFFFFFFE", () => {
      expect(formatEnumHex(-2, "uint32_t")).toBe("0xFFFFFFFE");
    });

    it("converts INT32_MIN to 0x80000000", () => {
      expect(formatEnumHex(-2147483648, "uint32_t")).toBe("0x80000000");
    });
  });

  describe("negative values with uint64_t", () => {
    it("converts -1 to 0xFFFFFFFFFFFFFFFF", () => {
      expect(formatEnumHex(-1, "uint64_t")).toBe("0xFFFFFFFFFFFFFFFF");
    });

    it("converts -2 to 0xFFFFFFFFFFFFFFFE", () => {
      expect(formatEnumHex(-2, "uint64_t")).toBe("0xFFFFFFFFFFFFFFFE");
    });
  });

  describe("negative values with uint64_t padding", () => {
    it("pads to even hex digits in 64-bit path", () => {
      expect(formatEnumHex(-1, "uint64_t")).toBe("0xFFFFFFFFFFFFFFFF");
      expect(formatEnumHex(-2, "uint64_t")).toBe("0xFFFFFFFFFFFFFFFE");
    });

    it("handles large negative 64-bit values", () => {
      // Verify the BigInt conversion stays consistent
      expect(formatEnumHex(-9007199254740991, "uint64_t")).toBe("0xFFE0000000000001");
    });
  });

  describe("unknown alignment", () => {
    it("returns null for negative values", () => {
      expect(formatEnumHex(-1, "unknown")).toBeNull();
      expect(formatEnumHex(-1, "int32_t")).toBeNull();
    });

    it("still returns hex for non-negative values", () => {
      expect(formatEnumHex(42, "unknown")).toBe("0x2A");
    });
  });
});
