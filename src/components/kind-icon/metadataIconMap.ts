import type { IconKind } from "./KindIcon";

export const metadataIconMap: Partial<Record<string, IconKind>> = {
  MPropertyFriendlyName: "meta-tag",
  MPropertyDescription: "meta-note",
  MGetKV3ClassDefaults: "meta-variable",
  MKV3TransferName: "meta-tag",
  MAlternateSemanticName: "meta-tag",
  MNotSaved: "meta-not-saved",
  MPropertySuppressExpr: "meta-eye-closed",
  MPropertySuppressField: "meta-eye-closed",
  MPropertySuppressEnumerator: "meta-eye-closed",
  MPropertyHideField: "meta-eye-closed",
  MPropertyGroupName: "meta-folder",
  MPropertyStartGroup: "meta-folder",
};
