import { toast } from "vue-sonner";
import { dialogApi, type DialogOptions, type DialogVariant } from "./dialog-store";

type ToastOptions = { duration?: number; description?: string };

interface LoadingHandle {
  destroy: () => void;
  update: (text: string) => void;
}

const wrap =
  (variant: "success" | "error" | "info" | "warning" | "loading") =>
  (text: string, opts: ToastOptions = {}): LoadingHandle => {
    const id =
      opts.duration === 0
        ? toast[variant === "loading" ? "loading" : variant](text, {
            description: opts.description,
            duration: Infinity
          })
        : toast[variant === "loading" ? "loading" : variant](text, {
            description: opts.description
          });
    return {
      destroy: () => toast.dismiss(id),
      update: (newText: string) =>
        toast.loading(newText, { id, duration: Infinity })
    };
  };

/**
 * Drop-in replacement for Naive UI's discrete `message` API.
 * Backed by vue-sonner toasts.
 */
export const message = {
  success: wrap("success"),
  error: wrap("error"),
  info: wrap("info"),
  warning: wrap("warning"),
  loading: wrap("loading")
};

/**
 * Drop-in replacement for Naive UI's discrete `dialog` API.
 * Backed by a reactive store + shadcn Dialog host mounted in App.vue.
 */
export const dialog: {
  create: (opts: DialogOptions) => void;
  info: (opts: DialogOptions) => void;
  warning: (opts: DialogOptions) => void;
  error: (opts: DialogOptions) => void;
  success: (opts: DialogOptions) => void;
  destroyAll: () => void;
} = {
  create: (opts: DialogOptions) => dialogApi.open("default", opts),
  info: (opts: DialogOptions) => dialogApi.open("info", opts),
  warning: (opts: DialogOptions) => dialogApi.open("warning", opts),
  error: (opts: DialogOptions) => dialogApi.open("error", opts),
  success: (opts: DialogOptions) => dialogApi.open("success", opts),
  destroyAll: () => dialogApi.closeAll()
};

export type { DialogOptions, DialogVariant };
