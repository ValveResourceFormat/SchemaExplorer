import type { EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { renderToPipeableStream } from "react-dom/server";
import { PassThrough } from "node:stream";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { preloadedData } from "./data/preload";
import { parseSchemas } from "./data/schemas";
import { GAME_LIST } from "./games-list";

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
) {
  for (const game of GAME_LIST) {
    if (!preloadedData.has(game.id)) {
      const buf = readFileSync(resolve("schemas", `${game.id}.json.gz`));
      const data = JSON.parse(gunzipSync(buf).toString("utf-8"));
      preloadedData.set(game.id, parseSchemas(data));
    }
  }

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
