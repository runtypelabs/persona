const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Deep-merge plain objects. Arrays and non-objects are replaced by override.
 */
export function deepMerge<T extends Record<string, unknown>>(
  base: T | undefined,
  override: Record<string, unknown> | undefined
): T | Record<string, unknown> | undefined {
  if (!base) return override;
  if (!override) return base;

  const merged: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    if (isObject(existing) && isObject(value)) {
      merged[key] = deepMerge(existing, value);
    } else {
      merged[key] = value;
    }
  }

  return merged;
}
