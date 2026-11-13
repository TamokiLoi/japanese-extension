export interface JlptLeisureScene {
  startSentence: number;
  path: string;
  alt: string;
}

export interface JlptLeisureEntry {
  passageId: string;
  title: string;
  summary: string;
  titleJa: string;
  summaryJa: string;
  /** Number of leading exam directions to omit from leisure reading pages. */
  skipLeadingSentences?: number;
  scenes: JlptLeisureScene[];
}

// Curated first release of annual N1/N3 passages. The original exam records
// stay the source of truth; this file only adds leisure titles and artwork.
export const JLPT_LEISURE_PILOT: JlptLeisureEntry[] = [
  {
    passageId: "jlpt-cacnam-n1-2025-07-language-reading-pabl7j",
    title: "Xã hội được tạo nên từ những kết nối nhỏ",
    summary: "Một bài luận ngắn nhìn xã hội qua những mối liên hệ trong đời sống thường ngày.",
    titleJa: "小さなつながりが社会をつくる",
    summaryJa: "社会は、一人ひとりの小さな行動やつながりによって形づくられている。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n1-society.webp", alt: "Người dân kết nối với nhau trên một con phố buổi sáng ở Nhật Bản" }],
  },
  {
    passageId: "jlpt-cacnam-n1-2025-12-language-reading-7snccd",
    title: "Bữa ăn chung đã thay đổi con người ra sao?",
    summary: "Từ việc nấu chín thức ăn đến những bữa ăn giúp con người gắn kết.",
    titleJa: "共に食べることが人類を変えた",
    summaryJa: "火を使った料理や食事の変化を通して、人類の進化と社会の成り立ちを考える。",
    scenes: [
      { startSentence: 0, path: "assets/reading/jlpt-pilot/n1-cooking-fire.webp", alt: "Một nhóm người thời tiền sử cùng chuẩn bị thức ăn bên bếp lửa" },
      { startSentence: 2, path: "assets/reading/jlpt-pilot/n1-shared-meal.webp", alt: "Gia đình thời tiền sử cùng chia sẻ bữa ăn bên bếp lửa" },
    ],
  },
  {
    passageId: "jlpt-cacnam-n1-2025-07-language-reading-p6wvtw",
    title: "Hai cách đối diện với lo lắng",
    summary: "Hai ý kiến đưa ra cách tự trấn an và điều chỉnh cơ thể trước khi căng thẳng.",
    titleJa: "不安への二つの向き合い方",
    summaryJa: "不安を感じたときに心と体を整える方法を、二つの意見から紹介する。",
    skipLeadingSentences: 1,
    scenes: [
      { startSentence: 0, path: "assets/reading/jlpt-pilot/n1-self-talk.webp", alt: "Một người tự trấn an trước buổi thuyết trình" },
      { startSentence: 4, path: "assets/reading/jlpt-pilot/n1-breathing.webp", alt: "Một người hít thở sâu, ngẩng nhìn khán giả trước khi lên sân khấu" },
    ],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-12-bunpou-dokkai-fmp3qs",
    title: "Nước dùng từ vỏ rau",
    summary: "Một vị khách bất ngờ khi biết nồi nước dùng được nấu từ vỏ rau củ.",
    titleJa: "野菜の皮で作るだし",
    summaryJa: "友人の家で、野菜の皮から取っただしを使ったスープをごちそうになる。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-broth.webp", alt: "Người bạn giới thiệu nồi nước dùng nấu từ vỏ rau trong căn bếp gia đình" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-12-bunpou-dokkai-1uxyapd",
    title: "Đi siêu thị cùng nhau",
    summary: "Một đôi vợ chồng nhận ra niềm vui trong thói quen chọn thực phẩm mỗi tuần.",
    titleJa: "夫婦で通う近所のスーパー",
    summaryJa: "夫婦でスーパーに通ううちに、買い物の時間に小さな楽しみを見つけていく。",
    scenes: [
      { startSentence: 0, path: "assets/reading/jlpt-pilot/n3-online-shopping.webp", alt: "Đôi vợ chồng thử đặt thực phẩm trực tuyến tại nhà" },
      { startSentence: 2, path: "assets/reading/jlpt-pilot/n3-grocery-shopping.webp", alt: "Đôi vợ chồng cùng chọn rau củ và cá ở siêu thị" },
    ],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-12-bunpou-dokkai-7tzm9u",
    title: "Bố đọc sách ở lớp con",
    summary: "Một người cha tập đọc sách tranh cho lớp con gái rồi nhận được lời nhắn bất ngờ.",
    titleJa: "娘のクラスで絵本を読む父",
    summaryJa: "絵本の読み聞かせを引き受けた父親が、娘のクラスで子どもたちと過ごす。",
    scenes: [
      { startSentence: 0, path: "assets/reading/jlpt-pilot/n3-practice-reading.webp", alt: "Người cha tập đọc sách tranh ở nhà, con gái nhìn theo" },
      { startSentence: 3, path: "assets/reading/jlpt-pilot/n3-classroom-reading.webp", alt: "Người cha đọc sách tranh cho trẻ em trong lớp học" },
      { startSentence: 6, path: "assets/reading/jlpt-pilot/n3-after-school.webp", alt: "Người cha lắng nghe con gái trên đường về nhà sau giờ học" },
    ],
  },
];

export const JLPT_LEISURE_BY_ID = new Map(JLPT_LEISURE_PILOT.map((entry) => [entry.passageId, entry]));
