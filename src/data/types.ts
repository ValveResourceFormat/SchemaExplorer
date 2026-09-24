// Structured C++ type from the JSON dump. If this changes, update the pseudo-schema in scripts/generate-llms.ts (llms.txt).
export type SchemaFieldType =
  | { category: "builtin"; name: string }
  | { category: "ptr"; inner: SchemaFieldType }
  | { category: "fixed_array"; inner: SchemaFieldType; count: number }
  | {
      category: "atomic";
      name: string;
      inner?: SchemaFieldType;
      inner2?: SchemaFieldType;
      /** Integer template argument, rendered last: CBitVec<N>, CUtlVectorFixedGrowable<T, N> */
      count?: number;
    }
  /** Without module, the class is not in any schema scope */
  | { category: "declared_class"; name: string; module?: string }
  | { category: "declared_enum"; name: string; module: string }
  | { category: "bitfield"; count: number };

/**
 * Raw metadata text, or a parsed object for MGetKV3ClassDefaults. Unparseable defaults stay
 * the string "Could not parse KV3 Defaults".
 */
export type SchemaMetadataValue = string | Record<string, unknown>;

export interface SchemaMetadataEntry {
  name: string;
  value?: SchemaMetadataValue;
}

export interface SchemaField {
  name: string;
  offset: number;
  type: SchemaFieldType;
  metadata: SchemaMetadataEntry[];
  defaultValue?: string;
}

export type SchemaClassFlag =
  | "abstract"
  | "trivial_constructor"
  | "trivial_destructor"
  | "construct_disallowed";

export interface SchemaParent {
  name: string;
  module: string;
  /** Byte offset of a later base in multiple inheritance, omitted when 0 */
  offset?: number;
}

export interface SchemaClass {
  kind: "class";
  name: string;
  module: string;
  /** Size in bytes */
  size: number;
  /** Omitted when unknown */
  alignment?: number;
  flags: SchemaClassFlag[];
  parents: SchemaParent[];
  fields: SchemaField[];
  metadata: SchemaMetadataEntry[];
}

export interface SchemaEnumMember {
  name: string;
  value: number;
  metadata: SchemaMetadataEntry[];
}

export interface SchemaEnum {
  kind: "enum";
  name: string;
  module: string;
  alignment: string;
  members: SchemaEnumMember[];
  metadata: SchemaMetadataEntry[];
}

export type Declaration = SchemaClass | SchemaEnum;
