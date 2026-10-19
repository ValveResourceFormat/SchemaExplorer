import { INTRINSIC_MODULE } from "./intrinsics.ts";

const MODULE_PRIORITY = ["client", "server"];

/** client and server first, then the other modules by name, and the engine types last */
export function compareModuleNames(a: string, b: string): number {
  const aIntrinsic = a === INTRINSIC_MODULE;
  const bIntrinsic = b === INTRINSIC_MODULE;
  if (aIntrinsic !== bIntrinsic) return aIntrinsic ? 1 : -1;
  const ai = MODULE_PRIORITY.indexOf(a);
  const bi = MODULE_PRIORITY.indexOf(b);
  if (ai !== bi) return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** What a module is called on the site, the intrinsics are engine types rather than a DLL */
export function moduleLabel(module: string): string {
  return module === INTRINSIC_MODULE ? "Engine types" : module;
}

/** Where a declaration lives, "client.dll", or "engine type" for the intrinsics */
export function moduleFile(module: string): string {
  return module === INTRINSIC_MODULE ? "engine type" : `${module}.dll`;
}
