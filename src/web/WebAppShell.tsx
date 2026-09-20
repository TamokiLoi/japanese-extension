import { createContext, useContext, useEffect, useState } from "react";
import { Menu, X, ArrowUp, ArrowLeft } from "lucide-react";
import type { Screen } from "../popup/App.tsx";
import { NAV_ITEMS, NAV_GROUPS } from "./navItems.ts";

// Screens with their own fixed bottom-36 prev/next buttons (Reading,
// Listening, Dictation, Quiz, DeThi) register here so ScrollToTopButton can
// move up to bottom-[150px] and avoid overlapping them.
const FloatingNavContext = createContext<(present: boolean) => void>(() => {});

export function useFloatingNav(present: boolean) {
  const setFloatingNavPresent = useContext(FloatingNavContext);
  useEffect(() => {
    setFloatingNavPresent(present);
    return () => setFloatingNavPresent(false);
  }, [present, setFloatingNavPresent]);
}

function SidebarFooter() {
  return (
    <div className="mt-auto flex flex-col gap-1 pt-4 text-xs text-neutral-400">
      <span>
        ©2026 Tamoki Nguyen -{" "}
        <a href="tel:0938947221" className="hover:text-rose-600">
          0938.947.221
        </a>
      </span>
      <a
        href="https://github.com/TamokiLoi/japanese-extension/blob/main/PRIVACY.md"
        target="_blank"
        rel="noreferrer"
        className="hover:text-rose-600"
      >
        Chính sách quyền riêng tư
      </a>
    </div>
  );
}

function BrandLink({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2.5 text-left ${className ?? ""}`}>
      <img src={`${import.meta.env.BASE_URL}icons/icon48.png`} alt="" className="h-11 w-11 shrink-0 rounded-lg" />
      <div>
        <div className="text-lg leading-tight font-bold text-rose-600">Nihongo Nin</div>
        <div className="text-xs text-neutral-400">忍耐で、着実に。</div>
      </div>
    </button>
  );
}

function NavLink({
  item,
  active,
  onClick,
}: {
  item: (typeof NAV_ITEMS)[number];
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-rose-50 text-rose-600" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.4 : 2} />
      {item.label}
    </button>
  );
}

function GroupedNav({ active, onNavigate }: { active: Screen; onNavigate: (screen: Screen) => void }) {
  return (
    <nav className="flex flex-col gap-2.5">
      {NAV_GROUPS.map((group, i) => (
        <div key={group.label ?? `group-${i}`} className="flex flex-col gap-0.5">
          {group.label ? (
            <div className="px-3 pb-0.5 text-[11px] font-semibold tracking-wide text-neutral-400 uppercase">{group.label}</div>
          ) : null}
          {group.screens.map((screen) => {
            const item = NAV_ITEMS.find((i) => i.screen === screen)!;
            return <NavLink key={item.screen} item={item} active={active === item.screen} onClick={() => onNavigate(item.screen)} />;
          })}
        </div>
      ))}
    </nav>
  );
}

function ScrollToTopButton({ floatingNavPresent }: { floatingNavPresent: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 400);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Lên đầu trang"
      title="Lên đầu trang"
      className={`fixed right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-500 shadow-lg ring-1 ring-neutral-200 hover:text-rose-600 md:right-6 md:bottom-6 ${
        floatingNavPresent ? "bottom-50" : "bottom-20"
      }`}
    >
      <ArrowUp size={18} />
    </button>
  );
}

// Sits directly above the screen's own floating "Trước" button (fixed
// left-4 bottom-36 -- 144px, 40px tall) with a small gap: 144+40+8=192px,
// exactly bottom-48. Only rendered alongside that prev/next pair (see
// floatingNavPresent below) -- on screens without one, the bottom nav and
// each screen's own in-page breadcrumb are already enough to not get lost.
function FloatingBackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`Quay lại ${label}`}
      title={`Quay lại ${label}`}
      className="fixed bottom-48 left-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-600 shadow-lg ring-1 ring-neutral-200 active:bg-neutral-50 md:hidden"
    >
      <ArrowLeft size={18} />
    </button>
  );
}

export function WebAppShell({
  active,
  onNavigate,
  returnTo,
  onGoBack,
  bottomNavShortcuts,
  children,
}: {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  returnTo: { screen: Screen; targetId?: string } | null;
  onGoBack: () => void;
  bottomNavShortcuts: Screen[];
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [floatingNavPresent, setFloatingNavPresent] = useState(false);

  function go(screen: Screen) {
    onNavigate(screen);
    setDrawerOpen(false);
  }

  return (
    <FloatingNavContext.Provider value={setFloatingNavPresent}>
      <div className="flex min-h-screen bg-neutral-50 text-neutral-900">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white p-4 pt-6 md:sticky md:top-0 md:flex md:h-screen md:flex-col md:overflow-y-auto">
          <BrandLink onClick={() => go("menu")} className="mb-5 px-2" />
          <GroupedNav active={active} onNavigate={go} />
          <SidebarFooter />
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
              <SidebarFooter />
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
          <header className="sticky top-0 z-30 grid h-14 grid-cols-[44px_1fr_44px] items-center border-b border-neutral-200/80 bg-white/95 px-2 backdrop-blur md:hidden">
            <button
              aria-label="Mở menu"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-600 hover:bg-neutral-100"
              onClick={() => setDrawerOpen(true)}
            >
              <Menu size={22} />
            </button>
            <div className="truncate px-2 text-center text-sm font-semibold text-neutral-800">
              {active === "menu" ? "Nihongo Nin" : (NAV_ITEMS.find((item) => item.screen === active)?.label ?? "Nihongo Nin")}
            </div>
            <button aria-label="Về Trang chủ" onClick={() => go("menu")} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-rose-50">
              <img src={`${import.meta.env.BASE_URL}icons/icon48.png`} alt="" className="h-7 w-7 rounded-lg" />
            </button>
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
                    isActive ? "text-rose-600" : "text-neutral-500"
                  }`}
                >
                  <span className={`flex h-7 min-w-11 items-center justify-center rounded-full px-3 ${isActive ? "bg-rose-100" : ""}`}>
                    <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                  </span>
                  <span className="max-w-full truncate px-0.5">{screen === "listening" ? "Nghe" : item.label}</span>
                </button>
              );
            })}
          </nav>

          {returnTo && floatingNavPresent ? (
            <FloatingBackButton
              label={NAV_ITEMS.find((i) => i.screen === returnTo.screen)?.label ?? returnTo.screen}
              onClick={onGoBack}
            />
          ) : null}
          <ScrollToTopButton floatingNavPresent={floatingNavPresent} />
        </div>
      </div>
    </FloatingNavContext.Provider>
  );
}
