export const demoRoutes = {
  home: {
    id: "home",
    path: "/",
    label: "Overview",
    description: "Demo goals and source data"
  },
  demo_form: {
    id: "demo_form",
    path: "/demo-form",
    label: "Demo Form",
    description: "Allowlisted local tool target"
  }
} as const;

export type DemoRouteId = keyof typeof demoRoutes;
export type DemoRoutePath = (typeof demoRoutes)[DemoRouteId]["path"];

export const routeIds = ["home", "demo_form"] as const satisfies readonly DemoRouteId[];

export function resolveDemoRoute(routeId: string): DemoRoutePath | null {
  return routeId in demoRoutes
    ? demoRoutes[routeId as DemoRouteId].path
    : null;
}

export function getDemoRoute(routeId: DemoRouteId) {
  return demoRoutes[routeId];
}

export function getRouteIdFromPathname(pathname: string): DemoRouteId | null {
  const matched = routeIds.find((routeId) => demoRoutes[routeId].path === pathname);
  return matched ?? null;
}

export function isImplementationRequestPath(pathname: string) {
  return pathname === demoRoutes.demo_form.path;
}
