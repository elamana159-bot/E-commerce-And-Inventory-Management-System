import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore";
import type { PosSale } from "@/lib/types";

export type PosVoucherType = "cash_register" | "manual_receipt";

export interface PosVoucherTypeSettings {
  cashRegister: {
    prefix: string; // e.g. "CR-"
    startNumber: number; // e.g. 1001
    padding: number; // e.g. 4
    name: string;
  };
  manualReceipt: {
    prefix: string; // e.g. "MSR-"
    startNumber: number; // e.g. 1001
    padding: number; // e.g. 4
    name: string;
  };
}

export const DEFAULT_VOUCHER_SETTINGS: PosVoucherTypeSettings = {
  cashRegister: {
    prefix: "CR-",
    startNumber: 1001,
    padding: 4,
    name: "Cash Register (የካሽ ሬጂስተር)",
  },
  manualReceipt: {
    prefix: "MSR-",
    startNumber: 1001,
    padding: 4,
    name: "Manual Sales Receipt (የማኑዋል የሽያጭ ደረሰኝ)",
  },
};

const STORAGE_KEY = "nexus_pos_voucher_settings";

/**
 * Load POS Voucher settings from localStorage (sync) or fallback to defaults
 */
export function getLocalVoucherSettings(): PosVoucherTypeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        cashRegister: {
          prefix: parsed.cashRegister?.prefix ?? DEFAULT_VOUCHER_SETTINGS.cashRegister.prefix,
          startNumber: Number(parsed.cashRegister?.startNumber) || DEFAULT_VOUCHER_SETTINGS.cashRegister.startNumber,
          padding: Number(parsed.cashRegister?.padding) || DEFAULT_VOUCHER_SETTINGS.cashRegister.padding,
          name: parsed.cashRegister?.name || DEFAULT_VOUCHER_SETTINGS.cashRegister.name,
        },
        manualReceipt: {
          prefix: parsed.manualReceipt?.prefix ?? DEFAULT_VOUCHER_SETTINGS.manualReceipt.prefix,
          startNumber: Number(parsed.manualReceipt?.startNumber) || DEFAULT_VOUCHER_SETTINGS.manualReceipt.startNumber,
          padding: Number(parsed.manualReceipt?.padding) || DEFAULT_VOUCHER_SETTINGS.manualReceipt.padding,
          name: parsed.manualReceipt?.name || DEFAULT_VOUCHER_SETTINGS.manualReceipt.name,
        },
      };
    }
  } catch {}
  return DEFAULT_VOUCHER_SETTINGS;
}

/**
 * Fetch settings from Firestore (with localStorage sync)
 */
export async function fetchVoucherSettings(): Promise<PosVoucherTypeSettings> {
  try {
    const ref = doc(db, COLLECTIONS.APP_SETTINGS, "pos_voucher_settings");
    const snap = await getDoc(ref);
    if (snap.exists()) {
      const data = snap.data() as Partial<PosVoucherTypeSettings>;
      const merged: PosVoucherTypeSettings = {
        cashRegister: {
          prefix: data.cashRegister?.prefix ?? DEFAULT_VOUCHER_SETTINGS.cashRegister.prefix,
          startNumber: Number(data.cashRegister?.startNumber) || DEFAULT_VOUCHER_SETTINGS.cashRegister.startNumber,
          padding: Number(data.cashRegister?.padding) || DEFAULT_VOUCHER_SETTINGS.cashRegister.padding,
          name: data.cashRegister?.name || DEFAULT_VOUCHER_SETTINGS.cashRegister.name,
        },
        manualReceipt: {
          prefix: data.manualReceipt?.prefix ?? DEFAULT_VOUCHER_SETTINGS.manualReceipt.prefix,
          startNumber: Number(data.manualReceipt?.startNumber) || DEFAULT_VOUCHER_SETTINGS.manualReceipt.startNumber,
          padding: Number(data.manualReceipt?.padding) || DEFAULT_VOUCHER_SETTINGS.manualReceipt.padding,
          name: data.manualReceipt?.name || DEFAULT_VOUCHER_SETTINGS.manualReceipt.name,
        },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch (e) {
    console.warn("Failed fetching pos_voucher_settings from Firestore:", e);
  }
  return getLocalVoucherSettings();
}

/**
 * Save settings to both Firestore and localStorage
 */
export async function saveVoucherSettings(settings: PosVoucherTypeSettings): Promise<void> {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {}

  try {
    const ref = doc(db, COLLECTIONS.APP_SETTINGS, "pos_voucher_settings");
    await setDoc(ref, {
      ...settings,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (e) {
    console.warn("Failed saving pos_voucher_settings to Firestore:", e);
  }
}

/**
 * Calculates the next sequential voucher ID based on voucher type,
 * existing sales records, and starting number configuration.
 */
export function getNextPosVoucherId(
  type: PosVoucherType,
  existingSales: PosSale[],
  settings?: PosVoucherTypeSettings
): string {
  const currentSettings = settings || getLocalVoucherSettings();
  const cfg = type === "cash_register" ? currentSettings.cashRegister : currentSettings.manualReceipt;
  const prefix = cfg.prefix || "";
  const startNumber = Number(cfg.startNumber) || 1;
  const padding = Number(cfg.padding) || 4;

  // Find sales that match this voucher type or prefix
  const relevantSales = existingSales.filter(s => {
    if (s.isVoided) return false;
    const vType = s.voucherType;
    if (vType === type) return true;
    if (type === "cash_register") {
      if (vType === "Cash Register" || vType === "cash") return true;
      if (prefix && s.voucherId && s.voucherId.toUpperCase().startsWith(prefix.toUpperCase())) return true;
      // Also match default CR-
      if (s.voucherId && s.voucherId.toUpperCase().startsWith("CR-")) return true;
    } else if (type === "manual_receipt") {
      if (vType === "Manual Sales Receipt" || vType === "manual") return true;
      if (prefix && s.voucherId && s.voucherId.toUpperCase().startsWith(prefix.toUpperCase())) return true;
      // Also match default MSR-
      if (s.voucherId && s.voucherId.toUpperCase().startsWith("MSR-")) return true;
    }
    return false;
  });

  let maxNum = 0;
  for (const s of relevantSales) {
    const vId = (s.voucherId || "").trim();
    if (!vId) continue;

    // Check if starts with configured prefix
    if (prefix && vId.toUpperCase().startsWith(prefix.toUpperCase())) {
      const rest = vId.slice(prefix.length).trim();
      const match = rest.match(/^(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    } else {
      // Look for any trailing or embedded digits
      const match = vId.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
  }

  // Next number: if max existing is below startNumber, start at startNumber; else max + 1
  const nextNum = maxNum >= startNumber ? maxNum + 1 : startNumber;
  const formattedNum = String(nextNum).padStart(padding, "0");
  return `${prefix}${formattedNum}`;
}

export function formatVoucherTypeLabel(type?: string): { en: string; am: string; short: string } {
  if (type === "cash_register" || type === "Cash Register") {
    return {
      en: "Cash Register",
      am: "የካሽ ሬጂስተር",
      short: "CR",
    };
  }
  if (type === "manual_receipt" || type === "Manual Sales Receipt") {
    return {
      en: "Manual Sales Receipt",
      am: "የማኑዋል የሽያጭ ደረሰኝ",
      short: "MSR",
    };
  }
  return {
    en: "Standard POS",
    am: "መደበኛ POS",
    short: "POS",
  };
}
