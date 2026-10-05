// Kept apart from components: the build evaluates this module to inline it into other files' CSS,
// and it can only do that for plain values

/** A chevron before the text, pointing down while expanded and right while collapsed */
export const chevronBefore = `
  &::before {
    content: "";
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    background: currentColor;
    mask: var(--mask-chevron) center / contain no-repeat;
    transition: rotate 0.1s;
  }

  &[data-collapsed]::before,
  &[aria-expanded="false"]::before {
    rotate: -90deg;
  }
`;
