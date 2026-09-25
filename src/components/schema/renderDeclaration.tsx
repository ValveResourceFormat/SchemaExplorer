import { ListItem } from "../layout/Content";
import { Declaration } from "../../data/types";
import { DeclarationBreadcrumb } from "./Breadcrumb";
import { declarationKey } from "./DeclarationsContext";
import { SchemaClassView } from "./SchemaClass";
import { SchemaEnumView } from "./SchemaEnum";

export function renderDeclaration(declaration: Declaration, isSearchResult?: boolean) {
  return (
    <ListItem key={declarationKey(declaration.module, declaration.name)}>
      {!isSearchResult && (
        <DeclarationBreadcrumb
          module={declaration.module}
          name={declaration.name}
          parent={declaration.kind === "class" ? declaration.parents[0] : undefined}
        />
      )}
      {declaration.kind === "class" ? (
        <SchemaClassView declaration={declaration} isSearchResult={isSearchResult} />
      ) : (
        <SchemaEnumView declaration={declaration} isSearchResult={isSearchResult} />
      )}
    </ListItem>
  );
}

export const renderSearchResult = (declaration: Declaration) =>
  renderDeclaration(declaration, true);
