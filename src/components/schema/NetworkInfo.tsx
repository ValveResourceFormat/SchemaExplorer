import React, { useContext, useMemo } from "react";
import { styled } from "@linaria/react";
import { Link } from "../Link";
import type {
  ClassNetwork,
  FieldNetwork,
  NetworkOverride,
  SchemaClass,
  SchemaField,
} from "../../data/types";
import { findDeclarationByName, type InheritedBase } from "../../data/derived";
import { isSameNetworkType, networkName, type FieldSending } from "../../data/network";
import { searchLink } from "../../utils/filtering";
import { formatFieldType } from "../../utils/format";
import { formatRange } from "../../utils/console-format";
import { KindIcon } from "../kind-icon/KindIcon";
import { DeclarationsContext, fieldLink, schemaPath } from "./DeclarationsContext";
import { Detail } from "./Detail";
import { Band } from "./styles";
import { dimLink } from "./link-styles";
import { tip } from "../Tooltip";

// -- Field rows --

/** In the row's notes, lined up with the field's name */
const NetworkLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 6px;
  font-size: 14px;
  color: var(--text-dim);

  a {
    ${dimLink}
  }
`;

/** One property, a dot between it and the one before */
const Attr = styled.span`
  &:not(:first-child)::before {
    content: "·";
    margin-right: 6px;
  }
`;

/** A little brighter than the labels, not as bright as the field names */
const Value = styled.span`
  font-family: var(--font-mono);
  font-size: 13px;
  color: color-mix(in srgb, var(--text) 55%, var(--text-dim));
`;

const Mark = styled.span`
  display: inline-flex;
  color: var(--text-dim);
`;

/** Next to a networked field's offset, crossed out when the class doesn't send it */
export function NetworkedMark({ sending }: { sending?: FieldSending }) {
  const off = sending?.sent === false;
  const text = off
    ? `Networked, but not sent by this class: ${sendingReason(sending)}`
    : `Networked, sent from the server to clients. ${sendingReason(sending)}`;
  return (
    <Mark {...tip(text.trim())} aria-label={off ? "not sent" : "networked"}>
      <KindIcon kind={off ? "meta-broadcast-off" : "meta-broadcast"} size="small" />
    </Mark>
  );
}

/** Which class decides whether it's sent, and how */
function sendingReason(sending: FieldSending | undefined) {
  if (!sending) return "";
  const { by, sent, group, noBase, via } = sending;
  if (via) return `It's kept for ${via}, which is sent.`;
  if (noBase) return `${by} sends none of its bases' fields it doesn't include.`;
  const verb = sent ? "includes" : "excludes";
  return group ? `${by} ${verb} its user group ${group}.` : `${by} ${verb} it.`;
}

/**
 * A name to search the network data for, like a user group or a callback. The search is for the
 * whole value, not every name containing it, like LocalPlayerExclusive for Player
 */
function SearchValue({ value }: { value: string }) {
  const { game } = useContext(DeclarationsContext);
  return (
    <Link to={searchLink(game, `network:=${value}`)} title={`Find network data with ${value}`}>
      <Value>{value}</Value>
    </Link>
  );
}

function SearchValues({ values }: { values: string[] }) {
  return values.map((v, i) => (
    <React.Fragment key={v}>
      {i > 0 && ", "}
      <SearchValue value={v} />
    </React.Fragment>
  ));
}

/** A class named by the network data, linked when the game has it */
function ClassName({ name, module }: { name: string; module: string }) {
  const { game, declarations } = useContext(DeclarationsContext);
  const target = findDeclarationByName(declarations, name, "class", module);
  if (!target) return <Value>{name}</Value>;
  return (
    <Link to={schemaPath(game, target.module, target.name)} title={`class in ${target.module}`}>
      <Value>{name}</Value>
    </Link>
  );
}

/**
 * The properties shown as they are, in this order. Names others search for link to a network:
 * search, numbers and types are plain
 */
const FIELD_PROPERTIES: {
  key: keyof FieldNetwork;
  label: string;
  tip: string;
  search?: boolean;
}[] = [
  { key: "sentAs", label: "sent as", tip: "The type it's sent as." },
  { key: "alias", label: "alias", tip: "Name it's networked under." },
  { key: "resourceType", label: "resource", tip: "Resource type of the handle.", search: true },
  { key: "serializer", label: "serializer", tip: "Serializer.", search: true },
  { key: "encoder", label: "encoder", tip: "Encoder.", search: true },
  { key: "bitCount", label: "bits", tip: "Bits it's sent in, 32 when not given." },
  { key: "encodeFlags", label: "encode flags", tip: "Encoder flags." },
  // Not a send rate: fields are sorted by it, so the ones that change often get small indices
  {
    key: "priority",
    label: "priority",
    tip: "Orders the class's fields, lowest first, 64 when not given.",
  },
  {
    key: "userGroups",
    label: "user group",
    tip: "User groups the field is in, classes include or exclude them.",
    search: true,
  },
  {
    key: "changeCallbacks",
    label: "on change",
    tip: "Called on the client when the value changes.",
    search: true,
  },
  {
    key: "changePointerCallback",
    label: "on pointer change",
    tip: "Called on the client when the pointer changes.",
    search: true,
  },
  { key: "recipientsFilter", label: "recipients", tip: "Filters who it's sent to.", search: true },
  {
    key: "embeddedFieldOffsetDelta",
    label: "embedded offset delta",
    tip: "Offset delta of the embedded field.",
  },
];

export type FieldAttr = { key: string; label: string; tip: string; value?: React.ReactNode };

/**
 * What to show of how a field is sent, nothing for a field sent as its own type with the
 * defaults. The module of the declaring class is preferred when a property names a class
 */
export function fieldNetworkAttrs(field: SchemaField, module: string): FieldAttr[] {
  const network = field.network;
  if (!network) return [];
  const attrs: FieldAttr[] = [];
  const typeText = formatFieldType(field.type);

  if (!isSameNetworkType(typeText, network.type)) {
    attrs.push({
      key: "type",
      label: "as",
      tip: "The type it's networked as.",
      value: <Value>{network.type}</Value>,
    });
  }
  // Most name a class the field's type names already
  if (network.class && !typeText.split(/\W+/).includes(network.class)) {
    attrs.push({
      key: "class",
      label: "class",
      tip: "Class of the embedded, pointer or component field.",
      value: <ClassName name={network.class} module={module} />,
    });
  }
  if (network.polymorphic) {
    attrs.push({ key: "polymorphic", label: "polymorphic", tip: "A polymorphic pointer." });
  }
  if (network.typeAlias && network.typeAlias !== network.alias) {
    attrs.push({
      key: "typeAlias",
      label: "type alias",
      tip: "Type name it's networked under.",
      value: <Value>{network.typeAlias}</Value>,
    });
  }
  for (const { key, label, tip, search } of FIELD_PROPERTIES) {
    const value = network[key];
    if (value == null || value === false) continue;
    const values = Array.isArray(value) ? value : [String(value)];
    attrs.push({
      key,
      label: values.length > 1 && key === "userGroups" ? "user groups" : label,
      tip,
      value: search ? <SearchValues values={values} /> : <Value>{values.join(", ")}</Value>,
    });
  }
  const range = formatRange(network.min?.toString(), network.max?.toString());
  if (range) {
    attrs.push({
      key: "range",
      label: "range",
      tip: "Range the encoding covers.",
      value: <Value>{range}</Value>,
    });
  }
  return attrs;
}

/** How a networked field is sent, under its name in the field row */
export function FieldNetworkLine({ attrs }: { attrs: FieldAttr[] }) {
  return (
    <NetworkLine>
      {attrs.map((a) => (
        <Attr key={a.key} {...tip(a.tip)}>
          {a.label}
          {a.value != null && <> {a.value}</>}
        </Attr>
      ))}
    </NetworkLine>
  );
}

// -- Class details --

const NetworkList = styled.div`
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  align-items: baseline;
  gap: 4px 14px;
  font-size: 14px;

  a {
    ${dimLink}
  }

  @media (max-width: 768px) {
    grid-template-columns: minmax(0, 1fr);
    row-gap: 0;
  }
`;

const ListLabel = styled.span`
  color: var(--text-dim);

  @media (max-width: 768px) {
    &:not(:first-child) {
      margin-top: 6px;
    }
  }
`;

/** Names next to each other, or one entry per line */
const Items = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 14px;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--text-dim);

  &[data-lines] {
    flex-direction: column;
    gap: 2px;
  }
`;

/**
 * A field of the class or a base, by name or a path like m_baseLayer.m_hSequence, linked to the
 * nearest class that has its first part
 */
function FieldName({
  path,
  declaration,
  bases,
  className,
  showClass,
}: {
  path: string;
  declaration: SchemaClass;
  bases: InheritedBase[];
  /** The class that has the field, when it isn't the nearest */
  className?: string;
  /** Written before the field, the first of several fields of the class */
  showClass?: boolean;
}) {
  const { game, declarations } = useContext(DeclarationsContext);
  const first = path.split(".")[0];
  // The lists name fields by their network alias, like m_vecVelocity for m_vecServerVelocity
  const named = (f: SchemaField) => f.name === first || networkName(f) === first;
  let owner: { module: string; name: string } | undefined;
  let field: SchemaField | undefined;
  if (className) {
    // A||B::field names several classes, the first the game has links
    for (const name of className.split("||")) {
      const cls = findDeclarationByName(declarations, name, "class", declaration.module);
      if (!cls) continue;
      owner = cls;
      if (cls.kind === "class") field = cls.fields.find(named);
      break;
    }
  } else {
    field = declaration.fields.find(named);
    if (field) owner = declaration;
    // The nearest base first
    for (let i = bases.length - 1; !field && i >= 0; i--) {
      field = bases[i].fields.find(named);
      if (field) owner = bases[i].parent;
    }
  }
  const fieldName = field?.name ?? first;
  // Long ones wrap after the class rather than inside a name
  const text =
    className && showClass ? (
      <>
        {className}::
        <wbr />
        {path}
      </>
    ) : (
      path
    );
  if (!owner) return <Value>{text}</Value>;
  return (
    <Link
      to={fieldLink(game, owner.module, owner.name, fieldName)}
      title={`${owner.name}::${fieldName}`}
    >
      <Value>{text}</Value>
    </Link>
  );
}

/**
 * The game's NetworkOverrideType_t. A user group override adds a group, and clears the field's
 * groups without a value
 */
const OVERRIDE_KINDS: Record<string, string> = {
  changeCallback: "on change",
  changeTag: "change tag",
  bitCount: "bits",
  userGroup: "user group",
  outOfPVSUpdates: "out of PVS updates",
  removeAll: "reset to defaults",
};

/** Overrides of the same class, kind and value on one line, like m_cellX, m_cellY and m_cellZ */
function groupOverrides(overrides: NetworkOverride[]) {
  const groups = new Map<string, { key: string; override: NetworkOverride; fields: string[] }>();
  for (const o of overrides) {
    const key = `${o.class}/${o.kind}/${o.value}`;
    const group = groups.get(key);
    if (group) group.fields.push(o.field);
    else groups.set(key, { key, override: o, fields: [o.field] });
  }
  return [...groups.values()];
}

/** Lists of names, each in a row of its own: field names or user groups */
const NAME_LISTS: {
  key:
    | "includeByName"
    | "excludeByName"
    | "includeByUserGroup"
    | "excludeByUserGroup"
    | "userGroupProxies";
  label: string;
  tip: string;
  fields?: boolean;
}[] = [
  { key: "includeByName", label: "Includes", tip: "Fields included by name.", fields: true },
  { key: "excludeByName", label: "Excludes", tip: "Fields excluded by name.", fields: true },
  { key: "includeByUserGroup", label: "Includes groups", tip: "User groups included." },
  { key: "excludeByUserGroup", label: "Excludes groups", tip: "User groups excluded." },
  { key: "userGroupProxies", label: "Group proxies", tip: "User group proxies." },
];

type Row = { label: string; tip: string; lines?: boolean; items: React.ReactNode };

/** Class-wide network settings, a details row of the class page */
export function ClassNetworkDetail({
  declaration,
  bases,
}: {
  declaration: SchemaClass;
  bases: InheritedBase[];
}) {
  if (!declaration.network) return null;
  // The class's own fields say on their rows whether it sends them, the lists name them by alias
  const own = new Set(declaration.fields.flatMap((f) => [f.name, networkName(f)]));
  const rows = networkRows(declaration, declaration.network, bases, own);
  if (rows.length === 0) return null;
  return (
    <Detail label="Network">
      <RowList rows={rows} />
    </Detail>
  );
}

const MatchBody = styled.div`
  padding: 8px 16px 12px;
`;

/**
 * The parts of a search result's network data that matched, under a band like other matches,
 * nothing when it matched by its fields
 */
export function ClassNetworkMatch({
  declaration,
  whole,
  bases,
}: {
  /** The search result, its fields left out */
  declaration: SchemaClass;
  /** The class with every field, which field names link through */
  whole: SchemaClass;
  bases: InheritedBase[];
}) {
  const { networkMatch } = declaration;
  const rows = useMemo(
    () => (networkMatch ? networkRows(whole, networkMatch, bases) : []),
    [networkMatch, whole, bases],
  );
  if (rows.length === 0) return null;
  return (
    <>
      <Band>
        <KindIcon kind="meta-broadcast" size={14} />
        <strong>Network</strong>
      </Band>
      <MatchBody>
        <RowList rows={rows} />
      </MatchBody>
    </>
  );
}

function RowList({ rows }: { rows: Row[] }) {
  return (
    <NetworkList>
      {rows.map((row) => (
        <React.Fragment key={row.label}>
          <ListLabel {...tip(row.tip)}>{row.label}</ListLabel>
          <Items data-lines={row.lines || undefined}>{row.items}</Items>
        </React.Fragment>
      ))}
    </NetworkList>
  );
}

/** A row for each setting of the network data */
function networkRows(
  declaration: SchemaClass,
  network: ClassNetwork,
  bases: InheritedBase[],
  /** Field names left out of the lists by name */
  hidden?: Set<string>,
): Row[] {
  const field = (path: string, className?: string, showClass?: boolean) => (
    <FieldName
      key={path}
      path={path}
      declaration={declaration}
      bases={bases}
      className={className}
      showClass={showClass}
    />
  );
  const rows: Row[] = [];

  for (const { key, label, tip, fields } of NAME_LISTS) {
    let names = network[key];
    if (fields && hidden) names = names?.filter((name) => !hidden.has(name));
    if (!names?.length) continue;
    rows.push({
      label,
      tip,
      items: names.map((name) => {
        if (!fields) return <SearchValue key={name} value={name} />;
        // CGameSceneNode::m_hParent is the field in serializers of the class nested anywhere
        const colons = name.indexOf("::");
        return colons < 0
          ? field(name)
          : field(name.slice(colons + 2), name.slice(0, colons), true);
      }),
    });
  }
  if (network.overrides) {
    rows.push({
      label: "Overrides",
      tip: "Changes to how fields of this class or its bases are sent.",
      lines: true,
      items: groupOverrides(network.overrides).map(({ key, override: o, fields }) => (
        <span key={key}>
          {fields.map((f, i) => (
            <React.Fragment key={f}>
              {i > 0 && ", "}
              {field(f, o.class, i === 0)}
            </React.Fragment>
          ))}{" "}
          →{" "}
          {o.kind === "userGroup" && !o.value
            ? "no user groups"
            : (OVERRIDE_KINDS[o.kind] ?? o.kind)}
          {/* Kinds without a value, like resetting, have an empty one */}
          {o.value && (
            <>
              {" "}
              <Value>{o.value}</Value>
            </>
          )}
        </span>
      )),
    });
  }
  if (network.varTypeOverrides) {
    rows.push({
      label: "Type overrides",
      tip: "Fields sent as another type.",
      lines: true,
      items: Object.entries(network.varTypeOverrides).map(([f, type]) => (
        <span key={f}>
          {field(f)} → <ClassName name={type} module={declaration.module} />
        </span>
      )),
    });
  }
  if (network.replayCompatFields) {
    rows.push({
      label: "Replay compat",
      tip: "Field paths, as a regex, and their callback for replay compatibility.",
      lines: true,
      items: network.replayCompatFields.map((r) => (
        <span key={r.field}>
          <Value>{r.field}</Value> → <SearchValue value={r.callback} />
        </span>
      )),
    });
  }
  if (network.outOfPVSUpdates != null) {
    rows.push({
      label: "Out of PVS updates",
      tip: "Updates sent while out of the PVS, 2 when not given.",
      items: <Value>{network.outOfPVSUpdates}</Value>,
    });
  }
  const flags = [
    network.varsAtomic && "vars atomic",
    network.structNotInNetworkUtlVectorEmbedded && "not in embedded network vectors",
  ].filter(Boolean);
  if (flags.length > 0) {
    rows.push({
      label: "Flags",
      tip: "Settings of the class's network variables.",
      items: flags.join(", "),
    });
  }

  return rows;
}
