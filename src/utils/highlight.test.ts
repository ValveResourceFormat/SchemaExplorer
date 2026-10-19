import { describe, expect, it } from "vitest";
import { mergeRanges } from "./highlight";

describe("mergeRanges", () => {
  it("returns nothing without ranges", () => {
    expect(mergeRanges([])).toEqual([]);
    expect(mergeRanges([[], []])).toEqual([]);
  });

  it("sorts ranges from several lists", () => {
    expect(
      mergeRanges([
        [6, 8],
        [0, 2],
      ]),
    ).toEqual([0, 2, 6, 8]);
  });

  it("joins overlapping and touching ranges", () => {
    expect(
      mergeRanges([
        [0, 3],
        [2, 5],
        [5, 6],
        [9, 10],
      ]),
    ).toEqual([0, 6, 9, 10]);
  });

  it("keeps a range inside another", () => {
    expect(
      mergeRanges([
        [0, 10],
        [2, 4],
      ]),
    ).toEqual([0, 10]);
  });
});
