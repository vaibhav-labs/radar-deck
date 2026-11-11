import { defineConfig } from "vite";

export default defineConfig({
  // Relative base: makes the build work unchanged whether it's served from a
  // domain root (a custom domain) or a GitHub Pages project subpath
  // (https://<user>.github.io/<repo>/).
  base: "./",
});
