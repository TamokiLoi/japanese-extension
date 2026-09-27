---
name: jlpt-exam-builder
description: Add, audit, or correct one or more source JLPT past exams in the Japanese extension app, verifying questions, answer keys, reading review data, tested-word emphasis, listening audio, and illustrations against supplied materials. Use when asked to integrate, check, or repair an exam or a set of exams.
---

# Hướng dẫn rà soát và xây dựng đề JLPT

Use this skill for the requested scope: one exam, a set of exams, or every registered JLPT exam in the Japanese extension repository. Work in the current checkout; the usual project is `D:\Work\japanese-extension`. For comprehensive audits, follow the detailed checklist in [`docs/jlpt-exam-dataset-audit.md`](../../../docs/jlpt-exam-dataset-audit.md) and record coverage by dataset and question number rather than treating a successful build as proof of correctness.

## Inspect the source and app conventions

- Read repository `AGENTS.md` instructions and check the current branch/status before editing. Preserve unrelated work.
- Build a current inventory from the app registries (including past-exam, quizbook, and listening registries) before deciding what “all exams” means. Distinguish registered/visible datasets from JSON files that are merely present on disk. For an all-exam request, include every registered dataset in the audit plan and report any source PDF that is missing.
- Identify all source files for the requested exam: question booklet, answer key, listening script, and full listening MP3 when supplied. Filenames and PDFs vary; inspect rather than assume.
- Inspect the matching level's exam data, types, screen, and nearby years. Use the 2025 N3 exams as the reference for the N3 past-exam structure and image treatment.
- **Read all source PDFs with Gemini using the API key(s) configured in `_scratch/.env.gemini`.** Follow existing project scripts/SDK conventions. Send the PDF to Gemini when supported; otherwise render relevant pages and send those page images. Do not use plain text extraction or local OCR as a substitute for the required Gemini reading. If no usable key is configured or Gemini cannot read the source after reasonable retries/key rotation, stop and report the blocker rather than silently switching methods.
- Never print, log, hardcode, commit, or expose API keys; load them from `_scratch/.env.gemini` only in the local processing script, never in app/browser code. Rotate among configured keys only as needed for quota/rate-limit failures.
- Render and inspect relevant source pages as an additional visual check, especially for diagrams, question order, or answer marks; Gemini transcription must still be checked against the source and official answer key.

## Add the exam data

- Update the existing past-exam dataset for that level (N3 is `src/data/dethi-n3-cac-nam.json`). Follow its exam IDs, labels, paper IDs, question groups, points, and metadata conventions. Add counts only after counting source questions.
- Transcribe question text and choices from the source booklet or script. Preserve order and numbering. Use the answer key and script's printed `正解` as the authority for correct answers; do not infer them from generated explanations.
- `correctIndex` is zero-based: subtract one from the printed answer number. Compare every question's resulting answer number against the official key before finishing.
- Check the total questions, group counts, option counts, and total points for each paper. Keep explanations concise and in Vietnamese, and make sure each explanation supports the verified answer.

## Preserve the clues needed to answer

- Visually compare every question type in the source booklet with the app's taking view, not just its transcribed text. Preserve the exact underlined/bold target word, blank, `★` ordering position, passage reference, illustration, and number of choices. Missing emphasis can make two otherwise identical-looking questions impossible to answer correctly.
- For vocabulary reading and context questions, set `underline` to the **exact substring of `question` printed as the target**. Do not infer the target merely from the correct answer. Check that `question.includes(underline)` is true and that the taking and review screens actually emphasize it.
- For vocabulary usage, the prompt is the tested word and the option sentences should emphasize that word too. This is 問題4 for N1 and 問題5 for some other levels; inspect the source instead of hardcoding a group number. Supply `underlineForms` for inflected or alternate printed forms, and verify a target match in every option. Keep the answer choices' wording exactly as printed.
- Grammar fill-in and ordering questions use their blanks and `★` as printed; do not misuse `underline` to hold a reconstructed answer that is not a literal substring of `question`. Confirm all slots and the star are visible. Reading passages and their question text must remain available while answering. Listening prompts, pictures, and choices must follow the source's reveal order and be answerable with the hosted audio.
- Do not leave display-only passage placeholders such as `（上記と同じ）` as the only text a learner sees for later reading questions. Either store the shared passage or verify the screen resolves the reference in both taking and review. Recheck arithmetic explanations against their selected answer, especially fees, discounts, and shipping conditions.
- Preserve source paragraph breaks and layout cues in reading passages (titles, notices, dialogue turns, list items, and continuation pages). Do not flatten a multi-paragraph source into one prose block. For numbered blanks, make the currently reviewed question's matching marker prominent without filling in the answer.
- For shared reading passages, store the complete passage once on the first question in the group and use a resolvable same-passage marker for subsequent questions. Compare the complete passage with the source PDF; a short excerpt, title label, or question-specific snippet is not a substitute.
- Preserve source tables as explicit rows and columns. If the dataset uses Markdown table delimiters, confirm review renders an actual table instead of showing literal pipes and hyphens.
- For numbered blank/order questions, furigana must annotate only text that is literally present in the printed prompt. Never reconstruct the answer into `questionFurigana`; the segmented text must concatenate byte-for-byte to `question`, including dialogue newlines, blank markers, and `★`. Every source kanji in an annotated prompt/option needs a reading. Use `scripts/enrich-dethi-question-furigana.ts` to repair mismatched question annotations and re-run its dry-run afterward.
- For all-exam reading-furigana work, inventory eligible shared passages from the active registries. Generate context-sensitive readings, store `passageFurigana` on one question per shared passage, and require exact passage reconstruction plus complete kanji coverage before accepting a result. Recheck names, compounds, okurigana, and any character-level repairs; generated furigana must never modify the Japanese source text.
- Keep exam-taking mode faithful to the printed test. Reading enrichment belongs in submitted-answer/history review only: show furigana and translation controls near the passage, align Vietnamese translation sentence-by-sentence for every passage, and provide separate question/reference tabs for the reviewed question and its in-passage vocabulary/grammar. Prefer the renderer's deterministic sentence split when it aligns; where it cannot, populate `passageSentencesVi` as an exact 1:1 array matching source sentence/heading/list/table-row units. Validate unit count and order before saving; never silently fall back to one undifferentiated translation block for a multi-sentence passage. Use `scripts/enrich-dethi-reading-sentence-translations.ts` to find and fill these gaps. These controls must not appear during an active timed attempt unless the user explicitly asks to change that behavior.
- In review, keep the printed question number visible before its prompt, provide previous/next navigation, and preserve the existing ReadingScreen behavior for vocabulary/grammar lookup and highlighting. Returning from a lookup should restore the exact exam, attempt, and reviewed question. Use the consistent translation labels “Xem bản dịch” / “Ẩn bản dịch”.
- Furigana is review-only support, not a change to the question. If `passageFurigana`, `questionFurigana`, or `optionsFurigana` exist, verify concatenation reconstructs the exact source passage/prompt/option and every source kanji has a contextual reading. For grammar-ordering questions especially, verify the displayed furigana version still contains all blank slots and `★` and never includes answer words. Test show/hide furigana, script, translation, tables, paragraphs, and markers; controls must affect only the intended region.
- Before delivering, run a per-question audit for missing/invalid `underline` and usage-option matches in applicable groups, then open representative questions from **vocabulary, grammar, reading, and listening** in both taking and review states. For a cross-exam UI/data change, verify the shared behavior against each affected registered level/dataset, not only the exam that motivated the change. Document any intentionally unresolved source ambiguity.

## Include every necessary illustration

- Inspect every source page for diagrams, maps, room layouts, people, or other pictures needed to understand an item. The 2025 precedent includes source-page image captures for picture-based items; do not omit a figure because the choices are text.
- Save listening images in `public/images/listening/` and reference them from the question data. Prefer a legible capture of the relevant source page, matching existing assets.
- Use `questionImage` for a context/situation picture when the answer choices remain text. Use `optionsImage` when the answer choices themselves are pictures; in that case follow the existing schema for empty text options and numbered buttons.
- Confirm the image is shown both while answering and in answer review. `questionImage` is supported by `src/types/dethi.ts` and `src/web/screens/DeThiScreen.tsx`; inspect the current checkout before adding UI code so this support is not duplicated.

## Handle the listening audio

- Follow the existing convention: one complete, continuous audio file per listening paper, referenced by `audioUrl`; do not split it into per-question clips. Use `audioStartSec` only for verified jump points. Check that times are increasing, fall within the source audio duration, and correspond to the correct question sequence.
- Do not add the large MP3 under `src/` or `public/`. Existing past exams host it in a dedicated GitHub Release and store only the release URL in app data.
- Use the repository convention for release identifiers: tag `audio-choukai-cacnam-YYYY-MM-v1`, asset name `N3-YYYY-MM.mp3` (zero-pad the month), and a release title/body matching nearby years and the exam date. For other levels, inspect that level's existing convention.
- Treat publishing a GitHub Release as an external public action. This skill does not authorize future uploads: upload only when the current request explicitly authorizes publishing this exam's audio. Otherwise finish the local integration and state that Release hosting remains pending.
- Before upload, inspect whether the tag/release or asset already exists. Do not overwrite an existing release asset unless the user authorized an update. If authorized to create a release, copy the source MP3 to a temporary file named exactly `N3-YYYY-MM.mp3` before uploading. In `gh release upload`, `#choukai-full.mp3` sets the asset label; the temporary file's basename determines the download URL. Verify `assets[].name`, size, and SHA-256 with `gh release view` and `Get-FileHash`.
- Verify a public Release URL with a small HTTP GET range request (for example bytes 0–1023). GitHub may return 404 to `HEAD` even when the download URL works, so do not use `HEAD` as the sole check.
- If a temporary local audio copy or URL override is needed for a requested localhost preview, keep it in ignored build output only. Rebuild after Release hosting is ready so the preview uses the canonical Release URL. Never leave the MP3 in tracked app assets.

## Verify and deliver

- Parse/validate the edited JSON, confirm every referenced image exists, check all answer indices against the printed key, and verify the audio release asset name matches the URL in the data.
- When the user asks for a local build, use the project's existing `build:pages` and preview scripts and serve on `localhost`. Check the page, image URLs, and the audio URL. Keep a requested preview running and give the exact local URL.
- Run validation proportional to the change: at minimum parse edited JSON and run typecheck/build for shared UI changes; exercise representative taking and review flows when the UI is affected. Do not commit or push unless the user asks. Report which datasets/questions were actually checked, source/answer-key verification, Release status, build result, and remaining gaps plainly.

## Project paths

- Exam data: `src/data/dethi-n{level}-cac-nam.json`
- Question types/UI: `src/types/dethi.ts`, `src/web/screens/DeThiScreen.tsx`
- Listening illustrations: `public/images/listening/`
- Source sets commonly live under `assets/data/de-thi-cac-nam/`.
