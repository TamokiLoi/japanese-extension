/** Unique kanji from the Japanese Somatome sheet, in first-occurrence row order. */
export const FPT_SOMATOME_334 = [
  "駐", "無", "満", "向", "禁", "関", "係", "断", "困", "消", "防", "救", "警", "察", "故", "伝",
  "横", "押", "式", "信", "号", "確", "認", "飛", "黄", "絵", "組", "束", "授", "渡", "昔", "要",
  "非", "常", "階", "段", "箱", "危", "険", "捨", "冷", "蔵", "凍", "庫", "召", "保", "存", "必",
  "線", "面", "普", "各", "次", "快", "速", "過", "費", "期", "限", "製", "造", "賞", "法", "温",
  "鉄", "指", "定", "席", "由", "番", "窓", "側", "販", "機", "増", "減", "量", "氷", "返", "湯",
  "路", "停", "整", "券", "現", "両", "替", "優", "材", "卵", "乳", "粉", "袋", "混", "表", "裏",
  "座", "降", "未", "若", "末", "晩", "島", "皿", "留", "守", "濃", "薄", "部", "数", "件", "再",
  "血", "助", "準", "備", "営", "閉", "案", "内", "接", "続", "示", "戻", "完", "了", "登", "録",
  "予", "約", "煙", "当", "全", "客", "様", "解", "育", "成", "種", "類", "教", "妻", "馬", "石",
  "協", "願", "観", "園", "港", "遊", "美", "術", "砂", "塩", "油", "緑", "紅", "冊", "個", "枚",
  "神", "寺", "役", "郵", "局", "交", "差", "点", "告", "利", "割", "値", "商", "支", "払", "倍",
  "橋", "公", "受", "付", "科", "鼻", "婦", "形", "米", "級", "残", "型", "税", "込", "価", "格",
  "骨", "折", "申", "記", "例", "齢", "歳", "性", "連", "絡", "届", "宅", "配", "希", "望", "荷",
  "換", "額", "戦", "経", "済", "貿", "易", "輸", "相", "在", "取", "預", "衣", "参", "達", "勤",
  "帯", "化", "比", "原", "際", "議", "活", "変", "細", "戸", "湖", "船", "角", "夫", "苦", "政",
  "府", "改", "否", "的", "実", "欠", "専", "礼", "伺", "遅", "失", "汗", "念", "涙", "笑", "亡",
  "忙", "忘", "祭", "労", "加", "情", "反", "調", "査", "移", "難", "簡", "単", "感", "想", "練",
  "最", "適", "選", "違", "直", "復", "辞", "宿", "昨", "君", "結", "婚", "祝", "曲", "奥", "寝",
  "痛", "熱", "虫", "歯", "治", "汚", "並", "他", "身", "酒", "吸", "欲", "眠", "疲", "息", "呼",
  "厚", "泣", "鳴", "初", "泊", "葉", "報", "晴", "雲", "吹", "暖", "雪", "震", "波", "求", "募",
  "職", "容", "技", "般", "務", "課", "球", "決", "勝", "対", "流", "負", "投", "果",
] as const;

export type FptSomatomeKanjiCharacter = (typeof FPT_SOMATOME_334)[number];
export type FptKanjiCharacter = FptSomatomeKanjiCharacter;
export type FptKanjiId = `kanji-${FptKanjiCharacter}`;

export function toCanonicalKanjiId<T extends FptKanjiCharacter>(character: T): `kanji-${T}` {
  return `kanji-${character}`;
}

export function getFptStudySetIds(characters: readonly FptKanjiCharacter[]): FptKanjiId[] {
  return characters.map((character) => toCanonicalKanjiId(character));
}

/** Mnemonic hints for FPT Soumatome kanji missing a hint in the core dataset. */
export const FPT_SOMATOME_MNEMONICS = {
  救: "Khi ai đó CẦU 求 cứu, hãy hành động 攵 để ra tay CỨU giúp.",
  費: "Tiền 貝 bỏ ra cho một việc chính là khoản CHI PHÍ; tiêu nhiều thì hao tốn.",
  製: "Dùng quy cách 制 để làm ra áo quần 衣 và sản phẩm: CHẾ TẠO.",
  賞: "Trao vật quý hoặc tiền 貝 để KHEN THƯỞNG người xứng đáng.",
  停: "Người 亻 dừng chân ở đình 亭 nghỉ một lát: 停 là DỪNG.",
  粉: "Gạo 米 được chia, nghiền thành hạt nhỏ 分 để thành BỘT 粉.",
  告: "Hình dung dùng miệng 口 loan báo điều mình biết: 告 là THÔNG BÁO.",
  型: "Đất 土 được nặn theo khuôn để tạo dáng cố định: KIỂU, HÌNH MẪU.",
  難: "Hình dung một con chim 隹 mắc giữa bụi rậm, loay hoay mãi mới thoát ra — thật KHÓ KHĂN.",
} as const satisfies Partial<Record<FptSomatomeKanjiCharacter, string>>;

export const KANJI_STUDY_SETS = {
  "FPT-Soumatome-334": {
    label: "FPT-Soumatome-334",
    ids: getFptStudySetIds(FPT_SOMATOME_334),
  },
} as const;

export type KanjiStudySetId = keyof typeof KANJI_STUDY_SETS;
