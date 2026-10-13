/** Tracks host intent for versioned defaults without comparing values to defaults. */
const DEFAULTS_PROVENANCE = Symbol("persona.defaultsProvenance");
type Provenance = { [DEFAULTS_PROVENANCE]?: readonly string[] };
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function versionedDefaultPaths(overlay: object, prefix = ""): string[] {
  return Object.entries(overlay).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return record(value) ? versionedDefaultPaths(value, path) : [path];
  });
}

export function suppliedPath(value: unknown, path: string): "absent" | "clear" | "explicit" {
  const keys = path.split(".");
  for (let index = 0; index < keys.length; index++) {
    const key = keys[index];
    if (!record(value) || !Object.prototype.hasOwnProperty.call(value, key)) return "absent";
    value = value[key];
    if (value === undefined) return "clear";
    // Replacing a parent object with a disabled/non-object value drops every
    // tracked descendant, just as clearing that parent with undefined does.
    if (index < keys.length - 1 && !record(value)) return "clear";
  }
  return "explicit";
}

export function defaultProvenance(config: object | undefined, paths: readonly string[]): readonly string[] {
  return (config as Provenance | undefined)?.[DEFAULTS_PROVENANCE]
    ?? paths.filter((path) => suppliedPath(config, path) === "explicit");
}

export function setDefaultProvenance<T extends object>(config: T, explicit: readonly string[]): T {
  Object.defineProperty(config, DEFAULTS_PROVENANCE, {
    value: explicit, enumerable: true, configurable: true,
  });
  return config;
}

export function inheritDefaultProvenance<T extends object>(result: T, raw: object | undefined, overlay: object): T {
  return setDefaultProvenance(result, defaultProvenance(raw, versionedDefaultPaths(overlay)));
}

export function updateDefaultProvenance(previous: object, patch: object, paths: readonly string[]): readonly string[] {
  const marked = (patch as Provenance)[DEFAULTS_PROVENANCE];
  if (marked) return marked;
  const explicit = new Set(defaultProvenance(previous, paths));
  for (const path of paths) {
    const supplied = suppliedPath(patch, path);
    if (supplied === "clear") explicit.delete(path);
    if (supplied === "explicit") explicit.add(path);
  }
  return [...explicit];
}

/** Copy only traversed objects so deleting inherited defaults never mutates callers. */
export function omitInheritedDefaults<T extends object>(config: T, paths: readonly string[], explicit: readonly string[]): T {
  const result = { ...config } as Record<string, unknown>;
  for (const path of paths) {
    if (explicit.includes(path)) continue;
    const keys = path.split(".");
    let target: Record<string, unknown> | undefined = result;
    for (const key of keys.slice(0, -1)) {
      const child: unknown = target[key];
      if (!record(child)) { target = undefined; break; }
      target[key] = { ...child };
      target = target[key] as Record<string, unknown>;
    }
    if (target) delete target[keys[keys.length - 1]];
  }
  return result as T;
}
