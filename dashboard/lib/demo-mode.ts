export function demoModeIsEnabled(
  value: string | undefined = process.env.DASHBOARD_DEMO_MODE,
): boolean {
  return value === "true";
}
