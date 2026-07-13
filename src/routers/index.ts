import {
  createMemoryHistory,
  createRouter,
  type RouteRecordRaw
} from "vue-router";
import { getMenuItems, type MenuItem } from "./menu";

const mapToRoute = (item: MenuItem): RouteRecordRaw | undefined => {
  if (item === "-") return undefined;

  // Children keep absolute paths (e.g. "/maps"). Vue Router treats child
  // paths starting with "/" as absolute, so they match sidebar links that
  // navigate to `item.route` directly.
  const path = item.route;

  if (item.view) {
    return {
      path,
      name: path,
      component: item.view
    };
  }
  const children = item.children
    .map(child => mapToRoute(child))
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
    .map(x => mapToRoute(x))
    .filter(x => !!x)
});
