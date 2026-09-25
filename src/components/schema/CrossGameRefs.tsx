import React, { useContext, useMemo } from "react";
import { Link } from "../Link";
import {
  Declaration,
  SchemaClass,
  SchemaEnum,
  SchemaFieldType,
  SchemaMetadataEntry,
} from "../../data/types";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";
import { getGameDef, GameId } from "../../games-list";
import { ICONS_URL, KindIcon } from "../kind-icon/KindIcon";
import { InlineList, Pill, PillDot } from "./styles";
import { Detail } from "./Detail";
import { tip } from "../Tooltip";
import { deepEqual } from "../../data/schemas";

type DiffStatus = "identical" | "offsets_only" | "differs";

function typesEqual(a: SchemaFieldType, b: SchemaFieldType): boolean {
  if (a.category !== b.category) return false;
  switch (a.category) {
    case "builtin":
      return a.name === (b as typeof a).name;
    case "declared_class":
    case "declared_enum":
      return a.name === (b as typeof a).name && a.module === (b as typeof a).module;
    case "ptr":
      return typesEqual(a.inner, (b as typeof a).inner);
    case "fixed_array":
      return a.count === (b as typeof a).count && typesEqual(a.inner, (b as typeof a).inner);
    case "atomic": {
      const ba = b as typeof a;
      if (a.name !== ba.name || a.count !== ba.count) return false;
      if ((a.inner == null) !== (ba.inner == null)) return false;
      if (a.inner && ba.inner && !typesEqual(a.inner, ba.inner)) return false;
      if ((a.inner2 == null) !== (ba.inner2 == null)) return false;
      if (a.inner2 && ba.inner2 && !typesEqual(a.inner2, ba.inner2)) return false;
      return true;
    }
    case "bitfield":
      return a.count === (b as typeof a).count;
  }
}

function metadataEqual(a: SchemaMetadataEntry[], b: SchemaMetadataEntry[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].name !== b[i].name) return false;
    if (!deepEqual(a[i].value, b[i].value)) return false;
  }
  return true;
}

function compareClasses(a: SchemaClass, b: SchemaClass): DiffStatus {
  if (a.parents.length !== b.parents.length) return "differs";
  // Size, alignment and base offsets are layout, like field offsets. Dumps that are not kept up
  // to date have no layout, there is nothing to compare then
  const hasLayout = a.size != null && b.size != null;
  let offsetsDiffer = hasLayout && (a.size !== b.size || a.alignment !== b.alignment);
  for (let i = 0; i < a.parents.length; i++) {
    if (a.parents[i].name !== b.parents[i].name || a.parents[i].module !== b.parents[i].module)
      return "differs";
    if (hasLayout && a.parents[i].offset !== b.parents[i].offset) offsetsDiffer = true;
  }
  if (a.flags.join() !== b.flags.join()) return "differs";
  if (a.fields.length !== b.fields.length) return "differs";
  for (let i = 0; i < a.fields.length; i++) {
    if (a.fields[i].name !== b.fields[i].name) return "differs";
    if (!typesEqual(a.fields[i].type, b.fields[i].type)) return "differs";
    if (!metadataEqual(a.fields[i].metadata, b.fields[i].metadata)) return "differs";
    if (a.fields[i].defaultValue !== b.fields[i].defaultValue) return "differs";
    if (hasLayout && a.fields[i].offset !== b.fields[i].offset) offsetsDiffer = true;
  }
  if (!metadataEqual(a.metadata, b.metadata)) return "differs";
  return offsetsDiffer ? "offsets_only" : "identical";
}

function areEnumsEqual(a: SchemaEnum, b: SchemaEnum): boolean {
  if (a.alignment !== b.alignment) return false;
  if (a.members.length !== b.members.length) return false;
  for (let i = 0; i < a.members.length; i++) {
    if (a.members[i].name !== b.members[i].name || a.members[i].value !== b.members[i].value)
      return false;
    if (!metadataEqual(a.members[i].metadata, b.members[i].metadata)) return false;
  }
  if (!metadataEqual(a.metadata, b.metadata)) return false;
  return true;
}

function compareDeclarations(a: Declaration, b: Declaration): DiffStatus {
  if (a.kind !== b.kind) return "differs";
  if (a.kind === "class" && b.kind === "class") return compareClasses(a, b);
  if (a.kind === "enum" && b.kind === "enum") return areEnumsEqual(a, b) ? "identical" : "differs";
  return "differs";
}

interface CrossGameRefs {
  /** The same class in the other of client and server */
  crossModuleMatch?: Declaration;
  gameMatches: { gameId: GameId; gameName: string; status: DiffStatus; module: string }[];
}

/** Where else a declaration exists, or null when nowhere */
function useCrossGameRefs(declaration: Declaration): CrossGameRefs | null {
  const { otherGamesLookup, crossModuleLookup } = useContext(DeclarationsContext);
  return useMemo(() => {
    const crossModuleMatch = crossModuleLookup.get(
      declarationKey(declaration.module, declaration.name),
    );
    const gameMatches: CrossGameRefs["gameMatches"] = [];
    for (const [gameId, lookup] of otherGamesLookup) {
      const match = lookup.get(declaration.name);
      if (match && match.kind === declaration.kind) {
        gameMatches.push({
          gameId,
          gameName: getGameDef(gameId)?.name ?? gameId,
          status: compareDeclarations(declaration, match),
          module: match.module,
        });
      }
    }
    if (!crossModuleMatch && gameMatches.length === 0) return null;
    return { crossModuleMatch, gameMatches };
  }, [declaration, otherGamesLookup, crossModuleLookup]);
}

const STATUS: Record<
  Exclude<DiffStatus, "identical">,
  { text: string; title: string; dot: string }
> = {
  offsets_only: {
    text: "offsets differ",
    title: "Only offsets, size or alignment differ, the fields are the same.",
    dot: "var(--cross-game-offsets)",
  },
  differs: {
    text: "differs",
    title: "Its fields, members, base classes, flags or metadata differ.",
    dot: "var(--cross-game-differs)",
  },
};

/** The same declaration in the other module and in other games, nothing when there is none */
export function CrossGameDetail({ declaration }: { declaration: Declaration }) {
  const { game } = useContext(DeclarationsContext);
  const refs = useCrossGameRefs(declaration);
  if (!refs) return null;
  const { crossModuleMatch, gameMatches } = refs;

  return (
    <Detail label="Also in">
      <InlineList>
        {crossModuleMatch && (
          <Link
            to={schemaPath(game, crossModuleMatch.module, crossModuleMatch.name)}
            title={`${crossModuleMatch.name} in ${crossModuleMatch.module}`}
          >
            <KindIcon kind="module" size="small" />
            {crossModuleMatch.module}
          </Link>
        )}
        {gameMatches.map(({ gameId, gameName, status, module: otherModule }) => {
          const info = status === "identical" ? null : STATUS[status];
          // The pill sits next to the link, a link underlines everything inside it
          return (
            <span key={gameId}>
              <Link
                to={schemaPath(gameId, otherModule, declaration.name)}
                {...(info ? {} : tip("Identical in this game."))}
              >
                <svg width="16" height="16" aria-hidden="true">
                  <use href={`${ICONS_URL}#game-${gameId}`} />
                </svg>
                {gameName}
              </Link>
              {info && (
                <Pill
                  style={{ "--dot": info.dot } as React.CSSProperties}
                  {...tip(info.title, info.dot)}
                >
                  <PillDot />
                  {info.text}
                </Pill>
              )}
            </span>
          );
        })}
      </InlineList>
    </Detail>
  );
}
