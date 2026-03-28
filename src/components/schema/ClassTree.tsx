import { useContext, useMemo } from "react";
import { Link } from "../Link";
import { styled } from "@linaria/react";
import { Declaration, SchemaClass, SchemaEnum } from "../../data/types";
import { DeclarationsContext, declarationKey, schemaPath } from "./DeclarationsContext";
import { CardBlock } from "./styles";
import { ICONS_URL } from "../kind-icon/KindIcon";

interface TreeNode {
  cls: SchemaClass;
  children: TreeNode[];
}

function buildTree(
  classes: Map<string, SchemaClass>,
  declarations: Map<string, Map<string, Declaration>>,
): TreeNode[] {
  const allNodes = new Map<string, TreeNode>();
  const hasParentInTree = new Set<string>();

  for (const [key, cls] of classes) {
    allNodes.set(key, { cls, children: [] });
  }

  for (const [key, cls] of classes) {
    for (const parent of cls.parents) {
      const parentKey = declarationKey(parent.module, parent.name);
      let parentNode = allNodes.get(parentKey);
      if (!parentNode) {
        // Parent may be in a different module
        const parentDecl = declarations.get(parent.module)?.get(parent.name);
        if (parentDecl?.kind === "class") {
          parentNode = { cls: parentDecl, children: [] };
          allNodes.set(parentKey, parentNode);
        }
      }
      if (parentNode) {
        hasParentInTree.add(key);
        parentNode.children.push(allNodes.get(key)!);
      }
    }
  }

  for (const node of allNodes.values()) {
    if (node.children.length > 1) {
      node.children.sort((a, b) =>
        a.cls.name < b.cls.name ? -1 : a.cls.name > b.cls.name ? 1 : 0,
      );
    }
  }

  const roots: TreeNode[] = [];
  for (const [key, node] of allNodes) {
    if (!hasParentInTree.has(key)) {
      roots.push(node);
    }
  }
  roots.sort((a, b) => (a.cls.name < b.cls.name ? -1 : a.cls.name > b.cls.name ? 1 : 0));
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
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text);

  a {
    display: flex;
  }

  svg {
    width: 24px;
    height: 24px;
    border-radius: 3px;
  }
`;

const EnumsHeading = styled.h2`
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-dim);
  margin: 12px 0 6px;
`;

const TreeContainer = styled(CardBlock)`
  margin-top: 32px;
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
  const { declarations, game } = useContext(DeclarationsContext);

  const { classes, enums } = useMemo(() => {
    const classes = new Map<string, SchemaClass>();
    const enums: SchemaEnum[] = [];
    const modules = module ? [declarations.get(module)] : declarations.values();
    for (const moduleMap of modules) {
      if (!moduleMap) continue;
      for (const d of moduleMap.values()) {
        if (d.kind === "class") classes.set(declarationKey(d.module, d.name), d);
        else enums.push(d);
      }
    }
    enums.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return { classes, enums };
  }, [declarations, module]);

  const roots = useMemo(() => buildTree(classes, declarations), [classes, declarations]);

  return (
    <TreeContainer>
      <TreeHeading>
        <Link to={schemaPath(game)}>
          <svg width="24" height="24">
            <use href={`${ICONS_URL}#game-${game}`} />
          </svg>
        </Link>
        {module}
      </TreeHeading>
      <RootList>
        {roots.map((node) => (
          <TreeNodeView
            key={declarationKey(node.cls.module, node.cls.name)}
            node={node}
            game={game}
          />
        ))}
      </RootList>
      {enums.length > 0 && (
        <>
          <EnumsHeading>Enums</EnumsHeading>
          <RootList>
            {enums.map((e) => (
              <li key={declarationKey(e.module, e.name)}>
                <ClassLink to={schemaPath(game, e.module, e.name)} title={`enum in ${e.module}`}>
                  {e.name}
                </ClassLink>
              </li>
            ))}
          </RootList>
        </>
      )}
    </TreeContainer>
  );
}
