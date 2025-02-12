import BasicDialog from "@/components/BasicDialog.vue";
import { useAppStore } from "@/stores/app";
import { App, createApp, h, ref, VNode } from "vue";
import { withDefault } from "./common";
import VirtualKeyboard from "@/components/VirtualKeyboard.vue";

export type DialogArgs = {
  title?: string;
  footer?: boolean;
  sure?: boolean;
  cancel?: boolean;
  sureText?: string;
  cancelText?: string;
  onSure?: () => void;
  onCancel?: () => void;
  onClose?: (sure: boolean) => void;
  lock?: boolean;
  parent?: "body" | "content";
};
export const openDialog = (
  content: string | (() => VNode),
  args?: DialogArgs
) => {
  let component: App;
  const div = document.createElement("div");
  const parent =
    (args?.parent ?? "body") === "body"
      ? document.body
      : document.querySelector("div#content-container")!;

  const onDestroy = () => {
    setTimeout(() => {
      component?.unmount();
      parent.removeChild(div);
    }, 200);
  };

  if (!args?.lock) {
    div.onclick = onDestroy;
  }

  if (typeof content === "string") {
    component = createApp(BasicDialog, { content, ...args, onDestroy });
  } else {
    component = createApp({
      render: () =>
        h(BasicDialog, { ...args, onDestroy }, { default: () => content() })
    });
  }

  parent.appendChild(div);
  component.mount(div);

  return {
    close: onDestroy
  };
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
