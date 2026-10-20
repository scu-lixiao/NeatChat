function isPlainObject(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deep merges `source` into `target`. Arrays and other values replace the
 * target's value instead of being merged index by index.
 */
export function merge(target: any, source: any) {
  Object.keys(source).forEach(function (key) {
    // `source` can be parsed from an imported file, don't let it reach
    // Object.prototype
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
      return;
    }
    if (isPlainObject(source[key])) {
      if (!isPlainObject(target[key])) target[key] = {};
      merge(target[key], source[key]);
      return;
    }
    target[key] = source[key];
  });
}
