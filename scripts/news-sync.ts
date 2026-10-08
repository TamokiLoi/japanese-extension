// Build private reading-news drafts from local inbox items and public URLs.
// No code in this file writes to src/data/reading-news.json.
// Usage: node --experimental-strip-types scripts/news-sync.ts [--rss] [--enrich] [--limit N]

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, renameSync } from "node:fs";
import { basename, join } from "node:path";
import type { ReadingDataset, ReadingPassage } from "../src/types/reading.ts";

const ROOT = join(import.meta.dirname, "..");
const INBOX = join(ROOT, "_scratch/news-inbox");
const DRAFTS = join(ROOT, "_scratch/news-drafts");
const GOV_RSS_PAGE = "https://www.gov-online.go.jp/rss/";
const GEMINI_MODEL = "gemini-3.1-flash-lite";
const MAX_ARTICLE_CHARS = 14_000;
const MAX_DOWNLOAD_BYTES = 3_000_000;
const USER_AGENT = "NihongoNinReadingNews/1.0 (manual private reading draft; contact: local user)";
const KANA_ONLY = /^[\u3041-\u3096\u30a1-\u30faー]+$/u;
const HAS_KANJI = /[\u3400-\u9fff々〆ヶ]/u;

type Collection = "news" | "custom";
interface InputItem {
  title?: string;
  url?: string;
  text?: string;
  body?: string;
  source?: string;
  sourceUrl?: string;
  publishedAt?: string;
  topic?: string;
  collection?: Collection;
  book?: Collection;
  rightsVerified?: boolean;
  sourcePolicy?: string;
}
interface Draft {
  collection: Collection;
  passage: ReadingPassage;
  rights: { status: string; rightsVerified: boolean; note: string };
  review: { approved: boolean; legalReviewed: boolean; qaReviewed: boolean; reviewer?: string; reviewedAt?: string };
}
interface Args { rss: boolean; enrich: boolean; limit: number; help: boolean; }

function parseArgs(): Args {
  const values = process.argv.slice(2);
  const limitIndex = values.indexOf("--limit");
  const limit = limitIndex < 0 ? 12 : Number(values[limitIndex + 1]);
  if (limitIndex >= 0 && (!Number.isInteger(limit) || limit < 1 || limit > 100)) throw new Error("--limit must be an integer from 1 to 100");
  const unknown = values.filter((value, index) => !["--rss", "--enrich", "--limit", "--help"].includes(value) && !(limitIndex >= 0 && index === limitIndex + 1));
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(", ")}`);
  return { rss: values.includes("--rss"), enrich: values.includes("--enrich"), limit, help: values.includes("--help") };
}

function decodeEntities(value: string): string {
  return value.replace(/&#x([\da-f]+);/giu, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&nbsp;/giu, " ").replace(/&amp;/giu, "&").replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">").replace(/&quot;/giu, '"').replace(/&apos;/giu, "'");
}

function plainText(html: string): string {
  return decodeEntities(html.replace(/<!--[\s\S]*?-->/gu, " ")
    .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, " ")
    .replace(/<\/(?:p|section|article|h[1-6]|li|tr)\s*>/giu, "\n\n")
    .replace(/<br\s*\/?>|<\/div\s*>/giu, "\n")
    .replace(/<[^>]*>/gu, " ").replace(/[\t\u00a0 ]+/gu, " ")
    .replace(/[ \t]*\n[ \t]*/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim());
}

function tagText(html: string, tag: string): string | undefined {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, "iu"));
  return match ? plainText(match[1]) : undefined;
}

function attr(html: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = html.match(new RegExp(`\\b${escaped}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "iu"));
  return match ? decodeEntities(match[2]) : undefined;
}

function frontmatter(text: string): { fields: Record<string, string>; body: string } {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n?([\s\S]*)$/u);
  if (!match) return { fields: {}, body: text.trim() };
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/u)) {
    const entry = line.match(/^([\w-]+):\s*(.*?)\s*$/u);
    if (entry) fields[entry[1]] = entry[2].replace(/^(["'])(.*)\1$/u, "$2");
  }
  return { fields, body: match[2].trim() };
}

function readInboxFiles(): InputItem[] {
  mkdirSync(INBOX, { recursive: true });
  return readdirSync(INBOX, { withFileTypes: true }).filter((item) => item.isFile() && /\.(?:json|md|txt)$/iu.test(item.name))
    .flatMap((file) => {
      const path = join(INBOX, file.name);
      const text = readFileSync(path, "utf8");
      try {
        const parsed: unknown = JSON.parse(text);
        const rows = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && "items" in parsed && Array.isArray(parsed.items) ? parsed.items : [parsed]);
        return rows.map((row) => ({ ...row as InputItem, source: (row as InputItem).source ?? basename(file.name, ".json") }));
      } catch (error) {
        if (/\.json$/iu.test(file.name)) throw new Error(`${file.name}: invalid JSON (${(error as Error).message})`);
        if (/\.md$/iu.test(file.name)) {
          const parsed = frontmatter(text);
          return [{ title: parsed.fields.title, url: parsed.fields.url, text: parsed.body, source: parsed.fields.source ?? basename(file.name, ".md"),
            publishedAt: parsed.fields.publishedAt ?? parsed.fields.published, topic: parsed.fields.topic,
            collection: parsed.fields.collection as Collection | undefined, rightsVerified: parsed.fields.rightsVerified === "true" }];
        }
        return [{ title: basename(file.name, ".txt"), text: text.trim(), source: basename(file.name, ".txt"), collection: "custom" }];
      }
    });
}

function xmlValue(xml: string, name: string): string | undefined {
  const tag = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = xml.match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}\\s*>`, "iu"));
  return match ? decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, "$1").replace(/<[^>]*>/gu, "").trim()) : undefined;
}

async function fetchText(url: string, maxBytes = MAX_DOWNLOAD_BYTES, redirects = 0): Promise<string> {
  if (redirects > 5) throw new Error(`Too many redirects fetching ${url}`);
  assertPublicUrl(new URL(url));
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "text/html,application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.2" }, signal: AbortSignal.timeout(25_000), redirect: "manual" });
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error(`Redirect without a Location header: ${url}`);
    const next = new URL(location, url);
    assertPublicUrl(next);
    return fetchText(next.href, maxBytes, redirects + 1);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${url}`);
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > maxBytes) throw new Error(`Response too large (${length} bytes): ${url}`);
  if (!response.body) throw new Error(`Response body is empty: ${url}`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel(); throw new Error(`Response exceeds ${maxBytes} bytes: ${url}`); }
    chunks.push(value);
  }
  const buffer = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
  return buffer.toString("utf8");
}

function assertPublicUrl(url: URL): void {
  if (!/^https?:$/u.test(url.protocol) || url.username || url.password) throw new Error(`Only public HTTP(S) URLs without credentials are allowed: ${url.href}`);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/gu, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("::ffff:") ||
      /^127\.|^10\.|^192\.168\.|^169\.254\.|^172\.(?:1[6-9]|2\d|3[01])\./u.test(host)) {
    throw new Error(`Local/private network URLs are not allowed: ${url.href}`);
  }
}

function isHost(host: string, suffix: string): boolean { return host === suffix || host.endsWith(`.${suffix}`); }
function restrictedLinkOnly(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return isHost(host, "nhk.or.jp") || isHost(host, "nippon.com");
}
function isGovOnline(url: URL): boolean { return isHost(url.hostname.toLowerCase(), "gov-online.go.jp"); }

function extractArticle(html: string, url: URL): { title: string; text: string; publishedAt?: string } {
  const title = attr(html.match(/<meta\b[^>]*(?:property|name)=["'](?:og:title|twitter:title)["'][^>]*>/iu)?.[0] ?? "", "content") ?? tagText(html, "title") ?? url.pathname;
  const dateTag = html.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|datePublished|pubdate)["'][^>]*>/iu)?.[0];
  const publishedAt = dateTag ? attr(dateTag, "content") : undefined;
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article\s*>/iu)?.[1]
    ?? html.match(/<main\b[^>]*>([\s\S]*?)<\/main\s*>/iu)?.[1]
    ?? html.match(/<body\b[^>]*>([\s\S]*?)<\/body\s*>/iu)?.[1] ?? html;
  return { title, text: plainText(article).slice(0, MAX_ARTICLE_CHARS), publishedAt };
}

async function loadGovRss(limit: number): Promise<InputItem[]> {
  const landing = await fetchText(GOV_RSS_PAGE);
  let feedUrls = [...landing.matchAll(/<(?:a|link)\b[^>]*>/giu)].map((match) => {
    const tag = match[0];
    const href = attr(tag, "href");
    const rel = attr(tag, "rel") ?? "";
    const type = attr(tag, "type") ?? "";
    return href && (/rss|feed|\.xml(?:$|[?#])|\.rdf(?:$|[?#])/iu.test(href) || /alternate/iu.test(rel) && /rss|xml/iu.test(type))
      ? new URL(href, GOV_RSS_PAGE).href : undefined;
  }).filter((url): url is string => Boolean(url));
  feedUrls = [...new Set(feedUrls)].filter((href) => isGovOnline(new URL(href)));
  if (!feedUrls.length) throw new Error(`No Gov-Online RSS feed links found on ${GOV_RSS_PAGE}. Check the official RSS page before configuring a feed URL.`);
  const rows: InputItem[] = [];
  for (const feedUrl of feedUrls) {
    const xml = await fetchText(feedUrl);
    const items = [...xml.matchAll(/<(?:item|entry)\b[^>]*>[\s\S]*?<\/(?:item|entry)\s*>/giu)].map((match) => match[0]);
    for (const item of items) {
      const title = xmlValue(item, "title");
      const link = xmlValue(item, "link") ?? item.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?\s*>/iu)?.[1];
      if (!title || !link) continue;
      const url = new URL(decodeEntities(link), feedUrl);
      if (!isGovOnline(url)) continue;
      rows.push({ title, url: url.href, source: "政府広報オンライン", publishedAt: xmlValue(item, "pubDate") ?? xmlValue(item, "published") ?? xmlValue(item, "updated"), collection: "news", sourcePolicy: "PDL 1.0 candidate; inspect page-specific and third-party rights before publication" });
      if (rows.length >= limit) return rows;
    }
  }
  return rows;
}

function articleId(item: InputItem, text: string, url?: string): string {
  const seed = url ? new URL(url).href : `${item.title ?? ""}\n${text}`;
  const host = url ? new URL(url).hostname.split(".").slice(-2, -1)[0] : "custom";
  const slug = (item.title ?? "reading").normalize("NFKD").replace(/[^a-z\d]+/giu, "-").replace(/^-|-$/gu, "").slice(0, 42) || "article";
  return `news-${host}-${slug}-${createHash("sha256").update(seed).digest("hex").slice(0, 8)}`.toLowerCase();
}

function splitSentenceTexts(text: string): string[] {
  const chunks: string[] = [];
  for (const paragraph of text.split(/\n{2,}/u)) {
    let current = "";
    for (const ch of paragraph) {
      current += ch;
      if (/[。！？]/u.test(ch)) { chunks.push(current); current = ""; }
    }
    if (current.trim()) chunks.push(current);
  }
  return chunks;
}

function splitRenderedSentenceTexts(body: { text: string; furigana: string | null; paragraphStart?: boolean }[]): string[] {
  const groups: string[] = [];
  let current = "";
  for (const segment of body) {
    if ((segment.paragraphStart || segment.text.startsWith("\n")) && current) { groups.push(current); current = ""; }
    let text = segment.text.replace(/^\n+/u, "");
    while (text) {
      const end = text.search(/[。！？]/u);
      if (end < 0) { current += text; break; }
      let boundary = end + 1;
      while (boundary < text.length && /[」』）)]/u.test(text[boundary])) boundary++;
      current += text.slice(0, boundary);
      groups.push(current);
      current = "";
      text = text.slice(boundary);
    }
  }
  if (current.trim()) groups.push(current);
  return groups;
}

function baseDraft(item: InputItem, url: string | undefined, fetchedTitle?: string, fetchedText?: string, fetchedDate?: string): Draft {
  const articleText = (item.text ?? item.body ?? fetchedText ?? "").trim().slice(0, MAX_ARTICLE_CHARS);
  const sourceUrl = url ?? item.sourceUrl;
  const domain = sourceUrl ? new URL(sourceUrl).hostname.toLowerCase() : "";
  const mustLinkOnly = Boolean(sourceUrl && !isGovOnline(new URL(sourceUrl)) && !item.rightsVerified);
  const useText = Boolean(articleText) && !mustLinkOnly;
  const collection: Collection = item.collection ?? item.book ?? (isGovOnline(new URL(sourceUrl ?? "https://custom.invalid")) ? "news" : "custom");
  if (collection !== "news" && collection !== "custom") throw new Error(`Invalid collection/book value: ${collection}`);
  const title = item.title ?? fetchedTitle ?? "Japanese reading";
  const source = item.source ?? (isGovOnline(new URL(sourceUrl ?? "https://custom.invalid")) ? "政府広報オンライン" : domain || "User supplied");
  const body = useText
    ? articleText.split(/\n{2,}/u).map((paragraph, index) => ({
        text: `${index > 0 ? "\n\n" : ""}${paragraph}`,
        furigana: null,
        ...(index > 0 ? { paragraphStart: true } : {}),
      }))
    : [];
  const passage: ReadingPassage = {
    id: articleId(item, articleText, sourceUrl), level: "N3", length: articleText.length > 1_100 ? "long" : "medium", book: collection,
    topic: item.topic ?? "News", estimatedMinutes: Math.max(1, Math.ceil((articleText.length || 600) / 400)), title, source,
    ...(sourceUrl ? { sourceUrl } : {}), ...(item.publishedAt ?? fetchedDate ? { publishedAt: item.publishedAt ?? fetchedDate } : {}),
    ...(mustLinkOnly ? { linkOnly: true } : {}),
    ...(mustLinkOnly ? { sourceNotice: "Chỉ lưu tiêu đề và đường dẫn; mở trang nguồn để đọc vì quyền tái sử dụng nội dung chưa được xác nhận." } : {}),
    ...(!mustLinkOnly && isGovOnline(new URL(sourceUrl ?? "https://custom.invalid")) ? { sourceNotice: `政府広報オンライン「${title}」を加工して作成。日本語学習用に編集し、ベトナム語訳とふりがなを付加しました。` } : {}),
    body, translationVi: "", sentencesVi: [], questions: [],
  };
  const rightsStatus = !sourceUrl ? "user-supplied text" : restrictedLinkOnly(new URL(sourceUrl)) && !item.rightsVerified ? "link-only; rights not verified" :
    isGovOnline(new URL(sourceUrl)) ? "full-text candidate; page-specific and third-party rights review required" :
      item.rightsVerified ? "user marked rights verified; confirm scope and attribution" : "link-only; rights not verified";
  return { collection, passage, rights: { status: rightsStatus, rightsVerified: item.rightsVerified === true, note: item.sourcePolicy ?? "Confirm source terms, third-party material, required attribution, and modification notice before approval." },
    review: { approved: false, legalReviewed: false, qaReviewed: false } };
}

function readGeminiKeys(): string[] {
  const keys = new Set<string>();
  for (const [name, value] of Object.entries(process.env)) if (/^GEMINI_API_KEY(?:_[A-Z0-9_]+)?$/u.test(name) && value?.trim()) keys.add(value.trim());
  const path = join(ROOT, "_scratch/.env.gemini");
  if (existsSync(path)) for (const line of readFileSync(path, "utf8").split(/\r?\n/u)) {
    const match = line.trim().match(/^GEMINI_API_KEY(?:_[A-Z0-9_]+)?=(.*)$/u);
    if (!match) continue;
    const value = match[1].trim().replace(/^("([\s\S]*)"|'([\s\S]*)')$/u, (_, _whole, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted);
    if (value) keys.add(value);
  }
  return [...keys];
}

async function enrich(draft: Draft, keys: string[]): Promise<void> {
  if (!draft.passage.body.length) return;
  const sourceText = draft.passage.body.map((segment) => segment.text).join("");
  const requestedSentences = splitSentenceTexts(sourceText);
  const prompt = `Create Japanese N3 study enrichment for this article. Return only JSON with keys body (array of {text,furigana,paragraphStart?}), sentencesVi (one accurate Vietnamese translation per sentence), and translationVi (natural full passage translation). In body, segment the original Japanese text and preserve every character in order; concatenating body[].text must exactly equal the input. Preserve paragraph boundaries: set paragraphStart:true on the first segment of each paragraph (and on the first segment if the source starts a new paragraph). Put furigana in kana for kanji-bearing segments and null for segments with no kanji. Do not omit, rewrite, or invent Japanese. sentencesVi must have exactly ${requestedSentences.length} entries, corresponding in order to these sentences: ${JSON.stringify(requestedSentences)}. Avoid unsupported factual additions.\n\n${sourceText}`;
  let lastError: Error | undefined;
  for (const key of keys) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } }),
      });
      if (!response.ok) { lastError = new Error(`Gemini request returned HTTP ${response.status}`); continue; }
      const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] }[] } };
      const raw = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
      const result = JSON.parse(raw) as { body: { text: string; furigana: string | null; paragraphStart?: boolean }[]; sentencesVi: string[]; translationVi: string };
      if (!Array.isArray(result.body) || result.body.map((segment) => segment.text).join("") !== sourceText) throw new Error("Gemini changed or omitted Japanese source text");
      if (result.body.some((segment) => typeof segment.text !== "string" || !segment.text || !(segment.furigana === null ? !HAS_KANJI.test(segment.text) : typeof segment.furigana === "string" && KANA_ONLY.test(segment.furigana)))) throw new Error("Gemini returned invalid furigana segments or left kanji unannotated");
      const renderedSentences = splitRenderedSentenceTexts(result.body);
      if (!Array.isArray(result.sentencesVi) || result.sentencesVi.length !== renderedSentences.length || result.sentencesVi.some((line) => typeof line !== "string" || !line.trim())) throw new Error("Vietnamese sentence count/content does not match the rendered Japanese sentence groups");
      if (typeof result.translationVi !== "string" || !result.translationVi.trim()) throw new Error("Gemini omitted translationVi");
      draft.passage.body = result.body;
      draft.passage.sentencesVi = result.sentencesVi;
      draft.passage.translationVi = result.translationVi;
      return;
    } catch (error) { lastError = error as Error; }
  }
  throw lastError ?? new Error("No usable Gemini API key is configured");
}

function writeAtomic(path: string, value: unknown): void {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  renameSync(temp, path);
}

async function makeDraft(item: InputItem): Promise<Draft> {
  let url = item.url ?? item.sourceUrl;
  let fetchedTitle: string | undefined;
  let fetchedText: string | undefined;
  let fetchedDate: string | undefined;
  if (url) {
    const parsedUrl = new URL(url);
    assertPublicUrl(parsedUrl);
    url = parsedUrl.href;
    const canFetch = Boolean(item.rightsVerified) || isGovOnline(parsedUrl);
    if (canFetch && !(restrictedLinkOnly(parsedUrl) && !item.rightsVerified)) {
      const article = extractArticle(await fetchText(url), parsedUrl);
      fetchedTitle = article.title;
      fetchedText = article.text;
      fetchedDate = article.publishedAt;
    }
  }
  return baseDraft(item, url, fetchedTitle, fetchedText, fetchedDate);
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help) {
    console.log("Usage: node --experimental-strip-types scripts/news-sync.ts [--rss] [--enrich] [--limit N]");
    console.log("Imports _scratch/news-inbox items into private _scratch/news-drafts. It never publishes.");
    return;
  }
  mkdirSync(DRAFTS, { recursive: true });
  const items = readInboxFiles();
  if (args.rss) items.push(...await loadGovRss(args.limit));
  const keys = args.enrich ? readGeminiKeys() : [];
  if (args.enrich && !keys.length) throw new Error("--enrich requested but no Gemini API key was found in _scratch/.env.gemini or GEMINI_API_KEY environment variables.");
  let created = 0;
  for (const item of items.slice(0, args.limit)) {
    try {
      const draft = await makeDraft(item);
      const path = join(DRAFTS, `${draft.passage.id}.json`);
      if (existsSync(path)) { console.log(`skip existing draft ${draft.passage.id}`); continue; }
      if (args.enrich) await enrich(draft, keys);
      writeAtomic(path, draft);
      created++;
      console.log(`drafted ${draft.passage.id} (${draft.collection}; ${draft.passage.body.length ? "article text" : "link only"})`);
    } catch (error) { console.error(`item skipped: ${(error as Error).message}`); }
  }
  console.log(`Created ${created} private draft(s) in _scratch/news-drafts. Review and publish separately.`);
}

try { await main(); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
