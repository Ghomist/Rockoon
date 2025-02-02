import BasicDialogVue from "@/components/BasicDialog.vue";
import BasicMessageVue from "@/components/BasicMessage.vue";
import { useAppStore } from "@/stores/app";
import { createApp } from "vue";

export const openDialog = (
  content: string,
  icon?: "info" | "warning" | "error"
) => {
  const header =
    icon === "info" ? "提示" : icon === "warning" ? "警告" : "错误";
  const component = createApp(BasicDialogVue, { type: icon, header, content });
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

export const sendMessage = (type: HintType, message: string) => {
  const app = useAppStore();

  const id = Date.now();
  app.messageQueue.push({
    id,
    type,
    message
  });

  setTimeout(() => {
    app.messageQueue = app.messageQueue.filter(msg => msg.id !== id);
  }, 3000);
};
