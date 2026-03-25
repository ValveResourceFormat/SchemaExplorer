import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { reactRouter } from "@react-router/dev/vite";
import wyw from "@wyw-in-js/vite";
import { createLogger, defineConfig } from "vite";

export default defineConfig(({ mode }) => {
  const logger = createLogger();
  const originalInfo = logger.info;
  let prerenderCount = 0;
  logger.info = (msg, options) => {
    if (msg.startsWith("Prerender (html): ")) {
      prerenderCount++;
      if (prerenderCount % 1000 === 0) {
        originalInfo(`Prerendered ${prerenderCount} pages...`, options);
      }
      return;
    }
    originalInfo(msg, options);
  };

  return {
    customLogger: logger,
    base: "/SchemaExplorer/",
    assetsInclude: ["schemas/*.json.gz"],
    plugins: [
      reactRouter(),
      wyw({
        include: "src/**/*.tsx",
        classNameSlug: mode === "development" ? "[title]" : "[hash]",
        sourceMap: true,
        babelOptions: {
          presets: ["@babel/preset-typescript"],
        },
      }),
      {
        // sirv treats .gz files as pre-compressed and adds Content-Encoding: gzip,
        // causing the browser to auto-decompress. Serve them ourselves instead.
        name: "serve-gz-raw",
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const match = req.url?.match(/\/schemas\/(\w+\.json\.gz)$/);
            if (!match) return next();
            try {
              const data = readFileSync(resolve("schemas", match[1]));
              res.setHeader("Content-Type", "application/gzip");
              res.setHeader("Content-Length", data.length);
              res.end(data);
            } catch {
              next();
            }
          });
        },
      },
    ],
    build: {
      sourcemap: true,
    },
  };
});
