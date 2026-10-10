/** Display only: computed from the exact persisted pre/post images, after receipt verification. */
export function exactChangeDiff(path: string, before: string, after: string): string {
  const left = before.split("\n"), right = after.split("\n");
  let start = 0, end = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  while (end < left.length - start && end < right.length - start && left[left.length - end - 1] === right[right.length - end - 1]) end++;
  if (start === left.length && start === right.length) return "";
  const removed = left.slice(start, left.length - end), added = right.slice(start, right.length - end);
  return [`--- a/${path}`, `+++ b/${path}`, `@@ -${start + 1},${removed.length} +${start + 1},${added.length} @@`,
    ...removed.map(line => `-${line}`), ...added.map(line => `+${line}`)].join("\n");
}
