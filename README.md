# Nihongo Nin (japanese-extension)

> **⚠️ Personal use only — do not publish.** `meanings.vi` and `mnemonic` for
> 943/979 kanji come from a personal Kanji flashcard PDF ("Hán tự Tanoshii")
> with unverified copyright status. See
> [japanese-data's README](../japanese-data/README.md#known-limitations--next-steps)
> before ever considering a Chrome Web Store / Edge Add-ons submission.

Chrome/Edge extension (Manifest V3) for learning Japanese — built on top of
the [japanese-data](../japanese-data) dataset. Named/iconed after 忍 (nin,
"perseverance"). One codebase covers both browsers since Edge is
Chromium-based and supports MV3 directly.

Long-term scope: Kanji, vocabulary, and grammar across all JLPT levels, plus
quizzes — not just N4/N3 Kanji review. Package/manifest name is intentionally
level-agnostic for that reason.

## Status

MVP: a menu screen (Kanji active; Từ vựng/Ngữ pháp/Quiz shown as "sắp ra mắt"
placeholders) leading into a Kanji viewer — browse/shuffle through N5/N4/N3/N2
Kanji (979 total), with group level selection (tick any combination of
levels, or all), a persistent-order random mode, readings, Hán-Việt, radical,
meanings, and a periodic review-reminder notification. No quiz/SRS/
vocabulary/grammar yet — those depend on later phases of the `japanese-data`
project. The level list and counts are read from the dataset at runtime, so
adding N1 later needs no UI code changes.

## Setup

```bash
npm install
npm run data:sync      # copies data/kanji/all.json from ../japanese-data
npm run icons:generate # only needed once, or after deleting public/icons
npm run dev             # Vite dev server with HMR
npm run build            # production build -> dist/
```

`src/data/kanji-all.json` is a **vendored copy** committed to this repo so it
builds standalone without `japanese-data` present. Re-run `npm run data:sync`
(requires `japanese-data` checked out as a sibling directory) whenever the
dataset changes, then commit the updated file.

## Load into the browser

1. `npm run build`
2. Chrome: go to `chrome://extensions`, enable "Developer mode", click "Load
   unpacked", select the `dist/` folder.
3. Edge: go to `edge://extensions`, enable "Developer mode", click "Load
   unpacked", select the same `dist/` folder. Same build works for both.

## Icons

`public/icons/icon{16,48,128}.png` are generated from `assets/icon-source.jpg`
(a 忍 red-ring logo mark) by center-cropping to a square and downscaling.
Regenerate after changing the source art:

```powershell
powershell -File scripts/resize-icon.ps1
```

`scripts/generate-icons.ts` still exists as a fallback that produces plain
solid-color placeholder icons if `assets/icon-source.jpg` is ever removed.

## Known limitations

- **943/979 kanji show `meanings.vi` and a `mnemonic` sourced from a personal,
  non-open PDF** ("Hán tự Tanoshii") — see the warning at the top of this
  file. The remaining 36 kanji fall back to `meanings.viDraft` (AI-translated,
  unverified, labeled "nháp AI" in the UI).
- No build step publishes to any store yet; this is local-only for now, and
  must stay that way while the fields above are populated from that source.
