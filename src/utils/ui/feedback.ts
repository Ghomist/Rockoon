import { createDiscreteApi } from "naive-ui";

const discreteApi = createDiscreteApi([
  "message",
  "dialog",
  "notification",
  "loadingBar"
]);

export const message = discreteApi.message;
export const notification = discreteApi.notification;
export const loadingBar = discreteApi.loadingBar;
export const dialog = discreteApi.dialog;
