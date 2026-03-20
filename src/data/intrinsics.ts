import type { SchemaClass, SchemaFieldType } from "./types";

export const INTRINSIC_MODULE = "_intrinsic";

const b = (name: string): SchemaFieldType => ({ category: "builtin", name });
const bf = (count: number): SchemaFieldType => ({ category: "bitfield", count });
const parent = (name: string) => [{ name, module: INTRINSIC_MODULE }];

type IntrinsicDef = {
  name: string;
  parents?: { name: string; module: string }[];
  fields?: { name: string; offset: number; type: SchemaFieldType }[];
  size: number;
};

const types: IntrinsicDef[] = [
  // ---- Math types ----

  {
    name: "Color",
    fields: [
      { name: "r", offset: 0, type: b("uint8") },
      { name: "g", offset: 1, type: b("uint8") },
      { name: "b", offset: 2, type: b("uint8") },
      { name: "a", offset: 3, type: b("uint8") },
    ],
    size: 4,
  },
  {
    name: "DegreeEuler",
    fields: [
      { name: "x", offset: 0, type: b("float32") },
      { name: "y", offset: 4, type: b("float32") },
      { name: "z", offset: 8, type: b("float32") },
    ],
    size: 12,
  },
  {
    name: "fltx4",
    fields: [
      {
        name: "m128_f32",
        offset: 0,
        type: { category: "fixed_array", inner: b("float32"), count: 4 },
      },
      {
        name: "m128_u32",
        offset: 0,
        type: { category: "fixed_array", inner: b("uint32"), count: 4 },
      },
    ],
    size: 16,
  },
  {
    name: "FourVectors",
    fields: [
      { name: "x", offset: 0, type: { category: "atomic", name: "fltx4" } },
      { name: "y", offset: 16, type: { category: "atomic", name: "fltx4" } },
      { name: "z", offset: 32, type: { category: "atomic", name: "fltx4" } },
    ],
    size: 48,
  },
  {
    name: "matrix3x4_t",
    fields: [
      {
        name: "m_flMatVal",
        offset: 0,
        type: { category: "fixed_array", inner: b("float32"), count: 12 },
      },
    ],
    size: 48,
  },
  {
    name: "matrix3x4a_t",
    parents: parent("matrix3x4_t"),
    size: 48,
  },
  {
    name: "QAngle",
    fields: [
      { name: "x", offset: 0, type: b("float32") },
      { name: "y", offset: 4, type: b("float32") },
      { name: "z", offset: 8, type: b("float32") },
    ],
    size: 12,
  },
  {
    name: "Quaternion",
    fields: [
      { name: "x", offset: 0, type: b("float32") },
      { name: "y", offset: 4, type: b("float32") },
      { name: "z", offset: 8, type: b("float32") },
      { name: "w", offset: 12, type: b("float32") },
    ],
    size: 16,
  },
  {
    name: "QuaternionAligned",
    parents: parent("Quaternion"),
    size: 16,
  },
  {
    name: "RadianEuler",
    fields: [
      { name: "x", offset: 0, type: b("float32") },
      { name: "y", offset: 4, type: b("float32") },
      { name: "z", offset: 8, type: b("float32") },
    ],
    size: 12,
  },
  {
    name: "Range_t",
    fields: [
      { name: "m_flMin", offset: 0, type: b("float32") },
      { name: "m_flMax", offset: 4, type: b("float32") },
    ],
    size: 8,
  },
  {
    name: "Vector",
    fields: [
      { name: "x", offset: 0, type: b("float32") },
      { name: "y", offset: 4, type: b("float32") },
      { name: "z", offset: 8, type: b("float32") },
    ],
    size: 12,
  },
  {
    name: "Vector2D",
    fields: [
      { name: "x", offset: 0, type: b("float32") },
      { name: "y", offset: 4, type: b("float32") },
    ],
    size: 8,
  },
  {
    name: "Vector4D",
    fields: [
      { name: "x", offset: 0, type: b("float32") },
      { name: "y", offset: 4, type: b("float32") },
      { name: "z", offset: 8, type: b("float32") },
      { name: "w", offset: 12, type: b("float32") },
    ],
    size: 16,
  },
  {
    name: "VectorAligned",
    parents: parent("Vector"),
    fields: [{ name: "w", offset: 12, type: b("float32") }],
    size: 16,
  },
  {
    name: "VectorWS",
    parents: parent("Vector"),
    size: 12,
  },
  {
    name: "CTransform",
    fields: [
      { name: "m_vPosition", offset: 0, type: { category: "atomic", name: "VectorAligned" } },
      {
        name: "m_orientation",
        offset: 16,
        type: { category: "atomic", name: "QuaternionAligned" },
      },
    ],
    size: 32,
  },

  // ---- Entity / Handle types ----

  {
    name: "CEntityHandle",
    fields: [
      { name: "m_Index", offset: 0, type: b("uint32") },
      { name: "m_EntityIndex", offset: 0, type: bf(15) },
      { name: "m_Serial", offset: 0, type: bf(17) },
    ],
    size: 4,
  },
  {
    name: "CEntityIndex",
    fields: [{ name: "m_Data", offset: 0, type: b("int32") }],
    size: 4,
  },
  {
    name: "CHandle",
    parents: parent("CEntityHandle"),
    size: 4,
  },
  {
    name: "CPlayerSlot",
    fields: [{ name: "m_Data", offset: 0, type: b("int32") }],
    size: 4,
  },
  {
    name: "CSplitScreenSlot",
    fields: [{ name: "m_Data", offset: 0, type: b("int32") }],
    size: 4,
  },

  // ---- String / Symbol types ----

  {
    name: "CBufferString",
    fields: [
      { name: "m_nLength", offset: 0, type: b("int32") },
      { name: "m_nAllocatedSize", offset: 4, type: b("int32") },
      { name: "m_pString", offset: 8, type: { category: "ptr", inner: b("char") } },
      {
        name: "m_szString",
        offset: 8,
        type: { category: "fixed_array", inner: b("char"), count: 8 },
      },
    ],
    size: 16,
  },
  {
    name: "CUtlString",
    fields: [{ name: "m_pString", offset: 0, type: { category: "ptr", inner: b("char") } }],
    size: 8,
  },
  {
    name: "CUtlSymbol",
    fields: [{ name: "m_Id", offset: 0, type: b("uint16") }],
    size: 2,
  },
  {
    name: "CUtlSymbolLarge",
    fields: [{ name: "m_pString", offset: 0, type: { category: "ptr", inner: b("char") } }],
    size: 8,
  },
  {
    name: "CUtlStringToken",
    fields: [{ name: "m_nHashCode", offset: 0, type: b("uint32") }],
    size: 4,
  },
  {
    name: "CGlobalSymbol",
    fields: [{ name: "m_Id", offset: 0, type: b("uint32") }],
    size: 4,
  },
  {
    name: "CGlobalSymbolCaseSensitive",
    parents: parent("CGlobalSymbol"),
    size: 4,
  },
  {
    name: "WorldGroupId_t",
    fields: [{ name: "m_nHashCode", offset: 0, type: b("uint32") }],
    size: 4,
  },

  // ---- Container types ----

  {
    name: "CUtlVector",
    fields: [
      { name: "m_Size", offset: 0, type: b("int32") },
      { name: "m_pMemory", offset: 8, type: { category: "ptr", inner: b("void") } },
      { name: "m_nAllocationCount", offset: 16, type: b("int32") },
      { name: "m_nGrowSize", offset: 20, type: b("int32") },
    ],
    size: 24,
  },
  {
    name: "CUtlVectorFixedGrowable",
    parents: parent("CUtlVector"),
    size: 24,
  },

  // ---- Resource / Handle types ----

  {
    name: "CResourceArray",
    fields: [
      { name: "m_nOffset", offset: 0, type: b("int32") },
      { name: "m_nCount", offset: 4, type: b("uint32") },
    ],
    size: 8,
  },
  {
    name: "CResourcePointer",
    fields: [{ name: "m_nOffset", offset: 0, type: b("int32") }],
    size: 4,
  },
  {
    name: "CResourceString",
    parents: parent("CResourcePointer"),
    size: 4,
  },
  {
    name: "CSmartPtr",
    fields: [{ name: "m_pObj", offset: 0, type: { category: "ptr", inner: b("void") } }],
    size: 8,
  },
  {
    name: "CStrongHandle",
    fields: [{ name: "m_pBinding", offset: 0, type: { category: "ptr", inner: b("void") } }],
    size: 8,
  },
  {
    name: "CStrongHandleCopyable",
    parents: parent("CStrongHandle"),
    size: 8,
  },
  {
    name: "CStrongHandleVoid",
    parents: parent("CStrongHandle"),
    size: 8,
  },
  {
    name: "CWeakHandle",
    fields: [{ name: "m_pBinding", offset: 0, type: { category: "ptr", inner: b("void") } }],
    size: 8,
  },

  // ---- Variant / Output types ----

  {
    name: "CNetworkedQuantizedFloat",
    fields: [
      { name: "m_Value", offset: 0, type: b("float32") },
      { name: "m_nEncoder", offset: 4, type: b("uint16") },
      { name: "m_bUnflattened", offset: 6, type: b("bool") },
    ],
    size: 8,
  },
  {
    name: "CVariantBase",
    fields: [
      { name: "m_int32", offset: 0, type: b("int32") },
      { name: "m_uint32", offset: 0, type: b("uint32") },
      { name: "m_int64", offset: 0, type: b("int64") },
      { name: "m_uint64", offset: 0, type: b("uint64") },
      { name: "m_float32", offset: 0, type: b("float32") },
      { name: "m_float64", offset: 0, type: b("float64") },
      { name: "m_pszString", offset: 0, type: { category: "ptr", inner: b("char") } },
      { name: "m_pVector", offset: 0, type: { category: "ptr", inner: b("void") } },
      { name: "m_pData", offset: 0, type: { category: "ptr", inner: b("void") } },
      { name: "m_char", offset: 0, type: b("char") },
      { name: "m_bool", offset: 0, type: b("bool") },
      { name: "m_hScript", offset: 0, type: { category: "atomic", name: "HSCRIPT" } },
      { name: "m_hEntity", offset: 0, type: { category: "atomic", name: "CEntityHandle" } },
      {
        name: "m_utlStringToken",
        offset: 0,
        type: { category: "atomic", name: "CUtlStringToken" },
      },
      { name: "m_type", offset: 8, type: b("int16") },
      { name: "m_flags", offset: 10, type: b("uint16") },
    ],
    size: 12,
  },

  // ---- Misc types ----

  {
    name: "SndOpEventGuid_t",
    fields: [
      { name: "m_nGuid", offset: 0, type: b("int32") },
      { name: "m_hStackHash", offset: 4, type: b("uint32") },
    ],
    size: 8,
  },
  {
    name: "V_uuid_t",
    fields: [
      { name: "Data1", offset: 0, type: b("uint32") },
      { name: "Data2", offset: 4, type: b("uint16") },
      { name: "Data3", offset: 6, type: b("uint16") },
      { name: "Data4", offset: 8, type: { category: "fixed_array", inner: b("uint8"), count: 8 } },
    ],
    size: 16,
  },
];

export const intrinsicDeclarations: SchemaClass[] = types.map((c) => ({
  kind: "class",
  name: c.name,
  module: INTRINSIC_MODULE,
  parents: c.parents ?? [],
  fields: (c.fields ?? []).map((f) => ({ ...f, metadata: [] })),
  metadata: [],
}));
