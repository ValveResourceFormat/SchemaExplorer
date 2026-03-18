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
    ],
    build: {
      sourcemap: true,
    },
  };
});
