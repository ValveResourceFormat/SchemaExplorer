import { readFile } from "node:fs/promises";
import { gunzip } from "node:zlib";
import { promisify } from "node:util";

const gunzipAsync = promisify(gunzip);

export async function readGzippedJson<T>(path: string): Promise<T> {
  const buf = await readFile(path);
  return JSON.parse((await gunzipAsync(buf)).toString("utf-8"));
}
