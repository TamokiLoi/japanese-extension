import { useState } from "react";
import { Menu, X } from "lucide-react";
import type { Screen } from "../popup/App.tsx";
import { NAV_ITEMS, BOTTOM_NAV_SCREENS } from "./navItems.ts";

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
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? "bg-rose-50 text-rose-600" : "text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      <Icon size={18} strokeWidth={active ? 2.4 : 2} />
      {item.label}
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
      <aside className="hidden w-60 shrink-0 border-r border-neutral-200 bg-white p-4 md:flex md:flex-col">
        <div className="mb-6 px-2">
          <div className="text-lg font-bold text-rose-600">Nihongo Nin</div>
          <div className="text-xs text-neutral-400">日本語を学ぼう</div>
        </div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.screen} item={item} active={active === item.screen} onClick={() => go(item.screen)} />
          ))}
        </nav>
      </aside>

      {/* Mobile drawer overlay */}
      {drawerOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-white p-4 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <div>
                <div className="text-lg font-bold text-rose-600">Nihongo Nin</div>
                <div className="text-xs text-neutral-400">日本語を学ぼう</div>
              </div>
              <button className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100" onClick={() => setDrawerOpen(false)}>
                <X size={20} />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.screen} item={item} active={active === item.screen} onClick={() => go(item.screen)} />
              ))}
            </nav>
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
        <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 md:hidden">
          <button className="rounded-lg p-1.5 text-neutral-600 hover:bg-neutral-100" onClick={() => setDrawerOpen(true)}>
            <Menu size={22} />
          </button>
          <span className="font-bold text-rose-600">Nihongo Nin</span>
        </header>

        <main className="flex-1 pb-16 md:pb-0">{children}</main>

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
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-neutral-500"
          >
            <Menu size={20} />
            Thêm
          </button>
        </nav>
      </div>
    </div>
  );
}
