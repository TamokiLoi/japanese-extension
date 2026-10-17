export type KanjiMapMnemonicTip = {
  id: string;
  book: "b1" | "b2" | "b3";
  entry: number;
  pdfPage: number;
  printedPage?: number;
  sourceEdition?: "original" | "vietnamese-scan";
  kind: "paraphrase" | "excerpt" | "visual-note";
  transcription?: "ocr" | "visual-check";
  ocrConfidence?: number;
  text: string;
};

export const KANJI_MAP_MNEMONIC_SOURCES = {
  b1: {
    label: "KLL N5–N4 · tiếng Việt",
    title: "Kanji Look and Learn · N5–N4 · bản tiếng Việt",
    note: "Mẹo nhớ được ghép theo số mục từ bản scan tiếng Việt; mục OCR có thể sai ký tự và nên đối chiếu. Ảnh lấy từ sách gốc.",
  },
  b2: {
    label: "Bản N2–N1",
    title: "Kanji Look and Learn · N2–N1 · biên soạn Triệu Đức Duy",
    note: "Diễn giải từ bản tiếng Việt do Triệu Đức Duy biên soạn.",
  },
  b3: {
    label: "Bản N3–N2",
    title: "Kanji Look and Learn · N3–N2 · biên soạn Triệu Đức Duy",
    note: "Diễn giải từ bản tiếng Việt do Triệu Đức Duy biên soạn.",
  },
} as const;

// These are concise Vietnamese retellings of the supplied source pages, not
// OCR copies. Book 2's 脈 and 航 pages have illustrations but no written story;
// those entries are explicitly shown as visual-source notes.
export const KANJI_MAP_MNEMONICS: Record<string, KanjiMapMnemonicTip[]> = {
  士: [
    { id: "b1-270", book: "b1", entry: 270, pdfPage: 131, printedPage: 104, sourceEdition: "original", kind: "paraphrase", text: "Hình dung mười một samurai, những chiến binh gắn với chữ 士." },
  ],
  堂: [
    { id: "b1-309", book: "b1", entry: 309, pdfPage: 146, printedPage: 119, sourceEdition: "original", kind: "paraphrase", text: "Một hội trường 堂 lớn được dựng trên nền đất 土." },
    { id: "b3-88", book: "b3", entry: 88, pdfPage: 48, printedPage: 45, kind: "paraphrase", text: "Thực đường 堂 là nơi đặt chén để uống nước." },
  ],
  猟: [
    { id: "b2-171", book: "b2", entry: 171, pdfPage: 89, printedPage: 85, kind: "paraphrase", text: "Chó săn đứng cạnh bờ rào, chăm chú nhìn những chú chim." },
  ],
  繭: [
    { id: "b2-181", book: "b2", entry: 181, pdfPage: 94, printedPage: 90, kind: "paraphrase", text: "Lông mày rậm như một bãi cỏ, đủ chỗ cho con bướm và cuộn chỉ." },
  ],
  粉: [
    { id: "b2-202", book: "b2", entry: 202, pdfPage: 105, printedPage: 101, kind: "paraphrase", text: "Hình dung băm cây lúa thành bột 粉." },
  ],
  脈: [
    { id: "b2-208", book: "b2", entry: 208, pdfPage: 108, printedPage: 104, kind: "visual-note", text: "Trang này có hình minh họa mạch máu; sách không ghi câu gợi nhớ bằng chữ." },
  ],
  腸: [
    { id: "b2-210", book: "b2", entry: 210, pdfPage: 109, printedPage: 105, kind: "paraphrase", text: "Đứng dưới nắng quá lâu khiến bụng đau, gợi nhớ đến ruột 腸." },
  ],
  航: [
    { id: "b2-212", book: "b2", entry: 212, pdfPage: 110, printedPage: 106, kind: "visual-note", text: "Trang có hình minh họa hàng hải, nhưng không kèm câu gợi nhớ bằng chữ." },
  ],
  史: [
    { id: "b3-71", book: "b3", entry: 71, pdfPage: 40, printedPage: 37, kind: "paraphrase", text: "Lịch sử Việt Nam được gợi nhớ qua những cuộc đấu tranh kéo dài." },
  ],
  囲: [
    { id: "b3-79", book: "b3", entry: 79, pdfPage: 44, printedPage: 41, kind: "paraphrase", text: "Bốn bức tường bao vây, tạo thành một căn phòng 囲." },
  ],
  歴: [
    { id: "b3-328", book: "b3", entry: 328, pdfPage: 164, printedPage: 161, kind: "paraphrase", text: "Học sinh dừng trước ngôi nhà có hai cây, gợi đến lịch sử 歴." },
  ],
  殺: [
    { id: "b3-185", book: "b3", entry: 185, pdfPage: 96, printedPage: 93, kind: "paraphrase", text: "Sau vụ án, kẻ giết người đánh dấu X vào sổ." },
  ],
  貯: [
    { id: "b3-280", book: "b3", entry: 280, pdfPage: 141, printedPage: 138, kind: "paraphrase", text: "Mua bất động sản là một cách tích trữ tiền bạc 貯." },
  ],
  費: [
    { id: "b3-282", book: "b3", entry: 282, pdfPage: 142, printedPage: 139, kind: "paraphrase", text: "Hình dung chi phí đất đai được tính bằng đô la." },
  ],
  賞: [
    { id: "b3-284", book: "b3", entry: 284, pdfPage: 143, printedPage: 140, kind: "paraphrase", text: "Mỗi năm, giải thưởng 賞 được thêm một đồng so với năm trước." },
  ],
};
