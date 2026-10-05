/**
 * Direct Cloud Firestore Storage Engine for Saved Receipts & Statements
 */

import { formatEthDate } from "../ethiopianCalendar";
import { doc, setDoc, deleteDoc, getDocs, collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import { sanitizeForFirestore } from "./sanitize";

export interface SavedReceiptRecord {
  id: string;
  voucherId: string;
  voucherTitle: string;
  voucherSubtitle?: string;
  filenamePrefix?: string;
  type: "receipt" | "statement" | "report" | "voucher";
  savedAt: string;
  savedAtFormatted: string;
  ethiopianDate: string;
  referencePhotoUrl?: string;
  htmlContent?: string;
  textContent?: string;
  data?: Record<string, any>;
  syncStatus?: "synced" | "pending" | "syncing" | "failed";
}

export const SAVED_RECEIPTS_EVENT = "nexus_saved_receipts_changed";

function makeReceiptRecordId(voucherId: string, type: string): string {
  const clean = (voucherId || "doc").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  const cleanType = (type || "rcpt").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
  return `save_${cleanType}_${clean}`;
}

export function detectDocumentType(title?: string, voucherId?: string): "receipt" | "statement" | "report" | "voucher" {
  const text = `${title || ""} ${voucherId || ""}`.toLowerCase();
  if (text.includes("statement") || text.includes("ስቴትመንት") || text.includes("ሂሳብ መግለጫ")) {
    return "statement";
  }
  if (text.includes("report") || text.includes("ሪፖርት")) {
    return "report";
  }
  if (text.includes("voucher") || text.includes("ቮውቸር") || text.includes("order")) {
    return "voucher";
  }
  return "receipt";
}

export async function saveReceiptToLocalDb(params: {
  receiptElement?: HTMLElement | null;
  voucherId?: string;
  voucherTitle?: string;
  voucherSubtitle?: string;
  filenamePrefix?: string;
  referencePhotoUrl?: string;
  type?: "receipt" | "statement" | "report" | "voucher";
  data?: Record<string, any>;
}): Promise<SavedReceiptRecord> {
  const now = new Date();
  const voucherId = (params.voucherId || `VOUCHER-${Date.now()}`).trim();
  const voucherTitle = (params.voucherTitle || "RECEIPT VOUCHER").trim();
  const docType = params.type || detectDocumentType(voucherTitle, voucherId);
  const id = makeReceiptRecordId(voucherId, docType);

  let ethDateStr = "";
  try {
    ethDateStr = formatEthDate(now);
  } catch {
    ethDateStr = "";
  }

  let htmlContent = "";
  let textContent = "";
  if (params.receiptElement) {
    try {
      htmlContent = params.receiptElement.innerHTML || "";
      textContent = (params.receiptElement.innerText || "").slice(0, 1000);
    } catch (e) {
      console.warn("Failed to serialize element content:", e);
    }
  }

  const record: SavedReceiptRecord = {
    id,
    voucherId,
    voucherTitle,
    voucherSubtitle: params.voucherSubtitle || "",
    filenamePrefix: params.filenamePrefix || (docType === "statement" ? "statement" : "receipt"),
    type: docType,
    savedAt: now.toISOString(),
    savedAtFormatted: now.toLocaleString(),
    ethiopianDate: ethDateStr,
    referencePhotoUrl: params.referencePhotoUrl || "",
    htmlContent,
    textContent,
    data: params.data,
    syncStatus: "synced",
  };

  // Direct Cloud Firestore write
  try {
    await setDoc(doc(db, "saved_receipts", id), sanitizeForFirestore(record), { merge: true });
  } catch (err) {
    console.warn("Direct Firestore save receipt error:", err);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SAVED_RECEIPTS_EVENT, { detail: record }));
  }

  return record;
}

export async function getSavedReceiptsFromLocalDb(): Promise<SavedReceiptRecord[]> {
  try {
    const q = query(collection(db, "saved_receipts"), orderBy("savedAt", "desc"), limit(100));
    const snap = await getDocs(q);
    if (!snap.empty) {
      return snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedReceiptRecord));
    }
  } catch (err) {
    console.warn("Direct Firestore getSavedReceipts error:", err);
  }

  return [];
}

export async function isReceiptSavedInLocalDb(voucherId?: string): Promise<boolean> {
  if (!voucherId || !voucherId.trim()) return false;
  const cleanId = voucherId.trim();

  try {
    const list = await getSavedReceiptsFromLocalDb();
    return list.some(r => r.voucherId === cleanId);
  } catch {}

  return false;
}

export async function deleteSavedReceiptFromLocalDb(id: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "saved_receipts", id));
  } catch (err) {
    console.warn("Direct Firestore deleteSavedReceipt error:", err);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SAVED_RECEIPTS_EVENT, { detail: { deletedId: id } }));
  }
}

export async function clearAllSavedReceiptsFromLocalDb(): Promise<void> {
  try {
    const snap = await getDocs(collection(db, "saved_receipts"));
    for (const d of snap.docs) {
      await deleteDoc(d.ref);
    }
  } catch (err) {
    console.warn("Direct Firestore clearAllSavedReceipts error:", err);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SAVED_RECEIPTS_EVENT, { detail: { cleared: true } }));
  }
}
