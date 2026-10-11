// Kept apart from components: the build evaluates this module to inline it into other files' CSS,
// and it can only do that for plain values

/** Hover styles only for a mouse, touch screens would keep them stuck on after a tap */
export const hover = (styles: string) => `
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      ${styles}
    }
  }
`;

/** The same styles on hover and while pressed, so taps get them too */
export const hoverAndPress = (styles: string) => `
  ${hover(styles)}

  &:active {
    ${styles}
  }
`;

/** Shrinks a little while pressed, unless reduced motion is asked for */
export const pressScale = (scale: number) => `
  @media (prefers-reduced-motion: no-preference) {
    transition: transform 120ms var(--ease-out);

    &:active {
      transform: scale(${scale});
    }
  }
`;
