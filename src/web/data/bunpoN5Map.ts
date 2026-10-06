export interface BunpoMapItem {
  id: string;
  label: string;
  hint: string;
  grammarId?: string;
}

export interface BunpoMapGroup {
  id: string;
  label: string;
  shortLabel?: string;
  color: string;
  items: BunpoMapItem[];
}

// This is a hand-curated learning map, not a classification derived from
// grammar-card level/source metadata. Links are only set when the existing
// card covers the same grammar point; unlinked map topics stay visible.
export const BUNPO_N5_MAP_GROUPS: BunpoMapGroup[] = [
  {
    id: "noun",
    label: "Danh từ",
    color: "#e6a51b",
    items: [
      { id: "noun-basics", label: "Danh từ căn bản", hint: "Cách dùng danh từ trong câu" },
      { id: "noun-counters", label: "Đếm người và đồ vật", hint: "Số đếm và lượng từ" },
      { id: "noun-dates", label: "Thứ, ngày và tháng", hint: "Cách nói thời gian theo lịch" },
      { id: "noun-modifier", label: "Động từ bổ nghĩa danh từ", hint: "Nối mệnh đề ngắn với danh từ" },
    ],
  },
  {
    id: "adjective",
    label: "Tính từ",
    color: "#e84c91",
    items: [
      { id: "adjective-basics", label: "Tính từ căn bản", hint: "Tính từ い và な" },
      { id: "adjective-want", label: "〜たいです", hint: "Diễn tả mong muốn làm gì" },
      { id: "adjective-become", label: "Tính từ + なる", hint: "Diễn tả sự thay đổi" },
      { id: "adjective-desire", label: "〜がほしいです", hint: "Muốn có một vật" },
      { id: "adjective-like", label: "〜が好きです", hint: "Nói điều mình yêu thích" },
      { id: "adjective-modifier", label: "Tính từ bổ nghĩa danh từ / động từ", hint: "Kết hợp tính từ với thành phần khác" },
      { id: "adjective-skill", label: "〜が上手・下手です", hint: "Nói ai giỏi hoặc chưa giỏi việc gì" },
    ],
  },
  {
    id: "verb",
    label: "Động từ",
    color: "#2596d2",
    items: [
      { id: "verb-dictionary", label: "辞書形・Vる", hint: "Thể từ điển của động từ", grammarId: "bunpo-thedongtu-3" },
      { id: "verb-nai", label: "ない形・Vない", hint: "Thể phủ định thông thường", grammarId: "bunpo-thedongtu-5" },
      { id: "verb-masu", label: "ます形", hint: "Thể lịch sự", grammarId: "bunpo-thedongtu-1" },
      { id: "verb-ta", label: "た形", hint: "Thể quá khứ thông thường", grammarId: "bunpo-thedongtu-4" },
      { id: "verb-te", label: "て形", hint: "Thể て của động từ", grammarId: "bunpo-thedongtu-2" },
      { id: "verb-invitation", label: "〜ませんか・〜ましょう", hint: "Rủ hoặc đề nghị cùng làm" },
      { id: "verb-experience", label: "〜たことがある", hint: "Nói về trải nghiệm đã từng có" },
      { id: "verb-existence", label: "あります・います", hint: "Sự tồn tại của vật và người" },
      { id: "verb-listing", label: "〜たり…たりする", hint: "Nêu vài hoạt động làm ví dụ" },
      { id: "verb-sequence", label: "Vて、V2 ／ Vないで、V2", hint: "Nối hành động với điều kiện đi kèm", grammarId: "bunpo-400-34" },
      { id: "verb-request", label: "〜ないでください", hint: "Yêu cầu ai đó đừng làm gì" },
      { id: "verb-giving", label: "あげる・もらう・くれる", hint: "Cho, nhận và làm giúp" },
      { id: "verb-obligation", label: "〜なければならない", hint: "Diễn tả việc phải làm" },
      { id: "verb-no-need", label: "〜なくてもいい", hint: "Diễn tả việc không cần làm" },
    ],
  },
  {
    id: "particle",
    label: "Trợ từ",
    color: "#8b5ac7",
    items: [
      { id: "particle-basics", label: "Trợ từ căn bản", hint: "は・が・を・に・で và cách dùng" },
      { id: "particle-ni-de", label: "Phân biệt に và で", hint: "Điểm đến, thời điểm và nơi diễn ra hành động" },
      { id: "particle-ga-kedo", label: "が・けど", hint: "Nối hai vế có quan hệ tương phản" },
    ],
  },
  {
    id: "other",
    label: "Mẫu câu khác",
    color: "#45a35b",
    items: [
      { id: "other-comparison", label: "〜より〜のほうが", hint: "So sánh hai sự vật" },
      { id: "other-demonstrative", label: "こ・そ・あ・ど", hint: "Từ chỉ định người, vật và nơi chốn" },
      { id: "other-before", label: "〜まえ", hint: "Nói một việc xảy ra trước sự kiện khác" },
      { id: "other-after", label: "〜あとで", hint: "Nói một việc xảy ra sau sự kiện khác", grammarId: "bunpo-400-33" },
      { id: "other-most", label: "〜のなかで〜がいちばん", hint: "Nêu điều nổi bật nhất trong một nhóm" },
      { id: "other-only", label: "〜だけ・しかし", hint: "Giới hạn và nối ý tương phản" },
      { id: "other-cause-node", label: "〜ので", hint: "Nêu lý do một cách mềm hơn", grammarId: "bunpo-400-54" },
      { id: "other-probability", label: "〜でしょう", hint: "Phỏng đoán hoặc xác nhận nhẹ", grammarId: "bunpo-400-20" },
      { id: "other-negative", label: "Trạng từ với câu phủ định", hint: "Nhấn mạnh mức độ phủ định" },
      { id: "other-question", label: "Từ để hỏi + 〜たらいいですか", hint: "Hỏi xin lời khuyên", grammarId: "bunpo-400-4" },
    ],
  },
];
