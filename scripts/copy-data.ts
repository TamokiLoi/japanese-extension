// Copies the built Kanji dataset from the sibling japanese-data repo into
// this extension's src/data/, so the extension builds standalone without
// needing japanese-data present at build time. Re-run after regenerating
// data over there (`npm run kanji:build` in japanese-data).
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_DIR = join(ROOT, "..", "japanese-data", "data", "kanji");
const DEST_DIR = join(ROOT, "src", "data");

async function main() {
  if (!existsSync(SOURCE_DIR)) {
    console.error(
      `Source not found: ${SOURCE_DIR}\nExpected japanese-data as a sibling directory of japanese-extension.`,
    );
    process.exit(1);
  }

  await mkdir(DEST_DIR, { recursive: true });
  await copyFile(join(SOURCE_DIR, "all.json"), join(DEST_DIR, "kanji-all.json"));

  console.log(`Copied all.json -> ${join(DEST_DIR, "kanji-all.json")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
