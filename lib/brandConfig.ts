import { getAll, update, create, COLLECTIONS } from "@/firestore";
import type { AppSettings } from "@/types";

export const BRAND_STORAGE_KEY = "nexus_stock_brand_name";
export const BRAND_TAGLINE_KEY = "nexus_stock_brand_tagline";
export const DEFAULT_BRAND_NAME = "YESERAHUT";
export const DEFAULT_TAGLINE = "MANAGEMENT SYSTEM";

/**
 * Synchronously retrieves the current brand name.
 * 1. Checks direct localStorage key
 * 2. Checks cached AppSettings in localStorage
 * 3. Falls back to DEFAULT_BRAND_NAME
 */
export function getStoredBrandName(): string {
  if (typeof window === "undefined") return DEFAULT_BRAND_NAME;
  try {
    const direct = localStorage.getItem(BRAND_STORAGE_KEY);
    if (direct && direct.trim()) return direct.trim();

    const cachedSettings = localStorage.getItem("nexus_stock_app_settings");
    if (cachedSettings) {
      const parsed = JSON.parse(cachedSettings);
      const name = parsed.brandName || parsed.companyName || parsed.ecommerceName;
      if (name && typeof name === "string" && name.trim()) {
        return name.trim();
      }
    }
  } catch {
    // Ignore and fall back
  }
  return DEFAULT_BRAND_NAME;
}

/**
 * Sets the brand name into localStorage and dispatches a change event
 */
export function setStoredBrandName(name: string, tagline?: string): void {
  if (typeof window === "undefined") return;
  try {
    const cleanName = (name || "").trim() || DEFAULT_BRAND_NAME;
    localStorage.setItem(BRAND_STORAGE_KEY, cleanName);
    if (tagline !== undefined) {
      localStorage.setItem(BRAND_TAGLINE_KEY, (tagline || "").trim() || DEFAULT_TAGLINE);
    }
    window.dispatchEvent(
      new CustomEvent("brand_settings_changed", {
        detail: { brandName: cleanName, tagline },
      })
    );
  } catch (err) {
    console.error("Failed to store brand name in localStorage", err);
  }
}

/**
 * Returns the tagline / header system title
 */
export function getStoredBrandTagline(): string {
  if (typeof window === "undefined") return DEFAULT_TAGLINE;
  try {
    const tag = localStorage.getItem(BRAND_TAGLINE_KEY);
    if (tag && tag.trim()) return tag.trim();
  } catch {}
  return DEFAULT_TAGLINE;
}

/**
 * Formats a report title dynamically:
 * Replaces any occurrence of "YESERAHUT" with the configured brand name.
 */
export function replaceBrandInTitle(rawTitle: string, brandOverride?: string): string {
  if (!rawTitle) return "";
  const brand = (brandOverride || getStoredBrandName() || DEFAULT_BRAND_NAME).trim();
  const regex = /YESERAHUT/gi;
  if (regex.test(rawTitle)) {
    return rawTitle.replace(regex, brand.toUpperCase());
  }
  return rawTitle;
}

/**
 * Returns corporate header banner text (e.g. "ABDU MANAGEMENT SYSTEM" or "YESERAHUT MANAGEMENT SYSTEM")
 */
export function getSystemHeaderBadge(brandOverride?: string, taglineOverride?: string): string {
  const brand = (brandOverride || getStoredBrandName() || DEFAULT_BRAND_NAME).trim().toUpperCase();
  const tagline = (taglineOverride || getStoredBrandTagline() || DEFAULT_TAGLINE).trim().toUpperCase();
  return `${brand} ${tagline}`;
}

/**
 * Returns footer branding text
 */
export function getSystemFooterBranding(brandOverride?: string): string {
  const brand = (brandOverride || getStoredBrandName() || DEFAULT_BRAND_NAME).trim();
  return `${brand} Inventory & Business Management System`;
}

/**
 * Asynchronously loads brand info from database and syncs to local storage cache
 */
export async function loadAndCacheBrandSettings(): Promise<{
  brandName: string;
  tagline: string;
  settings: AppSettings | null;
}> {
  try {
    const list = await getAll<AppSettings>(COLLECTIONS.APP_SETTINGS);
    if (list && list.length > 0) {
      const s = list[0];
      const brand = s.brandName || s.companyName || s.ecommerceName || DEFAULT_BRAND_NAME;
      const tagline = s.systemTitle || s.ecommerceTagline || DEFAULT_TAGLINE;
      setStoredBrandName(brand, tagline);
      try {
        localStorage.setItem("nexus_stock_app_settings", JSON.stringify(s));
      } catch {}
      return { brandName: brand, tagline, settings: s };
    }
  } catch (err) {
    console.warn("Could not fetch brand settings from DB, using cached/default:", err);
  }
  return { brandName: getStoredBrandName(), tagline: getStoredBrandTagline(), settings: null };
}

/**
 * Saves updated brand settings to database and local cache
 */
export async function saveBrandSettings(updates: {
  brandName: string;
  systemTitle?: string;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
}): Promise<void> {
  const brandName = updates.brandName.trim() || DEFAULT_BRAND_NAME;
  const systemTitle = (updates.systemTitle || DEFAULT_TAGLINE).trim();

  // Save to local cache first for instant feedback
  setStoredBrandName(brandName, systemTitle);

  // Sync to database
  const list = await getAll<AppSettings>(COLLECTIONS.APP_SETTINGS);
  const dataToSave: Partial<AppSettings> = {
    brandName,
    companyName: updates.companyName?.trim() || brandName,
    systemTitle,
    ecommerceName: updates.companyName?.trim() || brandName,
    companyPhone: updates.companyPhone?.trim(),
    companyAddress: updates.companyAddress?.trim(),
  };

  if (list && list.length > 0) {
    await update(COLLECTIONS.APP_SETTINGS, list[0].id, dataToSave as Record<string, unknown>);
  } else {
    await create(COLLECTIONS.APP_SETTINGS, dataToSave as Record<string, unknown>);
  }

  // Update cached full settings
  try {
    const existingCached = localStorage.getItem("nexus_stock_app_settings");
    const merged = existingCached ? { ...JSON.parse(existingCached), ...dataToSave } : dataToSave;
    localStorage.setItem("nexus_stock_app_settings", JSON.stringify(merged));
  } catch {}
}
