import type { Declaration, SchemaFieldType, SchemaMetadataEntry } from "./Docs/api.ts";

export interface RawSchemaClass {
  name: string;
  module: string;
  parents?: { name: string; module: string }[];
  fields?: {
    name: string;
    offset: number;
    type: SchemaFieldType;
    metadata?: SchemaMetadataEntry[];
  }[];
  metadata?: SchemaMetadataEntry[];
}

export interface RawSchemaEnum {
  name: string;
  module: string;
  alignment: string;
  members?: {
    name: string;
    value: number;
    metadata?: SchemaMetadataEntry[];
  }[];
  metadata?: SchemaMetadataEntry[];
}

export interface SchemasJson {
  classes: RawSchemaClass[];
  enums: RawSchemaEnum[];
  revision?: number;
  version_date?: string;
  version_time?: string;
}

export interface SchemaMetadata {
  revision: number;
  versionDate: string;
  versionTime: string;
}

export function parseSchemas(data: SchemasJson) {
  const classes: Declaration[] = data.classes.map((c) => ({
    kind: "class" as const,
    name: c.name,
    module: c.module,
    parents: c.parents ?? [],
    fields: (c.fields ?? []).map((f) => ({
      ...f,
      metadata: f.metadata ?? [],
    })),
    metadata: c.metadata ?? [],
  }));
  const enums: Declaration[] = data.enums.map((e) => ({
    kind: "enum" as const,
    name: e.name,
    module: e.module,
    alignment: e.alignment,
    members: (e.members ?? []).map((m) => ({
      ...m,
      metadata: m.metadata ?? [],
    })),
    metadata: e.metadata ?? [],
  }));

  const seen = new Set<string>();
  const all: Declaration[] = [];
  for (const arr of [classes, enums]) {
    for (const d of arr) {
      const key = `${d.module}/${d.name}`;
      if (!seen.has(key)) {
        seen.add(key);
        all.push(d);
      }
    }
  }

  return {
    declarations: all.sort((a, b) => a.name.localeCompare(b.name)),
    metadata: {
      revision: data.revision ?? 0,
      versionDate: data.version_date ?? "",
      versionTime: data.version_time ?? "",
    } satisfies SchemaMetadata,
  };
}
