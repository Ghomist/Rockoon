import BasicDialog, { DialogArgs } from "@/components/BasicDialog.vue";
import VirtualKeyboard from "@/components/VirtualKeyboard.vue";
import { useAppStore } from "@/stores/app";
import { App, createApp, h, ref, VNode } from "vue";
import { withDefault } from "./common";

export const openDialog = (
  content: string | (() => VNode),
  args?: DialogArgs & {
    onSure?: () => void;
    onCancel?: () => void;
    onClose?: (sure: boolean) => void;
    onDestroy?: () => void;
  } & {
    parent?: "body" | "content";
  }
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
  id?: number | null;
  duration?: number;
  sticky?: boolean;
};
export const sendMessage = (message: string, args?: MessageArgs) => {
  const app = useAppStore();
  args = withDefault<Required<MessageArgs>>(args ?? {}, {
    id: null,
    duration: 3000,
    sticky: false
  });

  let messageId: number | null = null;
  if (args.id) {
    const msg = app.messageQueue.find(msg => msg.id !== args.id);
    if (msg) {
      msg.message = message;
      messageId = msg.id;
    }
  }
  if (!messageId) {
    messageId = Date.now();
    app.messageQueue.push({
      id: messageId,
      message
    });
  }

  const closeLater = () => {
    setTimeout(() => {
      app.messageQueue = app.messageQueue.filter(msg => msg.id !== messageId);
    }, args.duration);
  };

  if (!args.sticky) closeLater();

  return {
    id: messageId,
    closeLater
  };
};
