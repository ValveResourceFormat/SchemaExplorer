import react from "@vitejs/plugin-react";
import wyw from "@wyw-in-js/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "/SchemaExplorer/",
  assetsInclude: ["schemas/*.json.gz"],
  plugins: [
    react(),
    wyw({
      include: "src/**/*.tsx",
      classNameSlug: mode === "development" ? "[title]" : "[title]_[hash]",
      sourceMap: true,
      babelOptions: {
        presets: ["@babel/preset-typescript"],
      },
    }),
  ],
  build: {
    emptyOutDir: true,
    sourcemap: true,
  },
}));
