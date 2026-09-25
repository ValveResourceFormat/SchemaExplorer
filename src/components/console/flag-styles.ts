// Kept apart from components: the build evaluates this module to inline it into other files' CSS,
// and it can only do that for plain values

/** Sets --c to the color of the element's data-group flag group */
export const flagColorVars = `
  &[data-group="workshop"] {
    --c: var(--flag-workshop);
  }
  &[data-group="cheat"] {
    --c: var(--flag-cheat);
  }
  &[data-group="devonly"] {
    --c: var(--flag-devonly);
  }
  &[data-group="restricted"] {
    --c: var(--flag-restricted);
  }
  &[data-group="network"] {
    --c: var(--flag-network);
  }
  &[data-group="saved"] {
    --c: var(--flag-saved);
  }
`;
