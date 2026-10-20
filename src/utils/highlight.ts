/**
 * Joins lists of [start, end, ...] ranges into one sorted list. Overlapping and touching ranges
 * become one range
 */
export function mergeRanges(lists: readonly (readonly number[])[]): number[] {
  const pairs: [number, number][] = [];
  for (const list of lists) {
    for (let i = 0; i + 1 < list.length; i += 2) pairs.push([list[i], list[i + 1]]);
  }
  pairs.sort((a, b) => a[0] - b[0]);

  const merged: number[] = [];
  for (const [start, end] of pairs) {
    const last = merged.length - 1;
    if (last >= 0 && start <= merged[last]) {
      merged[last] = Math.max(merged[last], end);
    } else {
      merged.push(start, end);
    }
  }
  return merged;
}
