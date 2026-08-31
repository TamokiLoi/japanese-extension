import { Search, BookMarked, BookOpenText, GraduationCap, HelpCircle, RotateCcw, BarChart3, Filter } from "lucide-react";
import { PageHeader } from "../components/PageHeader.tsx";
import { Card } from "../components/ui/card.tsx";

interface GuideItem {
  icon: typeof Search;
  title: string;
  points: string[];
}

const GUIDE_SECTIONS: GuideItem[] = [
  {
    icon: Search,
    title: "Tra cứu",
    points: [
      "Gõ chữ Hán, từ, Hán Việt, hoặc nghĩa tiếng Việt để tìm nhanh trong cả Kanji, Từ vựng và Ngữ pháp.",
      "Bấm vào các nhãn Kanji/Từ vựng/Ngữ pháp phía trên ô tìm để giới hạn chỉ tìm trong 1 loại.",
    ],
  },
  {
    icon: BookMarked,
    title: "Kanji / Từ vựng / Ngữ pháp",
    points: [
      "Bấm nút Bộ lọc để chọn cấp độ, nguồn tài liệu... — mặc định ẩn đi để nội dung học hiện ngay, không cần cuộn.",
      "Các thẻ đang lọc hiện thành nhãn nhỏ ngay dưới thanh công cụ — bấm dấu × trên nhãn để bỏ lọc nhanh.",
      "Ngẫu nhiên: xáo trộn thứ tự thẻ. Trước/Tiếp: duyệt tuần tự. Bấm 'Đánh dấu đã thuộc' hoặc cờ (khó) để ghi nhận tiến độ.",
    ],
  },
  {
    icon: BookOpenText,
    title: "Luyện đọc",
    points: [
      "Danh sách bài đọc hiện đủ tiêu đề/nguồn/độ dài/trạng thái để chọn nhanh, không cần mở từng bài mới biết nội dung.",
      "Trong bài đọc có thể bật/tắt furigana và xem bản dịch tiếng Việt.",
    ],
  },
  {
    icon: GraduationCap,
    title: "Luyện đề",
    points: [
      "Câu hỏi trích từ đề thi/sách luyện thi thật, chia theo dạng (Chữ Hán, Từ vựng, Ngữ pháp).",
      "Chọn số câu rồi bấm Bắt đầu để làm theo phiên ngẫu nhiên, hoặc bấm thẳng vào 1 câu trong danh sách để làm riêng câu đó.",
    ],
  },
  {
    icon: HelpCircle,
    title: "Quiz",
    points: [
      "Trắc nghiệm tùy chỉnh: chọn nội dung (Kanji/Từ vựng/Ngữ pháp), dạng câu hỏi, số câu, phạm vi theo bộ lọc hiện tại.",
      "Bấm vào ô tóm tắt phía trên câu hỏi để mở lưới xem nhanh câu nào đã làm/đúng/sai và nhảy tới câu bất kỳ.",
    ],
  },
  {
    icon: RotateCcw,
    title: "Ôn tập",
    points: [
      "Gộp toàn bộ thẻ đến hạn ôn lại (Kanji + Từ vựng + Ngữ pháp) vào 1 phiên duy nhất, truy cập từ nút ở Trang chủ.",
      "Kanji/Từ vựng: gõ đáp án (không cần gõ dấu vẫn được chấm đúng). Ngữ pháp: bấm 'Hiện đáp án' rồi tự đánh giá Nhớ đúng/Chưa nhớ.",
      "Trả lời đúng sẽ đẩy lịch ôn tiếp theo ra xa hơn; trả lời sai/chưa nhớ sẽ đưa thẻ về lại trạng thái cần học.",
    ],
  },
  {
    icon: BarChart3,
    title: "Thống kê",
    points: [
      "Xem tổng quan Đã thuộc/Đang học/Cần ôn lại/Chưa học theo Kanji hoặc Từ vựng, và tiến độ theo từng cấp độ/nguồn.",
      "Bấm vào 1 ô tổng quan (vd 'Cần ôn lại') để lọc danh sách bên dưới chỉ hiện đúng nhóm đó.",
    ],
  },
];

export function GuideScreen() {
  return (
    <div className="mx-auto max-w-4xl px-2.5 py-2 md:px-8 md:py-6">
      <PageHeader title="Hướng dẫn" subtitle="Cách dùng nhanh từng phần của Nihongo Nin" />

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
        <Filter size={16} className="mt-0.5 shrink-0" />
        <div>
          Hầu hết các màn duyệt nội dung đều theo cùng 1 kiểu: <b>tiêu đề → thanh công cụ (Bộ lọc/Sắp xếp) → nội dung</b>.
          Bộ lọc luôn ẩn mặc định để bạn thấy bài học ngay, chỉ mở ra khi cần đổi phạm vi.
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {GUIDE_SECTIONS.map(({ icon: Icon, title, points }) => (
          <Card key={title} className="gap-2 p-5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                <Icon size={17} />
              </span>
              <h2 className="font-semibold text-neutral-800">{title}</h2>
            </div>
            <ul className="ml-1 list-disc space-y-1.5 pl-4 text-sm text-neutral-600">
              {points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
