import { styled } from "@linaria/react";
import { UiIcon } from "../kind-icon/KindIcon";
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
          <UiIcon name="menu" />
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
