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

/** How a networked field is sent, from the game's network database. Defaults are left out */
export interface FieldNetwork {
  /** Networked type, like the element type of network vectors */
  type: string;
  /** The type it's sent as, when different */
  sentAs?: string;
  /** Class of embedded, pointer and component fields, when the type doesn't name it */
  class?: string;
  alias?: string;
  typeAlias?: string;
  serializer?: string;
  encoder?: string;
  recipientsFilter?: string;
  changePointerCallback?: string;
  changeCallbacks?: string[];
  userGroups?: string[];
  /** Default 64 left out */
  priority?: number;
  /** Default 32 left out */
  bitCount?: number;
  encodeFlags?: number;
  /** ±FLT_MAX left out */
  min?: number;
  max?: number;
  embeddedFieldOffsetDelta?: number;
  /** Polymorphic pointers */
  polymorphic?: boolean;
  /** Resource extension of resource handle fields, like vnmgraph */
  resourceType?: string;
}

/** A class's change to how a field of a base is sent */
export interface NetworkOverride {
  field: string;
  /** serializer, encoder, changeCallback, bitCount, userGroup or priority, kindN if unknown */
  kind: string;
  /** Without it, the nearest base that has the field */
  class?: string;
  value?: string;
}

/** Class-wide network settings, from the game's network database */
export interface ClassNetwork {
  /** Field names */
  includeByName?: string[];
  excludeByName?: string[];
  /** User groups */
  includeByUserGroup?: string[];
  excludeByUserGroup?: string[];
  overrides?: NetworkOverride[];
  /** Field → type */
  varTypeOverrides?: Record<string, string>;
  userGroupProxies?: string[];
  /** field is a regex over field paths */
  replayCompatFields?: { field: string; callback: string }[];
  varsAtomic?: boolean;
  structNotInNetworkUtlVectorEmbedded?: boolean;
  /** Default 2 left out */
  outOfPVSUpdates?: number;
}

export interface SchemaField {
  name: string;
  /** Omitted in dumps that are not kept up to date, where offsets would go stale */
  offset?: number;
  type: SchemaFieldType;
  metadata: SchemaMetadataEntry[];
  /** Only on networked fields */
  network?: FieldNetwork;
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
  network?: ClassNetwork;
  /** Set on search results filtered by input:/output: */
  entityMatches?: { inputs: EntityInput[]; outputs: EntityOutput[] };
  /** Set on search results whose own network data matched network:, the parts that did */
  networkMatch?: ClassNetwork;
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

// Entity classes, in the games whose dumps have them. Keys, inputs and outputs are only the ones
// added since baseClass.
export interface EntityKey {
  name: string;
  type: string;
  field?: string;
  /**
   * Class whose datadesc adds the key, the field can be inherited from its schema parents (see
   * resolveKeyField). The dump omits it when it's the entity's class. For component keys it's the
   * component's datamap class, like CGameSceneNode for CBodyComponent
   */
  declaredIn: string;
  /** The dump omits it when it's the entity's classModule */
  declaredInModule: string;
  /** Component class the key belongs to, like CBodyComponent */
  component?: string;
  path?: string;
  enum?: string;
  enumModule?: string;
  procedural?: boolean;
  removed?: boolean;
  arrayStart?: number;
  arrayCount?: number;
  /** Rare datadesc flags: ADDED_KEYFIELD, ADDITIONAL_FIELDS, EXPLICIT_BASE */
  flags?: string[];
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

/** A component the class adds itself, or one replacing a base class's component with a subclass */
export type EntityComponent = { name: string } | { base: string; override: string };

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
