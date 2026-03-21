import { useContext, useEffect, useMemo, useState } from "react";
import { Link, NavLink } from "../Link";
import { styled } from "@linaria/react";
import { SchemaFieldType, SchemaMetadataEntry } from "../../data/types";
import { ColoredSyntax } from "./ColoredSyntax";
import { KindIcon } from "../kind-icon/KindIcon";
import { metadataIconMap } from "../kind-icon/metadataIconMap";
import { searchLink } from "../../utils/filtering";
import { DeclarationsContext, schemaPath } from "./DeclarationsContext";
import { INTRINSIC_MODULE } from "../../data/intrinsics";

const AngleBracket = styled.span`
  color: var(--text-dim);
  font-weight: 400;
`;

// @ts-expect-error Linaria styled() doesn't support ForwardRefExoticComponent
const TypeLink = styled(NavLink)`
  font-weight: 600;

  &.interface {
    color: var(--syntax-interface);
  }
  &.container {
    color: var(--syntax-container);
  }
  &.atomic {
    color: var(--syntax-atomic);
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
      return <DeclarationLink name={type.name} module={type.module} />;
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
    case "atomic":
      if (type.inner) {
        return (
          <span>
            <IntrinsicLink name={type.name} kind="container" />
            <AngleBracket>&lt; </AngleBracket>
            <SchemaTypeView type={type.inner} />
            {type.inner2 && (
              <>
                , <SchemaTypeView type={type.inner2} />
              </>
            )}
            <AngleBracket> &gt;</AngleBracket>
          </span>
        );
      }
      return <IntrinsicLink name={type.name} kind="atomic" />;
    case "bitfield":
      return <ColoredSyntax kind="literal">bitfield:{type.count}</ColoredSyntax>;
    default:
      return <span>{(type as { category: string }).category}</span>;
  }
}

function IntrinsicLink({ name, kind }: { name: string; kind: "atomic" | "container" }) {
  const { game } = useContext(DeclarationsContext);
  const to = schemaPath(game, INTRINSIC_MODULE, name);

  return (
    <TypeLink to={to} title="intrinsic type" className={kind}>
      {name}
    </TypeLink>
  );
}

function DeclarationLink({ name, module }: { name: string; module: string }) {
  const { game } = useContext(DeclarationsContext);
  const to = schemaPath(game, module, name);

  return (
    <TypeLink to={to} title={`in ${module}`} className="interface">
      {name}
    </TypeLink>
  );
}

const MetadataList = styled.div`
  font-size: 14px;
  color: var(--text-dim);
  margin-top: 4px;
  margin-bottom: 4px;
  margin-left: 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const MetadataGroupName = styled(Link)`
  color: var(--text-dim);
  text-decoration: none;
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
  text-decoration: none;

  &:hover {
    color: var(--highlight);
  }
`;

const MetadataValue = styled.span`
  color: var(--text-dim);
  white-space: pre-wrap;
`;

const MetadataToggle = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--text-dim);
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  margin-left: 20px;
  text-align: left;

  &:hover {
    color: var(--text);
  }

  &::before {
    content: "·";
    margin-right: 4px;
    opacity: 0.5;
  }
`;

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

export function MetadataTags({
  metadata,
  game,
}: {
  metadata: SchemaMetadataEntry[];
  game: string;
}) {
  const grouped = useMemo(() => {
    const groups: { name: string; values: (string | undefined)[] }[] = [];
    const map = new Map<string, { name: string; values: (string | undefined)[] }>();
    for (const entry of metadata) {
      let group = map.get(entry.name);
      if (!group) {
        group = { name: entry.name, values: [] };
        map.set(entry.name, group);
        groups.push(group);
      }
      group.values.push(entry.value);
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
  }, [metadata]);

  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [metadata]);

  if (metadata.length === 0) return null;

  const totalLines = countLines(grouped);
  const hasMore = totalLines > MAX_COLLAPSED_LINES;
  const visible = expanded || !hasMore ? grouped : truncateGroups(grouped, MAX_COLLAPSED_LINES);

  return (
    <>
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
                    <MetadataValue>: {group.values[0]}</MetadataValue>
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
                  <MetadataValue key={i}>{v}</MetadataValue>
                ))}
              </MetadataGroupValues>
            </div>
          );
        })}
      </MetadataList>
      {hasMore && (
        <MetadataToggle onClick={() => setExpanded(!expanded)}>
          {expanded ? "collapse" : "expand…"}
        </MetadataToggle>
      )}
    </>
  );
}
