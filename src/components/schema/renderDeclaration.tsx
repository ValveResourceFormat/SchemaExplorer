import { ListItem } from "../layout/Content";
import { Declaration } from "../../data/types";
import { DeclarationBreadcrumb } from "./Breadcrumb";
import { declarationKey } from "./DeclarationsContext";
import { SchemaClassView } from "./SchemaClass";
import { SchemaEnumView } from "./SchemaEnum";

export function renderDeclaration(declaration: Declaration) {
  return (
    <ListItem key={declarationKey(declaration.module, declaration.name)}>
      <DeclarationBreadcrumb
        module={declaration.module}
        name={declaration.name}
        parent={declaration.kind === "class" ? declaration.parents[0] : undefined}
      />
      {declaration.kind === "class" ? (
        <SchemaClassView declaration={declaration} />
      ) : (
        <SchemaEnumView declaration={declaration} />
      )}
    </ListItem>
  );
}
