import { Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { getMenuItems, preloadPages, type SidebarItem } from "./menu";

/**
 * Build the route tree from `getMenuItems()`.
 * - Leaf items (with `view`) → Route with element.
 * - Group items (with `children`) → parent path is index-only (no redirect),
 *   children keep absolute paths.
 * - "-" separators and section headers are ignored.
 */
function buildRoutes(items: SidebarItem[]): JSX.Element[] {
  const out: JSX.Element[] = [];
  items.forEach(item => {
    if (item === "-") return;
    // 动作项（不占路由）
    if ("action" in item || "section" in item) return;
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
  useEffect(() => {
    // 首屏渲染完再预取其它页面，不跟当前页抢
    const idle =
      window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 500));
    idle(() => preloadPages());
  }, []);
  return (
    <div key={location.pathname} className="route-enter h-full">
      <Suspense fallback={null}>
        <Routes>{buildRoutes(getMenuItems())}</Routes>
      </Suspense>
    </div>
  );
}
