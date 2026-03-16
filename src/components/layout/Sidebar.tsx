import React, { useContext } from "react";
import { NavLink } from "react-router-dom";
import { styled } from "@linaria/react";
import { IconKind, KindIcon } from "../KindIcon";
import { Declaration } from "../Docs/api";
import { DeclarationsContext } from "../Docs/DeclarationsContext";

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

export const SidebarElement: React.FC<{
  to: string;
  icon: IconKind;
  text: string;
  onClick?: () => void;
}> = React.memo(({ to, icon, text, onClick }) => (
  <SidebarLink to={to} prefetch="none" onClick={onClick}>
    <KindIcon kind={icon} size="small" />
    <span>{text}</span>
  </SidebarLink>
));

export const DeclarationSidebarElement: React.FC<{
  declaration: Declaration;
  onClick?: () => void;
}> = React.memo(({ declaration, onClick }) => {
  const { root } = useContext(DeclarationsContext);
  return (
    <SidebarElement
      to={`${root}/${declaration.module}/${declaration.name}`}
      icon={declaration.kind}
      text={declaration.name}
      onClick={onClick}
    />
  );
});

export const SidebarGroupHeader = styled.button`
  background: var(--sidebar);
  border: none;
  width: 100%;
  padding: 0 8px;
  height: 30px;
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

export const SidebarWrapper = styled.div`
  grid-column: 1;
  grid-row: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  padding: 6px 8px 4px 10px;
  background-color: var(--sidebar);
`;
