import { create } from "zustand";
import type { ReactNode } from "react";

export type DialogVariant =
  | "default"
  | "info"
  | "warning"
  | "error"
  | "success";

export interface DialogOptions {
  title?: string;
  content?: string | (() => ReactNode);
  positiveText?: string;
  negativeText?: string;
  onPositiveClick?: () => void | boolean | Promise<void | boolean>;
  onNegativeClick?: () => void | boolean | Promise<void | boolean>;
  onClose?: () => void;
}

export interface DialogInstance extends DialogOptions {
  id: number;
  variant: DialogVariant;
}

interface DialogState {
  dialogs: DialogInstance[];
  open: (variant: DialogVariant, opts: DialogOptions) => void;
  confirm: (id: number) => Promise<void>;
  cancel: (id: number) => Promise<void>;
  dismiss: (id: number) => void;
  closeAll: () => void;
}

let nextId = 1;

const close = (
  dialogs: DialogInstance[],
  id: number
): { next: DialogInstance[]; onClose?: () => void } => {
  const removed = dialogs.find(d => d.id === id);
  return {
    next: dialogs.filter(d => d.id !== id),
    onClose: removed?.onClose
  };
};

export const useDialogStore = create<DialogState>((set, get) => ({
  dialogs: [],

  open(variant, opts) {
    set(s => ({ dialogs: [...s.dialogs, { id: nextId++, variant, ...opts }] }));
  },

  async confirm(id) {
    const d = get().dialogs.find(x => x.id === id);
    if (!d) return;
    // Naive-UI compat: returning false keeps the dialog open.
    const result = await d.onPositiveClick?.();
    if (result === false) return;
    const { next, onClose } = close(get().dialogs, id);
    set({ dialogs: next });
    onClose?.();
  },

  async cancel(id) {
    const d = get().dialogs.find(x => x.id === id);
    if (!d) return;
    try {
      await d.onNegativeClick?.();
    } finally {
      const { next, onClose } = close(get().dialogs, id);
      set({ dialogs: next });
      onClose?.();
    }
  },

  dismiss(id) {
    const { next, onClose } = close(get().dialogs, id);
    set({ dialogs: next });
    onClose?.();
  },

  closeAll() {
    const all = get().dialogs;
    set({ dialogs: [] });
    for (const d of all) d.onClose?.();
  }
}));
