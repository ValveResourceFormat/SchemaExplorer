import { useContext, useMemo } from "react";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import { SchemaClass } from "../../data/types";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";

interface TreeNode {
  cls: SchemaClass;
  children: TreeNode[];
}

function buildTree(classesByKey: Map<string, SchemaClass>): TreeNode[] {
  const allNodes = new Map<string, TreeNode>();
  const hasParentInTree = new Set<string>();

  for (const [key, cls] of classesByKey) {
    allNodes.set(key, { cls, children: [] });
  }

  for (const [key, cls] of classesByKey) {
    for (const parent of cls.parents) {
      const parentKey = declarationKey(parent.module, parent.name);
      const parentNode = allNodes.get(parentKey);
      if (parentNode) {
        hasParentInTree.add(key);
        parentNode.children.push(allNodes.get(key)!);
      }
    }
  }

  for (const node of allNodes.values()) {
    if (node.children.length > 1) {
      node.children.sort((a, b) => a.cls.name.localeCompare(b.cls.name));
    }
  }

  const roots: TreeNode[] = [];
  for (const [key, node] of allNodes) {
    if (!hasParentInTree.has(key)) {
      roots.push(node);
    }
  }
  roots.sort((a, b) => a.cls.name.localeCompare(b.cls.name));
  return roots;
}

const ClassLink = styled(Link)`
  text-decoration: none;
  color: var(--text);
  font-size: 14px;
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    color: var(--highlight);
  }
`;

const TreeList = styled.ul`
  margin: 0;
  padding-left: 10px;
  list-style: none;
`;

const RootList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

const TreeHeading = styled.h1`
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);
`;

const TreeContainer = styled.div`
  max-width: 560px;
  margin: 16px auto 0;
  padding: 16px 20px;
  background: var(--group);
  border: 1px solid var(--group-border);
  border-radius: 10px;
  overflow: hidden;
`;

function TreeNodeView({ node, game }: { node: TreeNode; game: string }) {
  return (
    <li>
      <ClassLink
        to={schemaPath(game, node.cls.module, node.cls.name)}
        title={`class in ${node.cls.module}`}
      >
        {node.cls.name}
      </ClassLink>
      {node.children.length > 0 && (
        <TreeList>
          {node.children.map((child) => (
            <TreeNodeView
              key={declarationKey(child.cls.module, child.cls.name)}
              node={child}
              game={game}
            />
          ))}
        </TreeList>
      )}
    </li>
  );
}

export function ClassTree({ module }: { module?: string }) {
  const { classesByKey, game } = useContext(DeclarationsContext);

  const filteredClassesByKey = useMemo(() => {
    if (!module) return classesByKey;
    const filtered = new Map<string, SchemaClass>();
    for (const [key, cls] of classesByKey) {
      if (cls.module === module) filtered.set(key, cls);
    }
    return filtered;
  }, [classesByKey, module]);

  const roots = useMemo(() => buildTree(filteredClassesByKey), [filteredClassesByKey]);

  return (
    <TreeContainer>
      <TreeHeading>{module}</TreeHeading>
      <RootList>
        {roots.map((node) => (
          <TreeNodeView
            key={declarationKey(node.cls.module, node.cls.name)}
            node={node}
            game={game}
          />
        ))}
      </RootList>
    </TreeContainer>
  );
}
