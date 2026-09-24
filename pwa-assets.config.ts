import { defineConfig, minimal2023Preset as preset } from "@vite-pwa/assets-generator/config";

export default defineConfig({
  preset,
  // Use the tracked app icon so asset generation works on developer machines
  // and in CI without relying on the ignored, full-resolution source artwork.
  images: ["public/icons/icon128.png"],
});
