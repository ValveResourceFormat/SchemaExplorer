import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import { resolve as pathResolve } from "node:path";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { buildAllGameContexts } from "./data/derived";
import { parseSchemas, type SchemasJson } from "./data/schemas";
import { GAME_LIST, type GameId } from "./games-list";

const loaded = new Map<GameId, ReturnType<typeof parseSchemas>>();
for (const game of GAME_LIST) {
  const buf = readFileSync(pathResolve("schemas", `${game.id}.json.gz`));
  const data: SchemasJson = JSON.parse(gunzipSync(buf).toString("utf-8"));
  loaded.set(game.id, parseSchemas(data));
}
buildAllGameContexts(loaded, new Map());

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  return new Promise<Response>((resolve, reject) => {
    const body = new PassThrough();
    const chunks: Buffer[] = [];
    body.on("data", (chunk) => chunks.push(chunk));

    const { pipe } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        onAllReady() {
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      },
    );

    body.on("end", () => {
      responseHeaders.set("Content-Type", "text/html");
      const html = Buffer.concat(chunks).toString();
      resolve(
        new Response(html, {
          headers: responseHeaders,
          status: responseStatusCode,
        }),
      );
    });
  });
}
