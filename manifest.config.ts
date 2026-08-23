import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Nihongo Nin - Học Tiếng Nhật",
  description:
    "Kiên trì học tiếng Nhật: Kanji, từ vựng, ngữ pháp và quiz ôn luyện cho mọi cấp độ JLPT — dành cho người Việt.",
  version: pkg.version,
  action: {
    default_popup: "index.html",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  icons: {
    16: "public/icons/icon16.png",
    48: "public/icons/icon48.png",
    128: "public/icons/icon128.png",
  },
  permissions: ["storage", "alarms", "notifications", "tabs"],
});
