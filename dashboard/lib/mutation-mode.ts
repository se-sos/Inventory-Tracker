import "server-only";

export function dashboardWritesAreEnabled(): boolean {
  return process.env.DASHBOARD_ALLOW_WRITES === "true";
}
