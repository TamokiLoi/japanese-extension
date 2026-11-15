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
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-m5r4s0",
    title: "Nhà sách yêu thích",
    summary: "Một du học sinh tìm thấy cuốn sách về cà phê giữa những món đồ được bày theo chủ đề.",
    titleJa: "私のお気に入りの本屋",
    summaryJa: "本に合わせた商品が並ぶさくら書店で、留学生がコーヒーの本を見つけてお気に入りの場所にする。",
    skipLeadingSentences: 1,
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-bookstore.webp", alt: "Du học sinh khám phá góc sách về cà phê trong một nhà sách Nhật Bản" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-18chx2z",
    title: "Kệ sách tái sử dụng ở thư viện",
    summary: "Thư viện đặt một kệ sách miễn phí và hướng dẫn cách mang sách cũ đến chia sẻ.",
    titleJa: "図書館のリサイクル本棚",
    summaryJa: "図書館では、読み終えた本を持ち寄り、ほかの人が自由に持ち帰れる棚を設けている。",
    skipLeadingSentences: 1,
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-recycled-bookshelf.webp", alt: "Nhân viên thư viện đặt sách được quyên góp lên kệ chia sẻ miễn phí" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-49kf7m",
    title: "Gọi nhân viên ở quán ramen",
    summary: "Một cách gọi đủ rõ và hướng về phía nhân viên giúp việc gọi món dễ dàng hơn.",
    titleJa: "店員に届く呼び方",
    summaryJa: "ラーメン店で店員にお願いするときは、相手に届く声で伝えることが大切だ。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-ramen-call.webp", alt: "Khách trong quán ramen gọi nhân viên bằng giọng rõ ràng, lịch sự" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-ziu39v",
    title: "Chọn ảnh cho bài phỏng vấn",
    summary: "Một cựu sinh viên được nhờ xem lại bài phỏng vấn và chọn hai trong bốn tấm ảnh.",
    titleJa: "卒業生インタビューの記事確認",
    summaryJa: "大学新聞のインタビュー記事を確認し、四枚の写真から使う二枚を選んでもらう。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-university-email.webp", alt: "Cựu sinh viên xem bản thảo phỏng vấn và chọn ảnh cùng sinh viên làm báo" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-ne20er",
    title: "Cây cầu bằng thuyền",
    summary: "Ngày xưa, người dân xếp thuyền nối nhau để qua sông ở nơi nước quá sâu để xây cầu.",
    titleJa: "船橋という名前の由来",
    summaryJa: "川の水が深く橋を造れなかった場所では、船を並べて人々が渡っていた。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-funabashi-boats.webp", alt: "Những chiếc thuyền nối thành lối đi để người dân qua sông" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-3nbvhn",
    title: "Câu nói ‘chỉ còn một món’",
    summary: "Cùng một lời nhắc có thể thúc đẩy mua hàng hoặc làm khách phân vân tùy thời điểm.",
    titleJa: "「最後の一つ」と言うタイミング",
    summaryJa: "「残り一つ」という言葉は、買う前と買った後では客の受け取り方が変わる。",
    scenes: [
      { startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-last-skirt.webp", alt: "Khách hàng đang cân nhắc chiếc váy cuối cùng khi nhân viên cho biết chỉ còn một chiếc" },
      { startSentence: 7, path: "assets/reading/jlpt-pilot/n3-2026-07-last-shoes.webp", alt: "Khách đã mua giày nghe nhân viên nói đó là đôi cuối cùng và cảm thấy lo lắng" },
    ],
  },
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-c7f0vf",
    title: "Đèn đường và cây rụng lá",
    summary: "Ánh đèn ban đêm khiến một số cây trong thành phố chậm rụng lá vào mùa thu.",
    titleJa: "街路灯と落葉樹",
    summaryJa: "街路灯の光を受ける落葉樹は、日が長いと感じて葉を落とす時期が遅れることがある。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-city-streetlight.webp", alt: "Cây rụng lá bên con đường Nhật Bản vẫn còn lá dưới ánh đèn đường ban đêm" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-qpu9oi",
    title: "Cách giúp em bé ngủ",
    summary: "Nghiên cứu gợi ý bế em bé đi bộ, chờ bé ngủ sâu rồi nhẹ nhàng đặt xuống nôi.",
    titleJa: "泣く赤ちゃんを眠らせる方法",
    summaryJa: "赤ちゃんを抱いて歩き、眠ってからもしばらく抱いた後、静かにベッドへ移す方法が研究された。",
    scenes: [
      { startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-baby-walking.webp", alt: "Người mẹ bế em bé đang khóc và đi bộ chậm rãi trong phòng" },
      { startSentence: 11, path: "assets/reading/jlpt-pilot/n3-2026-07-baby-waiting.webp", alt: "Người mẹ ngồi yên bế em bé đã ngủ để chờ bé ngủ sâu hơn" },
      { startSentence: 15, path: "assets/reading/jlpt-pilot/n3-2026-07-baby-transfer.webp", alt: "Người mẹ nhẹ nhàng đặt em bé đang ngủ xuống chiếc nôi an toàn" },
    ],
  },
  {
    passageId: "jlpt-cacnam-n3-2026-07-bunpou-dokkai-ia613r",
    title: "Thông báo lớp tennis Kihara",
    summary: "Một trung tâm thể thao mở lớp tennis cho người mới và hướng dẫn cách đăng ký.",
    titleJa: "テニス教室の募集案内",
    summaryJa: "木原スポーツセンターでは初心者向けのテニス教室を開き、参加者を募集している。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2026-07-tennis-class.webp", alt: "Người mới tập tennis cùng huấn luyện viên tại sân thể thao cộng đồng" }],
  },
];

export const JLPT_LEISURE_BY_ID = new Map(JLPT_LEISURE_PILOT.map((entry) => [entry.passageId, entry]));
