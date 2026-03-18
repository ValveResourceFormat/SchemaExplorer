import { reactRouter } from "@react-router/dev/vite";
import wyw from "@wyw-in-js/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
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
}));
