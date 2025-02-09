import BasicDialogVue from "@/components/BasicDialog.vue";
import { useAppStore } from "@/stores/app";
import { createApp, h, VNode } from "vue";
import { withDefault } from "./common";

export type DialogArgs = {
  title?: string;
  footer?: boolean;
  sureText?: string;
  cancelText?: string;
  onSure?: () => void;
  onCancel?: () => void;
};
export const openDialog = (
  content: string | (() => VNode),
  args?: DialogArgs
) => {
  let component;
  if (typeof content === "string") {
    component = createApp(BasicDialogVue, { content, ...args });
  } else {
    component = createApp({
      render: () => h(BasicDialogVue, { ...args }, { default: () => content() })
    });
  }
  const div = document.createElement("div");
  div.onclick = () => {
    setTimeout(() => {
      component.unmount();
      document.body.removeChild(div);
    }, 150);
  };
  document.body.appendChild(div);
  component.mount(div);
};

export type MessageArgs = {
  duration?: number;
};
export const sendMessage = (message: string, args?: MessageArgs) => {
  const app = useAppStore();
  args = withDefault<Required<MessageArgs>>(args ?? {}, {
    duration: 3000
  });

  const id = Date.now();
  app.messageQueue.push({
    id,
    message
  });

  setTimeout(() => {
    app.messageQueue = app.messageQueue.filter(msg => msg.id !== id);
  }, args.duration);
};
