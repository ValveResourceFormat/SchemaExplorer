import { styled } from "@linaria/react";
import { SearchBox } from "../search/SearchBox";
import type { SearchMode } from "../../utils/section-search";
import { iconButton } from "./sidebar-styles";

export const NavBar = ({
  onMenuClick,
  section = "schemas",
}: {
  onMenuClick?: () => void;
  section?: SearchMode;
}) => {
  return (
    <NavBarContentCell>
      {onMenuClick && (
        <MenuButton onClick={onMenuClick} aria-label="Open sidebar">
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </MenuButton>
      )}
      <NavBarSearchBox mode={section} />
    </NavBarContentCell>
  );
};

const MenuButton = styled.button`
  ${iconButton}
  display: none;
  color: var(--text);

  @media (max-width: 768px) {
    display: grid;
  }
`;

const NavBarContentCell = styled.header`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  min-width: 0;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--background);

  @media (max-width: 768px) {
    grid-column: 1;
    gap: 4px;
  }
`;

const NavBarSearchBox = styled(SearchBox)`
  flex: 1;
  min-width: 0;
`;
