import React, { useCallback, useMemo, useState } from "react";
import { styled } from "@linaria/react";
import {
  DeclarationsContext,
  DeclarationsContextType,
  ReferenceEntry,
  declarationKey,
} from "./Docs/DeclarationsContext";
import { Declaration, SchemaClass, SchemaFieldType } from "./Docs/api";
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
      out.add(declarationKey(type.module, type.name));
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
        addRef(declarationKey(parent.module, parent.name), {
          declarationName: decl.name,
          declarationModule: decl.module,
          relation: "class",
        });
      }
      for (const field of decl.fields) {
        const keys = new Set<string>();
        collectTypeKeys(field.type, keys);
        const declKey = declarationKey(decl.module, decl.name);
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
  context: Omit<DeclarationsContextType, "references" | "otherGamesLookup" | "classesByKey"> & {
    otherGames: Map<GameId, Declaration[]>;
  };
}) {
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const references = useMemo(() => buildReferences(context.declarations), [context.declarations]);

  const classesByKey = useMemo(() => {
    const map = new Map<string, SchemaClass>();
    for (const d of context.declarations) {
      if (d.kind === "class") map.set(declarationKey(d.module, d.name), d);
    }
    return map;
  }, [context.declarations]);

  const otherGamesLookup = useMemo(() => {
    const lookup = new Map<GameId, Map<string, Declaration>>();
    for (const [gameId, decls] of context.otherGames) {
      const map = new Map<string, Declaration>();
      for (const d of decls) map.set(d.name, d);
      lookup.set(gameId, map);
    }
    return lookup;
  }, [context.otherGames]);

  const fullContext = useMemo(() => {
    const { otherGames: _, ...rest } = context;
    return { ...rest, references, classesByKey, otherGamesLookup };
  }, [context, references, classesByKey, otherGamesLookup]);

  const searchCtx = useMemo(() => ({ search, setSearch }), [search]);
  const filterCtx = useMemo(() => ({ filter, setFilter }), [filter]);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const openSidebar = useCallback(() => setSidebarOpen(true), []);

  return (
    <DeclarationsContext.Provider value={fullContext}>
      <SearchContext.Provider value={searchCtx}>
        <SidebarFilterContext.Provider value={filterCtx}>
          <PageGrid>
            <MobileSidebarOverlay data-open={sidebarOpen || undefined} onClick={closeSidebar} />
            <SidebarPanel data-open={sidebarOpen || undefined}>
              <DeclarationsSidebar onNavigate={closeSidebar} />
            </SidebarPanel>
            <ContentColumn>
              <NavBar baseUrl={context.root} onMenuClick={openSidebar} />
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
  min-height: 0;
  padding-right: 32px;

  @media (max-width: 768px) {
    padding: 0 8px;
  }
`;

const MobileSidebarOverlay = styled.div`
  display: none;

  @media (max-width: 768px) {
    &[data-open] {
      display: block;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 300;
    }
  }
`;

const SidebarPanel = styled.div`
  display: contents;

  @media (max-width: 768px) {
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 300px;
    z-index: 301;
    background: var(--sidebar);

    &[data-open] {
      display: flex;
    }

    > * {
      flex: 1;
      min-height: 0;
    }
  }
`;

const PageGrid = styled.div`
  display: grid;
  grid-template-columns: 372px 1fr;
  min-height: 100dvh;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;
