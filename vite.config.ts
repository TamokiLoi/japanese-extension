import { fileURLToPath } from "node:url";
import { rm } from "node:fs/promises";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import manifest from "./manifest.config.ts";

// public/images/it-book/ (~26MB of scanned page images, see
// ItBookLessonsScreen.tsx's "Ảnh trang sách gốc") is web-dashboard-only --
// IT Book has no popup UI at all (App.tsx's fallback message). `public/` has
// no per-build-target filtering in Vite, so both builds copy it verbatim by
// default; this deletes it from the extension's dist/ right after Vite
// copies public/ there, so the Chrome package doesn't ship 26MB nobody in
// the popup can ever reach. No-op for the pages build (the images are the
// whole point there).
function pruneItBookImagesFromExtensionBuild(): Plugin {
  return {
    name: "prune-it-book-images",
    apply: "build",
    closeBundle: async () => {
      await rm("dist/images/it-book", { recursive: true, force: true });
    },
  };
}

// GH_PAGES=true switches to the static-site build for GitHub Pages: no
// crx() (that plugin assumes a manifest.json + service worker + chrome.*
// APIs, none of which exist on a plain web page -- src/platform/ is what
// lets the same src/popup/** work without it), a GitHub Pages project-repo
// base path (served under /<repo>/, not /), and a separate outDir so
// `npm run build` (extension) and `npm run build:pages` (web) never clobber
// each other's output.
//
// tailwindcss() is likewise pages-only: the new src/web/** dashboard (see
// src/web/README) is the only tree that uses Tailwind, and it's reached
// exclusively via a dynamic import gated on isExtensionRuntime() (see
// src/platform/runtime.ts), so the extension build never even requests the
// Tailwind-processed CSS chunk. Keeping the plugin out of that build entirely
// avoids scanning src/popup/** for Tailwind classes it doesn't use.
const isPages = process.env.GH_PAGES === "true";

export default defineConfig({
  base: isPages ? "/japanese-extension/" : "/",
  plugins: isPages ? [react(), tailwindcss()] : [react(), crx({ manifest }), pruneItBookImagesFromExtensionBuild()],
  // "@/*" -> src/web/* -- see the tsconfig.json comment; shadcn/ui's
  // generated components (src/web/components/ui/**) import each other and
  // ./lib/utils this way. Harmless for the extension build: it's just an
  // import-path resolution rule, nothing under src/popup/** uses it.
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/web", import.meta.url)),
    },
  },
  build: {
    outDir: isPages ? "dist-pages" : "dist",
  },
  // Inlined as a literal boolean at build time (see src/vite-env.d.ts for the
  // type). main.tsx guards the src/web/ dynamic import behind this so
  // esbuild/Rollup can dead-code-eliminate the whole `import()` -- and the
  // Tailwind-processed CSS chunk that comes with it -- out of the extension
  // build entirely, instead of merely leaving it unfetched at runtime.
  define: {
    __IS_PAGES_BUILD__: JSON.stringify(isPages),
  },
});
