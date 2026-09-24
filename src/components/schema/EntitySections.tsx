import React, { useContext, useEffect, useMemo, useState } from "react";
import { styled } from "@linaria/react";
import { Link } from "../Link";
import type {
  EntityClass,
  EntityInput,
  EntityKey,
  EntityOutput,
  EntityParam,
} from "../../data/types";
import {
  declarationKey,
  entityChain,
  findEntityByDesignName,
  keyFieldKey,
} from "../../data/derived";
import { useHashParam } from "../../utils/filtering";
import {
  buildInheritedGroups,
  entityLabel,
  formatDescription,
  formatKeyName,
  formatKeyType,
  type Entry,
  type InheritedGroup,
} from "../../utils/entity-format";
import { KindIcon } from "../kind-icon/KindIcon";
import { ColoredSyntax } from "./ColoredSyntax";
import {
  DeclarationsContext,
  entityPath,
  fieldLink,
  keyvalueLink,
  schemaPath,
} from "./DeclarationsContext";
import { countBy } from "../../utils/collections";
import { SchemaTypeView } from "./SchemaType";
import { useAnchoredRef } from "./useAnchoredRow";
import { CollapsibleChipSection, RefField } from "./ReferencedBy";
import {
  AnchorName,
  CommonGroupMembers,
  CommonGroupSignature,
  CommonGroupWrapper,
  DeclarationHeader,
  Dim,
  GridContent,
  GridIcon,
  InheritedLabel,
  InheritedMembers,
  MemberSignature,
  SectionBadge,
  SectionLink,
  SectionList,
  SectionTitle,
  SectionToggle,
} from "./styles";

// -- Shared bits --

const EntityChip = styled(SectionBadge)`
  font-family: var(--font-mono);
  font-weight: 600;

  &[data-dim] {
    opacity: 0.6;
  }
`;

export function DesignNameChips({ entities }: { entities: EntityClass[] | undefined }) {
  if (!entities) return null;
  const seen = new Set<string>();
  return (
    <>
      {entities.map((e) => {
        if (!e.designName || seen.has(e.designName)) return null;
        seen.add(e.designName);
        return (
          <EntityChip
            key={e.designName}
            data-dim={!e.spawnable || undefined}
            title={e.spawnable ? "Entity design name" : "Entity design name (not spawnable)"}
          >
            <KindIcon kind="entity" size="small" />
            {e.designName}
          </EntityChip>
        );
      })}
    </>
  );
}

const DimBadge = styled(SectionBadge)`
  color: var(--text-dim);
`;

// -- Summary --

/** A component class, linked when it's in the entity's schema or linking module */
function ComponentClass({ entity, name }: { entity: EntityClass; name: string }) {
  const { game, crossModuleLookup, declarations } = useContext(DeclarationsContext);
  const module = [entity.classModule, entity.module].find((m) => declarations.get(m)?.has(name));
  const target = module
    ? { module, name }
    : crossModuleLookup.get(declarationKey(entity.classModule, name));
  if (!target) return <SectionBadge>{name}</SectionBadge>;
  return (
    <SectionLink to={schemaPath(game, target.module, target.name)}>
      <KindIcon kind="class" size="small" />
      {name}
    </SectionLink>
  );
}

function EntitySummary({ entity }: { entity: EntityClass }) {
  return (
    <SummaryWrapper>
      <SectionList>
        <DimBadge>{entity.spawnable ? "spawnable" : "not spawnable"}</DimBadge>
        {entity.flags.map((f) => (
          <DimBadge key={f}>{f}</DimBadge>
        ))}
        {entity.spawnOrder !== 0 && <DimBadge>spawn order {entity.spawnOrder}</DimBadge>}
        {entity.module !== entity.classModule && <DimBadge>linked in {entity.module}</DimBadge>}
      </SectionList>
      {entity.components.length > 0 && (
        <ComponentList>
          {entity.components.map((c) => (
            <React.Fragment key={c.base}>
              <ComponentClass entity={entity} name={c.base} />
              <Dim>→</Dim>
              <ComponentClass entity={entity} name={c.override} />
            </React.Fragment>
          ))}
        </ComponentList>
      )}
    </SummaryWrapper>
  );
}

const SummaryWrapper = styled.div`
  padding: 0 14px 12px;
`;

const ComponentList = styled.div`
  display: grid;
  grid-template-columns: max-content max-content max-content;
  align-items: center;
  gap: 5px 8px;
  margin-top: 8px;

  @media (max-width: 768px) {
    grid-template-columns: max-content;

    > span {
      display: none;
    }
  }
`;

// -- Inherited entries --

const InheritedEntryList = styled(InheritedMembers)`
  border-top: 1px solid var(--group-separator);
`;

const InheritedEntryLabel = styled(InheritedLabel)`
  padding: 6px 4px 2px;

  a {
    color: var(--text);
    text-decoration: none;

    &:hover {
      color: var(--highlight);
    }
  }

  > span {
    font-weight: 400;
  }
`;

const InheritedSummary = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  border-top: 1px solid var(--group-separator);
  font-size: 14px;
  color: var(--text-dim);
`;

function InheritedEntries<T extends Entry>({
  title,
  groups,
  expanded,
  setExpanded,
  render,
}: {
  title: string;
  groups: InheritedGroup<T>[];
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  render: (entry: T, overriddenBy: EntityClass | undefined) => React.ReactNode;
}) {
  const { game } = useContext(DeclarationsContext);
  if (groups.length === 0) return null;

  if (!expanded) {
    return (
      <InheritedSummary>
        Inherited from
        {groups.map((g) => (
          <SectionLink key={g.entity.class} to={entityPath(game, g.entity)} title={g.entity.class}>
            <KindIcon kind="inherited-class" size="small" />
            {entityLabel(g.entity)} ({g.count})
          </SectionLink>
        ))}
        <SectionToggle
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          aria-label={`Expand inherited ${title}`}
        >
          expand
        </SectionToggle>
      </InheritedSummary>
    );
  }

  return (
    <InheritedEntryList>
      {groups.map((g) => (
        <React.Fragment key={g.entity.class}>
          <InheritedEntryLabel>
            Inherited from
            <KindIcon kind="inherited-class" size="small" />
            <Link to={entityPath(game, g.entity)}>{entityLabel(g.entity)}</Link>
            {g.entity.designName && <span>({g.entity.class})</span>}
          </InheritedEntryLabel>
          {g.entries.map(({ entry, overriddenBy }) => (
            <React.Fragment key={entry.name}>{render(entry, overriddenBy)}</React.Fragment>
          ))}
        </React.Fragment>
      ))}
      <li>
        <SectionToggle
          onClick={() => setExpanded(false)}
          aria-expanded
          aria-label={`Collapse inherited ${title}`}
        >
          collapse inherited
        </SectionToggle>
      </li>
    </InheritedEntryList>
  );
}

// -- Rows --

const MemberRow = styled.li`
  padding: 4px 10px;
  background-color: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 8px;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0 8px;

  &[data-anchored] {
    background-color: var(--search-highlight);
    border-color: var(--highlight);
  }

  &[data-overridden] {
    opacity: 0.55;
  }
`;

const RowMembers = styled(CommonGroupMembers)`
  border-top: 1px solid var(--group-separator);
`;

const MonoName = styled.span`
  font-family: var(--font-mono);

  &[data-removed] {
    text-decoration: line-through;
    color: var(--text-dim);
  }
`;

const SmallBadge = styled.span`
  font-size: 12px;
  font-weight: 500;
  padding: 0 6px;
  border-radius: 4px;
  border: 1px solid var(--group-border);
  background: var(--group-members);
  color: var(--text-dim);
`;

const Description = styled.div`
  font-size: 14px;
  color: var(--text-dim);
  white-space: pre-wrap;
  word-break: normal;
  overflow-wrap: anywhere;
`;

const FieldLink = styled(Link)`
  font-family: var(--font-mono);
  font-weight: 500;
  color: var(--text-dim);
  text-decoration: none;

  &:hover {
    color: var(--highlight);
  }
`;

function KeyFieldLink({ entityKey }: { entityKey: EntityKey }) {
  const { game, keyOwners } = useContext(DeclarationsContext);
  const owner = keyOwners.get(entityKey);
  if (!entityKey.field) return <SmallBadge>procedural</SmallBadge>;

  const text = entityKey.path ? `${entityKey.path}.${entityKey.field}` : entityKey.field;
  if (!owner) return <Dim>→ {text}</Dim>;

  return (
    <>
      <Dim>→</Dim>
      <FieldLink
        to={fieldLink(game, owner.module, owner.name, entityKey.field)}
        title={`${owner.name}::${entityKey.field}`}
      >
        {text}
      </FieldLink>
    </>
  );
}

function KeyRow({
  entityKey,
  anchorBase,
  anchored,
  overriddenBy,
}: {
  entityKey: EntityKey;
  anchorBase: string;
  anchored: boolean;
  overriddenBy?: EntityClass;
}) {
  const rowRef = useAnchoredRef(anchored);
  const display = formatKeyName(entityKey);

  return (
    <MemberRow
      ref={rowRef as React.Ref<HTMLLIElement>}
      data-anchored={anchored || undefined}
      data-overridden={overriddenBy ? true : undefined}
    >
      <GridIcon>
        <KindIcon kind="keyvalue" size="small" />
      </GridIcon>
      <GridContent>
        <MemberSignature>
          <AnchorName
            to={{ pathname: anchorBase, hash: `kv=${encodeURIComponent(entityKey.name)}` }}
            replace
            preventScrollReset
            title={display !== entityKey.name ? entityKey.name : undefined}
          >
            <MonoName data-removed={entityKey.removed || undefined}>{display}</MonoName>
          </AnchorName>
          :{" "}
          {entityKey.enum && entityKey.enumModule ? (
            <SchemaTypeView
              type={{
                category: "declared_enum",
                name: entityKey.enum,
                module: entityKey.enumModule,
              }}
            />
          ) : (
            <ColoredSyntax kind="literal">{formatKeyType(entityKey.type)}</ColoredSyntax>
          )}
          <KeyFieldLink entityKey={entityKey} />
          {entityKey.removed && <SmallBadge>removed</SmallBadge>}
          {overriddenBy && <SmallBadge>overridden by {entityLabel(overriddenBy)}</SmallBadge>}
        </MemberSignature>
      </GridContent>
    </MemberRow>
  );
}

/**
 * A Pulse type, entity handles link to the entity in the same module (client or server),
 * schema enums to the param's enumModule
 */
function PvalType({
  type,
  module,
  enumModule,
}: {
  type: string;
  module?: string;
  enumModule?: string;
}) {
  const context = useContext(DeclarationsContext);
  const { game, declarations } = context;
  const colon = type.indexOf(":");
  const base = (colon < 0 ? type : type.slice(0, colon)).replace(/^PVAL_/, "").toLowerCase();
  if (colon < 0) return <ColoredSyntax kind="literal">{base}</ColoredSyntax>;

  const sub = type.slice(colon + 1);
  let inner: React.ReactNode = sub;
  if (sub.startsWith("PVAL_")) {
    inner = <PvalType type={sub} module={module} enumModule={enumModule} />;
  } else if (base === "ehandle") {
    const target = findEntityByDesignName(context, sub, module);
    if (target) {
      inner = (
        <FieldLink to={entityPath(game, target)} title={target.class}>
          {sub}
        </FieldLink>
      );
    }
  } else if (base === "schema_enum" && enumModule) {
    if (declarations.get(enumModule)?.get(sub)?.kind === "enum") {
      inner = <SchemaTypeView type={{ category: "declared_enum", name: sub, module: enumModule }} />;
    }
  }

  return (
    <span>
      <ColoredSyntax kind="literal">{base}</ColoredSyntax>
      <Dim>&lt;</Dim>
      {inner}
      <Dim>&gt;</Dim>
    </span>
  );
}

function ParamList({ params, module }: { params: EntityParam[]; module?: string }) {
  return (
    <Dim>
      (
      {params.map((p, i) => (
        <React.Fragment key={p.name}>
          {i > 0 && ", "}
          {p.name}: <PvalType type={p.type} module={module} enumModule={p.enumModule} />
        </React.Fragment>
      ))}
      )
    </Dim>
  );
}

function IORow({
  kind,
  entry,
  module,
  anchorBase,
  anchored,
  overriddenBy,
}: {
  kind: "input" | "output";
  entry: EntityInput | EntityOutput;
  /** Module of the entity shown, for entity handle links */
  module?: string;
  anchorBase: string;
  anchored: boolean;
  overriddenBy?: EntityClass;
}) {
  const rowRef = useAnchoredRef(anchored);
  const input = kind === "input" ? (entry as EntityInput) : null;

  return (
    <MemberRow
      ref={rowRef as React.Ref<HTMLLIElement>}
      data-anchored={anchored || undefined}
      data-overridden={overriddenBy ? true : undefined}
    >
      <GridIcon>
        <KindIcon kind={kind} size="small" />
      </GridIcon>
      <GridContent>
        <MemberSignature>
          <span>
            <AnchorName
              to={{ pathname: anchorBase, hash: `${kind}=${encodeURIComponent(entry.name)}` }}
              replace
              preventScrollReset
            >
              <MonoName>{entry.name}</MonoName>
            </AnchorName>
            <ParamList params={entry.params} module={module} />
            {input && input.returns.length > 0 && (
              <>
                {" "}
                <Dim>→</Dim> <ParamList params={input.returns} module={module} />
              </>
            )}
          </span>
          {input?.pulseNode && <SmallBadge>Pulse node</SmallBadge>}
          {overriddenBy && <SmallBadge>overridden by {entityLabel(overriddenBy)}</SmallBadge>}
        </MemberSignature>
        {entry.description && <Description>{formatDescription(entry.description)}</Description>}
      </GridContent>
    </MemberRow>
  );
}

// -- Sections --

const ListSectionTitle = styled(SectionTitle)`
  padding: 10px 14px 0;
  margin: 0;
  border-top: 1px solid var(--group-separator);

  & + ${RowMembers} {
    border-top: none;
  }

  > span {
    text-transform: none;
    letter-spacing: normal;
  }
`;

type SectionKind = "kv" | "input" | "output";

const SECTION_TITLES: Record<SectionKind, string> = {
  kv: "Keyvalues",
  input: "Inputs",
  output: "Outputs",
};

const ENTRIES: Record<SectionKind, (e: EntityClass) => Entry[]> = {
  kv: (e) => e.keys,
  input: (e) => e.inputs,
  output: (e) => e.outputs,
};

function EntityListSection({
  entity,
  chain,
  kind,
  anchorBase,
}: {
  entity: EntityClass;
  chain: EntityClass[];
  kind: SectionKind;
  anchorBase: string;
}) {
  // Names are case-insensitive, like the overrides in buildInheritedGroups
  const anchor = useHashParam(kind)?.toLowerCase();
  const isAnchor = (e: Entry) => e.name.toLowerCase() === anchor;
  const own = ENTRIES[kind](entity);
  const groups = useMemo(
    () => buildInheritedGroups(entity, chain, ENTRIES[kind]),
    [entity, chain, kind],
  );
  const inheritedCount = groups.reduce((sum, g) => sum + g.count, 0);

  const anchoredInherited =
    anchor != null && !own.some(isAnchor)
      ? groups.some((g) => g.entries.some((e) => !e.overriddenBy && isAnchor(e.entry)))
      : false;
  // Each entity card is keyed by game and module, so this starts collapsed for every entity
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    if (anchoredInherited) setExpanded(true);
  }, [anchoredInherited]);

  if (own.length === 0 && inheritedCount === 0) return null;

  function renderEntry(entry: Entry, overriddenBy?: EntityClass) {
    // Own entries are never overridden, inherited ones lose to a nearer redeclaration
    const anchored = !overriddenBy && isAnchor(entry);
    if (kind === "kv") {
      return (
        <KeyRow
          entityKey={entry as EntityKey}
          anchorBase={anchorBase}
          anchored={anchored}
          overriddenBy={overriddenBy}
        />
      );
    }
    return (
      <IORow
        kind={kind}
        entry={entry as EntityInput | EntityOutput}
        module={entity.module}
        anchorBase={anchorBase}
        anchored={anchored}
        overriddenBy={overriddenBy}
      />
    );
  }

  return (
    <>
      <ListSectionTitle>
        {SECTION_TITLES[kind]}{" "}
        <Dim>
          ({own.length} own{inheritedCount > 0 && ` · ${inheritedCount} inherited`})
        </Dim>
      </ListSectionTitle>
      {own.length > 0 && (
        <RowMembers>
          {own.map((entry) => (
            <React.Fragment key={entry.name}>{renderEntry(entry)}</React.Fragment>
          ))}
        </RowMembers>
      )}
      <InheritedEntries
        title={SECTION_TITLES[kind].toLowerCase()}
        groups={groups}
        expanded={expanded}
        setExpanded={setExpanded}
        render={renderEntry}
      />
    </>
  );
}

const EntityCardWrapper = styled(CommonGroupWrapper)`
  margin-top: 12px;
`;

const EntityHeading = styled.h2`
  margin: 0;
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;

  &[data-unnamed] {
    font-family: inherit;
  }
`;

const EntityKindLabel = styled.span`
  font-size: 14px;
  font-weight: 500;
  color: var(--text-dim);
`;

/** Entity data of a class, in its own card below the class card */
export function EntityCards({
  entities,
  anchorBase,
}: {
  entities: EntityClass[];
  anchorBase: string;
}) {
  const ctx = useContext(DeclarationsContext);
  // CEntityInstance is the root of both the client and server entity lists
  const showModule = entities.length > 1;

  return (
    <>
      {entities.map((entity) => {
        const chain = entityChain(ctx, entity);
        return (
          <EntityCardWrapper key={`${ctx.game}/${entity.module}`}>
            <DeclarationHeader>
              <CommonGroupSignature>
                <KindIcon kind="entity" size="big" />
                <EntityHeading data-unnamed={!entity.designName || undefined}>
                  {entity.designName ?? "Entity"}
                </EntityHeading>
                <EntityKindLabel>
                  {entity.designName ? "entity" : "no design name, can't be created by name"}
                  {showModule && ` in ${entity.module}`}
                </EntityKindLabel>
              </CommonGroupSignature>
            </DeclarationHeader>
            <EntitySummary entity={entity} />
            {(["kv", "input", "output"] as const).map((kind) => (
              <EntityListSection
                key={kind}
                entity={entity}
                chain={chain}
                kind={kind}
                anchorBase={anchorBase}
              />
            ))}
          </EntityCardWrapper>
        );
      })}
    </>
  );
}

/** Inputs/outputs that matched an input:/output: search */
export function EntityMatches({
  matches,
  module,
  anchorBase,
}: {
  matches: { inputs: EntityInput[]; outputs: EntityOutput[] };
  module: string;
  anchorBase: string;
}) {
  if (matches.inputs.length === 0 && matches.outputs.length === 0) return null;
  const rows = [
    ...matches.inputs.map((entry) => ({ kind: "input" as const, entry })),
    ...matches.outputs.map((entry) => ({ kind: "output" as const, entry })),
  ];
  return (
    <RowMembers>
      {rows.map(({ kind, entry }) => (
        <IORow
          key={`${kind}-${entry.name}`}
          kind={kind}
          entry={entry}
          module={module}
          anchorBase={anchorBase}
          anchored={false}
        />
      ))}
    </RowMembers>
  );
}

// -- Field annotations --

const KeyChipLink = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 0 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-dim);
  background: var(--group-members);
  border: 1px solid var(--group-border);
  text-decoration: none;
  align-self: center;

  &:hover {
    border-color: var(--highlight);
  }

  &[data-removed] {
    text-decoration: line-through;
  }
`;

/** Keyvalues bound to a schema field */
export function KeyvalueChips({
  owner,
  field,
}: {
  owner: { module: string; name: string };
  field: string;
}) {
  const { game, keyByField } = useContext(DeclarationsContext);
  const refs = keyByField.get(keyFieldKey(owner.module, owner.name, field));
  if (!refs) return null;
  const unique = new Map<string, (typeof refs)[number]>();
  for (const ref of refs) {
    const id = `${ref.entity.classModule}/${ref.entity.class}/${ref.key.name}`;
    if (!unique.has(id)) unique.set(id, ref);
  }
  // Several entities can bind the same key name to a field of a shared struct
  const nameCounts = countBy(unique.values(), ({ key }) => [key.name]);
  return (
    <>
      {[...unique].map(([id, { entity, key }]) => (
        <KeyChipLink
          key={id}
          to={keyvalueLink(game, entity, key.name)}
          title={`Keyvalue of ${entityLabel(entity)}${key.removed ? " (removed)" : ""}`}
          data-removed={key.removed || undefined}
        >
          <KindIcon kind="keyvalue" size={14} />
          {formatKeyName(key)}
          {nameCounts.get(key.name)! > 1 && <Dim>({entityLabel(entity)})</Dim>}
        </KeyChipLink>
      ))}
    </>
  );
}

// -- Enum pages --

export function UsedByKeyvalues({ name, module }: { name: string; module: string }) {
  const { game, enumKeyRefs } = useContext(DeclarationsContext);
  const refs = enumKeyRefs.get(declarationKey(module, name));
  // Client and server entities often share a design name
  const ambiguous = useMemo(() => {
    const counts = countBy(refs ?? [], ({ entity, key }) => [`${entityLabel(entity)}.${key.name}`]);
    return new Set([...counts].filter(([, n]) => n > 1).map(([label]) => label));
  }, [refs]);

  return (
    <CollapsibleChipSection
      title="Used by entity keyvalues"
      items={refs}
      render={({ entity, key }) => (
        <SectionLink
          key={`${entity.module}/${entity.class}/${key.name}`}
          to={keyvalueLink(game, entity, key.name)}
          title={`${entity.class} in ${entity.module}`}
        >
          <KindIcon kind="keyvalue" size={18} />
          <span>
            {entityLabel(entity)}
            <RefField>{key.name}</RefField>
            {ambiguous.has(`${entityLabel(entity)}.${key.name}`) && (
              <Dim> ({entity.module})</Dim>
            )}
          </span>
        </SectionLink>
      )}
    />
  );
}
