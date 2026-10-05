// Ethiopian (Habesha) Calendar Utility Library
// Accurate bidirectional conversion between Gregorian (GC) and Ethiopian (EC / ዓ.ም)
import { toSafeDate, isValidDate } from "./dateUtils";

export interface EthiopianDate {
  year: number;
  month: number;
  day: number;
  monthNameAm: string;
  monthNameEn: string;
  shortAm: string;
  formattedAm: string;
  formattedEn: string;
}

export interface EthiopianMonthInfo {
  id: number;
  nameAm: string;
  nameEn: string;
  shortAm: string;
}

export const ETHIOPIAN_MONTHS: EthiopianMonthInfo[] = [
  { id: 1, nameAm: "መስከረም", nameEn: "Meskerem", shortAm: "መስ" },
  { id: 2, nameAm: "ጥቅምት", nameEn: "Tikimt", shortAm: "ጥቅ" },
  { id: 3, nameAm: "ኅዳር", nameEn: "Hidar", shortAm: "ኅዳ" },
  { id: 4, nameAm: "ታኅሣሥ", nameEn: "Tahsas", shortAm: "ታኅ" },
  { id: 5, nameAm: "ጥር", nameEn: "Tir", shortAm: "ጥር" },
  { id: 6, nameAm: "የካቲት", nameEn: "Yekatit", shortAm: "የካ" },
  { id: 7, nameAm: "መጋቢት", nameEn: "Megabit", shortAm: "መጋ" },
  { id: 8, nameAm: "ሚያዝያ", nameEn: "Miazia", shortAm: "ሚያ" },
  { id: 9, nameAm: "ግንቦት", nameEn: "Ginbot", shortAm: "ግን" },
  { id: 10, nameAm: "ሰኔ", nameEn: "Sene", shortAm: "ሰኔ" },
  { id: 11, nameAm: "ሐምሌ", nameEn: "Hamle", shortAm: "ሐም" },
  { id: 12, nameAm: "ነሐሴ", nameEn: "Nehase", shortAm: "ነሐ" },
  { id: 13, nameAm: "ጳጉሜ", nameEn: "Pagume", shortAm: "ጳጉ" },
];

/**
 * Check if an Ethiopian year is a leap year (Pagume has 6 days).
 * An Ethiopian year is a leap year if year % 4 === 3.
 */
export function isEthiopianLeapYear(year: number): boolean {
  return year % 4 === 3;
}

/**
 * Get number of days in an Ethiopian month.
 * Months 1-12 always have 30 days.
 * Month 13 (Pagume) has 5 days in a common year, 6 in a leap year.
 */
export function getDaysInEthiopianMonth(year: number, month: number): number {
  if (month < 1 || month > 13) return 30;
  if (month === 13) {
    return isEthiopianLeapYear(year) ? 6 : 5;
  }
  return 30;
}

/**
 * Convert a Gregorian Date or ISO string (YYYY-MM-DD) to Ethiopian Date.
 */
export function gregorianToEthiopian(input?: unknown): EthiopianDate {
  let gDate: Date = toSafeDate(input) || new Date();

  try {
    const fmt = new Intl.DateTimeFormat("en-US-u-ca-ethiopic", {
      timeZone: "UTC",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = fmt.formatToParts(gDate);
    let year = 0;
    let month = 0;
    let day = 0;

    for (const p of parts) {
      if (p.type === "year") year = parseInt(p.value.replace(/[^0-9]/g, ""), 10);
      if (p.type === "month") month = parseInt(p.value, 10);
      if (p.type === "day") day = parseInt(p.value, 10);
    }

    if (!year || !month || !day) {
      // Fallback calculation if Intl parts failed
      const gy = gDate.getUTCFullYear();
      year = gy - 8;
      month = 1;
      day = 1;
    }

    const monthInfo = ETHIOPIAN_MONTHS[month - 1] || ETHIOPIAN_MONTHS[0];
    const pad = (n: number) => String(n).padStart(2, "0");

    return {
      year,
      month,
      day,
      monthNameAm: monthInfo.nameAm,
      monthNameEn: monthInfo.nameEn,
      shortAm: monthInfo.shortAm,
      formattedAm: `${pad(day)}/${pad(month)}/${year} ዓ.ም (${monthInfo.nameAm} ${day})`,
      formattedEn: `${monthInfo.nameEn} ${day}, ${year} EC`,
    };
  } catch {
    const gy = gDate.getUTCFullYear();
    const year = gy - 8;
    return {
      year,
      month: 1,
      day: 1,
      monthNameAm: "መስከረም",
      monthNameEn: "Meskerem",
      shortAm: "መስ",
      formattedAm: `01/01/${year} ዓ.ም (መስከረም 1)`,
      formattedEn: `Meskerem 1, ${year} EC`,
    };
  }
}

/**
 * Convert Ethiopian Date (Year, Month, Day) to Gregorian Date & ISO string (YYYY-MM-DD).
 */
export function ethiopianToGregorian(year: number, month: number, day: number): {
  iso: string;
  year: number;
  month: number;
  day: number;
  date: Date;
} {
  // Bound checks
  const safeYear = Math.max(1900, Math.min(2200, year || 2018));
  const safeMonth = Math.max(1, Math.min(13, month || 1));
  const maxDays = getDaysInEthiopianMonth(safeYear, safeMonth);
  const safeDay = Math.max(1, Math.min(maxDays, day || 1));

  // Find Gregorian Meskerem 1 for safeYear
  const estGregYear = safeYear + 7;
  const gDate = new Date(Date.UTC(estGregYear, 8, 1, 12, 0, 0)); // Sept 1 UTC

  const fmt = new Intl.DateTimeFormat("en-US-u-ca-ethiopic", {
    timeZone: "UTC",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });

  const getEth = (d: Date) => {
    const parts = fmt.formatToParts(d);
    let y = 0,
      m = 0,
      dayNum = 0;
    for (const p of parts) {
      if (p.type === "year") y = parseInt(p.value.replace(/[^0-9]/g, ""), 10);
      if (p.type === "month") m = parseInt(p.value, 10);
      if (p.type === "day") dayNum = parseInt(p.value, 10);
    }
    return { year: y, month: m, day: dayNum };
  };

  // Step until year matches and month == 1 and day == 1
  let attempts = 0;
  while (attempts < 30) {
    const eth = getEth(gDate);
    if (eth.year === safeYear && eth.month === 1 && eth.day === 1) {
      break;
    }
    gDate.setUTCDate(gDate.getUTCDate() + 1);
    attempts++;
  }

  // Add the offset for target month and day: (safeMonth - 1) * 30 + (safeDay - 1)
  const dayOffset = (safeMonth - 1) * 30 + (safeDay - 1);
  gDate.setUTCDate(gDate.getUTCDate() + dayOffset);

  const pad = (n: number) => String(n).padStart(2, "0");
  const gy = gDate.getUTCFullYear();
  const gm = gDate.getUTCMonth() + 1;
  const gd = gDate.getUTCDate();
  const iso = `${gy}-${pad(gm)}-${pad(gd)}`;

  return {
    iso,
    year: gy,
    month: gm,
    day: gd,
    date: gDate,
  };
}

/**
 * Get current Ethiopian Date representation of right now.
 */
export function getTodayEthiopian(): EthiopianDate {
  return gregorianToEthiopian(new Date());
}

/**
 * Format any date/ISO string into dual Habesha + GC or clean Habesha representation.
 * NEVER throws "Invalid time value" - returns "—" if invalid or missing.
 */
export function formatEthDate(
  input?: unknown,
  options?: {
    includeGregorian?: boolean;
    short?: boolean;
  }
): string {
  if (input == null || input === "") return "—";
  const safeDate = toSafeDate(input);
  if (!safeDate) return "—";

  try {
    const eth = gregorianToEthiopian(safeDate);
    const pad = (n: number) => String(n).padStart(2, "0");

    if (options?.short) {
      return `${pad(eth.day)}/${pad(eth.month)}/${eth.year} ዓ.ም`;
    }

    let result = `${eth.monthNameAm} ${eth.day}፣ ${eth.year} ዓ.ም (${pad(eth.day)}/${pad(eth.month)}/${eth.year})`;

    if (options?.includeGregorian) {
      try {
        const gcStr = safeDate.toISOString().slice(0, 10);
        if (gcStr) {
          result += ` [GC: ${gcStr}]`;
        }
      } catch {
        // ignore
      }
    }

    return result;
  } catch {
    return "—";
  }
}
