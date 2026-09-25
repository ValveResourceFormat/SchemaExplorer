import { Fragment, useContext, useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "../Link";
import { styled } from "@linaria/react";
import { SchemaFieldType, SchemaMetadataEntry } from "../../data/types";
import { ColoredSyntax } from "./ColoredSyntax";
import { KindIcon } from "../kind-icon/KindIcon";
import { metadataIconMap } from "../kind-icon/metadataIconMap";
import { searchLink } from "../../utils/filtering";
import { DeclarationsContext, fieldLink, schemaPath } from "./DeclarationsContext";
import { Dim } from "./styles";
import { Detail, ExpandToggle } from "./Detail";
import { subtleUnderline } from "./link-styles";
import { INTRINSIC_MODULE } from "../../data/intrinsics";
import { metadataValueText, parseNetworkOverride } from "../../utils/format";
import { findDeclarationByName } from "../../data/derived";
import { tip } from "../Tooltip";

// @ts-expect-error Linaria styled() doesn't support ForwardRefExoticComponent
const TypeLink = styled(NavLink)`
  font-weight: inherit;
  ${subtleUnderline}

  &.interface {
    color: var(--syntax-interface);
  }
  &.enum {
    color: var(--syntax-enum);
  }
  &.intrinsic {
    color: var(--syntax-intrinsic);
  }

  &:hover {
    color: var(--highlight);
  }

  &.active {
    text-decoration: none;
  }
`;

export function SchemaTypeView({ type }: { type: SchemaFieldType }) {
  switch (type.category) {
    case "builtin":
      return <ColoredSyntax kind="literal">{type.name}</ColoredSyntax>;
    case "declared_class":
    case "declared_enum":
      if (!type.module) {
        return (
          <span {...tip("Not in any schema scope, so it has no page.")}>
            <ColoredSyntax kind="interface">{type.name}</ColoredSyntax>
          </span>
        );
      }
      return (
        <DeclarationLink
          name={type.name}
          module={type.module}
          isEnum={type.category === "declared_enum"}
        />
      );
    case "ptr":
      return (
        <>
          <SchemaTypeView type={type.inner} />*
        </>
      );
    case "fixed_array":
      return (
        <>
          <SchemaTypeView type={type.inner} />[{type.count}]
        </>
      );
    case "atomic": {
      const args = [
        type.inner && <SchemaTypeView type={type.inner} />,
        type.inner2 && <SchemaTypeView type={type.inner2} />,
        type.count != null && <ColoredSyntax kind="literal">{type.count}</ColoredSyntax>,
      ].filter(Boolean);
      if (args.length === 0) return <IntrinsicLink name={type.name} />;
      return (
        <span>
          <IntrinsicLink name={type.name} />
          <Dim>&lt;</Dim>
          {args.map((arg, i) => (
            <Fragment key={i}>
              {i > 0 && <Dim>, </Dim>}
              {arg}
            </Fragment>
          ))}
          <Dim>&gt;</Dim>
        </span>
      );
    }
    case "bitfield":
      return <ColoredSyntax kind="literal">bitfield:{type.count}</ColoredSyntax>;
    default:
      return <span>{(type as { category: string }).category}</span>;
  }
}

function IntrinsicLink({ name }: { name: string }) {
  const { game } = useContext(DeclarationsContext);
  const to = schemaPath(game, INTRINSIC_MODULE, name);

  return (
    <TypeLink
      to={to}
      className="intrinsic"
      {...tip(
        "An engine type the schemas use but don't describe, its layout here comes from this site.",
      )}
    >
      {name}
    </TypeLink>
  );
}

function DeclarationLink({
  name,
  module,
  isEnum,
}: {
  name: string;
  module: string;
  isEnum: boolean;
}) {
  const { game } = useContext(DeclarationsContext);
  const to = schemaPath(game, module, name);

  return (
    <TypeLink
      to={to}
      title={`${isEnum ? "enum" : "class"} in ${module}`}
      className={isEnum ? "enum" : "interface"}
    >
      {name}
    </TypeLink>
  );
}

const MetadataList = styled.div`
  font-size: 14px;
  color: var(--text-dim);
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MetadataGroupName = styled(Link)`
  color: var(--text-dim);
  ${subtleUnderline}
  display: flex;
  align-items: center;

  &:hover {
    color: var(--highlight);
  }
`;

const MetadataGroupValues = styled.div`
  margin-left: 16px;
  display: flex;
  flex-direction: column;
`;

const MetadataEntry = styled.div`
  display: flex;
`;

const MetadataIcon = styled.span`
  display: inline-flex;
  margin-right: 4px;
  flex-shrink: 0;
`;

const MetadataName = styled(Link)`
  color: var(--text-dim);
  ${subtleUnderline}

  &:hover {
    color: var(--highlight);
  }
`;

const MetadataValue = styled.span`
  color: var(--text-dim);
  white-space: pre-wrap;
`;

const MetadataValueLink = styled(Link)`
  color: var(--text-dim);
  ${subtleUnderline}

  &:hover {
    color: var(--highlight);
  }
`;

/** Metadata value text, MNetworkOverride links to the overridden field */
function MetadataValueText({
  name,
  text,
  module,
}: {
  name: string;
  text: string;
  module?: string;
}) {
  const { game, declarations } = useContext(DeclarationsContext);
  const override = name === "MNetworkOverride" ? parseNetworkOverride(text) : null;
  if (!override) return text;
  const target = findDeclarationByName(declarations, override.className, "class", module);
  if (!target) return text;
  return (
    <MetadataValueLink to={fieldLink(game, target.module, target.name, override.field)}>
      {text}
    </MetadataValueLink>
  );
}

const MAX_COLLAPSED_LINES = 6;

function countLines(groups: { name: string; values: (string | undefined)[] }[]): number {
  let lines = 0;
  for (const group of groups) {
    if (group.values.length === 1) {
      const val = group.values[0];
      lines += val !== undefined ? val.split("\n").length : 1;
    } else {
      lines++; // group name
      for (const v of group.values) {
        lines += v !== undefined ? v.split("\n").length : 1;
      }
    }
  }
  return lines;
}

function truncateGroups(
  groups: { name: string; values: (string | undefined)[] }[],
  maxLines: number,
): { name: string; values: (string | undefined)[] }[] {
  const result: { name: string; values: (string | undefined)[] }[] = [];
  let remaining = maxLines;

  for (const group of groups) {
    if (remaining <= 0) break;

    if (group.values.length === 1) {
      const val = group.values[0];
      if (val !== undefined) {
        const lines = val.split("\n");
        if (lines.length <= remaining) {
          result.push(group);
          remaining -= lines.length;
        } else {
          result.push({ name: group.name, values: [lines.slice(0, remaining).join("\n") + "…"] });
          remaining = 0;
        }
      } else {
        result.push(group);
        remaining--;
      }
    } else {
      remaining--; // group name line
      if (remaining <= 0) break;
      const truncatedValues: (string | undefined)[] = [];
      for (const v of group.values) {
        if (remaining <= 0) break;
        if (v !== undefined) {
          const lines = v.split("\n");
          if (lines.length <= remaining) {
            truncatedValues.push(v);
            remaining -= lines.length;
          } else {
            truncatedValues.push(lines.slice(0, remaining).join("\n") + "…");
            remaining = 0;
          }
        } else {
          truncatedValues.push(v);
          remaining--;
        }
      }
      result.push({ name: group.name, values: truncatedValues });
    }
  }

  return result;
}

type MetadataGroup = { name: string; values: (string | undefined)[] };

/** Entries grouped by name, the friendly name and description first, KV3 defaults last */
function groupMetadata(metadata: SchemaMetadataEntry[]): MetadataGroup[] {
  const groups: MetadataGroup[] = [];
  const map = new Map<string, MetadataGroup>();
  for (const entry of metadata) {
    let group = map.get(entry.name);
    if (!group) {
      group = { name: entry.name, values: [] };
      map.set(entry.name, group);
      groups.push(group);
    }
    group.values.push(metadataValueText(entry.value));
  }
  const priority = (name: string) => {
    if (name === "MPropertyFriendlyName" || name === "MPropertyDescription") return -1;
    if (name === "MGetKV3ClassDefaults") return 1;
    return 0;
  };
  groups.sort((a, b) => {
    const p = priority(a.name) - priority(b.name);
    if (p !== 0) return p;
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    return 0;
  });
  return groups;
}

interface MetadataState {
  grouped: MetadataGroup[];
  /** More lines than fit collapsed */
  hasMore: boolean;
  expanded: boolean;
  toggle: () => void;
}

/** Groups metadata once and keeps whether it's expanded, collapsed again for other metadata */
function useMetadata(metadata: SchemaMetadataEntry[]): MetadataState {
  const grouped = useMemo(() => groupMetadata(metadata), [metadata]);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [metadata]);
  return {
    grouped,
    hasMore: countLines(grouped) > MAX_COLLAPSED_LINES,
    expanded,
    toggle: () => setExpanded(!expanded),
  };
}

function metadataToggle(state: MetadataState) {
  if (!state.hasMore) return undefined;
  return { expanded: state.expanded, onToggle: state.toggle, more: "Show all" };
}

/** Metadata as a details row, the expand toggle under the label where it can't be missed */
export function MetadataDetail({
  metadata,
  game,
  module,
}: {
  metadata: SchemaMetadataEntry[];
  game: string;
  module?: string;
}) {
  const state = useMetadata(metadata);
  if (metadata.length === 0) return null;
  return (
    <Detail label="Metadata" toggle={metadataToggle(state)}>
      <MetadataEntries state={state} game={game} module={module} />
    </Detail>
  );
}

export function MetadataTags({
  metadata,
  game,
  module,
}: {
  metadata: SchemaMetadataEntry[];
  game: string;
  /** Module of the declaration, preferred when a value names a class */
  module?: string;
}) {
  const state = useMetadata(metadata);
  if (metadata.length === 0) return null;
  return (
    <>
      <MetadataEntries state={state} game={game} module={module} />
      {state.hasMore && <ExpandToggle {...metadataToggle(state)!} />}
    </>
  );
}

function MetadataEntries({
  state,
  game,
  module,
}: {
  state: MetadataState;
  game: string;
  module?: string;
}) {
  const { grouped, hasMore, expanded } = state;
  const visible = expanded || !hasMore ? grouped : truncateGroups(grouped, MAX_COLLAPSED_LINES);

  return (
    <MetadataList>
      {visible.map((group) => {
        const iconKind = metadataIconMap[group.name] ?? "meta-default";
        const metaTo = searchLink(game, `metadata:${group.name}`);
        if (group.values.length === 1) {
          return (
            <MetadataEntry key={group.name}>
              <MetadataIcon>
                <KindIcon kind={iconKind} size="small" />
              </MetadataIcon>
              <span>
                <MetadataName to={metaTo}>{group.name}</MetadataName>
                {group.values[0] !== undefined && (
                  <MetadataValue>
                    : <MetadataValueText name={group.name} text={group.values[0]} module={module} />
                  </MetadataValue>
                )}
              </span>
            </MetadataEntry>
          );
        }

        return (
          <div key={group.name}>
            <MetadataGroupName to={metaTo}>
              <MetadataIcon>
                <KindIcon kind={iconKind} size="small" />
              </MetadataIcon>
              {group.name}
            </MetadataGroupName>
            <MetadataGroupValues>
              {group.values.map((v, i) => (
                <MetadataValue key={i}>
                  {v !== undefined && (
                    <MetadataValueText name={group.name} text={v} module={module} />
                  )}
                </MetadataValue>
              ))}
            </MetadataGroupValues>
          </div>
        );
      })}
    </MetadataList>
  );
}
