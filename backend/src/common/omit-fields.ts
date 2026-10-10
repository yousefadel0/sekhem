/** Explicit field exclusion for plain persisted records and digest projections.
 * Preserves object-rest semantics without creating unused sensitive bindings. */
export function omitFields<T extends object, K extends keyof T>(value: T, keys: readonly K[]): Omit<T, K> {
  const result: Partial<T> = { ...value };
  for (const key of keys) delete result[key];
  return result as Omit<T, K>;
}
