import type { JlptLevel } from "./kanji.ts";

// "jlpt-da-ra": ngữ pháp đã ra trong đề thi JLPT (bảng phẳng, không chương).
// "theo-chuong": lộ trình ngữ pháp N3 nội bộ của app (15 chương), có
// usage/examTip; đây không phải mục lục của một cuốn sách cụ thể.
// "shinkanzen"/"try-n3"/"400-mau-thong-dung": trích từ phần giải thích ngữ pháp
// (không phải câu hỏi) của 3 nguồn bổ sung -- xem bunpoState.ts.
// "kaiwa": 32/60 mẫu ngữ pháp hội thoại thường ngày không trùng với 7 nguồn
// còn lại (28/60 mẫu trùng đã bỏ qua, xem _scratch/kaiwa_ngupap_matching.json).
export type BunpoSource =
  | "jlpt-da-ra"
  | "theo-chuong"
  | "shinkanzen"
  | "try-n3"
  | "400-mau-thong-dung"
  | "n4-infographic"
  | "the-dong-tu"
  | "kinh-ngu"
  | "kaiwa";

export interface BunpoGrammarPoint {
  id: string;
  level: JlptLevel;
  // Một mẫu ngữ pháp có thể được xác nhận trùng ở nhiều nguồn (vd vừa có
  // trong "theo-chuong" vừa có trong "shinkanzen") -- khi đó chỉ giữ 1 thẻ
  // duy nhất, gộp nội dung chi tiết nhất, và liệt kê đủ các nguồn ở đây
  // thay vì tạo thẻ trùng lặp cho mỗi nguồn.
  sources: BunpoSource[];
  chapter?: number; // chỉ có ở nguồn "theo-chuong"
  chapterTitle?: string; // vd "Biểu hiện mục đích / thay đổi"
  pattern: string; // vd "〜ようになる"
  meaningVi: string; // Nghĩa / Ý nghĩa
  usage?: string; // Cách dùng, vd "V辞書形" (chỉ "theo-chuong")
  formula?: string; // Công thức, vd "お/ご + Vます + します" (chỉ "n4-infographic")
  examTip?: string; // Key JLPT (chỉ "theo-chuong")
  example: string; // Ví dụ (JP)
  exampleVi: string; // Nghĩa tiếng Việt của ví dụ
  // Ví dụ bổ sung ngoài `example` chính -- thêm sau vì 1 ví dụ là hơi ít để
  // thấy hết cách dùng. Additive (không đổi `example`/`exampleVi` hiện có)
  // để không phải sửa các chỗ đang đọc 2 field đó.
  moreExamples?: { jp: string; vi: string }[];
  // Các mẫu ngữ pháp cùng cấp độ mà người học hay nhầm với mẫu này, kèm cách
  // phân biệt -- sinh bởi Gemini, chỉ trỏ tới `pattern` có thật trong bộ dữ
  // liệu (không bịa mẫu không tồn tại). Rỗng/không có nếu mẫu này không có
  // đối chiếu nào thật sự đáng chú ý.
  compareWith?: { pattern: string; note: string }[];
}

export interface BunpoDataset {
  grammarPoints: BunpoGrammarPoint[];
}

// Book-level chapter metadata is kept separate from BunpoGrammarPoint.chapter.
// `chapter` belongs to the app's 15-chapter thematic curriculum; these entries
// describe the 11 units in the TRY! N3 book.
export interface TryN3Chapter {
  chapter: number;
  titleJa: string;
  titleVi: string;
  quizCount: number;
  /** Grammar cards that have been manually linked to this book unit. */
  grammarIds?: string[];
}
