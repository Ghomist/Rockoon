import BasicDialogVue from "@/components/BasicDialog.vue";
import { createApp } from "vue";

export const openDialog = (
  content: string,
  icon?: "info" | "warning" | "error"
) => {
  const component = createApp(BasicDialogVue, { type: icon, content });
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
