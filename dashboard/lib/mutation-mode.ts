import "server-only";

import { writesAreEnabled } from "./mutation-policy";

export function dashboardWritesAreEnabled(): boolean {
  return writesAreEnabled(process.env.DASHBOARD_ALLOW_WRITES);
}
