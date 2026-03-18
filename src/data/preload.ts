import type { Declaration } from "./types";
import type { SchemaMetadata } from "./schemas";

export type PreloadedSchema = { declarations: Declaration[]; metadata: SchemaMetadata };

export const preloadedData = new Map<string, PreloadedSchema>();
