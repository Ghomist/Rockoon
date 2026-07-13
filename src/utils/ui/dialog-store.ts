import { ref } from "vue";

export type DialogVariant =
  | "default"
  | "info"
  | "warning"
  | "error"
  | "success";

export interface DialogOptions {
  title?: string;
  content?: string | (() => unknown);
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

const dialogs = ref<DialogInstance[]>([]);
let nextId = 1;

const close = (id: number) => {
  const idx = dialogs.value.findIndex(d => d.id === id);
  if (idx === -1) return;
  const [removed] = dialogs.value.splice(idx, 1);
  removed?.onClose?.();
};

export const dialogApi = {
  list: dialogs,
  open(variant: DialogVariant, opts: DialogOptions) {
    dialogs.value.push({ id: nextId++, variant, ...opts });
  },
  async confirm(id: number) {
    const d = dialogs.value.find(x => x.id === id);
    if (!d) return;
    // Naive-UI compatibility: returning false keeps the dialog open.
    const result = await d.onPositiveClick?.();
    if (result === false) return;
    close(id);
  },
  async cancel(id: number) {
    const d = dialogs.value.find(x => x.id === id);
    if (!d) return;
    try {
      await d.onNegativeClick?.();
    } finally {
      close(id);
    }
  },
  dismiss: close,
  closeAll() {
    while (dialogs.value.length) close(dialogs.value[0].id);
  }
};
