export function writesAreEnabled(value: string | undefined): boolean {
  return value === "true";
}

export function dashboardWritesAreAllowed(
  writesValue: string | undefined,
  demoValue: string | undefined,
): boolean {
  return writesAreEnabled(writesValue) && demoValue !== "true";
}
