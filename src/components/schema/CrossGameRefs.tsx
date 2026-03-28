import { useContext } from "react";
import { styled } from "@linaria/react";
import {
  Declaration,
  SchemaClass,
  SchemaEnum,
  SchemaFieldType,
  SchemaMetadataEntry,
} from "../../data/types";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";
import { getGameDef, GameId } from "../../games-list";
import { ICONS_URL } from "../kind-icon/KindIcon";
import { SectionWrapper, SectionTitle, SectionList, SectionLink } from "./styles";

type DiffStatus = "identical" | "offsets_only" | "differs";

const GameLink = styled(SectionLink)`
  &[data-status="offsets_only"] {
    border-color: var(--cross-game-offsets);
  }

  &[data-status="differs"] {
    border-color: var(--cross-game-differs);
  }
`;

const ModuleIconWrapper = styled.span`
  display: flex;
  flex-shrink: 0;
`;

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
      if (a.name !== ba.name) return false;
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
    if (a[i].name !== b[i].name || a[i].value !== b[i].value) return false;
  }
  return true;
}

function compareClasses(a: SchemaClass, b: SchemaClass): DiffStatus {
  if (a.parents.length !== b.parents.length) return "differs";
  for (let i = 0; i < a.parents.length; i++) {
    if (a.parents[i].name !== b.parents[i].name || a.parents[i].module !== b.parents[i].module)
      return "differs";
  }
  if (a.fields.length !== b.fields.length) return "differs";
  let offsetsDiffer = false;
  for (let i = 0; i < a.fields.length; i++) {
    if (a.fields[i].name !== b.fields[i].name) return "differs";
    if (!typesEqual(a.fields[i].type, b.fields[i].type)) return "differs";
    if (!metadataEqual(a.fields[i].metadata, b.fields[i].metadata)) return "differs";
    if (a.fields[i].defaultValue !== b.fields[i].defaultValue) return "differs";
    if (a.fields[i].offset !== b.fields[i].offset) offsetsDiffer = true;
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

export function CrossGameRefs({ declaration }: { declaration: Declaration }) {
  const { game, otherGamesLookup, crossModuleLookup } = useContext(DeclarationsContext);

  const crossModuleMatch = crossModuleLookup.get(
    declarationKey(declaration.module, declaration.name),
  );

  const gameMatches: {
    gameId: GameId;
    gameName: string;
    status: DiffStatus;
    module: string;
  }[] = [];

  for (const [gameId, lookup] of otherGamesLookup) {
    const match = lookup.get(declaration.name);
    if (match && match.kind === declaration.kind) {
      const gameInfo = getGameDef(gameId);
      gameMatches.push({
        gameId,
        gameName: gameInfo?.name ?? gameId,
        status: compareDeclarations(declaration, match),
        module: match.module,
      });
    }
  }

  if (!crossModuleMatch && gameMatches.length === 0) return null;

  return (
    <SectionWrapper>
      <SectionTitle>Also in</SectionTitle>
      <SectionList>
        {crossModuleMatch && (
          <GameLink
            key={`module-${crossModuleMatch.module}`}
            to={schemaPath(game, crossModuleMatch.module, crossModuleMatch.name)}
          >
            <ModuleIconWrapper>
              <svg width="16" height="16" aria-hidden="true">
                <use href={`${ICONS_URL}#ki-module`} />
              </svg>
            </ModuleIconWrapper>
            {crossModuleMatch.module}.dll
          </GameLink>
        )}
        {gameMatches.map(({ gameId, gameName, status, module: otherModule }) => (
          <GameLink
            key={gameId}
            to={schemaPath(gameId, otherModule, declaration.name)}
            data-status={status === "identical" ? undefined : status}
            title={
              status === "identical"
                ? "Identical"
                : status === "offsets_only"
                  ? "Only offsets differ"
                  : "Differs"
            }
          >
            <svg width="24" height="24">
              <use href={`${ICONS_URL}#game-${gameId}`} />
            </svg>
            {gameName}
          </GameLink>
        ))}
      </SectionList>
    </SectionWrapper>
  );
}
