// Kept apart from components: the build evaluates this module to inline it into other files' CSS,
// and it can only do that for plain values

/** A square button with only an icon, like the menu and theme buttons */
export const iconButton = `
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;

  &:hover {
    background: var(--group-members);
    color: var(--text);
  }
`;

/** A sidebar row, for links and filter buttons alike */
export const sidebarRow = `
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  font: inherit;
  font-size: 14px;
  text-align: left;
  text-decoration: none;
  white-space: nowrap;
  color: var(--text);
  cursor: pointer;

  > svg {
    flex-shrink: 0;
    /* Rounds the game icons' corners */
    border-radius: 3px;
  }

  &:hover {
    background: var(--group-members);
  }
`;

/** The row of the page being shown, or a filter that's on */
export const sidebarRowSelected = `
  font-weight: 600;
  background: color-mix(in srgb, var(--highlight) 9%, transparent);
  border-left-color: var(--highlight);
  color: var(--highlight);
`;
