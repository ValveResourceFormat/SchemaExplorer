import { styled } from "@linaria/react";

export const MatchHighlight = styled.span`
  background: color-mix(in srgb, var(--highlight) 25%, transparent);
  border-radius: 2px;
`;

/**
 * The text with the parts given as sorted [start, end, ...] ranges marked. It is one element, so
 * the parts don't become separate items in a flex container like a pill
 */
export function HighlightRanges({ text, ranges }: { text: string; ranges: readonly number[] }) {
  if (ranges.length === 0) return <span>{text}</span>;

  const parts: React.ReactNode[] = [];
  let position = 0;
  for (let i = 0; i + 1 < ranges.length; i += 2) {
    const start = ranges[i];
    const end = ranges[i + 1];
    if (start > position) parts.push(text.slice(position, start));
    parts.push(<MatchHighlight key={i}>{text.slice(start, end)}</MatchHighlight>);
    position = end;
  }
  if (position < text.length) parts.push(text.slice(position));
  return <span>{parts}</span>;
}
