// Short Gemini-researched blurb per curriculum "stop" (a real published JLPT
// book, or -- honestly labeled as such by the generation prompt -- one of
// this app's own compiled/merged sets) shown in the Roadmap's "Ghi chú tài
// liệu" menu. See _scratch/gemini_book_notes.py for how this was built.
export interface BookNote {
  type: "vocab" | "bunpo" | "reading" | "listening";
  key: string;
  label: string;
  description: string;
  difficulty: "Dễ" | "Trung bình" | "Khó" | string;
  audienceNote: string;
}

export interface BookNotesDataset {
  notes: BookNote[];
}
