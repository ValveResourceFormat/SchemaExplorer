// Kept apart from components: the build evaluates this module to inline it into other files' CSS,
// and it can only do that for plain values

// Codicons chevron-down, like the other icons in icons.svg
const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath d='M3.15 5.85l4.5 4.5c.19.2.51.2.7 0l4.5-4.5c.2-.19.2-.51 0-.7-.19-.2-.51-.2-.7 0L8 9.29 3.85 5.15c-.19-.2-.51-.2-.7 0-.2.19-.2.51 0 .7z'/%3E%3C/svg%3E")`;

/** A chevron before the text, pointing down while expanded and right while collapsed */
export const chevronBefore = `
  &::before {
    content: "";
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    background: currentColor;
    mask: ${CHEVRON} center / contain no-repeat;
    transition: rotate 0.1s;
  }

  &[data-collapsed]::before,
  &[aria-expanded="false"]::before {
    rotate: -90deg;
  }
`;
