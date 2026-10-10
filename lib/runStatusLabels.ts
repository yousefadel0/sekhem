export const runStatusLabels: Record<string, string> = {
  RUNNING: "Running",
  FAIL: "Failed",
  ABORTED: "Aborted",
  REVIEW_REQUIRED: "Review Required",
  COMPLETED: "Completed",
  // Add other statuses as needed
};

export function getRunStatusLabel(status: string): string {
  return runStatusLabels[status] ?? status;
}
