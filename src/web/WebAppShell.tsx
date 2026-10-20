import { createContext, useContext, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Menu, X, ArrowUp, ArrowLeft, ChevronDown, Search, PanelLeftClose, PanelLeftOpen, Check, Monitor, Moon, Sun } from "lucide-react";
import type { Screen } from "../popup/App.tsx";
import { NAV_ITEMS, NAV_GROUPS } from "./navItems.ts";
import type { ThemeMode } from "./lib/themeSettings.ts";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "nihongo-sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

const FLOATING_BUTTON_BOTTOMS = ["bottom-36", "bottom-48", "bottom-60"] as const;
type FloatingButtonBottom = (typeof FLOATING_BUTTON_BOTTOMS)[number];
function getFloatingButtonBottom(index: number): FloatingButtonBottom {
  return FLOATING_BUTTON_BOTTOMS[Math.min(Math.max(index, 0), FLOATING_BUTTON_BOTTOMS.length - 1)]!;
}
type FloatingNavState = { present: boolean; visible: boolean };
type FloatingNavContextValue = {
  setState: Dispatch<SetStateAction<FloatingNavState>>;
  scrollToTopVisible: boolean;
};

const FloatingNavContext = createContext<FloatingNavContextValue>({
  setState: () => {},
  scrollToTopVisible: false,
});

export function useFloatingNav(present: boolean, visible = present): FloatingButtonBottom {
  const { setState, scrollToTopVisible } = useContext(FloatingNavContext);
  useEffect(() => {
    setState((current) => ({ ...current, present }));
    return () => setState((current) => ({ ...current, present: false, visible: false }));
  }, [present, setState]);
  useEffect(() => {
    setState((current) => ({ ...current, visible: present && visible }));
  }, [present, visible, setState]);
  return getFloatingButtonBottom(Number(scrollToTopVisible));
}

function SidebarFooter({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className={`${mobile ? "mt-auto pt-4" : "border-t border-neutral-200 pt-3 dark:border-[#374151]"} flex flex-col gap-1 text-xs text-neutral-400`}>
      <span>
        ©2026 Tamoki Nguyen -{" "}
        <a href="tel:0938947221" className="hover:text-rose-600">
          0938.947.221
        </a>
      </span>
    </div>
  );
}

function BrandLink({ onClick, className, compact = false }: { onClick: () => void; className?: string; compact?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label="Nihongo Nin - Trang chủ"
      title={compact ? "Nihongo Nin - Trang chủ" : undefined}
      className={`flex items-center text-left ${compact ? "justify-center" : "gap-2.5"} ${className ?? ""}`}
    >
      <img src={`${import.meta.env.BASE_URL}icons/icon48.png`} alt="" className="h-11 w-11 shrink-0 rounded-lg" />
      <div className={compact ? "hidden" : undefined}>
        <div className="text-lg leading-tight font-bold text-rose-600 dark:text-[#c3e2ff]">Nihongo Nin</div>
        <div className="text-xs text-neutral-400">忍耐で、着実に。</div>
      </div>
    </button>
  );
}

function NavLink({
  item,
  active,
  onClick,
  collapsed = false,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onClick: () => void;
  collapsed?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      aria-label={item.label}
      title={collapsed ? item.label : undefined}
      className={`flex w-full items-center rounded-xl py-1.5 text-sm font-medium transition-colors ${collapsed ? "justify-center px-2" : "gap-3 px-3"} ${
        active ? "bg-rose-50 text-rose-600 dark:bg-[#203548] dark:text-[#7dd3fc]" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.4 : 2} />
      {!collapsed ? item.label : null}
    </button>
  );
}

function GroupedNav({ active, onNavigate, collapsed = false }: { active: Screen; onNavigate: (screen: Screen) => void; collapsed?: boolean }) {
  const activeGroupLabel = NAV_GROUPS.find((group) => group.label && group.screens.includes(active))?.label;
  const [openGroups, setOpenGroups] = useState<string[]>(() => (activeGroupLabel ? [activeGroupLabel] : []));

  useEffect(() => {
    if (!activeGroupLabel) return;
    setOpenGroups((current) => (current.includes(activeGroupLabel) ? current : [...current, activeGroupLabel]));
  }, [activeGroupLabel]);

  function toggleGroup(label: string) {
    setOpenGroups((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    );
  }

  return (
    <nav className="flex flex-col gap-1.5">
      {NAV_GROUPS.map((group, i) => {
        const expanded = collapsed ? true : group.label ? openGroups.includes(group.label) : true;
        const containsActive = group.screens.includes(active);
        return (
          <div key={group.label ?? `group-${i}`} className={`flex flex-col ${collapsed ? "gap-1" : "gap-0.5"}`}>
            {group.label && !collapsed ? (
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => toggleGroup(group.label!)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-[11px] font-bold tracking-wide uppercase transition-colors hover:bg-neutral-100 ${
                  containsActive ? "text-rose-600 dark:text-[#7dd3fc]" : "text-neutral-400"
                }`}
              >
                <span>{group.label}</span>
                <ChevronDown size={14} className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
            ) : null}
            {expanded
              ? group.screens.map((screen) => {
                  const item = NAV_ITEMS.find((navItem) => navItem.screen === screen)!;
                  return <NavLink key={item.screen} item={item} active={active === item.screen} onClick={() => onNavigate(item.screen)} collapsed={collapsed} />;
                })
              : null}
          </div>
        );
      })}
    </nav>
  );
}

const THEME_OPTIONS: { value: ThemeMode; label: string; Icon: typeof Monitor }[] = [
  { value: "system", label: "Theo hệ thống", Icon: Monitor },
  { value: "light", label: "Sáng", Icon: Sun },
  { value: "dark", label: "Tối", Icon: Moon },
];

function ThemeModeMenuButton({ themeMode, onThemeModeChange, compact = false, placement = "below" }: {
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  compact?: boolean;
  placement?: "below" | "above" | "right";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = THEME_OPTIONS.find((option) => option.value === themeMode) ?? THEME_OPTIONS[0]!;
  const SelectedIcon = selected.Icon;

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={`Giao diện: ${selected.label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={`Giao diện: ${selected.label}`}
        onClick={() => setOpen((current) => !current)}
        className={`flex items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-[#374151] dark:bg-[#1f2937] dark:text-[#93c5fd] dark:hover:bg-[#273449] ${compact ? "h-8 w-8" : "h-10 px-3 text-sm font-medium"}`}
      >
        <SelectedIcon size={compact ? 15 : 18} />
        {!compact ? <><span>{selected.label}</span><ChevronDown size={14} /></> : null}
      </button>
      {open ? (
        <div role="menu" aria-label="Chọn giao diện" className={`absolute z-50 w-40 rounded-lg border border-neutral-200 bg-white p-1 shadow-xl dark:border-[#374151] dark:bg-[#1f2937] ${placement === "above" ? "right-0 bottom-full mb-1.5" : placement === "right" ? "left-full bottom-0 ml-1.5" : "right-0 top-full mt-2"}`}>
          {THEME_OPTIONS.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={themeMode === value}
              onClick={() => { onThemeModeChange(value); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${themeMode === value ? "bg-rose-50 text-rose-700 dark:bg-[#203548] dark:text-[#7dd3fc]" : "text-neutral-700 hover:bg-neutral-100 dark:text-[#cbd5e1] dark:hover:bg-[#273449]"}`}
            >
              <Icon size={14} />
              <span className="flex-1">{label}</span>
              {themeMode === value ? <Check size={14} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FloatingSearchButton({ mobileBottom, onClick }: { mobileBottom: FloatingButtonBottom; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="Mở Tra cứu nhanh"
      title="Mở Tra cứu nhanh"
      className={`fixed right-4 z-20 floating-action-button bg-white text-neutral-500 shadow-lg ring-1 ring-neutral-200 hover:text-rose-600 md:right-6 md:bottom-6 ${mobileBottom}`}
    >
      <Search size={18} className="h-4 w-4 md:h-[18px] md:w-[18px]" />
    </button>
  );
}

function ScrollToTopButton({ searchPopupEnabled, onVisibilityChange }: { searchPopupEnabled: boolean; onVisibilityChange: (visible: boolean) => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      const nextVisible = window.scrollY > 400;
      setVisible(nextVisible);
      onVisibilityChange(nextVisible);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onVisibilityChange]);

  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Lên đầu trang"
      title="Lên đầu trang"
      className={`fixed right-4 z-20 floating-action-button bg-white text-neutral-500 shadow-lg ring-1 ring-neutral-200 hover:text-rose-600 md:right-6 ${searchPopupEnabled ? "md:bottom-20" : "md:bottom-6"} bottom-36`}
    >
      <ArrowUp size={18} className="h-4 w-4 md:h-[18px] md:w-[18px]" />
    </button>
  );
}

// Sits one mobile stack slot above the screen's own floating "Trước" button.
// Only rendered alongside that prev/next pair; other screens use breadcrumbs.
function FloatingBackButton({ label, onClick, mobileBottom }: { label: string; onClick: () => void; mobileBottom: FloatingButtonBottom }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Quay lại ${label}`}
      title={`Quay lại ${label}`}
      className={`fixed ${mobileBottom} left-4 z-20 floating-action-button bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden`}
    >
      <ArrowLeft size={16} />
    </button>
  );
}

export function WebAppShell({
  active,
  onNavigate,
  returnTo,
  onGoBack,
  bottomNavShortcuts,
  searchPopupEnabled,
  themeMode,
  onThemeModeChange,
  children,
}: {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  returnTo: { screen: Screen; targetId?: string } | null;
  onGoBack: () => void;
  bottomNavShortcuts: Screen[];
  searchPopupEnabled: boolean;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [floatingNavState, setFloatingNavState] = useState<FloatingNavState>({ present: false, visible: false });
  const [scrollToTopVisible, setScrollToTopVisible] = useState(false);
  const searchBottom = getFloatingButtonBottom(Number(scrollToTopVisible) + Number(floatingNavState.visible));
  const backBottom = getFloatingButtonBottom(1 + Number(scrollToTopVisible));

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(sidebarCollapsed)); } catch { /* Ignore unavailable storage. */ }
  }, [sidebarCollapsed]);

  function go(screen: Screen) {
    onNavigate(screen);
    setDrawerOpen(false);
  }

  return (
    <FloatingNavContext.Provider value={{ setState: setFloatingNavState, scrollToTopVisible }}>
      <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
        {/* Desktop sidebar */}
        <aside className={`hidden shrink-0 border-r border-neutral-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:flex-col dark:border-[#374151] dark:bg-[#111827] ${sidebarCollapsed ? "w-[4.5rem] gap-4 p-2 pt-4" : "w-60 p-4 pt-6"}`}>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <BrandLink onClick={() => go("menu")} compact={sidebarCollapsed} className={sidebarCollapsed ? "mb-1 w-full" : "mb-5 px-2"} />
            <GroupedNav active={active} onNavigate={go} collapsed={sidebarCollapsed} />
          </div>
          <div className="shrink-0">
            <div className={`mb-2 ${sidebarCollapsed ? "flex flex-col items-center gap-1" : "flex items-center gap-2"}`}>
              {!sidebarCollapsed ? (
                <button
                  type="button"
                  aria-label="Thu gọn sidebar"
                  title="Thu gọn sidebar"
                  onClick={() => setSidebarCollapsed(true)}
                  className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-[#cbd5e1] dark:hover:bg-[#273449] dark:hover:text-[#f9fafb]"
                >
                  <PanelLeftClose size={15} className="shrink-0" />
                  <span className="truncate">Thu gọn sidebar</span>
                </button>
              ) : null}
              <ThemeModeMenuButton themeMode={themeMode} onThemeModeChange={onThemeModeChange} compact placement={sidebarCollapsed ? "right" : "above"} />
              {sidebarCollapsed ? (
                <button
                  type="button"
                  aria-label="Mở rộng sidebar"
                  title="Mở rộng sidebar"
                  onClick={() => setSidebarCollapsed(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-[#cbd5e1] dark:hover:bg-[#273449] dark:hover:text-[#f9fafb]"
                >
                  <PanelLeftOpen size={15} />
                </button>
              ) : null}
            </div>
            {!sidebarCollapsed ? <SidebarFooter /> : null}
          </div>
        </aside>

        {/* Mobile drawer overlay */}
        {drawerOpen ? (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
            <div className="absolute inset-y-0 left-0 flex w-[88vw] max-w-80 flex-col overflow-y-auto bg-white p-4 shadow-xl">
              <div className="mb-5 flex items-center justify-between px-2">
                <BrandLink onClick={() => go("menu")} />
                <button
                  aria-label="Đóng menu"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-neutral-500 hover:bg-neutral-100"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X size={20} />
                </button>
              </div>
              <GroupedNav active={active} onNavigate={go} />
              <SidebarFooter mobile />
            </div>
          </div>
        ) : null}

        {/* min-w-0 overrides the flex default of min-width:auto -- without it,
            this column refuses to shrink below its widest descendant's
            content size (e.g. a filter-chip row), so on a narrow viewport the
            whole column silently grows past the sidebar's row instead of
            actually wrapping its own content down to fit. */}
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <header className="sticky top-0 z-30 grid h-14 grid-cols-[44px_minmax(0,1fr)_84px] items-center border-b border-neutral-200/80 bg-white/95 px-2 backdrop-blur dark:border-[#374151] dark:bg-[#111827]/95 md:hidden">
            <button
              aria-label="Mở menu"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={22} />
            </button>
            <div className={`truncate px-2 text-center ${active === "menu" ? "text-base font-bold text-rose-600 dark:text-[#c3e2ff]" : "text-sm font-semibold text-neutral-800 dark:text-[#e5e7eb]"}`}>
              {active === "menu" ? "Nihongo Nin" : (NAV_ITEMS.find((item) => item.screen === active)?.label ?? "Nihongo Nin")}
            </div>
            <div className="flex items-center justify-end gap-0.5">
              <ThemeModeMenuButton themeMode={themeMode} onThemeModeChange={onThemeModeChange} compact />
              <button aria-label="Về Trang chủ" onClick={() => go("menu")} className="flex h-9 w-9 items-center justify-center rounded-xl hover:bg-rose-50 dark:hover:bg-[#203548]">
                <img src={`${import.meta.env.BASE_URL}icons/icon48.png`} alt="" className="h-7 w-7 rounded-lg" />
              </button>
            </div>
          </header>

          <main className="flex-1 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:px-6 md:py-4">
            <div className="md:rounded-2xl md:border md:border-neutral-200/50 md:bg-white md:shadow-sm">{children}</div>
          </main>

          {/* Mobile bottom nav */}
          <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
            {(["menu", ...bottomNavShortcuts, "search"] as Screen[]).map((screen) => {
              const item = NAV_ITEMS.find((i) => i.screen === screen)!;
              const Icon = item.icon;
              const isActive = active === screen;
              return (
                <button
                  key={screen}
                  onClick={() => go(screen)}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-w-0 flex-col items-center gap-0.5 py-1.5 text-[10px] font-medium ${
                    isActive ? "text-rose-600 dark:text-[#7dd3fc]" : "text-neutral-500"
                  }`}
                >
                  <span className={`flex h-7 min-w-11 items-center justify-center rounded-full px-3 ${isActive ? "bg-rose-100 dark:bg-[#203548]" : ""}`}>
                    <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span className="max-w-full truncate px-0.5">{screen === "listening" ? "Nghe" : item.label}</span>
                </button>
              );
            })}
          </nav>

          {returnTo && floatingNavState.present ? (
            <FloatingBackButton
              mobileBottom={backBottom}
              label={NAV_ITEMS.find((i) => i.screen === returnTo.screen)?.label ?? returnTo.screen}
              onClick={onGoBack}
            />
          ) : null}
          {searchPopupEnabled && active !== "search" ? (
            <FloatingSearchButton mobileBottom={searchBottom} onClick={() => go("search")} />
          ) : null}
          <ScrollToTopButton searchPopupEnabled={searchPopupEnabled} onVisibilityChange={setScrollToTopVisible} />
        </div>
      </div>
    </FloatingNavContext.Provider>
  );
}
