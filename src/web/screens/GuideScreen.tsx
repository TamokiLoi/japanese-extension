import {
  ArrowRight,
  BarChart3,
  BookMarked,
  BookOpenText,
  CalendarCheck,
  ClipboardCheck,
  DatabaseBackup,
  GraduationCap,
  Headphones,
  HelpCircle,
  Home,
  Info,
  Library,
  Newspaper,
  PenSquare,
  Podcast,
  Search,
  Settings,
  Sparkles,
  Puzzle,
  Cpu,
  type LucideIcon,
} from "lucide-react";
import type { Screen } from "../../popup/App.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.tsx";

interface GuideTopic {
  screen: Screen;
  title: string;
  icon: LucideIcon;
  summary: string;
  flow: string[];
  caveat?: string;
}

interface GuideTab {
  id: string;
  label: string;
  icon: LucideIcon;
  topics: GuideTopic[];
}

const GUIDE_TABS: GuideTab[] = [
  {
    id: "start",
    label: "Bắt đầu",
    icon: Home,
    topics: [
      { screen: "menu", title: "Trang chủ", icon: Home, summary: "Tiếp tục học, xem tiến độ và vào các phần thường dùng.", flow: ["Chọn một mục học", "Mở phần cần học", "Quay lại trang chủ xem tiến độ"] },
      { screen: "roadmap", title: "Lộ trình N3", icon: CalendarCheck, summary: "Chọn ngày thi để xem các giai đoạn ôn N3 theo thời gian còn lại.", flow: ["Nhập ngày thi", "Chọn nhiệm vụ đang học", "Mở đúng nguồn theo bộ lọc"], caveat: "Lộ trình hiện dùng các mốc thời gian và thứ tự tài liệu định sẵn; chưa tự điều chỉnh theo độ đúng của từng kỹ năng." },
      { screen: "search", title: "Tra cứu", icon: Search, summary: "Tìm Kanji, từ vựng và ngữ pháp bằng chữ Nhật, Hán Việt hoặc nghĩa tiếng Việt.", flow: ["Nhập từ cần tìm", "Chọn loại kết quả nếu muốn thu hẹp", "Mở thẻ để xem chi tiết"] },
    ],
  },
  {
    id: "study",
    label: "Học",
    icon: BookMarked,
    topics: [
      { screen: "kanji", title: "Kanji", icon: BookMarked, summary: "Học cách đọc, nghĩa và từ có chứa Kanji.", flow: ["Chọn cấp độ / nguồn", "Học thẻ hoặc trả lời quiz", "Đánh dấu đã thuộc hoặc cần ôn"] },
      { screen: "vocab", title: "Từ vựng", icon: Library, summary: "Học từ theo bộ, cấp độ và trạng thái hiện tại.", flow: ["Lọc bộ từ", "Xem từ và nghĩa", "Luyện lại mục đã đánh dấu"] },
      { screen: "bunpo", title: "Ngữ pháp", icon: PenSquare, summary: "Xem nghĩa, cách dùng, ví dụ và các mẫu liên quan.", flow: ["Lọc mẫu ngữ pháp", "Đọc nghĩa / ví dụ", "Mở mẫu liên quan hoặc sơ đồ"] },
      { screen: "bunpoMap", title: "Sơ đồ ngữ pháp", icon: PenSquare, summary: "Duyệt các mẫu ngữ pháp theo nhóm liên quan.", flow: ["Chọn cấp độ", "Chọn nhóm trên sơ đồ", "Mở thẻ mẫu cần học"] },
    ],
  },
  {
    id: "read-listen",
    label: "Đọc & Nghe",
    icon: BookOpenText,
    topics: [
      { screen: "reading", title: "Luyện đọc", icon: BookOpenText, summary: "Đọc bài theo cấp độ, nguồn và dạng bài; làm các câu hỏi đi kèm.", flow: ["Chọn sách / đề / độ dài", "Đọc bài, bật furigana hoặc bản dịch", "Làm câu hỏi rồi xem tham khảo"] },
      { screen: "listening", title: "Luyện nghe", icon: Headphones, summary: "Nghe audio, chọn đáp án và xem transcript / dịch khi dữ liệu có.", flow: ["Chọn nguồn / dạng câu", "Nghe và trả lời", "Đối chiếu transcript và giải thích"] },
      { screen: "dictation", title: "Nghe chép chính tả", icon: Headphones, summary: "Nghe audio rồi gõ lại lời thoại để so sánh với transcript.", flow: ["Chọn câu", "Nghe và gõ", "Xem phần khớp / còn sai"], caveat: "Kết quả phụ thuộc transcript và cách chuẩn hóa kana, Kanji, dấu câu." },
    ],
  },
  {
    id: "practice",
    label: "Luyện thi",
    icon: GraduationCap,
    topics: [
      { screen: "quizBook", title: "Luyện đề", icon: GraduationCap, summary: "Luyện câu từ đề và sách theo nguồn, dạng và số lượng tùy chọn.", flow: ["Chọn nguồn / dạng câu", "Chọn số câu hoặc câu cụ thể", "Làm và xem đáp án"] },
      { screen: "exams", title: "Đề thi JLPT", icon: ClipboardCheck, summary: "Làm đề theo phần, lưu phiên và xem lại các lần đã thi.", flow: ["Chọn kỳ thi", "Làm và nộp từng phần", "Xem lịch sử, đáp án và tham khảo"], caveat: "Độ phủ đáp án / nghe khác nhau theo kỳ thi; đáp án tham khảo chưa đồng nghĩa đã xác minh chính thức." },
      { screen: "quiz", title: "Quiz", icon: HelpCircle, summary: "Tạo lượt trắc nghiệm từ Kanji, từ vựng hoặc ngữ pháp.", flow: ["Chọn nội dung và bộ lọc", "Bắt đầu quiz", "Mở lưới để xem lại câu"] },
      { screen: "matchGame", title: "Ghép cặp", icon: Puzzle, summary: "Ghép từ với nghĩa theo cấp độ và nguồn.", flow: ["Chọn cấp độ / nguồn", "Chạm các cặp tương ứng", "Tiếp tục hoặc chơi lượt khác"] },
    ],
  },
  {
    id: "it",
    label: "IT Book",
    icon: Cpu,
    topics: [
      { screen: "itBookLessons", title: "Bài học IT", icon: BookOpenText, summary: "Đọc bài và hội thoại tiếng Nhật trong ngữ cảnh công nghệ thông tin.", flow: ["Chọn bài", "Đọc văn bản hoặc ảnh trang gốc", "Làm câu hỏi của bài"] },
      { screen: "itBookVocab", title: "Từ vựng IT", icon: Cpu, summary: "Học từ chuyên ngành theo nội dung IT Book.", flow: ["Chọn bài / nhóm từ", "Xem nghĩa và cách đọc", "Ôn lại thẻ cần nhớ"] },
    ],
  },
  {
    id: "entertainment",
    label: "Giải trí",
    icon: Newspaper,
    topics: [
      { screen: "news", title: "Đọc báo", icon: Newspaper, summary: "Khu vực dành cho bài báo và bài đọc thời sự.", flow: ["Chọn chủ đề / cấp độ", "Đọc bài", "Xem bản dịch và câu hỏi"], caveat: "Kho bài hiện chưa có nội dung được xuất bản." },
      { screen: "aiStories", title: "Truyện AI", icon: Sparkles, summary: "Đọc truyện tiếng Nhật do AI biên soạn từ từ vựng và ngữ pháp trong app.", flow: ["Mở truyện theo chủ đề", "Đọc với furigana hoặc bản dịch", "Ôn từ vựng, ngữ pháp và câu hỏi"] },
      { screen: "podcast", title: "Podcast", icon: Podcast, summary: "Tìm và nghe podcast tiếng Nhật; lưu yêu thích và tiến độ nghe.", flow: ["Chọn kênh / cấp độ", "Mở tập và nghe", "Chuyển transcript hoặc từ vựng nếu tập có dữ liệu"], caveat: "Danh sách hiện bật Bitesize và Haruno. Transcript, bản dịch và tham khảo tùy từng tập." },
    ],
  },
  {
    id: "tools",
    label: "Công cụ",
    icon: Settings,
    topics: [
      { screen: "stats", title: "Thống kê", icon: BarChart3, summary: "Xem tiến độ theo nội dung, trạng thái, cấp độ và nguồn.", flow: ["Chọn nhóm thống kê", "Lọc mục cần xem", "Mở nội dung từ kết quả"] },
      { screen: "backup", title: "Sao lưu dữ liệu", icon: DatabaseBackup, summary: "Xuất hoặc khôi phục tiến độ học và cài đặt.", flow: ["Chọn JSON hoặc Google Drive", "Xuất bản sao", "Nhập lại khi cần chuyển hồ sơ / thiết bị"], caveat: "Drive là thao tác thủ công và cần cấu hình OAuth; sao lưu không bao gồm API key AI." },
      { screen: "settings", title: "Cài đặt", icon: Settings, summary: "Đổi lối tắt thanh điều hướng và cách mở Tra cứu; xem các góp ý dữ liệu trên thiết bị.", flow: ["Chọn cài đặt", "Thay đổi và lưu", "Quay lại phần học"] },
    ],
  },
];

function TopicCard({ topic, onNavigate }: { topic: GuideTopic; onNavigate: (screen: Screen) => void }) {
  const Icon = topic.icon;
  return (
    <article className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><Icon size={18} /></span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-neutral-800">{topic.title}</h3>
          <p className="mt-1 text-sm text-neutral-500">{topic.summary}</p>
        </div>
        <button type="button" onClick={() => onNavigate(topic.screen)} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:border-rose-200 hover:text-rose-600">
          Mở <ArrowRight size={13} />
        </button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
        {topic.flow.map((step, index) => (
          <span key={step} className="inline-flex items-center gap-2">
            <span className="rounded-lg bg-neutral-100 px-2.5 py-1.5 text-neutral-700"><span className="mr-1.5 font-semibold text-rose-600">{index + 1}</span>{step}</span>
            {index < topic.flow.length - 1 ? <ArrowRight size={13} className="text-neutral-300" aria-hidden="true" /> : null}
          </span>
        ))}
      </div>
      {topic.caveat ? <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">{topic.caveat}</p> : null}
    </article>
  );
}

export function GuideScreen({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
  return (
    <div className="mx-auto max-w-6xl px-2.5 py-2 md:px-8 md:py-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-rose-100 text-rose-600"><Info size={20} /></div>
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Hướng dẫn</h1>
          <p className="text-sm text-neutral-500">Chọn một mục để xem luồng sử dụng và mở thẳng phần học.</p>
        </div>
      </div>

      <Tabs defaultValue="start" className="mt-5">
        <TabsList className="!h-auto grid w-full grid-cols-2 gap-1 rounded-xl bg-neutral-100 p-1 sm:grid-cols-4 lg:grid-cols-7">
          {GUIDE_TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id} className="h-9 min-w-0 px-2 text-xs sm:text-sm"><Icon size={14} />{label}</TabsTrigger>
          ))}
        </TabsList>
        {GUIDE_TABS.map(({ id, label, topics }) => (
          <TabsContent key={id} value={id} className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-800">{label}</h2>
              <span className="text-xs text-neutral-400">{topics.length} mục</span>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {topics.map((topic) => <TopicCard key={topic.screen} topic={topic} onNavigate={onNavigate} />)}
            </div>
          </TabsContent>
        ))}
      </Tabs>

      <p className="mt-6 text-center text-xs text-neutral-400">
        Phần “Cách dùng” trong một số thẻ Ngữ pháp tham khảo từ{" "}
        <a href="https://hanabira.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-neutral-600">hanabira.org</a>
        {" "}(Creative Commons License), đã được dịch và biên tập lại.
      </p>
    </div>
  );
}
