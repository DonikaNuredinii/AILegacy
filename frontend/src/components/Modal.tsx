// src/components/Modal.tsx
import { useEffect } from "react";

type ModalProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
};

export function Modal({ open, title, onClose, children, right }: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* overlay */}
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl border bg-white shadow-lg">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <div className="text-base font-semibold">{title}</div>
            <div className="flex items-center gap-2">
              {right}
              <button
                onClick={onClose}
                className="rounded-lg border px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>
          </div>

          <div className="px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  );
}