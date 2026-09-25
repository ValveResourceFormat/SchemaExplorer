import { useContext } from "react";
import { NavLink } from "../Link";
import { styled } from "@linaria/react";
import { KindIcon } from "../kind-icon/KindIcon";
import { Declaration } from "../../data/types";
import { DeclarationsContext, schemaPath } from "../schema/DeclarationsContext";
import { sidebarRow, sidebarRowSelected } from "./sidebar-styles";
import { chevronBefore } from "../chevron-styles";

// @ts-expect-error Linaria styled() doesn't support ForwardRefExoticComponent
const SidebarLink = styled(NavLink)`
  ${sidebarRow}

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &.active {
    ${sidebarRowSelected}
  }
`;

export const DeclarationSidebarElement = ({
  declaration,
  onClick,
}: {
  declaration: Declaration;
  onClick?: () => void;
}) => {
  const { game } = useContext(DeclarationsContext);
  return (
    <SidebarLink
      to={schemaPath(game, declaration.module, declaration.name)}
      onClick={onClick}
      // Long names are cut off, the tooltip has all of it
      title={`${declaration.name}\n${declaration.kind} in ${declaration.module}`}
    >
      <KindIcon kind={declaration.kind} size="small" />
      <span>{declaration.name}</span>
    </SidebarLink>
  );
};

/** A collapsible group's header, its name lines up with the rows' names below it */
export const SidebarGroupHeader = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 8px 0 10px;
  border: none;
  background: var(--sidebar);
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-align: left;
  white-space: nowrap;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
  overflow: hidden;

  &:hover {
    color: var(--text);
  }

  ${chevronBefore}
`;

/** A dim count at the end of a row */
export const SidebarCount = styled.span`
  margin-left: auto;
  padding-left: 8px;
  font-weight: 400;
  color: var(--text-dim);
  font-variant-numeric: tabular-nums;
`;

export const SidebarWrapper = styled.nav`
  grid-column: 1;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  padding: 6px 8px 4px 10px;
  margin-right: 32px;
  background-color: var(--sidebar);
  position: sticky;
  top: 0;
  height: 100dvh;
  align-self: start;

  @media (max-width: 1100px) {
    margin-right: 24px;
  }

  @media (max-width: 768px) {
    margin-right: 0;
    flex: 1;
    min-height: 0;
  }
`;

export const SidebarList = styled.div`
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
`;
