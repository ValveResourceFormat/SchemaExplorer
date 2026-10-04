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

/** A link in the highlight color, for the few that should stand out from the text */
export const highlightLink = `
  color: var(--highlight);
  ${subtleUnderline}
`;

/** A link in the color of the text around it, highlighted on hover */
export const dimLink = `
  color: inherit;
  ${subtleUnderline}

  &:hover {
    color: var(--highlight);
  }
`;
