import type { ExamTipsLesson, ExamTipsSlideCoverage, ExamTipsSourceRef } from './types.ts';

const refs = (slides: number[]): ExamTipsSourceRef[] =>
  slides.map((slide) => ({ deck: 'listening-tips', slide }));

const coverage = (
  lessonId: string,
  slides: number[],
  disposition: 'converted' | 'merged' = 'merged',
): ExamTipsSlideCoverage[] =>
  slides.map((slide) => ({ deck: 'listening-tips', slide, lessonId, disposition }));

export const n3ListeningLessons: ExamTipsLesson[] = [
  {
    id: 'mondai1-nam-yeu-cau-va-trinh-tu',
    title: 'Mondai 1: nghe yêu cầu và xác định việc cần làm',
    summary: 'Đọc trước các lựa chọn, nhận ra điểm giống và khác, rồi nghe để xác định ai cần làm gì và vào lúc nào.',
    minutes: 9,
    sourceSlides: refs([3, 4, 5, 6, 8, 9, 10, 11, 13]),
    blocks: [
      {
        type: 'text',
        title: 'Câu hỏi thường nhắm đến hành động tiếp theo',
        paragraphs: [
          'Phần giới thiệu nêu các câu hỏi về việc nhân vật sẽ làm gì tiếp theo, đồng thời nhắc dạng hỏi lý do hoặc cách thức. Với câu hỏi hành động, hãy nghe ai là người được hỏi, việc nào đang được bàn và mốc thời gian nào được nhấn mạnh.',
          'Theo phần mô tả chung trong tài liệu, Mondai 1 có lựa chọn in sẵn bằng chữ hoặc tranh, nghe câu hỏi trước/sau hội thoại và thường có năm câu. Hình thức cụ thể có thể thay đổi theo bộ đề luyện.',
        ],
      },
      {
        type: 'steps',
        title: 'Quy trình trước và trong khi nghe',
        items: [
          { title: 'Đọc các lựa chọn', text: 'Tìm điểm giống và khác: người thực hiện, hành động, đồ vật hoặc thứ tự. Với lựa chọn bằng tranh, mô tả nhanh mỗi hình bằng vài từ.' },
          { title: 'Memo câu hỏi', text: 'Ghi ngắn “ai làm gì?” và lưu ý những danh từ/hành động được đối chiếu giữa các phương án.' },
          { title: 'Nghe để loại trừ', text: 'Đánh dấu lựa chọn bị phủ định, chỉ là phương án phụ hoặc không đúng người thực hiện.' },
          { title: 'Kiểm tra thời điểm', text: 'Nghe lại ý hỏi và các dấu hiệu như “trước tiên”, “ngay bây giờ”, “sau đó”; chọn việc phù hợp với đúng mốc được hỏi.' },
        ],
      },
      {
        type: 'examples',
        title: 'Tín hiệu cần nghe đến hết câu',
        items: [
          { jp: 'それより、なにより', vi: 'Hơn thế nữa / trên hết', analysis: 'Nhóm từ này báo hiệu phần kết luận hoặc điều được ưu tiên. Hãy nghe tiếp phần sau để xác định nội dung cụ thể.' },
          { jp: '～先に … Vてほしい', vi: 'Muốn ai đó làm … trước', analysis: 'Kết hợp mốc ưu tiên với điều người nói mong người khác thực hiện.' },
          { jp: '急いで … Vないと', vi: 'Mau lên, nếu không làm … thì…', analysis: 'Cấu trúc gợi sự gấp rút hoặc nghĩa vụ; không nên chọn một hành động trước khi nghe phần kết thúc.' },
        ],
      },
      {
        type: 'callout',
        title: 'Đừng chọn ở phần liệt kê hoặc nhượng bộ',
        text: 'Thông tin đứng trước các cụm như ～し, ～も, ～とか, ～たり, Nでも hoặc ～いいけど, ～だが, ～だけど có thể chỉ là ý bổ sung hoặc ý sẽ bị chuyển hướng. Đây là dấu hiệu cần nghe tiếp, không phải quy tắc loại đáp án tự động.',
        tone: 'warning',
      },
      {
        type: 'image',
        src: 'assets/exam-tips/n3/listening/mondai1-picture-choices.png',
        alt: 'Ảnh ví dụ Mondai 1: lựa chọn bằng chữ và tranh về cách cố định đồ nội thất và sắp xếp đồ vật trên bàn.',
        caption: 'Ví dụ lựa chọn bằng chữ và tranh, cho thấy cần so sánh cả chi tiết hình ảnh trước khi nghe.',
      },
      {
        type: 'image',
        src: 'assets/exam-tips/n3/listening/mondai1-workflow.png',
        alt: 'Sơ đồ bốn bước: phân tích điểm giống khác, memo ai làm gì, nghe loại đáp án sai, rồi xác định đáp án.',
        caption: 'Sơ đồ quy trình bốn bước; nội dung đã được diễn giải ở phía trên.',
      },
      {
        type: 'callout',
        title: 'Hai kiểu câu hỏi trong checklist',
        text: 'Tài liệu phân biệt câu hỏi về toàn bộ hội thoại và câu hỏi xoay quanh một chi tiết. Hãy dùng câu hỏi để biết mình đang tìm ý chung hay một hành động cụ thể.',
        tone: 'tip',
      },
    ],
  },
  {
    id: 'mondai1-dau-hieu-y-dinh-va-thoi-gian',
    title: 'Mondai 1: nhận ra ý định, sắc thái và thứ tự',
    summary: 'Nhận diện câu nhờ vả, mệnh lệnh, lời khuyên, đề nghị và từ chỉ trình tự để tìm đúng hành động.',
    minutes: 10,
    sourceSlides: refs([14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
    blocks: [
      {
        type: 'examples',
        title: 'Câu hỏi “việc tiếp theo là gì?”',
        items: [
          { jp: 'これからどうしますか。', vi: 'Từ bây giờ sẽ làm gì?', analysis: 'Câu hỏi hướng đến hành động sắp tới.' },
          { jp: 'まず何をしなければなりませんか。', vi: 'Trước tiên phải làm gì?', analysis: 'Tập trung vào việc đầu tiên và nghĩa vụ.' },
          { jp: '次にすることは何ですか。', vi: 'Việc tiếp theo là gì?', analysis: 'Nghe mốc kế tiếp sau hành động đang nói đến.' },
          { jp: 'この後、何をしますか。', vi: 'Sau đây sẽ làm gì?' },
          { jp: 'すぐ何をしますか。', vi: 'Sẽ làm gì ngay bây giờ?', analysis: 'Giới hạn câu trả lời ở hành động tức thời.' },
        ],
      },
      {
        type: 'comparison',
        title: 'Nghe mẫu câu để nhận ra chức năng',
        intro: 'Các hình thái sau được nhóm theo chức năng giao tiếp: nhờ vả, nhiệm vụ, khuyên bảo, đề nghị và cấm chỉ.',
        items: [
          { label: 'Nhờ vả', text: '～してください、～お願いします、～してくれない？、～してもらえますか、～してほしいんだけど', detail: 'Người nói muốn người nghe làm việc gì đó; để ý người được nhờ.' },
          { label: 'Mệnh lệnh / nghĩa vụ', text: '～しなさい、～しろ、～なければなりません、～なきゃ、～ないと、～ないと困る', detail: 'Nhận diện điều phải làm và mức độ trực tiếp của lời nói.' },
          { label: 'Khuyên bảo', text: '～ほうがいい、～するといい、～すればいい、～たらどうですか', detail: 'Thường nêu hành động được khuyên; kiểm tra xem câu hỏi hỏi lời khuyên hay việc kế tiếp.' },
          { label: 'Đề nghị / rủ rê', text: '～ましょうか、～ておこうか、～ませんか、～ましょう', detail: 'Nghe phản hồi đồng ý hay từ chối thay vì chỉ bắt lấy động từ ở lời mời.' },
          { label: 'Cấm / không cần', text: '～するな、～しないでください、～してはいけない、～しなくていい', detail: 'Phân biệt rõ “không được làm” với “không cần làm”.' },
        ],
        takeaway: 'Hình thái cho biết quan hệ giữa người nói và hành động; vẫn cần xác định chủ thể và thời điểm trong ngữ cảnh.',
      },
      {
        type: 'examples',
        title: 'Thái độ và tín hiệu trình tự',
        items: [
          { jp: 'はい・うん・いいね・ええ・そうそう', vi: 'Ừ / đúng / hay đấy', analysis: 'Khi nghe lời đồng tình, hãy chú ý ngữ điệu và nội dung theo sau.' },
          { jp: 'いいえ・ううん・いや・そうじゃなくて', vi: 'Không / không phải vậy', analysis: 'Các ví dụ phủ nhận hoặc sửa ý; だけど có thể báo hiệu chuyển ý, nên đọc cả câu.' },
          { jp: 'まず・最初に・初めに', vi: 'Trước tiên', analysis: 'Dấu hiệu cho hành động ưu tiên.' },
          { jp: '前に・次に・～の後・～が終わったら', vi: 'Trước / tiếp theo / sau khi / khi kết thúc', analysis: 'Dùng để dựng thứ tự các việc; ～たら cũng phụ thuộc ngữ cảnh.' },
          { jp: '～てから・それから・そして・続いて・Vます次第', vi: 'Sau khi… / rồi / tiếp tục / ngay sau khi…', analysis: 'Đây là các cách nối những việc theo trình tự; chú ý đúng động từ và ngữ cảnh.' },
          { jp: '今すぐ・すぐに・急いで・先に・～ておく', vi: 'Ngay bây giờ / nhanh lên / làm trước / làm sẵn', analysis: 'Các dấu hiệu thời điểm hoặc chuẩn bị có thể giúp phân biệt hành động tức thời với việc để sau.' },
        ],
      },
      {
        type: 'callout',
        title: 'Không biến từ chỉ thời gian thành đáp án cố định',
        text: 'Các dấu hiệu “ngay bây giờ / trước / làm sẵn” cần được phân biệt với “sau / cuối cùng / để lần sau”. Hãy hiểu chúng theo câu hỏi cụ thể: “cuối cùng” có thể đúng nếu đề hỏi việc cuối cùng, còn “sau đó” có thể đúng nếu đề hỏi bước kế tiếp.',
        tone: 'tip',
      },
      {
        type: 'exercise',
        prompt: 'Trong ví dụ các lựa chọn về việc cần làm đầu tiên, hãy nghe và xác định lựa chọn nào khớp với hành động được yêu cầu. Tài liệu không kèm âm thanh hay đáp án xác nhận.',
        choices: [
          '図書館の部屋を予約する',
          '案内のメールを出す',
          '進行役を頼む',
          '新しい会員リストを作る',
        ],
        evidence: 'Các lựa chọn được chép lại từ hình minh họa; bộ tài liệu được cung cấp không có audio.',
        selfCheck: true,
      },
    ],
  },
  {
    id: 'mondai3-doi-thoai-va-doc-thoai',
    title: 'Mondai 3: theo dõi chủ đề và ý kiến người nói',
    summary: 'Nghe câu dẫn để nhận dạng bối cảnh, ghi nhanh chủ đề và quan điểm, rồi đối chiếu từ hỏi với ý chính.',
    minutes: 9,
    sourceSlides: refs([25, 26, 27, 28, 29, 30, 31, 32]),
    blocks: [
      {
        type: 'text',
        title: 'Cấu trúc được giới thiệu trong tài liệu',
        paragraphs: [
          'Mondai 3 thường là đoạn độc thoại hoặc đối thoại với câu hỏi về chủ đề, ý kiến hay quan điểm của người nói. Tài liệu hướng dẫn ghi rằng nội dung không in sẵn, không nghe trước câu hỏi và thường có ba câu; hình thức thực tế có thể thay đổi tùy đề.',
          'Đối thoại thường mở bằng 「男の人と女の人が話しています」. Độc thoại được nhóm theo bối cảnh như thông báo, giới thiệu, chia sẻ của người nổi tiếng, nghị luận xã hội hoặc quan hệ giữa các chủ thể.',
        ],
      },
      {
        type: 'steps',
        title: 'Ba bước nghe',
        items: [
          { title: 'Nhận dạng câu dẫn', text: 'Xác định đang nghe đối thoại hay độc thoại và ghi bối cảnh ngắn gọn.' },
          { title: 'Memo khi nghe', text: 'Ghi ai nói gì, chủ đề nào và dấu hiệu đổi ý. Tập trung vào ý chính hơn là cố chép nguyên câu.' },
          { title: 'Đọc câu hỏi rồi chọn', text: 'Xác định câu hỏi muốn chủ đề, mong muốn hay đánh giá; so từng lựa chọn với đúng người nói.' },
        ],
      },
      {
        type: 'comparison',
        title: 'Câu hỏi chủ đề và câu hỏi mong muốn',
        items: [
          { label: 'Chủ đề / điều muốn nói', text: '男の人・女の人が言いたいことは何ですか。', detail: 'Chú ý danh từ mang nội dung chính; các ví dụ gồm lựa chọn về luyện marathon, thay đổi thể chất, lý do bắt đầu và kết quả cuộc thi.' },
          { label: 'Điều muốn làm', text: 'Lựa chọn thường diễn đạt hành động hoặc nguyện vọng.', detail: 'Các phương án ví dụ gồm muốn giới thiệu phim nước ngoài, cùng làm phim, mời vào câu lạc bộ hoặc rủ đi xem câu lạc bộ mới; hãy nghe động từ.' },
          { label: 'Ý kiến / cảm nhận', text: '～についてどう思っていますか。', detail: 'Tìm đánh giá như tốt/xấu, hữu ích/không hữu ích, thú vị/nhàm chán và xác định đúng người đang được hỏi.' },
        ],
      },
      {
        type: 'callout',
        title: 'Nghe ý sửa lại sau từ chuyển hướng',
        text: 'Trong đối thoại, 「でも」「しかし」「ですけど」「が」 có thể mở đầu phần sửa hoặc đối lập. Ý phía sau thường quan trọng; hãy nghe trọn ý và kiểm tra xem câu hỏi nhắm đến người đàn ông hay phụ nữ.',
        tone: 'warning',
      },
      {
        type: 'callout',
        title: 'Ai nói nhiều hơn không phải quy tắc tuyệt đối',
        text: 'Một gợi ý để chuẩn bị là người nói nhiều hơn có thể là người được hỏi; hãy quyết định theo câu hỏi thực tế và nội dung phát ngôn.',
        tone: 'tip',
      },
      { type: 'media', title: 'Video hướng dẫn Mondai 3', youtubeId: 'JJRlms71nY0' },
    ],
  },
  {
    id: 'mondai4-doi-chieu-tinh-huong-va-hoi-dap',
    title: 'Mondai 4: nhận ra nhu cầu để chọn phản hồi phù hợp',
    summary: 'Nghe xem người nói muốn nhờ, muốn tự làm hay đang gặp tình huống cần được đề xuất giúp đỡ.',
    minutes: 7,
    sourceSlides: refs([33, 34, 35, 36]),
    blocks: [
      {
        type: 'text',
        title: 'Nghe ý định trước khi chọn câu đáp',
        paragraphs: [
          'Bảng dưới đây ghép tình huống với mẫu câu đáp: lời nhờ người khác làm, mong muốn tự làm/được phép làm, và đề nghị hỗ trợ khi người kia có vẻ gặp khó khăn.',
          'Coi mẫu câu là tín hiệu để đoán chức năng giao tiếp. Sau đó kiểm tra ngôi xưng, mức độ lịch sự và nội dung cụ thể để chọn câu đáp tự nhiên.',
        ],
      },
      {
        type: 'table',
        title: 'Tình huống và cách đáp thường gặp',
        headers: ['Tình huống được nêu', 'Mẫu câu đáp trong tài liệu', 'Cách hiểu khi nghe'],
        rows: [
          ['～てもらいたい・～てほしい (muốn người khác làm)', '～てください・～てくれない？・～ていただけませんか・～んですが…', 'Lời nhờ vả; nghe xem người nói đang yêu cầu ai làm gì.'],
          ['～たい・～ほしい (muốn làm / muốn có)', '～てもいいですか・～させてもらえませんか・～させていただけませんか', 'Xin phép hoặc đề nghị được thực hiện hành động.'],
          ['～ています・～大変そうです・～そうです・～ようです', '～ましょうか・～ようか', 'Đề nghị giúp đỡ hoặc cùng làm; xác nhận câu nói có thật sự là lời đề nghị.'],
        ],
      },
      {
        type: 'steps',
        title: 'Cách ghép tình huống với lựa chọn',
        items: [
          { title: 'Tóm tắt nhu cầu', text: 'Người nói muốn ai làm gì, muốn tự làm gì, hay đang mô tả vấn đề?' },
          { title: 'Nhận ra chức năng', text: 'Phân biệt lời nhờ, xin phép, đề nghị giúp và câu trả lời chấp thuận/từ chối.' },
          { title: 'Loại câu không cùng chức năng', text: 'Đáp án có thể chứa từ khóa giống nhau nhưng không phản hồi đúng nhu cầu; đối chiếu ý nghĩa toàn câu.' },
        ],
      },
      { type: 'media', title: 'Video hướng dẫn Mondai 4', youtubeId: 'hpDmVdulb0Y' },
    ],
  },
  {
    id: 'mondai5-phan-xa-va-cau-dap-phu-hop',
    title: 'Mondai 5: phản xạ theo chức năng câu nói',
    summary: 'Nhận ra lời chào, lời mời, câu hỏi hoặc yêu cầu rồi chọn phản hồi đúng mạch hội thoại.',
    minutes: 9,
    sourceSlides: refs([37, 38, 39, 40, 41, 42, 43, 44, 45]),
    blocks: [
      {
        type: 'table',
        title: 'Các cặp câu mở đầu và phản hồi cố định',
        headers: ['Câu mở đầu', 'Phản hồi minh họa'],
        rows: [
          ['ただいま', 'お帰りなさい'],
          ['お先に失礼します', 'お疲れ様でした'],
          ['お元気ですか', 'おかげさまで'],
          ['お世話になりました', 'いいえ、こちらこそ。'],
          ['ちょっとよろしいでしょうか（ですか）', '何ですか'],
          ['～てもいいですか・～てもよろしいでしょうか', 'かまいません・どうぞ'],
          ['ご無沙汰しております', '本当に久しぶりですね・しばらくですね'],
          ['どうぞ召し上がってください', 'いただきます'],
          ['ご遠慮ください', 'すみません'],
        ],
      },
      {
        type: 'steps',
        title: 'Chọn câu đáp trong hội thoại ngắn',
        items: [
          { title: 'Nhận dạng hành động lời nói', text: 'Câu vừa nghe là lời chào, hỏi thăm, xin phép, mời, nhờ vả hay hỏi thông tin?' },
          { title: 'Chờ đến hết lượt nói', text: 'Ngữ điệu và phần cuối câu có thể đổi câu hỏi thành lời đề nghị hoặc lời nhờ.' },
          { title: 'Loại hai kiểu nhiễu', text: 'Theo tài liệu, đáp án nhiễu có thể lặp lại dữ kiện trong câu hỏi hoặc trả lời không liên quan. Hãy ưu tiên lựa chọn đáp đúng nội dung và sắc thái, không chỉ trùng từ.' },
        ],
      },
      {
        type: 'examples',
        title: 'Từ hỏi thường cần một thông tin cụ thể',
        items: [
          { jp: 'だれ・なん・いつ・どこ・どちら', vi: 'Ai / cái gì / khi nào / ở đâu / cái nào hoặc hướng nào', analysis: 'Trả lời đúng loại thông tin mà từ hỏi yêu cầu; câu lặp lại sự việc trong câu hỏi chưa chắc đã trả lời.' },
        ],
      },
      {
        type: 'exercise',
        prompt: '「明日から休みが一週間取れるとしたらどうする。」— Nếu từ ngày mai có thể nghỉ một tuần, bạn sẽ làm gì? Chọn câu đáp phù hợp với câu hỏi giả định.',
        choices: [
          'じゃ、ゆっくり休んでね。',
          '休み、一週間になったの。やった。',
          'うーん、家の中片づけたいなあ。',
        ],
        evidence: 'Câu hỏi và ba lựa chọn thuộc ví dụ JLPT 12/2019; ghi chú trong hình không đánh dấu đáp án đúng rõ ràng.',
        selfCheck: true,
      },
      {
        type: 'exercise',
        prompt: '「この間頼んだ書類、できてる。」— Tài liệu tôi nhờ hôm trước, làm xong chưa? Chọn câu phản hồi phù hợp.',
        choices: [
          'もうできたんですか。',
          'すみません、いまやっています。',
          'そこに置いといてください。',
        ],
        answerIndex: 1,
        explanation: 'Câu hỏi kiểm tra tài liệu đã hoàn thành chưa; lựa chọn 2 báo rằng người nói đang làm. Hai lựa chọn còn lại không trả lời trực tiếp tình trạng công việc.',
        evidence: 'Hình ghi chú khoanh lựa chọn 2 và đánh dấu X ở lựa chọn 1 và 3.',
      },
      {
        type: 'exercise',
        prompt: '「風邪、どう？治った。」— Cảm cúm thế nào rồi, khỏi chưa? Chọn phản hồi trực tiếp nhất.',
        choices: [
          'そう、お大事に。',
          'まだ調子、悪くて。',
          '風邪、引いちゃった。',
        ],
        evidence: 'Các lựa chọn được chép từ phần bài tập. Ghi chú có khoanh từ khóa 風邪 trong câu hỏi và một lựa chọn, nhưng không xác nhận đáp án đúng rõ ràng.',
        selfCheck: true,
      },
      { type: 'media', title: 'Video hướng dẫn Mondai 5', youtubeId: 'fsMKZ-wTVf4' },
    ],
  },
];

export const n3ListeningCoverage: ExamTipsSlideCoverage[] = [
  { deck: 'listening-tips', slide: 1, disposition: 'cover', note: 'Slide chỉ ghi liên kết YouTube; tiêu đề/nội dung video không đủ rõ để gắn vào một bài học.' },
  { deck: 'listening-tips', slide: 2, disposition: 'cover', note: 'Mục lục của bộ slide.' },
  ...coverage('mondai1-nam-yeu-cau-va-trinh-tu', [3], 'converted'),
  ...coverage('mondai1-nam-yeu-cau-va-trinh-tu', [4, 5, 6]),
  { deck: 'listening-tips', slide: 7, disposition: 'cover', note: 'Trang chia phần Mondai 1.' },
  ...coverage('mondai1-nam-yeu-cau-va-trinh-tu', [8, 9, 10, 11], 'converted'),
  { deck: 'listening-tips', slide: 12, disposition: 'reference', note: 'Biểu đồ ghi rõ thống kê đề JLPT N2 giai đoạn 2010–2022; không dùng làm tần suất cho N3.' },
  ...coverage('mondai1-nam-yeu-cau-va-trinh-tu', [13]),
  ...coverage('mondai1-dau-hieu-y-dinh-va-thoi-gian', [14], 'converted'),
  ...coverage('mondai1-dau-hieu-y-dinh-va-thoi-gian', [15, 16, 17, 18, 19, 20, 21, 22, 23, 24]),
  ...coverage('mondai3-doi-thoai-va-doc-thoai', [25], 'converted'),
  ...coverage('mondai3-doi-thoai-va-doc-thoai', [26, 27, 28, 29, 30, 31, 32]),
  ...coverage('mondai4-doi-chieu-tinh-huong-va-hoi-dap', [33, 34, 35, 36], 'converted'),
  ...coverage('mondai5-phan-xa-va-cau-dap-phu-hop', [37], 'converted'),
  ...coverage('mondai5-phan-xa-va-cau-dap-phu-hop', [38, 39, 40, 41, 42, 43, 44, 45]),
];
