import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getMenuItems, type MenuItem } from "./menu";

/**
 * Build the route tree from `getMenuItems()`.
 * - Leaf items (with `view`) → Route with element.
 * - Group items (with `children`) → parent path is index-only (no redirect),
 *   children keep absolute paths.
 * - "-" separators are ignored.
 */
function buildRoutes(items: MenuItem[]): JSX.Element[] {
  const out: JSX.Element[] = [];
  items.forEach(item => {
    if (item === "-") return;
    if ("view" in item && item.view) {
      out.push(
        <Route key={item.route} path={item.route} element={<item.view />} />
      );
    } else if ("children" in item) {
      item.children.forEach(c => {
        if (c !== "-" && "view" in c && c.view) {
          out.push(<Route key={c.route} path={c.route} element={<c.view />} />);
        }
      });
    }
  });
  out.push(
    <Route key="*" path="*" element={<Navigate to="/game" replace />} />
  );
  return out;
}

export function AppRoutes() {
  // key by pathname → remounts on navigation, triggering the CSS enter animation.
  const location = useLocation();
  return (
    <div key={location.pathname} className="route-enter h-full">
      <Routes>{buildRoutes(getMenuItems())}</Routes>
    </div>
  );
}
