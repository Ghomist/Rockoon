import { useRouter } from "vue-router";
import { message } from "./feedback";
import { useI18n } from "vue-i18n";
import { useAppStore } from "@/stores/app";

export const waitForSelectedInstance = (
  initFn?: (data: InstanceData) => void
) =>
  new Promise<void>((resolve, reject) => {
    const { t } = useI18n();
    const app = useAppStore();
    const router = useRouter();

    const timeout = setTimeout(() => {
      message.error(t("gameConfig.selectInstance"));
      router.push("/instances");
      detach();
      reject();
    }, 300);

    const detach = app.$subscribe(init);
    init();

    async function init() {
      if (app.selectedInstanceData) {
        initFn?.(app.selectedInstanceData);
        clearTimeout(timeout);
        detach();
        resolve();
      }
    }
  });
