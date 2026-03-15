import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/SchemaExplorer/",
  assetsInclude: ["schemas/*.json.gz"],
  plugins: [
    react({
      plugins: [["@swc/plugin-styled-components", { displayName: true, fileName: true }]],
    }),
  ],
  build: {
    emptyOutDir: true,
  },
});
