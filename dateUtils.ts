/**
 * Centralized Safe Date Utility for Yeserahut
 *
 * Safely parses and formats any date value from Firestore, local storage, REST, or user input.
 * Supports:
 * - Firestore Timestamp (with .toDate() or .toMillis())
 * - Timestamp-like objects with { seconds, nanoseconds } or { _seconds, _nanoseconds }
 * - JavaScript Date objects
 * - ISO 8601 date strings ("2025-09-05T10:14:00.000Z")
 * - Plain date strings ("YYYY-MM-DD")
 * - Numeric timestamps (milliseconds or seconds)
 * - Strings with numeric timestamps ("1700000000000")
 * - null, undefined, empty strings, and malformed strings (e.g. "[object Object]")
 *
 * GUARANTEE: Functions in this module NEVER throw "RangeError: Invalid time value"
 * or unhandled exceptions. If a date is missing, null, or malformed, safe fallback values
 * (such as "—" or null) are returned.
 */

/**
 * Checks if a value is a valid JavaScript Date with a finite, non-NaN timestamp.
 */
export function isValidDate(d: unknown): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Converts any Firestore, JavaScript, string, or numeric date value into a valid Date object.
 * Returns `null` if the value is missing, invalid, or malformed.
 */
export function toSafeDate(val: unknown): Date | null {
  if (val == null) return null;

  try {
    // 1. Already a Date
    if (val instanceof Date) {
      return !isNaN(val.getTime()) ? val : null;
    }

    // 2. Firestore Timestamp or object with .toDate()
    if (typeof val === "object" && val !== null) {
      // Check for .toDate() method (Firestore Timestamp)
      if (typeof (val as any).toDate === "function") {
        try {
          const d = (val as any).toDate();
          if (isValidDate(d)) return d;
        } catch {
          // ignore error and continue to other checks
        }
      }

      // Check for .toMillis() method
      if (typeof (val as any).toMillis === "function") {
        try {
          const ms = (val as any).toMillis();
          if (typeof ms === "number" && !isNaN(ms) && isFinite(ms) && ms > 0) {
            return new Date(ms);
          }
        } catch {
          // ignore
        }
      }

      // Check for seconds / _seconds property (deserialized Firestore Timestamp)
      const obj = val as Record<string, any>;
      const seconds = obj.seconds !== undefined ? obj.seconds : obj._seconds;
      if (seconds !== undefined) {
        const secNum = Number(seconds);
        const nanos = Number(obj.nanoseconds ?? obj._nanoseconds ?? 0);
        if (!isNaN(secNum) && isFinite(secNum) && secNum > 0) {
          const ms = secNum * 1000 + (isNaN(nanos) ? 0 : Math.floor(nanos / 1000000));
          const d = new Date(ms);
          if (isValidDate(d)) return d;
        }
      }
    }

    // 3. Number (timestamp in ms or seconds)
    if (typeof val === "number") {
      if (isNaN(val) || !isFinite(val) || val <= 0) return null;
      const ms = val > 1e11 ? val : val * 1000;
      const d = new Date(ms);
      return isValidDate(d) ? d : null;
    }

    // 4. String
    if (typeof val === "string") {
      const s = val.trim();
      if (
        !s ||
        s === "—" ||
        s === "-" ||
        s === "null" ||
        s === "undefined" ||
        s === "NaN" ||
        s === "Invalid Date" ||
        s.startsWith("[object")
      ) {
        return null;
      }

      // Pure numeric string
      if (/^\d{9,14}$/.test(s)) {
        const n = Number(s);
        if (!isNaN(n) && n > 0) {
          const ms = n > 1e11 ? n : n * 1000;
          const d = new Date(ms);
          if (isValidDate(d)) return d;
        }
      }

      // Exact YYYY-MM-DD format (construct at noon local to avoid timezone shift)
      const ymdMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (ymdMatch) {
        const y = parseInt(ymdMatch[1], 10);
        const m = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);
        if (y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && day >= 1 && day <= 31) {
          const d = new Date(y, m - 1, day, 12, 0, 0);
          if (isValidDate(d)) return d;
        }
      }

      // General string parse
      const d = new Date(s);
      if (isValidDate(d)) return d;
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Returns a valid Date instance, falling back to `new Date()` if the input is missing/invalid.
 */
export function toSafeDateOrToday(val: unknown): Date {
  return toSafeDate(val) || new Date();
}

/**
 * Safely converts any date value to a "YYYY-MM-DD" string.
 * Returns `fallback` (default: "") if the input is invalid or missing.
 */
export function toSafeIsoDate(val: unknown, fallback: string = ""): string {
  if (val == null) return fallback;

  // Fast path for clean YYYY-MM-DD strings
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
  }

  const d = toSafeDate(val);
  if (!d) return fallback;

  try {
    return d.toISOString().slice(0, 10);
  } catch {
    // If toISOString fails for any exotic edge case
    try {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    } catch {
      return fallback;
    }
  }
}

/**
 * Safely converts any date value to full ISO string.
 * Returns `fallback` (default: "") if invalid.
 */
export function toSafeIsoString(val: unknown, fallback: string = ""): string {
  const d = toSafeDate(val);
  if (!d) return fallback;
  try {
    return d.toISOString();
  } catch {
    return fallback;
  }
}

/**
 * Central safe date formatter.
 * Returns a localized date string (e.g. "05 Sep 2025").
 * If the value is missing or invalid, returns `fallback` (default "—").
 * NEVER throws "RangeError: Invalid time value".
 */
export function formatSafeDate(
  val: unknown,
  fallback: string = "—",
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short", year: "numeric" },
  locale: string = "en-GB"
): string {
  const d = toSafeDate(val);
  if (!d) return fallback;

  try {
    return d.toLocaleDateString(locale, options);
  } catch {
    // Ultra-safe manual fallback formatting: DD/MM/YYYY
    try {
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    } catch {
      return fallback;
    }
  }
}

/**
 * Safely formats date and time (e.g. "05 Sep 2025, 14:30").
 * Returns `fallback` (default "—") if invalid.
 */
export function formatSafeDateTime(
  val: unknown,
  fallback: string = "—",
  locale: string = "en-GB"
): string {
  const d = toSafeDate(val);
  if (!d) return fallback;

  try {
    return d.toLocaleDateString(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return formatSafeDate(d, fallback, undefined, locale);
  }
}

/**
 * Safely formats time only (e.g. "14:30").
 * Returns `fallback` (default "—") if invalid.
 */
export function formatSafeTime(
  val: unknown,
  fallback: string = "—",
  locale: string = "en-GB",
  options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit" }
): string {
  const d = toSafeDate(val);
  if (!d) return fallback;

  try {
    return d.toLocaleTimeString(locale, options);
  } catch {
    try {
      const h = String(d.getHours()).padStart(2, "0");
      const m = String(d.getMinutes()).padStart(2, "0");
      return `${h}:${m}`;
    } catch {
      return fallback;
    }
  }
}

/**
 * Safely gets numeric timestamp in milliseconds for sorting or comparisons.
 * Returns `fallback` (default 0) if invalid.
 */
export function getSafeTime(val: unknown, fallback: number = 0): number {
  const d = toSafeDate(val);
  if (!d) return fallback;
  const t = d.getTime();
  return isNaN(t) ? fallback : t;
}

/**
 * Safely sorts two items by date.
 */
export function safeDateSort(
  aDate: unknown,
  bDate: unknown,
  direction: "asc" | "desc" = "desc"
): number {
  const ta = getSafeTime(aDate, 0);
  const tb = getSafeTime(bDate, 0);
  return direction === "asc" ? ta - tb : tb - ta;
}

/**
 * Returns today's ISO string (YYYY-MM-DD).
 */
export function todayIsoDate(): string {
  try {
    return new Date().toISOString().slice(0, 10);
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }
}
