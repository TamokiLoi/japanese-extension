import type { Screen } from "../popup/App.tsx";
import { Home, BookMarked, Library, BookOpenText, PenSquare, GraduationCap, HelpCircle, BarChart3, Search, Info, RotateCcw, Headphones } from "lucide-react";

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
  { screen: "listening", label: "Luyện nghe (Beta)", icon: Headphones },
  { screen: "quizBook", label: "Luyện đề", icon: GraduationCap },
  { screen: "quiz", label: "Quiz", icon: HelpCircle },
  { screen: "review", label: "Ôn tập", icon: RotateCcw },
  { screen: "stats", label: "Thống kê", icon: BarChart3 },
  { screen: "guide", label: "Hướng dẫn", icon: Info },
];

// The 4 most-used destinations, shown in the mobile bottom bar -- the rest
// (plus these same 4 again) live in the hamburger drawer.
export const BOTTOM_NAV_SCREENS: Screen[] = ["menu", "vocab", "bunpo", "quiz"];

// Groups the sidebar/drawer nav into labeled sections (per
// UI_REVIEW_V2.md §11) so 9 destinations don't read as one flat, equally
// weighted list. "Trang chủ" stays ungrouped/first since it's not a content
// category. Screen membership only -- label/icon still comes from NAV_ITEMS.
export interface NavGroup {
  label?: string;
  screens: Screen[];
}

export const NAV_GROUPS: NavGroup[] = [
  { screens: ["menu", "search"] },
  { label: "Học", screens: ["kanji", "vocab", "bunpo", "reading", "listening"] },
  { label: "Luyện thi", screens: ["quizBook", "quiz", "review"] },
  { label: "Công cụ", screens: ["stats", "guide"] },
];
