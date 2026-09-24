/** How many items have each key */
export function countBy<T>(items: Iterable<T>, pick: (item: T) => Iterable<string>) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const k of pick(item)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}
