import { Check, Settings } from "lucide-react";
import type { Screen } from "../../popup/App.tsx";
import { NAV_ITEMS } from "../navItems.ts";
import { BOTTOM_NAV_CHOICES } from "../lib/bottomNavSettings.ts";

export function SettingsScreen({
  shortcuts,
  onChange,
}: {
  shortcuts: Screen[];
  onChange: (shortcuts: Screen[]) => void;
}) {
  function changeSlot(index: number, screen: Screen) {
    const next = [...shortcuts];
    next[index] = screen;
    onChange(next);
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-3 md:px-8 md:py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-rose-100 text-rose-600">
          <Settings size={21} />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">Cài đặt</h1>
          <p className="text-sm text-neutral-500">Tùy chỉnh thanh điều hướng trên điện thoại</p>
        </div>
      </div>

      <section className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
        <h2 className="font-semibold text-neutral-800">Ba lối tắt ở giữa</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Trang chủ và Tra cứu luôn được giữ cố định ở hai đầu. Mỗi mục bên dưới phải khác nhau.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {shortcuts.map((selected, index) => {
            const selectedItem = NAV_ITEMS.find((item) => item.screen === selected)!;
            const Icon = selectedItem.icon;
            return (
              <label key={index} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                <span className="mb-2 flex items-center gap-2 text-xs font-semibold text-neutral-500">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-100 text-rose-600">
                    <Icon size={16} />
                  </span>
                  Vị trí {index + 1}
                </span>
                <select
                  value={selected}
                  onChange={(event) => changeSlot(index, event.target.value as Screen)}
                  className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-2.5 text-sm font-medium text-neutral-700 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                >
                  {BOTTOM_NAV_CHOICES.map((screen) => {
                    const item = NAV_ITEMS.find((navItem) => navItem.screen === screen)!;
                    return (
                      <option key={screen} value={screen} disabled={screen !== selected && shortcuts.includes(screen)}>
                        {item.label}
                      </option>
                    );
                  })}
                </select>
              </label>
            );
          })}
        </div>

        <div className="mt-4 flex items-center gap-2 text-sm text-emerald-600">
          <Check size={16} />
          Thay đổi được lưu tự động trên trình duyệt này.
        </div>
      </section>
    </div>
  );
}
