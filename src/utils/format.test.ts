import { describe, it, expect, vi } from "vitest";
import {
  formatHexOffset,
  formatEnumHex,
  isBigIntString,
  metadataValueText,
  padHex,
  stringifyKV3,
  toEnumValue,
} from "./format";

describe("toEnumValue", () => {
  it("keeps safe integers as numbers", () => {
    expect(toEnumValue(0)).toBe(0);
    expect(toEnumValue(-1)).toBe(-1);
    expect(toEnumValue(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
    expect(toEnumValue("4294967295")).toBe(4294967295);
  });

  it("reads the dump's decimal strings past 2^53 exactly", () => {
    expect(toEnumValue("1152921504606846977")).toBe(1152921504606846977n);
    expect(toEnumValue("-9223372036854775808")).toBe(-9223372036854775808n);
  });

  it("turns numbers past 2^53 into bigints, so they match the same value from a string", () => {
    expect(toEnumValue(2 ** 60)).toBe(1152921504606846976n);
    expect(toEnumValue(2 ** 60)).toBe(toEnumValue("1152921504606846976"));
  });

  it("prints every digit", () => {
    expect(String(toEnumValue(2 ** 62))).toBe("4611686018427387904");
  });
});

describe("isBigIntString", () => {
  it("matches integers past 2^53", () => {
    expect(isBigIntString("18446744073709551615")).toBe(true);
    expect(isBigIntString("-9223372036854775808")).toBe(true);
    expect(isBigIntString("9007199254740992")).toBe(true);
  });

  it("leaves other strings alone", () => {
    expect(isBigIntString("9007199254740991")).toBe(false);
    expect(isBigIntString("12345")).toBe(false);
    expect(isBigIntString("18446744073709551615x")).toBe(false);
    expect(isBigIntString("")).toBe(false);
  });
});

describe("stringifyKV3", () => {
  it("writes big integer strings as numbers, anywhere in the value", () => {
    expect(stringifyKV3({ a: "18446744073709551615", b: ["-9223372036854775808", 1] })).toBe(
      '{"a":18446744073709551615,"b":[-9223372036854775808,1]}',
    );
  });

  it("keeps other strings and keys quoted", () => {
    expect(stringifyKV3({ "18446744073709551615": "12345", c: "x" })).toBe(
      '{"18446744073709551615":"12345","c":"x"}',
    );
  });

  it("indents like JSON.stringify", () => {
    expect(stringifyKV3({ a: "18446744073709551615" }, "\t")).toBe(
      '{\n\t"a": 18446744073709551615\n}',
    );
  });
});

describe("padHex", () => {
  it("pads to a number of hex digits", () => {
    expect(padHex("0x08", 4)).toBe("0x0008");
    expect(padHex("0x04A8", 4)).toBe("0x04A8");
  });
});

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

    it("formats bigints past 2^53", () => {
      expect(formatEnumHex(1152921504606846977n, "uint64_t")).toBe("0x1000000000000001");
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

    it("converts INT64_MIN as a bigint to 0x8000000000000000", () => {
      expect(formatEnumHex(-9223372036854775808n, "uint64_t")).toBe("0x8000000000000000");
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

describe("metadataValueText", () => {
  it("returns text values as-is", () => {
    expect(metadataValueText('"fish_pos_x"')).toBe('"fish_pos_x"');
    expect(metadataValueText(undefined)).toBeUndefined();
  });

  it("stringifies each object once", () => {
    const value = { m_a: [1, 2] };
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      const first = metadataValueText(value);
      expect(metadataValueText(value)).toBe(first);
      expect(stringify).toHaveBeenCalledTimes(1);
    } finally {
      stringify.mockRestore();
    }
  });

  it("formats object values as indented JSON", () => {
    expect(metadataValueText({ m_a: 1 })).toBe('{\n\t"m_a": 1\n}');
  });
});
