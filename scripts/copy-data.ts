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
const DATA_ROOT = join(ROOT, "..", "japanese-data", "data");
const KANJI_SOURCE_DIR = join(DATA_ROOT, "kanji");
const VOCAB_TANOSHII_SOURCE_DIR = join(DATA_ROOT, "vocab-tanoshii");
const DEST_DIR = join(ROOT, "src", "data");

async function main() {
  if (!existsSync(KANJI_SOURCE_DIR)) {
    console.error(
      `Source not found: ${KANJI_SOURCE_DIR}\nExpected japanese-data as a sibling directory of japanese-extension.`,
    );
    process.exit(1);
  }

  await mkdir(DEST_DIR, { recursive: true });
  await copyFile(join(KANJI_SOURCE_DIR, "all.json"), join(DEST_DIR, "kanji-all.json"));
  console.log(`Copied all.json -> ${join(DEST_DIR, "kanji-all.json")}`);

  if (existsSync(VOCAB_TANOSHII_SOURCE_DIR)) {
    for (const fileName of [
      "tinhtu-n3.json",
      "dongtu-n4.json",
      "dongnghia-n3.json",
      "mimikara-n3.json",
      "jlpt-n3-history.json",
    ]) {
      const destName = `vocab-tanoshii-${fileName}`;
      await copyFile(join(VOCAB_TANOSHII_SOURCE_DIR, fileName), join(DEST_DIR, destName));
      console.log(`Copied ${fileName} -> ${join(DEST_DIR, destName)}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
