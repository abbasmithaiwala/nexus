/**
 * Toast — non-blocking error/info notifications.
 *
 * Usage:
 *   const { toasts, showToast } = useToast();
 *   showToast({ message: 'Something went wrong', type: 'error' });
 *   <ToastContainer toasts={toasts} onDismiss={dismissToast} />
 */

import { useCallback, useRef, useState } from 'react';
import { X, AlertCircle, Info, CheckCircle } from 'lucide-react';

export type ToastType = 'error' | 'info' | 'success';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timerRefs.current.get(id));
    timerRefs.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ message, type = 'info', durationMs = 5000 }: { message: string; type?: ToastType; durationMs?: number }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, type }]);

      if (durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timerRefs.current.set(id, timer);
      }
    },
    [dismiss],
  );

  return { toasts, showToast, dismiss };
}

// ── Components ────────────────────────────────────────────────────────────────

const ICONS: Record<ToastType, React.ReactNode> = {
  error: <AlertCircle size={16} className="shrink-0 text-red-400" />,
  info: <Info size={16} className="shrink-0 text-neutral-300" />,
  success: <CheckCircle size={16} className="shrink-0 text-green-400" />,
};

const BG: Record<ToastType, string> = {
  error: 'bg-red-950/90 border-red-900',
  info: 'bg-neutral-900/90 border-neutral-800',
  success: 'bg-green-950/90 border-green-900',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  return (
    <div
      className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border backdrop-blur-sm shadow-lg text-sm text-white max-w-sm w-full ${BG[toast.type]}`}
      role="alert"
    >
      {ICONS[toast.type]}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="shrink-0 text-neutral-500 hover:text-white transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
