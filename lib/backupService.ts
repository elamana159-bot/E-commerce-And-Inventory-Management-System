/**
 * NexusStock Direct Cloud Backup & Restore Service
 * Directly reads and restores Cloud Firestore collections.
 */

import { COLLECTIONS } from "./firestoreCollections";
import { db } from "../firebase";
import {
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  collection,
  query,
  orderBy,
  limit,
  writeBatch,
} from "firebase/firestore";

export interface BackupSummary {
  productsCount: number;
  salesCount: number;
  customersCount: number;
  suppliersCount: number;
  categoriesCount: number;
  storesCount: number;
  inventoryCount: number;
  expensesCount: number;
  accountsCount: number;
  transfersCount: number;
  damageReturnsCount: number;
  orderVouchersCount: number;
  pricingCount: number;
  bincardCount: number;
  promotionsCount: number;
  settingsCount: number;
  usersCount: number;
  totalRecords: number;
  totalEntities: number;
}

export interface CloudBackup {
  id: string;
  backupDate: string;
  backupTime: string;
  createdAt: string;
  timestamp: number;
  deviceId: string;
  deviceInfo: string;
  appVersion: string;
  dbVersion: number;
  status: "completed" | "pending" | "failed";
  type: "manual" | "automatic" | "safety";
  name?: string;
  createdBy: string;
  sizeBytes: number;
  sizeFormatted: string;
  summary: BackupSummary;
  snapshot: Record<string, any[]>;
}

export interface BackupSettings {
  autoBackupEnabled: boolean;
  frequency: "hourly" | "every_6_hours" | "daily" | "weekly";
  maxBackupsToKeep: number;
  lastBackupDate?: string;
  lastBackupTimestamp?: number;
  lastBackupStatus?: "completed" | "failed" | "offline";
  notificationOnBackup?: boolean;
}

export function initializeAutoBackupDaemon(): void {
  // Direct Cloud Firestore backup daemon
}

const SETTINGS_KEY = "nexus_backup_settings";
const SAFETY_BACKUP_KEY = "nexus_safety_backup";

export const DEFAULT_SETTINGS: BackupSettings = {
  autoBackupEnabled: true,
  frequency: "daily",
  maxBackupsToKeep: 15,
  notificationOnBackup: true,
};

export const BACKUP_ENTITIES = [
  COLLECTIONS.PRODUCTS,
  COLLECTIONS.CATEGORIES,
  COLLECTIONS.STORES,
  COLLECTIONS.SUPPLIERS,
  COLLECTIONS.CUSTOMERS,
  COLLECTIONS.STOCK_IN,
  COLLECTIONS.POS_SALES,
  COLLECTIONS.ORDER_VOUCHERS,
  COLLECTIONS.TRANSFERS,
  COLLECTIONS.DAMAGE_RETURNS,
  COLLECTIONS.EXPENSES,
  COLLECTIONS.PRICING,
  COLLECTIONS.STORE_BALANCE,
  COLLECTIONS.BINCARD,
  COLLECTIONS.SUPPLIER_PAYMENTS,
  COLLECTIONS.CUSTOMER_PAYMENTS,
  COLLECTIONS.ACCOUNTS,
  COLLECTIONS.ACCOUNT_VOUCHERS,
  COLLECTIONS.PROMOTIONS,
  COLLECTIONS.DIRECT_SALES,
  COLLECTIONS.APP_SETTINGS,
  COLLECTIONS.BINNING,
  COLLECTIONS.INVENTORY_MOVEMENTS,
  COLLECTIONS.CHART_OF_ACCOUNTS,
  COLLECTIONS.JOURNAL_ENTRIES,
] as const;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getDeviceInfo(): string {
  if (typeof navigator === "undefined") return "Unknown Device";
  const ua = navigator.userAgent;
  let browser = "Browser";
  if (ua.includes("Chrome")) browser = "Chrome";
  else if (ua.includes("Safari")) browser = "Safari";
  else if (ua.includes("Firefox")) browser = "Firefox";
  else if (ua.includes("Edge")) browser = "Edge";

  let os = "Desktop";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";

  return `${browser} (${os})`;
}

export function getBackupSettings(): BackupSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_SETTINGS };
}

export function saveBackupSettings(updates: Partial<BackupSettings>): BackupSettings {
  const current = getBackupSettings();
  const next = { ...current, ...updates };
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {}
  return next;
}

/**
 * Takes a full snapshot directly from Cloud Firestore
 */
export async function takeLocalDatabaseSnapshot(
  type: "manual" | "automatic" | "safety" = "manual",
  customName?: string,
  createdBy = "Admin"
): Promise<CloudBackup> {
  const now = new Date();
  const backupDate = now.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const backupTime = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const snapshot: Record<string, any[]> = {};
  let totalRecords = 0;

  for (const entity of BACKUP_ENTITIES) {
    try {
      const snap = await getDocs(collection(db, entity));
      snapshot[entity] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      totalRecords += snapshot[entity].length;
    } catch {
      snapshot[entity] = [];
    }
  }

  const summary: BackupSummary = {
    productsCount: snapshot[COLLECTIONS.PRODUCTS]?.length || 0,
    salesCount:
      (snapshot[COLLECTIONS.POS_SALES]?.length || 0) +
      (snapshot[COLLECTIONS.DIRECT_SALES]?.length || 0) +
      (snapshot[COLLECTIONS.ORDER_VOUCHERS]?.length || 0),
    customersCount: snapshot[COLLECTIONS.CUSTOMERS]?.length || 0,
    suppliersCount: snapshot[COLLECTIONS.SUPPLIERS]?.length || 0,
    categoriesCount: snapshot[COLLECTIONS.CATEGORIES]?.length || 0,
    storesCount: snapshot[COLLECTIONS.STORES]?.length || 0,
    inventoryCount:
      (snapshot[COLLECTIONS.STOCK_IN]?.length || 0) +
      (snapshot[COLLECTIONS.INVENTORY_MOVEMENTS]?.length || 0) +
      (snapshot[COLLECTIONS.STORE_BALANCE]?.length || 0),
    expensesCount: snapshot[COLLECTIONS.EXPENSES]?.length || 0,
    accountsCount: snapshot[COLLECTIONS.ACCOUNTS]?.length || 0,
    transfersCount: snapshot[COLLECTIONS.TRANSFERS]?.length || 0,
    damageReturnsCount: snapshot[COLLECTIONS.DAMAGE_RETURNS]?.length || 0,
    orderVouchersCount: snapshot[COLLECTIONS.ORDER_VOUCHERS]?.length || 0,
    pricingCount: snapshot[COLLECTIONS.PRICING]?.length || 0,
    bincardCount: snapshot[COLLECTIONS.BINCARD]?.length || 0,
    promotionsCount: snapshot[COLLECTIONS.PROMOTIONS]?.length || 0,
    settingsCount: snapshot[COLLECTIONS.APP_SETTINGS]?.length || 0,
    usersCount: snapshot[COLLECTIONS.USERS]?.length || 0,
    totalRecords,
    totalEntities: BACKUP_ENTITIES.length,
  };

  const jsonString = JSON.stringify(snapshot);
  const sizeBytes = new Blob([jsonString]).size;
  const sizeFormatted = formatBytes(sizeBytes);

  const dateSlug = now.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const randomSuffix = Math.random().toString(36).slice(2, 6);
  const id = `bkp_${dateSlug}_${randomSuffix}`;

  const backup: CloudBackup = {
    id,
    backupDate,
    backupTime,
    createdAt: now.toISOString(),
    timestamp: now.getTime(),
    deviceId: "cloud_direct",
    deviceInfo: getDeviceInfo(),
    appVersion: "1.0.0",
    dbVersion: 2,
    status: "completed",
    type,
    name: customName || `Cloud Backup - ${backupDate}`,
    createdBy,
    sizeBytes,
    sizeFormatted,
    summary,
    snapshot,
  };

  return backup;
}

export async function createCloudBackup(
  type: "manual" | "automatic" = "manual",
  customName?: string,
  createdBy = "Admin"
): Promise<{ success: boolean; backup?: CloudBackup; error?: string }> {
  try {
    const backup = await takeLocalDatabaseSnapshot(type, customName, createdBy);
    const backupRef = doc(db, COLLECTIONS.BACKUPS, backup.id);
    await setDoc(backupRef, backup);

    saveBackupSettings({
      lastBackupDate: backup.createdAt,
      lastBackupStatus: "completed",
    });

    return { success: true, backup };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

export async function getCloudBackupsList(): Promise<CloudBackup[]> {
  try {
    const q = query(collection(db, COLLECTIONS.BACKUPS), orderBy("timestamp", "desc"), limit(50));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as CloudBackup));
  } catch (err) {
    console.warn("getCloudBackupsList warning:", err);
    return [];
  }
}

export async function deleteCloudBackup(backupId: string): Promise<boolean> {
  try {
    await deleteDoc(doc(db, COLLECTIONS.BACKUPS, backupId));
    return true;
  } catch (err) {
    console.error("deleteCloudBackup error:", err);
    return false;
  }
}

export async function restoreFromBackup(
  backup: CloudBackup
): Promise<{ success: boolean; safetyBackupId?: string; error?: string }> {
  if (!backup || !backup.snapshot) {
    return { success: false, error: "Invalid backup payload. Snapshot is missing." };
  }

  try {
    const snapshot = backup.snapshot;
    for (const entity of BACKUP_ENTITIES) {
      const records = snapshot[entity];
      if (Array.isArray(records)) {
        // Direct batch writes to Firestore
        const batchSize = 400;
        for (let i = 0; i < records.length; i += batchSize) {
          const chunk = records.slice(i, i + batchSize);
          const batch = writeBatch(db);
          for (const item of chunk) {
            if (item && item.id) {
              const docRef = doc(db, entity, item.id);
              batch.set(docRef, item, { merge: true });
            }
          }
          await batch.commit();
        }
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to restore backup" };
  }
}

export function exportBackupToFile(backup: CloudBackup): void {
  try {
    const jsonStr = JSON.stringify(backup, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${backup.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn("Export backup error:", e);
  }
}

export async function importBackupFromFile(file: File): Promise<CloudBackup> {
  const text = await file.text();
  const parsed = JSON.parse(text);
  if (!parsed || !parsed.snapshot || !parsed.summary) {
    throw new Error("Invalid backup JSON format.");
  }
  return parsed as CloudBackup;
}
