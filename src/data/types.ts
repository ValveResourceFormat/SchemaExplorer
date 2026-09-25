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
      /** Size in bytes of this instantiation, from the game. Omitted in older dumps */
      size?: number;
      /** Alignment of this instantiation, from the game. Omitted in older dumps */
      alignment?: number;
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
  /** Omitted in dumps that are not kept up to date, where offsets would go stale */
  offset?: number;
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
  /** Size in bytes, omitted in dumps that are not kept up to date */
  size?: number;
  /** Omitted when unknown, or in dumps that are not kept up to date */
  alignment?: number;
  flags: SchemaClassFlag[];
  parents: SchemaParent[];
  fields: SchemaField[];
  metadata: SchemaMetadataEntry[];
  /** Set on search results filtered by input:/output: */
  entityMatches?: { inputs: EntityInput[]; outputs: EntityOutput[] };
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

// Console variables and commands. If these change, update the pseudo-schema in scripts/generate-llms.ts (llms.txt).
export interface ConVar {
  kind: "convar";
  name: string;
  type: string;
  default?: string;
  min?: string;
  max?: string;
  /** Schema enum of enum_value convars, whose string value is enumerator names */
  enum?: string;
  enumModule?: string;
  flags: string[];
  modules: string[];
  help?: string;
}

export interface ConCommand {
  kind: "command";
  name: string;
  flags: string[];
  modules: string[];
  help?: string;
}

export type ConsoleItem = ConVar | ConCommand;

// Entity classes (CS2 only for now). Keys, inputs and outputs are only the ones added since baseClass.
export interface EntityKey {
  name: string;
  type: string;
  field?: string;
  /** Schema class of the field, the dump omits it when it's the entity's class */
  declaredIn: string;
  /** The dump omits it when it's the entity's classModule */
  declaredInModule: string;
  path?: string;
  enum?: string;
  enumModule?: string;
  procedural?: boolean;
  removed?: boolean;
  arrayStart?: number;
  arrayCount?: number;
}

export interface EntityParam {
  name: string;
  type: string;
  /** Module of a PVAL_SCHEMA_ENUM param's enum */
  enumModule?: string;
}

export interface EntityInput {
  name: string;
  params: EntityParam[];
  returns: EntityParam[];
  description?: string;
  pulseNode: boolean;
}

export interface EntityOutput {
  name: string;
  params: EntityParam[];
  description?: string;
}

export interface EntityComponent {
  base: string;
  override: string;
}

export interface EntityClass {
  class: string;
  module: string;
  /** Module of the schema class, the dump omits it when it's module */
  classModule: string;
  designName?: string;
  baseClass?: string;
  spawnable: boolean;
  flags: string[];
  spawnOrder: number;
  components: EntityComponent[];
  keys: EntityKey[];
  inputs: EntityInput[];
  outputs: EntityOutput[];
}
