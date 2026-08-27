import "server-only";

import { dashboardWritesAreAllowed } from "./mutation-policy";

export function dashboardWritesAreEnabled(): boolean {
  return dashboardWritesAreAllowed(
    process.env.DASHBOARD_ALLOW_WRITES,
    process.env.DASHBOARD_DEMO_MODE,
  );
}
