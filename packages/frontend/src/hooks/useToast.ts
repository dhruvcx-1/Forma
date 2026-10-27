import { useState, useCallback } from 'react';

export type ToastVariant = 'default' | 'success' | 'error' | 'warning';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

let _setToasts: React.Dispatch<React.SetStateAction<Toast[]>> | null = null;

/** Register the setter from ToastProvider */
export function _registerToastSetter(
  setter: React.Dispatch<React.SetStateAction<Toast[]>>
) {
  _setToasts = setter;
}

/** Imperative toast function usable outside of components */
export function toast(t: Omit<Toast, 'id'>) {
  if (!_setToasts) return;
  const id = Math.random().toString(36).slice(2);
  const duration = t.duration ?? 4000;
  _setToasts((prev) => [...prev, { ...t, id }]);
  setTimeout(() => {
    _setToasts?.((prev) => prev.filter((item) => item.id !== id));
  }, duration);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Register setter on mount
  const registerSetter = useCallback(
    (setter: React.Dispatch<React.SetStateAction<Toast[]>>) => {
      _registerToastSetter(setter);
    },
    []
  );

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return { toasts, setToasts, registerSetter, dismiss };
}
