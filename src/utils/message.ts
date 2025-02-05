import BasicDialogVue from "@/components/BasicDialog.vue";
import { useAppStore } from "@/stores/app";
import { createApp } from "vue";

export type DialogArgs = {
  title?: string;
  footer?: boolean;
  onSure?: () => void;
  onCancel?: () => void;
};

export const openDialog = (content: string, args?: DialogArgs) => {
  const component = createApp(BasicDialogVue, { content, ...args });
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

export const sendMessage = (message: string) => {
  const app = useAppStore();

  const id = Date.now();
  app.messageQueue.push({
    id,
    message
  });

  setTimeout(() => {
    app.messageQueue = app.messageQueue.filter(msg => msg.id !== id);
  }, 3000);
};
