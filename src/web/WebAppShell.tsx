import { useEffect, useState } from "react";
import { Menu, X, ArrowUp } from "lucide-react";
import type { Screen } from "../popup/App.tsx";
import { NAV_ITEMS, NAV_GROUPS, BOTTOM_NAV_SCREENS } from "./navItems.ts";

function SidebarFooter() {
  return (
    <div className="mt-auto pt-4 text-xs text-neutral-400">
      <span>
        ©2026 Tamoki Nguyen -{" "}
        <a href="tel:0938947221" className="hover:text-rose-600">
          0938.947.221
        </a>
      </span>
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

function ScrollToTopButton() {
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
      className="fixed right-4 bottom-20 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-white text-neutral-500 shadow-lg ring-1 ring-neutral-200 hover:text-rose-600 md:right-6 md:bottom-6"
    >
      <ArrowUp size={18} />
    </button>
  );
}

export function WebAppShell({
  active,
  onNavigate,
  children,
}: {
  active: Screen;
  onNavigate: (screen: Screen) => void;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  function go(screen: Screen) {
    onNavigate(screen);
    setDrawerOpen(false);
  }

  return (
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
          <div className="absolute inset-y-0 left-0 flex w-64 flex-col bg-white p-4 shadow-xl">
            <div className="mb-5 flex items-center justify-between px-2">
              <BrandLink onClick={() => go("menu")} />
              <button className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100" onClick={() => setDrawerOpen(false)}>
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
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-3 py-2 md:hidden">
          <button className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100" onClick={() => setDrawerOpen(true)}>
            <Menu size={22} />
          </button>
          <button onClick={() => go("menu")} className="flex items-center gap-2">
            <img src={`${import.meta.env.BASE_URL}icons/icon48.png`} alt="" className="h-6 w-6 rounded-md" />
            <span className="font-bold text-rose-600">Nihongo Nin</span>
          </button>
        </header>

        <main className="flex-1 pb-16 md:px-6 md:py-4">
          <div className="md:rounded-2xl md:border md:border-neutral-200/50 md:bg-white md:shadow-sm">{children}</div>
        </main>

        {/* Mobile bottom nav */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-200 bg-white md:hidden">
          {BOTTOM_NAV_SCREENS.map((screen) => {
            const item = NAV_ITEMS.find((i) => i.screen === screen)!;
            const Icon = item.icon;
            const isActive = active === screen;
            return (
              <button
                key={screen}
                onClick={() => go(screen)}
                className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  isActive ? "text-rose-600" : "text-neutral-500"
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.4 : 2} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <ScrollToTopButton />
      </div>
    </div>
  );
}
