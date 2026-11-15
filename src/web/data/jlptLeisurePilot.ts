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

// Curated leisure-reading metadata and artwork for selected annual N1/N3 passages.
// The original exam records stay the source of truth; this file adds display copy and scenes.
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
    passageId: "jlpt-cacnam-n3-2025-07-bunpou-dokkai-13e5b5c",
    title: "Kiểm tra lại tài liệu giới thiệu sản phẩm",
    summary: "Kimura gửi John tài liệu tiếng Anh đã chỉnh sửa cho buổi giới thiệu sản phẩm, với phần bổ sung được đánh dấu đỏ và biểu đồ đã sửa, rồi nhờ anh xem lại trong tuần.",
    titleJa: "製品発表会の資料をもう一度確認",
    summaryJa: "木村さんが、赤字の追加とグラフの修正をした英語資料をジョンさんに送り、今週中の再確認を頼む。",
    skipLeadingSentences: 1,
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2025-07-product-review.webp", alt: "Hai đồng nghiệp cùng rà tài liệu giới thiệu sản phẩm với ghi chú sửa màu đỏ và biểu đồ" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-07-bunpou-dokkai-grxzgy",
    title: "Quầy thư viện tạm trong thời gian sửa chữa",
    summary: "Thư viện Midori đóng cửa sáu tháng để thi công nhưng mở quầy tại tầng ba tòa nhà ga để cho mượn sách đã đặt trước và tiếp nhận sách trả lại.",
    titleJa: "休館中の図書館と特別窓口",
    summaryJa: "工事で休館する緑図書館が、駅ビルに予約本の貸し出しや返却ができる特別窓口を設ける。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2025-07-library-counter.webp", alt: "Nhân viên trao sách đặt trước cho khách tại quầy thư viện tạm trong tòa nhà ga" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-07-bunpou-dokkai-apag9p",
    title: "Đôi tất làm từ giấy",
    summary: "Bài viết giới thiệu loại tất làm từ sợi giấy đặc biệt, có thể giặt nhiều lần, thấm mồ hôi và nhanh khô.",
    titleJa: "紙から作られた靴下",
    summaryJa: "特別な紙の丈夫な糸で作られた靴下は、水に強く、洗って何度も使え、汗を吸って早く乾く。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2025-07-paper-socks.webp", alt: "Một người đọc cầm đôi tất sợi giấy bên cạnh tạp chí trong phòng khách" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-07-bunpou-dokkai-18mcbvi",
    title: "Vì sao cơn đau như chuyển sang chỗ khác?",
    summary: "Khi vùng đau nặng nhất bắt đầu hồi phục, người bệnh mới có thể nhận ra một vùng đau khác và cảm thấy cơn đau đã chuyển chỗ.",
    titleJa: "痛みが移ったように感じる理由",
    summaryJa: "体は同時に最も強い痛みを感じるため、一番悪い部分が治ると次の痛みに気づくことがある。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2025-07-pain-consultation.webp", alt: "Bệnh nhân trao đổi với bác sĩ trong phòng khám sáng sủa" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-07-bunpou-dokkai-l9mcax",
    title: "Hai chị em và bài tập hè",
    summary: "Hai chị em có cách đối diện trái ngược nhau với những việc mình không thích; một bài tập mùa hè khiến cô em gặp rắc rối vào phút chót.",
    titleJa: "夏休みの宿題に向き合う姉妹",
    summaryJa: "嫌なことへの姿勢が正反対の姉妹。夏休みの宿題を通して、妹は意外な形で最後の日を迎えることになる。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2025-07-summer-homework.webp", alt: "Hai chị em làm bài tập bên bàn học khi kỳ nghỉ hè sắp kết thúc" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-07-bunpou-dokkai-wgm274",
    title: "Lý do quạ không còn đến gần",
    summary: "Một tờ thông báo đơn giản ở tòa nhà nghiên cứu dẫn đến thay đổi bất ngờ trong cách quạ xuất hiện ở đó.",
    titleJa: "カラスが近づかなくなった理由",
    summaryJa: "研究所の入口に貼られた紙が、カラスの行動を変えた経緯を紹介する。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2025-07-crow-notice.webp", alt: "Một con quạ đậu trên hàng rào gần tòa nhà nghiên cứu, người qua lại bình thường" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-07-bunpou-dokkai-1p17nyl",
    title: "Những món cá ít được biết đến",
    summary: "Một gia đình thử món từ những loài cá ít được bày bán ở nhà hàng mới mở và nghe chủ quán giới thiệu về chúng.",
    titleJa: "未利用魚を味わうレストラン",
    summaryJa: "一般にはあまり売られてこなかった魚を料理する店を家族で訪れ、珍しい魚料理を味わう。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2025-07-underused-fish.webp", alt: "Một gia đình thưởng thức các món cá địa phương trong nhà hàng nhỏ" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-07-bunpou-dokkai-14xixj",
    title: "Hướng dẫn Trung tâm Thể thao Aoba",
    summary: "Tờ hướng dẫn nêu giờ mở cửa, phí sử dụng, quy định và lịch hoạt động thể thao tại nhà thi đấu cùng phòng bóng bàn.",
    titleJa: "青葉市民スポーツセンターの利用案内",
    summaryJa: "青葉市民スポーツセンターの営業時間、料金、利用方法と、九月の体育館でできるスポーツを案内する。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-2025-07-sports-center.webp", alt: "Một phụ huynh và trẻ nhỏ xem bảng biểu tượng thể thao ở lối vào trung tâm thể thao" }],
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
    passageId: "jlpt-cacnam-n3-2025-12-bunpou-dokkai-1q1r1wv",
    title: "Dã ngoại mùa xuân của Câu lạc bộ Giao lưu Quốc tế",
    summary: "Thông báo mời sinh viên quốc tế và Nhật Bản tham gia dã ngoại mùa xuân, kèm thời gian, chi phí và lưu ý chuẩn bị đồ uống.",
    titleJa: "国際交流クラブの春のピクニック",
    summaryJa: "東山大学の国際交流クラブが、留学生と日本人学生向けに春のピクニックを案内している。",
    skipLeadingSentences: 1,
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-picnic-notice.webp", alt: "Hai sinh viên xem thông báo dã ngoại mùa xuân trên bảng tin ở khuôn viên đại học" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-12-bunpou-dokkai-a57x7b",
    title: "Lữ quán trả lời yêu cầu đặt phòng",
    summary: "Lữ quán báo phòng kiểu Nhật đã kín, gợi ý phòng Nhật-Tây còn trống và khuyên đặt sớm vào mùa hoa anh đào.",
    titleJa: "旅館から届いた予約の返事",
    summaryJa: "旅館は、満室の和室に代わる和洋室を案内し、桜の季節の予約は早めにするよう勧める。",
    skipLeadingSentences: 1,
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-ryokan-reply.webp", alt: "Một du khách đọc tin đặt phòng trong phòng lữ quán kiểu Nhật-Tây, bên cửa sổ có hoa anh đào" }],
  },
  {
    passageId: "jlpt-cacnam-n3-2025-12-bunpou-dokkai-1ii2uci",
    title: "Cách tàu điện ngầm tiết kiệm năng lượng",
    summary: "Đường ray dốc giữa những ga nông giúp tàu tăng tốc tự nhiên khi xuống dốc và dễ dừng khi lên dốc, nhờ đó tiết kiệm năng lượng.",
    titleJa: "地下鉄の坂道と省エネルギー",
    summaryJa: "東京の地下鉄は駅間に坂を設け、下り坂で加速し上り坂で減速しやすくして、エネルギーを節約している。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-subway-slope.webp", alt: "Mặt cắt tuyến tàu điện ngầm với hai ga gần mặt đất và đường ray trũng sâu ở giữa" }],
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
    passageId: "jlpt-cacnam-n3-2025-12-bunpou-dokkai-1yfque4",
    title: "Khách sạn phân tán giữa phố cổ",
    summary: "Những ngôi nhà cổ trong phố được dùng làm phòng nghỉ, quầy lễ tân và nơi ăn uống, để khách đi bộ qua khu phố và góp phần hỗ trợ kinh tế địa phương.",
    titleJa: "町に広がる分散型ホテル",
    summaryJa: "古い町家を客室や受付、食事会場として再生する分散型ホテルは、町歩きと地域経済の活性化につながる。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-distributed-hotel.webp", alt: "Du khách kéo vali đi giữa các nhà machiya riêng biệt trên phố cổ Nhật Bản" }],
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
    passageId: "jlpt-cacnam-n3-2025-12-bunpou-dokkai-v5ndz",
    title: "Chọn chỗ ngồi ở Thư viện Toriyama",
    summary: "Thư viện giới thiệu bốn loại chỗ ngồi cùng mục đích, giới hạn thời gian và cách đăng ký sử dụng.",
    titleJa: "鳥山図書館の座席案内",
    summaryJa: "鳥山図書館の四種類の席について、用途、利用時間、申し込み方法を説明している。",
    scenes: [{ startSentence: 0, path: "assets/reading/jlpt-pilot/n3-library-seating.webp", alt: "Khách trao thẻ thư viện cho thủ thư trong không gian có nhiều khu bàn ghế đọc và học" }],
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
