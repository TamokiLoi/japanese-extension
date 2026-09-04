import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Button } from "./ui/button.tsx";

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn>(() => Promise.resolve(false));

// Drop-in async replacement for the browser's native confirm() -- which
// renders as a jarring native alert box, out of step with the rest of the
// app's design. Usage: `const confirm = useConfirm(); if (!(await
// confirm("..."))) return;` -- same call shape as before, just awaited.
export function useConfirm(): ConfirmFn {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<{ options: ConfirmOptions; resolve: (result: boolean) => void } | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    const normalized = typeof options === "string" ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setPending({ options: normalized, resolve });
    });
  }, []);

  function settle(result: boolean) {
    pending?.resolve(result);
    setPending(null);
  }

  useEffect(() => {
    if (!pending) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") settle(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={() => settle(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            {pending.options.title ? <h2 className="text-base font-bold text-neutral-800">{pending.options.title}</h2> : null}
            <p className="text-sm leading-relaxed text-neutral-600">{pending.options.message}</p>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => settle(false)}>
                {pending.options.cancelLabel ?? "Huỷ"}
              </Button>
              <Button className="flex-1" onClick={() => settle(true)}>
                {pending.options.confirmLabel ?? "Xác nhận"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}
