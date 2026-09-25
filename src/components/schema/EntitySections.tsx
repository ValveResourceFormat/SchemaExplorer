import React, { memo, useContext, useEffect, useMemo, useState } from "react";
import { styled } from "@linaria/react";
import { Link } from "../Link";
import type {
  EntityClass,
  EntityInput,
  EntityKey,
  EntityOutput,
  EntityParam,
  SchemaFieldType,
} from "../../data/types";
import {
  declarationKey,
  entityChain,
  findDeclarationByName,
  findEntityByDesignName,
} from "../../data/derived";
import { useHashParam } from "../../utils/filtering";
import {
  buildInheritedGroups,
  entityLabel,
  formatDescription,
  formatKeyName,
  formatKeyType,
  keySchemaType,
  type Entry,
} from "../../utils/entity-format";
import { KindIcon, type IconKind } from "../kind-icon/KindIcon";
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
import { CollapsibleLinkDetail, RefField } from "./ReferencedBy";
import {
  AnchorName,
  Band,
  Dim,
  InlineList,
  Pill,
  PillAnchor,
  Row,
  Table,
  TableHead,
} from "./styles";
import { Detail, DetailsCard } from "./Detail";
import { CollapsedInheritedRow, TitledCard } from "./Cards";
import { InheritedSwitch } from "./InheritedSwitch";
import { RowIcon } from "./RowIcon";
import { subtleUnderline } from "./link-styles";
import { tip } from "../Tooltip";

// -- Links to the entity sections of a class page --

const entityAnchor = (entity: EntityClass) => `entity-${entity.module}`;

/** Scrolls to an entity section without touching the hash, which holds the page's params */
function scrollToEntity(event: React.MouseEvent, entity: EntityClass) {
  const target = document.getElementById(entityAnchor(entity));
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** The class's entities in its page header, each jumping to its section below */
export function EntityJumpPills({ entities }: { entities: EntityClass[] }) {
  const showModule = entities.length > 1;
  return entities.map((entity) => (
    <PillAnchor
      key={entity.module}
      href={`#${entityAnchor(entity)}`}
      data-mono={entity.designName ? true : undefined}
      {...tip(entity.designName ? "Entity design name" : "Entity without a design name")}
      onClick={(e) => scrollToEntity(e, entity)}
    >
      <KindIcon kind="entity" size={14} />
      {entity.designName ?? "entity"}
      {showModule && ` · ${entity.module}`}
    </PillAnchor>
  ));
}

/** Design names of a class, for its search result */
export function DesignNamePills({ entities }: { entities: EntityClass[] | undefined }) {
  if (!entities) return null;
  const names = [...new Set(entities.flatMap((e) => (e.designName ? [e.designName] : [])))];
  return names.map((name) => (
    <Pill key={name} data-mono {...tip("Entity design name")}>
      <KindIcon kind="entity" size={14} />
      {name}
    </Pill>
  ));
}

// -- Entity heading and details --

const EntityHeading = styled.h2`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 10px;
  margin: 32px 0 12px;
  font-size: 22px;
  scroll-margin-top: 16px;
  word-break: break-all;

  > svg {
    flex-shrink: 0;
  }
`;

const EntityName = styled.span`
  font-family: var(--font-mono);
  font-weight: 700;
`;

/** A component class, linked when it's in the entity's schema or linking module */
function ComponentClass({ entity, name }: { entity: EntityClass; name: string }) {
  const { game, crossModuleLookup, declarations } = useContext(DeclarationsContext);
  const module = [entity.classModule, entity.module].find((m) => declarations.get(m)?.has(name));
  const target = module
    ? { module, name }
    : crossModuleLookup.get(declarationKey(entity.classModule, name));
  if (!target) return <span>{name}</span>;
  return <Link to={schemaPath(game, target.module, target.name)}>{name}</Link>;
}

const ComponentList = styled.span`
  display: grid;
  grid-template-columns: max-content max-content max-content;
  align-items: center;
  gap: 2px 8px;

  a {
    color: var(--syntax-interface);
    ${subtleUnderline}

    &:hover {
      color: var(--highlight);
    }
  }

  @media (max-width: 768px) {
    grid-template-columns: max-content;

    > span:nth-child(3n + 2) {
      display: none;
    }
  }
`;

/** Facts about an entity beyond its name, the card hides when there are none */
function EntityDetails({ entity }: { entity: EntityClass }) {
  return (
    <DetailsCard>
      {entity.flags.length > 0 && (
        <Detail label="Flags">
          <InlineList>
            {entity.flags.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </InlineList>
        </Detail>
      )}
      {entity.spawnOrder !== 0 && <Detail label="Spawn order">{entity.spawnOrder}</Detail>}
      {entity.components.length > 0 && (
        <Detail label="Components">
          <ComponentList>
            {entity.components.map((c) => (
              <React.Fragment key={c.base}>
                <ComponentClass entity={entity} name={c.base} />
                <Dim aria-label="replaced by">→</Dim>
                <ComponentClass entity={entity} name={c.override} />
              </React.Fragment>
            ))}
          </ComponentList>
        </Detail>
      )}
    </DetailsCard>
  );
}

// -- Rows --

const MonoName = styled.span`
  font-family: var(--font-mono);
  font-weight: 600;

  &[data-removed] {
    text-decoration: line-through;
    color: var(--text-dim);
  }
`;

const NameCell = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 8px;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const Description = styled.div`
  font-size: 15px;
  color: var(--text-dim);
  white-space: pre-wrap;
  word-break: normal;
  overflow-wrap: anywhere;
`;

const FieldLink = styled(Link)`
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-dim);
  ${subtleUnderline}
  word-break: break-all;

  &:hover {
    color: var(--highlight);
  }
`;

const PulseMark = styled.span`
  color: var(--text-dim);

  @media (max-width: 768px) {
    &::after {
      content: " Pulse node";
      font-size: 13px;
    }
  }
`;

/** Where a row's name goes: its anchor here, or the entity that declares it */
function EntryLink({
  kind,
  name,
  declaredBy,
  anchorBase,
  children,
}: {
  kind: SectionKind;
  name: string;
  declaredBy?: EntityClass;
  anchorBase: string;
  children: React.ReactNode;
}) {
  const { game } = useContext(DeclarationsContext);
  // An own row only changes the hash of this page
  const own = !declaredBy;
  return (
    <AnchorName
      to={{
        pathname: declaredBy ? entityPath(game, declaredBy) : anchorBase,
        hash: `${kind}=${encodeURIComponent(name)}`,
      }}
      title={declaredBy && `Declared by ${entityLabel(declaredBy)}`}
      replace={own}
      preventScrollReset={own}
    >
      {children}
    </AnchorName>
  );
}

/**
 * An entity field type, shown like the schema type it stands for when there is one, otherwise by
 * its own name like soundname. The raw FIELD_ name is in the tooltip.
 */
function KeyType({ type }: { type: string }) {
  const { declarations } = useContext(DeclarationsContext);
  const mapped = keySchemaType(type);
  let schemaType: SchemaFieldType | undefined;
  if (mapped?.category === "declared_class") {
    const decl = findDeclarationByName(declarations, mapped.name, "class");
    if (decl) schemaType = { category: "declared_class", name: decl.name, module: decl.module };
  } else if (mapped) {
    schemaType = mapped;
  }
  return (
    <span {...tip(`Keyvalue type ${type}`)}>
      {schemaType ? (
        <SchemaTypeView type={schemaType} />
      ) : (
        <ColoredSyntax kind="literal">{formatKeyType(type)}</ColoredSyntax>
      )}
    </span>
  );
}

function KeyFieldLink({ entityKey }: { entityKey: EntityKey }) {
  const { game, keyOwners } = useContext(DeclarationsContext);
  const owner = keyOwners.get(entityKey);
  if (!entityKey.field)
    return <Pill {...tip("Read by code, not bound to a field.")}>procedural</Pill>;

  const text = entityKey.path ? `${entityKey.path}.${entityKey.field}` : entityKey.field;
  if (!owner) return <Dim>{text}</Dim>;

  return (
    <FieldLink
      to={fieldLink(game, owner.module, owner.name, entityKey.field)}
      title={`${owner.name}::${entityKey.field}`}
    >
      {text}
    </FieldLink>
  );
}

interface RowProps {
  anchorBase: string;
  anchored: boolean;
  /** The base entity an inherited row comes from */
  declaredBy?: EntityClass;
  overriddenBy?: EntityClass;
}

function OverriddenPill({ by }: { by?: EntityClass }) {
  return by ? <Pill>overridden by {entityLabel(by)}</Pill> : null;
}

// Memoized like the field rows, an anchor click re-renders only the rows it changes
const KeyRow = memo(function KeyRow({ entityKey, ...props }: RowProps & { entityKey: EntityKey }) {
  const rowRef = useAnchoredRef(props.anchored);
  const display = formatKeyName(entityKey);

  return (
    <Row
      ref={rowRef as React.Ref<HTMLDivElement>}
      data-anchored={props.anchored || undefined}
      data-overridden={props.overriddenBy ? true : undefined}
    >
      <NameCell title={display !== entityKey.name ? entityKey.name : undefined}>
        <span>
          <RowIcon kind="keyvalue" size="small" />
          <EntryLink
            kind="kv"
            name={entityKey.name}
            declaredBy={props.declaredBy}
            anchorBase={props.anchorBase}
          >
            <MonoName data-removed={entityKey.removed || undefined}>{display}</MonoName>
          </EntryLink>
        </span>
        {entityKey.removed && <Pill>removed</Pill>}
        <OverriddenPill by={props.overriddenBy} />
      </NameCell>
      <div>
        {entityKey.enum && entityKey.enumModule ? (
          <SchemaTypeView
            type={{ category: "declared_enum", name: entityKey.enum, module: entityKey.enumModule }}
          />
        ) : (
          <KeyType type={entityKey.type} />
        )}
      </div>
      <div>
        <KeyFieldLink entityKey={entityKey} />
      </div>
    </Row>
  );
});

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
      inner = (
        <SchemaTypeView type={{ category: "declared_enum", name: sub, module: enumModule }} />
      );
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

const IORow = memo(function IORow({
  kind,
  entry,
  module,
  ...props
}: RowProps & {
  kind: "input" | "output";
  entry: EntityInput | EntityOutput;
  /** Module of the entity shown, for entity handle links */
  module?: string;
}) {
  const rowRef = useAnchoredRef(props.anchored);
  const input = kind === "input" ? (entry as EntityInput) : null;

  return (
    <Row
      ref={rowRef as React.Ref<HTMLDivElement>}
      data-anchored={props.anchored || undefined}
      data-overridden={props.overriddenBy ? true : undefined}
    >
      <NameCell>
        <span>
          <RowIcon kind={kind} size="small" />
          <EntryLink
            kind={kind}
            name={entry.name}
            declaredBy={props.declaredBy}
            anchorBase={props.anchorBase}
          >
            <MonoName>{entry.name}</MonoName>
          </EntryLink>
          <ParamList params={entry.params} module={module} />
          {input && input.returns.length > 0 && (
            <>
              {" "}
              <Dim>→</Dim> <ParamList params={input.returns} module={module} />
            </>
          )}
        </span>
        <OverriddenPill by={props.overriddenBy} />
      </NameCell>
      {input && (
        <div>
          {input.pulseNode && (
            <PulseMark title="Also available as a Pulse node" aria-label="Pulse node">
              ✓
            </PulseMark>
          )}
        </div>
      )}
      <Description>
        {entry.description ? formatDescription(entry.description) : <Dim>—</Dim>}
      </Description>
    </Row>
  );
});

// -- Keyvalue, input and output cards --

type SectionKind = "kv" | "input" | "output";

const SECTIONS: Record<
  SectionKind,
  {
    title: string;
    icon: IconKind;
    columns: string[];
    cols: string;
    entries: (e: EntityClass) => Entry[];
  }
> = {
  kv: {
    title: "Keyvalues",
    icon: "keyvalue",
    columns: ["Name", "Type", "Field"],
    cols: "fit-content(22em) max-content minmax(0, 1fr)",
    entries: (e) => e.keys,
  },
  input: {
    title: "Inputs",
    icon: "input",
    columns: ["Name", "Pulse", "Description"],
    cols: "fit-content(24em) max-content minmax(0, 1fr)",
    entries: (e) => e.inputs,
  },
  output: {
    title: "Outputs",
    icon: "output",
    columns: ["Name", "Description"],
    cols: "fit-content(24em) minmax(0, 1fr)",
    entries: (e) => e.outputs,
  },
};

function EntityListCard({
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
  const section = SECTIONS[kind];
  // Names are case-insensitive, like the overrides in buildInheritedGroups
  const anchor = useHashParam(kind)?.toLowerCase();
  const isAnchor = (e: Entry) => e.name.toLowerCase() === anchor;
  const own = section.entries(entity);
  // Farthest first, so the rows read from the root down to this entity
  const groups = useMemo(
    () => buildInheritedGroups(entity, chain, section.entries).toReversed(),
    [entity, chain, section],
  );

  // Links from older pages can still point at an inherited row here
  const anchoredInherited =
    anchor != null && !own.some(isAnchor)
      ? groups.some((g) => g.entries.some((e) => !e.overriddenBy && isAnchor(e.entry)))
      : false;
  // Each entity is keyed by game and module, so this starts on own entries for every entity
  const [showInherited, setShowInherited] = useState(false);
  useEffect(() => {
    if (anchoredInherited) setShowInherited(true);
  }, [anchoredInherited]);

  if (own.length === 0 && groups.length === 0) return null;

  function renderEntry(entry: Entry, declaredBy?: EntityClass, overriddenBy?: EntityClass) {
    // Own entries are never overridden, inherited ones lose to a nearer redeclaration
    const props = {
      anchorBase,
      anchored: !overriddenBy && isAnchor(entry),
      declaredBy,
      overriddenBy,
    };
    return kind === "kv" ? (
      <KeyRow key={entry.name} entityKey={entry as EntityKey} {...props} />
    ) : (
      <IORow
        key={entry.name}
        kind={kind}
        entry={entry as EntityInput | EntityOutput}
        module={entity.module}
        {...props}
      />
    );
  }

  const hasRows = own.length > 0 || showInherited;
  return (
    <TitledCard
      title={section.title}
      icon={section.icon}
      // Under the entity heading
      titleAs="h3"
      actions={
        groups.length > 0 && (
          <InheritedSwitch
            label={section.title}
            showInherited={showInherited}
            onChange={setShowInherited}
          />
        )
      }
    >
      <Table style={{ "--cols": section.cols } as React.CSSProperties}>
        {hasRows && (
          <TableHead>
            {section.columns.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </TableHead>
        )}
        {showInherited ? (
          <>
            {groups.map((g) => (
              <React.Fragment key={g.entity.class}>
                <InheritedBand entity={g.entity} />
                {g.entries.map(({ entry, overriddenBy }) =>
                  renderEntry(entry, g.entity, overriddenBy),
                )}
              </React.Fragment>
            ))}
            {own.length > 0 && (
              <Band>
                <KindIcon kind="entity" size={14} />
                <strong>{entityLabel(entity)}</strong>
              </Band>
            )}
          </>
        ) : (
          groups.length > 0 && (
            <CollapsedInheritedRow
              label={`Inherited ${section.title.toLowerCase()}`}
              onShow={() => setShowInherited(true)}
            />
          )
        )}
        {own.map((entry) => renderEntry(entry))}
      </Table>
    </TitledCard>
  );
}

function InheritedBand({ entity }: { entity: EntityClass }) {
  const { game } = useContext(DeclarationsContext);
  return (
    <Band>
      <KindIcon kind="inherited-class" size={14} />
      <Link to={entityPath(game, entity)}>{entityLabel(entity)}</Link>
      {entity.designName && <span>{entity.class}</span>}
    </Band>
  );
}

/** Entity data of a class, below its fields */
export function EntitySections({
  entities,
  anchorBase,
}: {
  entities: EntityClass[];
  anchorBase: string;
}) {
  const ctx = useContext(DeclarationsContext);
  // CEntityInstance is the root of both the client and server entity lists
  const manyEntities = entities.length > 1;

  return entities.map((entity) => {
    const chain = entityChain(ctx, entity);
    return (
      <section key={`${ctx.game}/${entity.module}`} aria-label={`${entityLabel(entity)} entity`}>
        <EntityHeading id={entityAnchor(entity)}>
          <KindIcon kind="entity" size="big" />
          <EntityName>{entityLabel(entity)}</EntityName>
          {!entity.designName && <Pill>no design name</Pill>}
          <Pill>{entity.spawnable ? "spawnable" : "not spawnable"}</Pill>
          {(manyEntities || entity.module !== entity.classModule) && (
            <Pill title={`Linked in ${entity.module}`}>{entity.module}</Pill>
          )}
        </EntityHeading>
        <EntityDetails entity={entity} />
        {(["kv", "input", "output"] as const).map((kind) => (
          <EntityListCard
            key={kind}
            entity={entity}
            chain={chain}
            kind={kind}
            anchorBase={anchorBase}
          />
        ))}
      </section>
    );
  });
}

/** Inputs/outputs that matched an input:/output: search, inside the class's result card */
export function EntityMatches({
  matches,
  module,
  anchorBase,
}: {
  matches: { inputs: EntityInput[]; outputs: EntityOutput[] };
  module: string;
  anchorBase: string;
}) {
  return (["input", "output"] as const).map((kind) => {
    const entries = kind === "input" ? matches.inputs : matches.outputs;
    if (entries.length === 0) return null;
    const section = SECTIONS[kind];
    return (
      <React.Fragment key={kind}>
        <Band>
          <KindIcon kind={section.icon} size={14} />
          <strong>{section.title}</strong>
        </Band>
        <Table style={{ "--cols": section.cols } as React.CSSProperties}>
          {entries.map((entry) => (
            <IORow
              key={entry.name}
              kind={kind}
              entry={entry}
              module={module}
              anchorBase={anchorBase}
              anchored={false}
            />
          ))}
        </Table>
      </React.Fragment>
    );
  });
}

// -- Component classes --

/** Entities using a class as a component, the reverse of an entity's components */
export function ComponentOf({ name, module }: { name: string; module: string }) {
  const { game, componentOf } = useContext(DeclarationsContext);
  return (
    <CollapsibleLinkDetail
      title="Component of"
      items={componentOf.get(declarationKey(module, name))}
      render={({ entity, component, replaced }) => (
        <Link
          key={`${entity.module}/${entity.class}/${component.base}`}
          to={entityPath(game, entity)}
          title={`${entity.class} in ${entity.module}`}
        >
          <KindIcon kind="entity" size="small" />
          <span>
            {entity.class}
            {entity.designName && <Dim> {entity.designName}</Dim>}
            {replaced && <Dim>, replaced by {component.override}</Dim>}
          </span>
        </Link>
      )}
    />
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
    <CollapsibleLinkDetail
      title="Used by entity keyvalues"
      items={refs}
      render={({ entity, key }) => (
        <Link
          key={`${entity.module}/${entity.class}/${key.name}`}
          to={keyvalueLink(game, entity, key.name)}
          title={`${entity.class} in ${entity.module}`}
        >
          <KindIcon kind="entity" size="small" />
          <span>
            {entityLabel(entity)}
            <RefField>{key.name}</RefField>
            {ambiguous.has(`${entityLabel(entity)}.${key.name}`) && <Dim> ({entity.module})</Dim>}
          </span>
        </Link>
      )}
    />
  );
}
