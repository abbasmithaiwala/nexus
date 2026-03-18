/**
 * Toast — non-blocking error/info notifications.
 *
 * Usage:
 *   const { toasts, showToast } = useToast();
 *   showToast({ message: 'Something went wrong', type: 'error' });
 *   <ToastContainer toasts={toasts} onDismiss={dismissToast} />
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

export type ToastType = 'error' | 'info' | 'success';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  /** Optional: shown as a large avatar initial (Google Meet style) */
  title?: string;
  /** Optional: secondary line below title */
  subtitle?: string;
}

const ANIM_DURATION = 300; // ms — must match transition duration below

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Maps toast id → function that triggers its exit animation
  const exitTriggers = useRef<Map<string, () => void>>(new Map());
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** Remove from state immediately (called after exit animation completes) */
  const remove = useCallback((id: string) => {
    exitTriggers.current.delete(id);
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  /** Trigger exit animation, then remove */
  const dismiss = useCallback((id: string) => {
    clearTimeout(timerRefs.current.get(id));
    timerRefs.current.delete(id);
    const trigger = exitTriggers.current.get(id);
    if (trigger) {
      trigger();
    } else {
      remove(id);
    }
  }, [remove]);

  const showToast = useCallback(
    ({ message, type = 'info', durationMs = 5000, title, subtitle }: {
      message: string;
      type?: ToastType;
      durationMs?: number;
      title?: string;
      subtitle?: string;
    }) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, type, title, subtitle }]);

      if (durationMs > 0) {
        const timer = setTimeout(() => dismiss(id), durationMs);
        timerRefs.current.set(id, timer);
      }
    },
    [dismiss],
  );

  return { toasts, showToast, dismiss, registerExitTrigger: exitTriggers };
}

// ── Components ────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const letter = name.trim()[0]?.toUpperCase() ?? '?';
  return (
    <div className="w-10 h-10 rounded-full bg-neutral-600 flex items-center justify-center shrink-0 text-white font-semibold text-base select-none">
      {letter}
    </div>
  );
}

function ToastItem({
  toast,
  onRemove,
  registerExit,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
  registerExit: (id: string, trigger: () => void) => void;
}) {
  const [phase, setPhase] = useState<'entering' | 'visible' | 'leaving'>('entering');

  // Slide in
  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('visible'));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Register the exit trigger so the hook can start the animation
  useEffect(() => {
    registerExit(toast.id, () => {
      setPhase('leaving');
      setTimeout(() => onRemove(toast.id), ANIM_DURATION);
    });
  }, [toast.id, registerExit, onRemove]);

  const leaving = phase === 'leaving';
  const entered = phase === 'visible' || leaving;

  const slideStyle: React.CSSProperties = {
    opacity: entered && !leaving ? 1 : 0,
    transform: entered && !leaving ? 'translateX(0)' : 'translateX(calc(100% + 1rem))',
    transition: `opacity ${ANIM_DURATION}ms ease-out, transform ${ANIM_DURATION}ms ease-out`,
    pointerEvents: leaving || !entered ? 'none' : 'auto',
  };

  const isPersonal = toast.type === 'info' && toast.title;

  if (isPersonal) {
    return (
      <div role="alert" style={slideStyle}
        className="flex items-center gap-3 pl-3 pr-3 py-2.5 rounded-2xl bg-neutral-800 shadow-2xl shadow-black/50 w-72"
      >
        <Avatar name={toast.title!} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-semibold leading-tight truncate">{toast.title}</p>
          <p className="text-neutral-400 text-xs leading-tight mt-0.5">{toast.subtitle ?? toast.message}</p>
        </div>
      </div>
    );
  }

  const styles: Record<ToastType, string> = {
    error: 'bg-neutral-800 border border-red-900/60',
    success: 'bg-neutral-800 border border-neutral-700/60',
    info: 'bg-neutral-800 border border-neutral-700/60',
  };
  const icons: Record<ToastType, React.ReactNode> = {
    error: <AlertCircle size={16} className="shrink-0 text-red-400" />,
    info: null,
    success: null,
  };

  return (
    <div role="alert" style={slideStyle}
      className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl shadow-black/50 text-sm text-white w-72 ${styles[toast.type]}`}
    >
      {icons[toast.type]}
      <span className="flex-1 leading-snug">{toast.message}</span>
      <button
        onClick={() => setPhase('leaving')}
        className="shrink-0 text-neutral-500 hover:text-white transition-colors p-0.5 rounded-full"
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
  registerExitTrigger,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  registerExitTrigger: React.MutableRefObject<Map<string, () => void>>;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="overflow-hidden">
          <ToastItem
            toast={t}
            onRemove={onDismiss}
            registerExit={(id, trigger) => { registerExitTrigger.current.set(id, trigger); }}
          />
        </div>
      ))}
    </div>
  );
}
