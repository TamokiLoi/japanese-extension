import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Kanji N4/N3 — Học Kanji tiếng Nhật",
  description:
    "Học và ôn tập Kanji JLPT N4/N3 dành cho người Việt học tiếng Nhật.",
  version: pkg.version,
  action: {
    default_popup: "index.html",
  },
  icons: {
    16: "public/icons/icon16.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  permissions: ["storage"],
});
