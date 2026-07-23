import React from "react";
import { toast } from "sonner";
import {
  useDialogStore,
  type DialogOptions,
  type DialogVariant
} from "./dialog-store";

type ToastOptions = { duration?: number; description?: string };

interface LoadingHandle {
  destroy: () => void;
  update: (text: string) => void;
}

const wrap =
  (variant: "success" | "error" | "info" | "warning" | "loading") =>
  (text: string, opts: ToastOptions = {}): LoadingHandle => {
    let id: string | number;
    const dismiss = () => toast.dismiss(id);
    const base = { description: opts.description };
    id =
      opts.duration === 0
        ? toast[variant === "loading" ? "loading" : variant](
            React.createElement("span", { style: { cursor: "pointer" }, onClick: dismiss }, text),
            { ...base, duration: Infinity }
          )
        : toast[variant === "loading" ? "loading" : variant](
            React.createElement("span", { style: { cursor: "pointer" }, onClick: dismiss }, text),
            base
          );
    return {
      destroy: dismiss,
      update: (newText: string) =>
        toast.loading(newText, { id, duration: Infinity })
    };
  };

/**
 * Drop-in replacement for Naive UI's discrete `message` API.
 * Backed by sonner toasts.
 */
export const message = {
  success: wrap("success"),
  error: wrap("error"),
  info: wrap("info"),
  warning: wrap("warning"),
  loading: wrap("loading")
};

/** Open a dialog with the given variant. */
const openVariant = (variant: DialogVariant) => (opts: DialogOptions) =>
  useDialogStore.getState().open(variant, opts);

/**
 * Drop-in replacement for Naive UI's discrete `dialog` API.
 * Backed by a Zustand store + shadcn Dialog host mounted in App.tsx.
 */
export const dialog: {
  create: (opts: DialogOptions) => void;
  info: (opts: DialogOptions) => void;
  warning: (opts: DialogOptions) => void;
  error: (opts: DialogOptions) => void;
  success: (opts: DialogOptions) => void;
  destroyAll: () => void;
} = {
  create: openVariant("default"),
  info: openVariant("info"),
  warning: openVariant("warning"),
  error: openVariant("error"),
  success: openVariant("success"),
  destroyAll: () => useDialogStore.getState().closeAll()
};

export type { DialogOptions, DialogVariant };
