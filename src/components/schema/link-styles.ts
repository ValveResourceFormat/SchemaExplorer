// Kept apart from styles.tsx: the build evaluates this module to inline it into other files' CSS,
// and it can only do that for plain values

/** A faint underline on links among other text, so they aren't told apart by color alone */
export const subtleUnderline = `
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
  text-decoration-color: color-mix(in srgb, currentColor 30%, transparent);

  &:hover {
    text-decoration-color: currentColor;
  }
`;
