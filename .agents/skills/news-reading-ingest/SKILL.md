---
name: news-reading-ingest
description: Import Japanese news text and public article links into private N3 reading drafts, enrich them, review source rights, and publish selected drafts.
metadata:
  short-description: Ingest and review Japanese news reading drafts
---

# News reading ingest

Use this workflow when preparing a new item for `src/data/reading-news.json`. Drafts and inbox material belong only in the ignored `_scratch/news-inbox/` and `_scratch/news-drafts/` directories.

1. Add an inbox `.json` object or array, `.md` with optional YAML frontmatter (`title`, `url`, `source`, `publishedAt`, `topic`, `collection`, `rightsVerified`), or `.txt` pasted text. Set `collection` to `news` for a curated source or `custom` for user supplied content and links. Example:

   ```json
   {"items":[{"title":"記事タイトル","url":"https://example.jp/article","source":"Publisher","topic":"社会","collection":"custom"}]}
   ```

   For pasted text, use `{"title":"...","text":"日本語本文...","collection":"custom"}`. Never put API keys in inbox files.
2. Run `node --experimental-strip-types scripts/news-sync.ts`. Add `--rss` to read the current official Gov-Online RSS page, `--enrich` to request Japanese segmentation, furigana, and Vietnamese translations from Gemini, and `--limit N` to bound imported items. Sync writes private draft files only. It never publishes.
3. Inspect every Japanese segment against its source, verify furigana, sentence-by-sentence Vietnamese alignment, article title/date/source/link, and N3 suitability. Confirm public facts are still current.
4. Review the page-specific reuse terms and third-party material. Gov-Online items are full-text candidates under the site's stated PDL 1.0 default; retain its source attribution and disclose edits using the generated `sourceNotice`. Verify the page has no excluded or third-party material before setting `rights.rightsVerified` and all review fields. NHK Easy and Nippon.com URLs remain link-only unless rights are explicitly verified and recorded. For other publisher URLs, keep link-only unless the supplied text is authorized or reuse rights are verified. A public URL alone is not permission to republish.
5. Edit the draft's `review` fields only after checks are complete: `approved`, `legalReviewed`, and `qaReviewed` must all be `true`; set `reviewer` and ISO `reviewedAt`. Then publish explicitly with `node --experimental-strip-types scripts/news-publish.ts --ids <draft-id>[,<draft-id>...]`. The publisher validates the selected drafts, rejects duplicates, and appends only those passages. Run `npm run build:pages` and deploy through the repository's normal release flow for the bundled app to receive the new entries.

Link-only resources may be published with an empty body so learners can open the original page; do not copy its article text, translation, or quiz into a link-only record. They still require source/URL review and the explicit publication review fields. Full text requires confirmed reuse rights or confirmed original/public-domain status, regardless of whether it arrived by URL or pasted text; set `rights.rightsVerified` only after that check.

Gemini keys follow the local convention: `_scratch/.env.gemini` (`GEMINI_API_KEY` and optional suffixed aliases) or environment variables with those names. Never copy, print, log, or commit key values. Enrichment is opt-in with `--enrich`; without it, drafts contain source text but require enrichment and QA before they can pass publication validation. Do not add keys to `.env.example` or tracked files.

Suggested package scripts (not added to `package.json`):

```json
"news:sync": "node --experimental-strip-types scripts/news-sync.ts",
"news:sync:enrich": "node --experimental-strip-types scripts/news-sync.ts --enrich",
"news:sync:rss": "node --experimental-strip-types scripts/news-sync.ts --rss --enrich",
"news:publish": "node --experimental-strip-types scripts/news-publish.ts"
```

Official source references: [Government Online RSS](https://www.gov-online.go.jp/rss/), [Government Online terms](https://www.gov-online.go.jp/tos/), [Nippon.com RSS list](https://www.nippon.com/ja/rss_list/), and [Nippon.com copyright policy](https://www.nippon.com/ja/copyright/). Recheck the current terms for each item; these links do not imply permission to republish a specific article.
