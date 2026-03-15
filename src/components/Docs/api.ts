// Structured C++ type from the JSON dump
export type SchemaFieldType =
  | { category: "builtin"; name: string }
  | { category: "ptr"; inner: SchemaFieldType }
  | { category: "fixed_array"; inner: SchemaFieldType; count: number }
  | { category: "atomic"; name: string; inner?: SchemaFieldType; inner2?: SchemaFieldType }
  | { category: "declared_class"; name: string; module: string }
  | { category: "declared_enum"; name: string; module: string }
  | { category: "bitfield"; count: number };

export interface SchemaMetadataEntry {
  name: string;
  value?: string;
}

export interface SchemaField {
  name: string;
  offset: number;
  type: SchemaFieldType;
  metadata: SchemaMetadataEntry[];
}

export interface SchemaClass {
  kind: "class";
  name: string;
  module: string;
  parents: { name: string; module: string }[];
  fields: SchemaField[];
  metadata: SchemaMetadataEntry[];
}

export interface SchemaEnumMember {
  name: string;
  value: number;
  metadata?: SchemaMetadataEntry[];
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
