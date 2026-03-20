import React, { useContext } from "react";
import { NavLink } from "../Link";
import { styled } from "@linaria/react";
import { IconKind, KindIcon } from "../kind-icon/KindIcon";
import { Declaration } from "../../data/types";
import { DeclarationsContext, schemaPath } from "../schema/DeclarationsContext";

// @ts-expect-error Linaria styled() doesn't support ForwardRefExoticComponent
const SidebarLink = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border-left: 2px solid transparent;
  padding: 0 8px;
  height: 28px;
  text-decoration: none;
  color: var(--text);
  white-space: nowrap;

  > svg {
    flex-shrink: 0;
  }

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  box-sizing: border-box;
  font-size: 14px;
  transition:
    background 0.1s,
    color 0.1s;

  &:hover {
    background: var(--group-members);
  }

  &.active {
    font-weight: 600;
    background: color-mix(in srgb, var(--highlight) 9%, transparent);
    border-left: 2px solid var(--highlight);
    color: var(--highlight);
  }
`;

const SidebarElement: React.FC<{
  to: string;
  icon: IconKind;
  text: string;
  title?: string;
  onClick?: () => void;
}> = React.memo(({ to, icon, text, title, onClick }) => (
  <SidebarLink to={to} onClick={onClick} title={title}>
    <KindIcon kind={icon} size="small" />
    <span>{text}</span>
  </SidebarLink>
));

export const DeclarationSidebarElement: React.FC<{
  declaration: Declaration;
  onClick?: () => void;
}> = React.memo(({ declaration, onClick }) => {
  const { game } = useContext(DeclarationsContext);
  return (
    <SidebarElement
      to={schemaPath(game, declaration.module, declaration.name)}
      icon={declaration.kind}
      text={declaration.name}
      title={`${declaration.kind} in ${declaration.module}`}
      onClick={onClick}
    />
  );
});

export const SidebarGroupHeader = styled.button`
  background: var(--sidebar);
  border: none;
  width: 100%;
  padding: 0 8px;
  height: 28px;
  box-sizing: border-box;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: left;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  gap: 4px;
  overflow: hidden;
  white-space: nowrap;
  min-width: 0;
  transition: color 0.1s;

  &:hover {
    color: var(--text);
  }

  &::before {
    content: "\\25BC";
    font-size: 9px;
    opacity: 0.6;
  }

  &[data-collapsed]::before {
    content: "\\25B6";
  }
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

  @media (max-width: 768px) {
    margin-right: 0;
    flex: 1;
    min-height: 0;
  }
`;
