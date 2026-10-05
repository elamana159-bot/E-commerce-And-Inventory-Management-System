/**
 * Recursively cleans and sanitizes objects for Cloud Firestore:
 * - Removes keys with undefined values
 * - Filters out undefined items inside arrays
 * - Replaces NaN and Infinity with safe numbers or 0
 * - Strips functions, symbols, and non-plain objects (preserving Dates)
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }

  // Handle numbers: replace NaN or Infinity with 0
  if (typeof data === "number") {
    if (isNaN(data) || !isFinite(data)) {
      return 0 as unknown as T;
    }
    return data;
  }

  // Ignore functions or symbols
  if (typeof data === "function" || typeof data === "symbol") {
    return undefined as unknown as T;
  }

  // Handle arrays: filter out undefined/null items and sanitize elements
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }

  // Handle objects (preserving Date instances)
  if (typeof data === "object") {
    if (data instanceof Date) {
      return (isNaN(data.getTime()) ? new Date() : data) as unknown as T;
    }

    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined && typeof value !== "function" && typeof value !== "symbol") {
        const sanitizedVal = sanitizeForFirestore(value);
        if (sanitizedVal !== undefined) {
          cleaned[key] = sanitizedVal;
        }
      }
    }
    return cleaned as T;
  }

  return data;
}
