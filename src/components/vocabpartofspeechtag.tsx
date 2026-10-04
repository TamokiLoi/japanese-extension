import type { CSSProperties } from "react";

interface VocabPartOfSpeechTagProps {
  word?: string;
  partOfSpeech?: string;
  verbGroup?: string | null;
  transitivity?: string | null;
}

interface PosTag {
  label: string;
  background: string;
}

const POS_TAGS: Record<string, PosTag> = {
  "Danh từ": { label: "名詞 (Danh từ)", background: "#3299df" },
  "Động từ": { label: "動詞 (Động từ)", background: "#29975b" },
  "Tính từ": { label: "形容詞 (Tính từ)", background: "#ff704b" },
  "Tính từ đuôi い": { label: "形容詞 (Tính từ I)", background: "#ff704b" },
  "Tính từ đuôi な": { label: "形容動詞 (Tính từ Na)", background: "#f1843b" },
  "Trạng từ": { label: "副詞 (Trạng từ)", background: "#8057c7" },
  "Trợ từ": { label: "助詞 (Trợ từ)", background: "#68758a" },
  "Liên từ": { label: "接続詞 (Liên từ)", background: "#16877d" },
  "Đại từ": { label: "代名詞 (Đại từ)", background: "#5368bf" },
  "Thán từ": { label: "感動詞 (Thán từ)", background: "#c34b88" },
  "Tiếp đầu ngữ": { label: "接頭辞 (Tiếp đầu ngữ)", background: "#c76a32" },
  "Hậu tố": { label: "接尾辞 (Hậu tố)", background: "#9c4ca8" },
  "Cụm từ": { label: "表現 (Cụm từ)", background: "#81768b" },
};

const verbGroupTag = (group?: string | null, word?: string): PosTag | null => {
  if (!group) return null;
  if (/Nhóm\s*1|Godan|五段/iu.test(group)) return { label: "五段動詞 (V1 - Godan)", background: "#16833c" };
  if (/Nhóm\s*2|Ichidan|一段/iu.test(group)) return { label: "一段動詞 (V2 - Ichidan)", background: "#169c82" };
  if (/Suru|サ変/iu.test(group) || (/Nhóm\s*3|irregular|bất quy tắc/iu.test(group) && word?.endsWith("する"))) {
    return { label: "サ変動詞 (V3 - Suru)", background: "#8057c7" };
  }
  if (/Kuru|カ変/iu.test(group) || (/Nhóm\s*3|irregular|bất quy tắc/iu.test(group) && /^(来る|くる)$/u.test(word ?? ""))) {
    return { label: "カ変動詞 (V3 - Kuru)", background: "#8057c7" };
  }
  if (/Nhóm\s*3|bất quy tắc|irregular|変格/iu.test(group)) return { label: "不規則動詞 (V3 - Bất quy tắc)", background: "#8057c7" };
  return { label: group, background: "#29975b" };
};

const transitivityTag = (transitivity?: string | null): PosTag | null => {
  if (!transitivity) return null;
  if (/Tự động từ|自動詞/iu.test(transitivity)) return { label: "自動詞 (Tự động từ)", background: "#3d4fbd" };
  if (/Tha động từ|他動詞/iu.test(transitivity)) return { label: "他動詞 (Tha động từ)", background: "#3d4fbd" };
  if (/Đa chức năng|Tự.?tha|自他/iu.test(transitivity)) return { label: "自他動詞 (Tự/tha động từ)", background: "#3d4fbd" };
  return { label: transitivity, background: "#3d4fbd" };
};

const tagStyle = (background: string): CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 6,
  background,
  color: "#fff",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: "18px",
  padding: "1px 9px",
  whiteSpace: "nowrap",
});

export function VocabPartOfSpeechTag({ word, partOfSpeech, verbGroup, transitivity }: VocabPartOfSpeechTagProps) {
  const tags: PosTag[] = [];
  const groupTag = verbGroupTag(verbGroup, word);
  if (groupTag) tags.push(groupTag);
  else if (partOfSpeech && partOfSpeech !== "Khác") {
    const tag = POS_TAGS[partOfSpeech];
    tags.push(tag ?? { label: partOfSpeech, background: "#81768b" });
  }

  const transitivityLabel = transitivityTag(transitivity);
  if (transitivityLabel) tags.push(transitivityLabel);
  if (tags.length === 0) return null;

  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
      {tags.map((tag) => <span key={tag.label} style={tagStyle(tag.background)}>{tag.label}</span>)}
    </span>
  );
}
