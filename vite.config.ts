import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import manifest from "./manifest.config.ts";

// GH_PAGES=true switches to the static-site build for GitHub Pages: no
// crx() (that plugin assumes a manifest.json + service worker + chrome.*
// APIs, none of which exist on a plain web page -- src/platform/ is what
// lets the same src/popup/** work without it), a GitHub Pages project-repo
// base path (served under /<repo>/, not /), and a separate outDir so
// `npm run build` (extension) and `npm run build:pages` (web) never clobber
// each other's output.
const isPages = process.env.GH_PAGES === "true";

export default defineConfig({
  base: isPages ? "/japanese-extension/" : "/",
  plugins: isPages ? [react()] : [react(), crx({ manifest })],
  build: {
    outDir: isPages ? "dist-pages" : "dist",
  },
});
