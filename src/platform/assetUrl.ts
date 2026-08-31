// Thin wrapper around chrome.runtime.getURL so screens can resolve bundled
// asset paths (icons, etc.) the same way in both the Chrome extension and
// the GitHub Pages static-site build. In the extension, chrome.runtime.getURL
// resolves relative to the packed extension root, where crx's build keeps
// the "public/" prefix in the callers' paths (e.g. "public/icons/x.png").
// On the web there is no `chrome` global, so we fall back to Vite's
// BASE_URL (set via the `base` config option -- see vite.config.ts), but
// Vite's own public-dir convention *strips* the "public/" prefix when
// copying those files into the build output -- so that same literal path
// has to be stripped here too, or it 404s against the deployed site.
export function assetUrl(path: string): string {
  // Already an absolute URL (e.g. a GitHub Release asset for hosted audio
  // that isn't bundled into the repo/extension at all) -- pass through
  // unchanged. Without this, the web branch below prepends BASE_URL to it,
  // producing a mangled "/japanese-extension/https://..." URL.
  if (/^https?:\/\//.test(path)) {
    return path;
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.getURL) {
    return chrome.runtime.getURL(path);
  }
  const webPath = path.replace(/^public\//, "");
  const base = import.meta.env.BASE_URL;
  return base.endsWith("/") ? `${base}${webPath}` : `${base}/${webPath}`;
}
