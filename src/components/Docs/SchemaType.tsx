import React, { useContext, useEffect, useMemo, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { styled } from "@linaria/react";
import { SchemaFieldType, SchemaMetadataEntry } from "./api";
import { ColoredSyntax } from "../ColoredSyntax";
import { DeclarationsContext } from "./DeclarationsContext";

const TypeLink = styled(NavLink)`
  font-weight: 600;
  text-decoration-color: var(--syntax-interface);

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
          <>
            <ColoredSyntax kind="interface">{type.name}</ColoredSyntax>
            {"< "}
            <SchemaTypeView type={type.inner} />
            {type.inner2 && (
              <>
                , <SchemaTypeView type={type.inner2} />
              </>
            )}
            {" >"}
          </>
        );
      }
      return <ColoredSyntax kind="interface">{type.name}</ColoredSyntax>;
    case "bitfield":
      return <ColoredSyntax kind="literal">bitfield:{type.count}</ColoredSyntax>;
  }
}

function DeclarationLink({ name, module }: { name: string; module: string }) {
  const { root } = useContext(DeclarationsContext);
  const to = `${root}/${module}/${name}`;

  return (
    <TypeLink to={to}>
      <ColoredSyntax kind="interface">{name}</ColoredSyntax>
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

const MetadataGroup = styled.div``;

const MetadataGroupName = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--text);
  opacity: 0.6;
  cursor: pointer;
  text-align: left;

  &:hover {
    color: var(--highlight);
    opacity: 1;
  }

  &::before {
    content: "·";
    margin-right: 4px;
    opacity: 0.5;
  }
`;

const MetadataGroupValues = styled.div`
  margin-left: 16px;
  display: flex;
  flex-direction: column;
`;

const MetadataEntry = styled.div`
  &::before {
    content: "·";
    margin-right: 4px;
    opacity: 0.5;
  }
`;

const MetadataName = styled.button`
  background: none;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--text);
  opacity: 0.6;
  cursor: pointer;

  &:hover {
    color: var(--highlight);
    opacity: 1;
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
  color: inherit;
  cursor: pointer;
  user-select: none;
  opacity: 0.5;
  font-size: 14px;
  margin-left: 20px;
  text-align: left;

  &:hover {
    opacity: 0.8;
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

export function MetadataTags({ metadata }: { metadata: SchemaMetadataEntry[] }) {
  const { root } = useContext(DeclarationsContext);
  const navigate = useNavigate();
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
    return groups;
  }, [metadata]);

  const [expanded, setExpanded] = useState(false);
  useEffect(() => setExpanded(false), [metadata]);

  if (metadata.length === 0) return null;

  const totalLines = countLines(grouped);
  const hasMore = totalLines > MAX_COLLAPSED_LINES;
  const visible = expanded
    ? grouped
    : hasMore
      ? truncateGroups(grouped, MAX_COLLAPSED_LINES)
      : grouped;

  return (
    <>
      <MetadataList>
        {visible.map((group) => {
          if (group.values.length === 1) {
            return (
              <MetadataEntry key={group.name}>
                <MetadataName
                  onClick={() =>
                    navigate(`${root}?search=${encodeURIComponent(`metadata:${group.name}`)}`)
                  }
                >
                  {group.name}
                </MetadataName>
                {group.values[0] !== undefined && (
                  <MetadataValue>: {group.values[0]}</MetadataValue>
                )}
              </MetadataEntry>
            );
          }

          return (
            <MetadataGroup key={group.name}>
              <MetadataGroupName
                onClick={() =>
                  navigate(`${root}?search=${encodeURIComponent(`metadata:${group.name}`)}`)
                }
              >
                {group.name}
              </MetadataGroupName>
              <MetadataGroupValues>
                {group.values.map((v, i) => (
                  <MetadataValue key={i}>{v}</MetadataValue>
                ))}
              </MetadataGroupValues>
            </MetadataGroup>
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
