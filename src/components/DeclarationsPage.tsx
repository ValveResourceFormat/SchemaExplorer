import React, { useMemo, useState } from "react";
import styled from "styled-components";
import {
  DeclarationsContext,
  DeclarationsContextType,
  ReferenceEntry,
} from "./Docs/DeclarationsContext";
import { Declaration, SchemaFieldType } from "./Docs/api";
import { GameId } from "../games";
import { DeclarationsSidebar } from "./DeclarationsSidebar";
import { ContentList } from "./Docs/ContentList";
import { SidebarFilterContext } from "./layout/SidebarFilterContext";
import { SearchContext } from "./Search/SearchContext";
import { NavBar } from "./layout/NavBar";

function collectTypeKeys(type: SchemaFieldType, out: Set<string>) {
  switch (type.category) {
    case "declared_class":
    case "declared_enum":
      out.add(`${type.module}/${type.name}`);
      break;
    case "ptr":
    case "fixed_array":
      collectTypeKeys(type.inner, out);
      break;
    case "atomic":
      if (type.inner) collectTypeKeys(type.inner, out);
      if (type.inner2) collectTypeKeys(type.inner2, out);
      break;
  }
}

function refKey(module: string, name: string): string {
  return `${module}/${name}`;
}

function buildReferences(declarations: Declaration[]): Map<string, ReferenceEntry[]> {
  const refs = new Map<string, ReferenceEntry[]>();

  function addRef(target: string, entry: ReferenceEntry) {
    let list = refs.get(target);
    if (!list) {
      list = [];
      refs.set(target, list);
    }
    list.push(entry);
  }

  for (const decl of declarations) {
    if (decl.kind === "class") {
      for (const parent of decl.parents) {
        addRef(refKey(parent.module, parent.name), {
          declarationName: decl.name,
          declarationModule: decl.module,
          relation: "class",
        });
      }
      for (const field of decl.fields) {
        const keys = new Set<string>();
        collectTypeKeys(field.type, keys);
        const declKey = refKey(decl.module, decl.name);
        for (const key of keys) {
          if (key !== declKey) {
            addRef(key, {
              declarationName: decl.name,
              declarationModule: decl.module,
              fieldName: field.name,
              relation: "field",
            });
          }
        }
      }
    }
  }

  return refs;
}

export default function DeclarationsPage({
  context,
}: {
  context: Omit<DeclarationsContextType, "references" | "otherGamesLookup">;
}) {
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");

  const references = useMemo(() => buildReferences(context.declarations), [context.declarations]);

  const otherGamesLookup = useMemo(() => {
    const lookup = new Map<GameId, Map<string, Declaration>>();
    for (const [gameId, decls] of context.otherGames) {
      const map = new Map<string, Declaration>();
      for (const d of decls) map.set(d.name, d);
      lookup.set(gameId, map);
    }
    return lookup;
  }, [context.otherGames]);

  const fullContext = useMemo(
    () => ({ ...context, references, otherGamesLookup }),
    [context, references, otherGamesLookup],
  );

  const searchCtx = useMemo(() => ({ search, setSearch }), [search, setSearch]);
  const filterCtx = useMemo(() => ({ filter, setFilter }), [filter, setFilter]);

  return (
    <DeclarationsContext.Provider value={fullContext}>
      <SearchContext.Provider value={searchCtx}>
        <SidebarFilterContext.Provider value={filterCtx}>
          <PageGrid>
            <DeclarationsSidebar />
            <ContentColumn>
              <NavBar baseUrl={context.root} />
              <ContentList />
            </ContentColumn>
          </PageGrid>
        </SidebarFilterContext.Provider>
      </SearchContext.Provider>
    </DeclarationsContext.Provider>
  );
}

const ContentColumn = styled.div`
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const PageGrid = styled.div`
  display: grid;
  grid-template-columns: 340px 1fr;
  height: 100dvh;

  @media (max-width: 1100px) {
    grid-template-columns: 200px 1fr;
  }

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;
