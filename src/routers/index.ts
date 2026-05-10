import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw
} from "vue-router";
import { getMenuItems, type MenuItem } from "./menu";
import { useHubStore } from "@/stores/hub";
import { message } from "@/utils/ui/feedback";
import { i18n } from "@/i18n";

const AUTH_REQUIRED_ROUTES = new Set(["hub-upload", "hub-batch", "hub-authors"]);

const mapToRoute = (
  item: MenuItem,
  isRoot: boolean
): RouteRecordRaw | undefined => {
  if (item === "-") return undefined;

  let path = item.route;
  if (!isRoot) path = path.replace(/^\//, "");

  if (item.view) {
    return {
      path,
      name: path,
      component: item.view
    };
  }
  const children = item.children
    .map(child => mapToRoute(child, false))
    .filter(x => !!x);
  return {
    path,
    name: path,
    redirect: (children[0] ?? { path: "" }).path,
    children: children
  };
};

export const router = createRouter({
  history: createMemoryHistory(),
  routes: getMenuItems()
    .map(x => mapToRoute(x, true))
    .filter(x => !!x)
});

router.beforeEach(to => {
  if (
    AUTH_REQUIRED_ROUTES.has(to.name as string) &&
    !useHubStore().isAuthenticated
  ) {
    message.warning(i18n.global.t("hub.authRequired"));
    return { name: "hub-admin" };
  }
});
