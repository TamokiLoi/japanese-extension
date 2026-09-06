import raw from "../../data/roadmap-book-notes.json";
import type { BookNotesDataset, BookNote } from "../../types/bookNote.ts";

const dataset = raw as unknown as BookNotesDataset;
export const ALL_BOOK_NOTES: BookNote[] = dataset.notes;

export function findBookNote(type: string, key: string): BookNote | undefined {
  return ALL_BOOK_NOTES.find((n) => n.type === type && n.key === key);
}
