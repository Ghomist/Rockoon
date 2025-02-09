import BasicDialogVue from "@/components/BasicDialog.vue";
import { useAppStore } from "@/stores/app";
import { createApp, h, ref, VNode } from "vue";
import { withDefault } from "./common";
import VirtualKeyboard from "@/components/VirtualKeyboard.vue";

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

export const keyboardDialog = (keycode: number, title: string) => {
  let result = ref(keycode);
  return new Promise<number>(resolve => {
    openDialog(
      () =>
        h(VirtualKeyboard, {
          modelValue: result.value,
          "onUpdate:modelValue": v => (result.value = v)
        }),
      {
        title: `更改按键绑定：${title}`,
        onSure: () => resolve(result.value),
        onCancel: () => resolve(keycode)
      }
    );
  });
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
