import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw
} from "vue-router";
import { getMenuItems, type MenuItem } from "./menu";

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
