import React, { useContext } from "react";
import { href } from "react-router";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import { DeclarationsContext, declarationPath } from "./DeclarationsContext";
import { getGameDef, SITE_ORIGIN } from "../../games-list";

const BreadcrumbNav = styled.nav`
  margin: 0 0 10px 4px;
  font-size: 13px;
`;

const BreadcrumbList = styled.ol`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
`;

const BreadcrumbItem = styled.li`
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-dim);

  &:not(:last-child)::after {
    content: "›";
    color: var(--text-dim);
    opacity: 0.5;
  }
`;

const BreadcrumbLink = styled(Link)`
  color: var(--text-dim);
  text-decoration: none;

  &:hover {
    color: var(--highlight);
  }
`;

export const DeclarationBreadcrumb: React.FC<{
  module: string;
  name: string;
  parent?: { name: string; module: string };
}> = ({ module, name, parent }) => {
  const { game } = useContext(DeclarationsContext);
  const gameData = getGameDef(game);
  if (!gameData) return null;

  const nameUrl = declarationPath(game, module, name);
  let position = 1;

  return (
    <BreadcrumbNav aria-label="Breadcrumb">
      <BreadcrumbList itemScope itemType="https://schema.org/BreadcrumbList">
        <BreadcrumbItem itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <BreadcrumbLink to={href("/:game/:module?/:scope?", { game })} itemProp="item">
            <span itemProp="name">{gameData.name}</span>
          </BreadcrumbLink>
          <meta itemProp="position" content={String(position++)} />
        </BreadcrumbItem>
        <BreadcrumbItem itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <BreadcrumbLink to={href("/:game/:module?/:scope?", { game, module })} itemProp="item">
            <span itemProp="name">{module}</span>
          </BreadcrumbLink>
          <meta itemProp="position" content={String(position++)} />
        </BreadcrumbItem>
        {parent && (
          <BreadcrumbItem
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
          >
            <BreadcrumbLink to={declarationPath(game, parent.module, parent.name)} itemProp="item">
              <span itemProp="name">{parent.name}</span>
            </BreadcrumbLink>
            <meta itemProp="position" content={String(position++)} />
          </BreadcrumbItem>
        )}
        <BreadcrumbItem itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <span itemProp="name">{name}</span>
          <link itemProp="item" href={`${SITE_ORIGIN}${nameUrl}`} />
          <meta itemProp="position" content={String(position)} />
        </BreadcrumbItem>
      </BreadcrumbList>
    </BreadcrumbNav>
  );
};
