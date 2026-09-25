// Kept apart from components: the build evaluates this module to inline it into other files' CSS,
// and it can only do that for plain values

const CHEVRON = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='m6 9 6 6 6-6' fill='none' stroke='%23000' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;

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
