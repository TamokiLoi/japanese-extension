import { useEffect, useMemo, useState } from "react";
import catalogRaw from "../../data/kanji-look-and-learn-catalog.json";
import { findVocabByWordReading } from "../../popup/vocabState.ts";
import type { Kanji } from "../../types/kanji.ts";
import "./kanji-book-resources.css";

type BookId = "b1" | "b2" | "b3";
type BookVocabulary = {
  index: number;
  word: string;
  reading: string;
  hanViet: string;
  meaning: string;
  needsReview: boolean;
};
type BookEntry = {
  id: string;
  kanji: string;
  book: BookId;
  entry: number;
  pdfPage: number;
  printedPage?: number | null;
  illustration?: { path: string; needsVisualReview?: boolean } | null;
  vocabulary: BookVocabulary[];
};
type BookCatalog = { entries: BookEntry[] };

const catalog = catalogRaw as BookCatalog;
const IMAGE_URLS = import.meta.glob("../../../assets/kanji-look-and-learn/**/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const BOOKS: { id: BookId; label: string; source: string; tone: string }[] = [
  { id: "b1", label: "N5–N4", source: "Bản gốc · sách N5–N4", tone: "b1" },
  { id: "b2", label: "N2–N1", source: "Sách N2–N1", tone: "b2" },
  { id: "b3", label: "N3–N2", source: "Sách N3–N2", tone: "b3" },
];

const JAPANESE_WORD = /^[\u3040-\u30ff\u3400-\u9fffー々〆ヶ・]+$/u;
const JAPANESE_READING = /^[\u3040-\u30ffー・々]+$/u;

function usableVocabulary(row: BookVocabulary): boolean {
  return !row.needsReview
    && JAPANESE_WORD.test(row.word.trim())
    && JAPANESE_READING.test(row.reading.trim())
    && !!row.hanViet.trim()
    && !!row.meaning.trim();
}

function imageUrl(entry: BookEntry): string | undefined {
  if (!entry.illustration?.path || entry.illustration.needsVisualReview) return undefined;
  return IMAGE_URLS[`../../../${entry.illustration.path}`];
}

export function KanjiBookResources({ kanji, onOpenVocab }: { kanji: Kanji; onOpenVocab: (id: string) => void }) {
  const entries = useMemo(
    () => catalog.entries.filter((entry) => entry.kanji === kanji.character),
    [kanji.character],
  );
  const availableBooks = BOOKS.filter((book) => entries.some((entry) => entry.book === book.id));
  const [selectedBook, setSelectedBook] = useState<BookId | null>(null);
  const activeBook = availableBooks.find((book) => book.id === selectedBook) ?? availableBooks[0];
  const activeEntry = activeBook ? entries.find((entry) => entry.book === activeBook.id) : undefined;
  const words = (activeEntry?.vocabulary ?? []).filter(usableVocabulary);
  const artwork = activeEntry ? imageUrl(activeEntry) : undefined;

  useEffect(() => {
    setSelectedBook(null);
  }, [kanji.character]);

  if (availableBooks.length === 0) return null;

  return (
    <section className="kanji-book-resources" aria-label={`Tài liệu Kanji Look and Learn cho ${kanji.character}`}>
      <div className="kanji-book-resources-heading">
        <div>
          <h3>Kanji Look and Learn</h3>
          <span>{availableBooks.length} nguồn sách</span>
        </div>
        {availableBooks.length > 1 ? (
          <div className="kanji-book-source-tabs" role="group" aria-label="Chọn sách Kanji Look and Learn">
            {availableBooks.map((book) => (
              <button
                key={book.id}
                type="button"
                aria-pressed={activeBook?.id === book.id}
                className={activeBook?.id === book.id ? "is-active" : ""}
                data-source={book.id}
                onClick={() => setSelectedBook(book.id)}
              >
                {book.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {activeEntry ? (
        <div className="kanji-book-entry" data-tone={activeBook?.tone}>
          {artwork ? (
            <figure className="kanji-book-illustration">
              <img src={artwork} alt={`Hình gợi nhớ chữ ${kanji.character} trong ${activeBook?.source}`} loading="lazy" decoding="async" />
              <figcaption>{activeBook?.source} · mục {activeEntry.entry} · trang {activeEntry.printedPage ?? activeEntry.pdfPage}</figcaption>
            </figure>
          ) : null}

          {words.length > 0 ? (
            <div className="kanji-book-words">
              <div className="kanji-book-words-heading"><strong>Từ trong sách</strong><span>{words.length}</span></div>
              <div className="kanji-book-words-list">
                {words.map((row) => {
                  const vocab = findVocabByWordReading(row.word.trim(), row.reading.trim());
                  const label = [row.reading.trim(), row.hanViet.trim(), row.meaning.trim()].filter(Boolean).join(" · ");
                  return (
                    <button
                      key={`${activeEntry.id}-${row.index}-${row.word}`}
                      type="button"
                      disabled={!vocab}
                      title={vocab ? "Mở thẻ từ vựng" : "Từ này chưa có thẻ trong ứng dụng"}
                      onClick={() => { if (vocab) onOpenVocab(vocab.id); }}
                    >
                      <strong>{row.word}</strong><span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
