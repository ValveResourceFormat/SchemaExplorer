import React, { useContext } from "react";
import { styled } from "@linaria/react";
import { Link } from "../Link";
import type { FieldNetwork, NetworkOverride, SchemaClass, SchemaField } from "../../data/types";
import { findDeclarationByName, type InheritedBase } from "../../data/derived";
import { isSameNetworkType } from "../../data/network";
import { searchLink } from "../../utils/filtering";
import { formatFieldType } from "../../utils/format";
import { formatRange } from "../../utils/console-format";
import { KindIcon } from "../kind-icon/KindIcon";
import { DeclarationsContext, fieldLink, schemaPath } from "./DeclarationsContext";
import { Detail } from "./Detail";
import { dimLink } from "./link-styles";
import { tip } from "../Tooltip";

// -- Field rows --

/** Lines up with the text of the metadata entries below, past their icons */
const NetworkLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0 6px;
  padding-left: 20px;
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
  margin-left: 6px;
  vertical-align: -2px;
  color: var(--text-dim);
`;

/** Next to a networked field's name */
export function NetworkedMark() {
  return (
    <Mark {...tip("Networked, sent from the server to clients.")} aria-label="networked">
      <KindIcon kind="meta-broadcast" size="small" />
    </Mark>
  );
}

/** A name to search the network data for, like a user group or a callback */
function SearchValue({ value }: { value: string }) {
  const { game } = useContext(DeclarationsContext);
  return (
    <Link to={searchLink(game, `network:${value}`)} title={`Find network data with ${value}`}>
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
  { key: "priority", label: "priority", tip: "Send priority, 64 when not given." },
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
  let owner: { module: string; name: string } | undefined;
  if (className) {
    owner = findDeclarationByName(declarations, className, "class", declaration.module);
  } else if (declaration.fields.some((f) => f.name === first)) {
    owner = declaration;
  } else {
    owner = bases.findLast((b) => b.fields.some((f) => f.name === first))?.parent;
  }
  const text = className && showClass ? `${className}::${path}` : path;
  if (!owner) return <Value>{text}</Value>;
  return (
    <Link to={fieldLink(game, owner.module, owner.name, first)} title={`${owner.name}::${first}`}>
      <Value>{text}</Value>
    </Link>
  );
}

const OVERRIDE_KINDS: Record<string, string> = {
  changeCallback: "on change",
  bitCount: "bits",
  userGroup: "user group",
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
  const { network } = declaration;
  if (!network) return null;

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
    const names = network[key];
    if (!names) continue;
    rows.push({
      label,
      tip,
      items: names.map((name) => (fields ? field(name) : <SearchValue key={name} value={name} />)),
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
          → {OVERRIDE_KINDS[o.kind] ?? o.kind}
          {/* Unknown kinds can come with an empty value */}
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

  if (rows.length === 0) return null;
  return (
    <Detail label="Network">
      <NetworkList>
        {rows.map((row) => (
          <React.Fragment key={row.label}>
            <ListLabel {...tip(row.tip)}>{row.label}</ListLabel>
            <Items data-lines={row.lines || undefined}>{row.items}</Items>
          </React.Fragment>
        ))}
      </NetworkList>
    </Detail>
  );
}
