import type { Screen } from "../popup/App.tsx";
import {
  Home,
  BookMarked,
  Library,
  BookOpenText,
  PenSquare,
  GraduationCap,
  HelpCircle,
  BarChart3,
  Search,
  Info,
  RotateCcw,
  Headphones,
  ClipboardCheck,
  DatabaseBackup,
  Cpu,
  CalendarCheck,
  Podcast,
  Puzzle,
  Settings,
} from "lucide-react";

export interface NavItem {
  screen: Screen;
  label: string;
  icon: typeof Home;
}

// Mirrors MenuScreen.tsx's card list/labels 1:1 -- the sidebar/drawer is a
// second way to reach the same destinations, not a new taxonomy, so it
// should read as "the same app" rather than a relabeled one.
export const NAV_ITEMS: NavItem[] = [
  { screen: "menu", label: "Trang chủ", icon: Home },
  { screen: "search", label: "Tra cứu", icon: Search },
  { screen: "kanji", label: "Kanji", icon: BookMarked },
  { screen: "vocab", label: "Từ vựng", icon: Library },
  { screen: "bunpo", label: "Ngữ pháp", icon: PenSquare },
  { screen: "reading", label: "Luyện đọc", icon: BookOpenText },
  { screen: "listening", label: "Luyện nghe", icon: Headphones },
  { screen: "podcast", label: "Podcast", icon: Podcast },
  // "translationPractice" deliberately not listed here -- feature is on
  // hold pending reconsideration (see project-translation-practice-poc
  // memory), hide the nav entry without removing the screen/routing.
  { screen: "quizBook", label: "Luyện đề", icon: GraduationCap },
  { screen: "exams", label: "Đề thi JLPT", icon: ClipboardCheck },
  { screen: "roadmap", label: "Lộ trình N3", icon: CalendarCheck },
  { screen: "quiz", label: "Quiz", icon: HelpCircle },
  { screen: "matchGame", label: "Ghép cặp", icon: Puzzle },
  { screen: "review", label: "Ôn tập", icon: RotateCcw },
  { screen: "itBookVocab", label: "Từ vựng IT", icon: Cpu },
  { screen: "itBookLessons", label: "Bài học IT", icon: BookOpenText },
  { screen: "stats", label: "Thống kê", icon: BarChart3 },
  { screen: "backup", label: "Sao lưu dữ liệu", icon: DatabaseBackup },
  { screen: "guide", label: "Hướng dẫn", icon: Info },
  { screen: "settings", label: "Cài đặt", icon: Settings },
];

// Groups the sidebar/drawer nav into labeled sections (per
// UI_REVIEW_V2.md §11) so 9 destinations don't read as one flat, equally
// weighted list. "Trang chủ" stays ungrouped/first since it's not a content
// category. Screen membership only -- label/icon still comes from NAV_ITEMS.
export interface NavGroup {
  label?: string;
  screens: Screen[];
}

export const NAV_GROUPS: NavGroup[] = [
  { screens: ["menu", "search", "roadmap"] },
  { label: "Học", screens: ["kanji", "vocab", "bunpo", "reading", "listening", "podcast"] },
  { label: "Luyện thi", screens: ["quizBook", "exams", "quiz", "matchGame", "review"] },
  { label: "IT Book", screens: ["itBookLessons", "itBookVocab"] },
  { label: "Công cụ", screens: ["stats", "backup", "guide", "settings"] },
];
