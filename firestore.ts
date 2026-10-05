import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
  runTransaction,
  Timestamp,
  QueryConstraint,
  Unsubscribe,
  getDocFromServer,
} from "firebase/firestore";
import { db } from "./firebase";
import { COLLECTIONS } from "./lib/firestoreCollections";
import { sanitizeForFirestore } from "./lib/sanitize";
import type { InventoryMovement } from "./types";

export { COLLECTIONS };
export { sanitizeForFirestore };

/**
 * Test live connectivity with Firestore
 */
export async function testFirestoreConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, "systems", "ping"));
    return true;
  } catch (err: any) {
    if (err instanceof Error && err.message.toLowerCase().includes("offline")) {
      return false;
    }
    return true;
  }
}

// In-memory cache purely for synchronous backward-compatibility if any caller needs it
const inMemoryCache = new Map<string, any[]>();

export function getLocalCollection<T>(collectionName: string): T[] {
  return (inMemoryCache.get(collectionName) as T[]) || [];
}

export function setLocalCollection<T>(collectionName: string, items: T[]): void {
  inMemoryCache.set(collectionName, items);
}

export function saveLocalDoc<T extends Record<string, unknown>>(collectionName: string, id: string, data: T): void {
  const list = getLocalCollection<any>(collectionName);
  const idx = list.findIndex(i => i.id === id);
  const full = { id, ...data };
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...full };
  } else {
    list.unshift(full);
  }
  setLocalCollection(collectionName, list);
}

export function deleteLocalDoc(collectionName: string, id: string): void {
  const list = getLocalCollection<any>(collectionName);
  const updated = list.filter(i => i.id !== id);
  setLocalCollection(collectionName, updated);
}

/** Map of voucher prefixes to their respective collection names */
const PREFIX_COLLECTION_MAP: Record<string, string> = {
  POS: COLLECTIONS.POS_SALES,
  STK: COLLECTIONS.STOCK_IN,
  DMG: COLLECTIONS.DAMAGE_RETURNS,
  RIN: COLLECTIONS.DAMAGE_RETURNS,
  ROUT: COLLECTIONS.DAMAGE_RETURNS,
  RET: COLLECTIONS.DAMAGE_RETURNS,
  REQ: COLLECTIONS.STORE_REQUESTS,
  BIN: COLLECTIONS.BINNING,
  DS: COLLECTIONS.DIRECT_SALES,
  ORD: COLLECTIONS.ORDER_VOUCHERS,
  TRF: COLLECTIONS.TRANSFERS,
  EXP: COLLECTIONS.EXPENSES,
  AV: COLLECTIONS.ACCOUNT_VOUCHERS,
};

/** Extract a clean YYYYMMDD date code from a date string, Date object, or current time */
export function extractVoucherDateCode(dateInput?: string | Date | null): string {
  if (!dateInput) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  }
  if (typeof dateInput === "string") {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      return `${match[1]}${match[2]}${match[3]}`;
    }
    const digits = dateInput.replace(/\D/g, "");
    if (digits.length >= 8) {
      return digits.slice(0, 8);
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

export function generateVoucherId(prefix: string, dateInput?: string | Date | null): string {
  const dateCode = extractVoucherDateCode(dateInput);
  const time = String(Date.now()).slice(-4);
  const rand = Math.floor(100 + Math.random() * 900);
  return `${prefix}-${dateCode}-${time}${rand}`;
}

/**
 * Generates an automatic, sequential, date-based voucher ID (e.g. POS-20260911-0001)
 * Directly queries Cloud Firestore to guarantee collision-free sequential numbers across all devices.
 */
export async function generateSerialVoucherId(prefix: string, dateInput?: string | Date | null): Promise<string> {
  const cleanPrefix = (prefix || "VOUCHER").toUpperCase().trim();
  const dateCode = extractVoucherDateCode(dateInput);
  const collectionName = PREFIX_COLLECTION_MAP[cleanPrefix];
  const existingIds = new Set<string>();

  if (collectionName) {
    try {
      const snap = await getDocs(collection(db, collectionName));
      snap.forEach(d => {
        const item = d.data();
        const idVal = item.voucherId || item.orderVoucherId || item.id;
        if (typeof idVal === "string" && idVal.trim()) {
          existingIds.add(idVal.trim().toUpperCase());
        }
      });
    } catch (e) {
      console.warn(`Query for voucher IDs on ${collectionName} warning:`, e);
    }
  }

  const prefixDatePattern = new RegExp(`^${cleanPrefix}-${dateCode}-(\\d+)$`, "i");
  let maxSeq = 0;
  for (const idStr of existingIds) {
    const match = idStr.match(prefixDatePattern);
    if (match && match[1]) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }

  let nextSeq = maxSeq + 1;
  let candidate = `${cleanPrefix}-${dateCode}-${String(nextSeq).padStart(4, "0")}`;
  while (existingIds.has(candidate.toUpperCase())) {
    nextSeq++;
    candidate = `${cleanPrefix}-${dateCode}-${String(nextSeq).padStart(4, "0")}`;
  }

  try {
    const counterRef = doc(db, COLLECTIONS.COUNTERS, `${cleanPrefix}_${dateCode}`);
    await setDoc(counterRef, { count: nextSeq, updatedAt: new Date().toISOString() }, { merge: true });
  } catch {}

  return candidate;
}

/**
 * Fetch all documents directly from Cloud Firestore
 */
export async function getAll<T>(collectionName: string, constraints: QueryConstraint[] = []): Promise<T[]> {
  try {
    const colRef = collection(db, collectionName);
    const q = constraints.length > 0 ? query(colRef, ...constraints) : colRef;
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as T));
    setLocalCollection(collectionName, docs);
    return docs;
  } catch (err) {
    console.error(`Direct Firestore read failed for "${collectionName}":`, err);
    return getLocalCollection<T>(collectionName);
  }
}

/**
 * Fetch a single document by ID directly from Cloud Firestore
 */
export async function getById<T>(collectionName: string, id: string): Promise<T | null> {
  try {
    const docRef = doc(db, collectionName, id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const item = { id: docSnap.id, ...docSnap.data() } as T;
      saveLocalDoc(collectionName, id, item as Record<string, unknown>);
      return item;
    }
    return null;
  } catch (err) {
    console.error(`Direct Firestore getById failed for "${collectionName}/${id}":`, err);
    const list = getLocalCollection<any>(collectionName);
    return list.find(i => i.id === id) || null;
  }
}

/**
 * Creates a new document directly in Cloud Firestore
 */
export async function create<T extends Record<string, unknown>>(
  collectionName: string,
  data: T
): Promise<string> {
  const id = (data.id as string) || `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const cleanPayload = sanitizeForFirestore({
    ...data,
    id,
    createdAt: data.createdAt || now,
    updatedAt: now,
    createdDate: now,
    updatedDate: now,
    version: 1,
  });

  const docRef = doc(db, collectionName, id);
  await setDoc(docRef, cleanPayload, { merge: true });
  saveLocalDoc(collectionName, id, cleanPayload);

  return id;
}

/**
 * Creates or overwrites a document with a specific ID directly in Cloud Firestore
 */
export async function createWithId<T extends Record<string, unknown>>(
  collectionName: string,
  id: string,
  data: T
): Promise<void> {
  const now = new Date().toISOString();
  const cleanPayload = sanitizeForFirestore({
    ...data,
    id,
    createdAt: data.createdAt || now,
    updatedAt: now,
    createdDate: now,
    updatedDate: now,
    version: 1,
  });

  const docRef = doc(db, collectionName, id);
  await setDoc(docRef, cleanPayload, { merge: true });
  saveLocalDoc(collectionName, id, cleanPayload);
}

/**
 * Updates an existing document directly in Cloud Firestore
 */
export async function update<T extends Record<string, unknown>>(
  collectionName: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  const now = new Date().toISOString();
  const updatePayload = sanitizeForFirestore({
    ...data,
    id,
    updatedAt: now,
    updatedDate: now,
  });

  const docRef = doc(db, collectionName, id);
  await setDoc(docRef, updatePayload, { merge: true });
  saveLocalDoc(collectionName, id, updatePayload);
}

/**
 * Deletes a document directly from Cloud Firestore
 */
export async function remove(collectionName: string, id: string): Promise<void> {
  const docRef = doc(db, collectionName, id);
  await deleteDoc(docRef);
  deleteLocalDoc(collectionName, id);
}

/**
 * Real-time collection subscriber directly listening to Cloud Firestore
 * Ensures Device B immediately reflects changes made on Device A in real time!
 */
export function subscribeCollection<T>(
  collectionName: string,
  onData: (data: T[]) => void,
  onError?: (err: Error) => void,
  constraints: QueryConstraint[] = []
): Unsubscribe {
  const colRef = collection(db, collectionName);
  const q = constraints.length > 0 ? query(colRef, ...constraints) : colRef;

  return onSnapshot(
    q,
    (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as T));
      setLocalCollection(collectionName, docs);
      onData(docs);
    },
    (err) => {
      console.error(`Direct Firestore real-time listener error for "${collectionName}":`, err.message);
      if (onError) onError(err);
    }
  );
}

/**
 * Log an audit trail entry into `inventory_movements` directly in Cloud Firestore
 */
export async function logInventoryMovement(movement: Omit<InventoryMovement, "id">): Promise<string> {
  const now = new Date().toISOString();
  const id = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const record = {
    ...movement,
    id,
    createdAt: now,
    updatedAt: now,
    voucherDate: movement.voucherDate || now.slice(0, 10),
  };

  const docRef = doc(db, COLLECTIONS.INVENTORY_MOVEMENTS, id);
  await setDoc(docRef, sanitizeForFirestore(record), { merge: true });
  saveLocalDoc(COLLECTIONS.INVENTORY_MOVEMENTS, id, record);

  return id;
}

/**
 * Record a manual stock adjustment directly into Cloud Firestore
 */
export async function executeStockAdjustment(params: {
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  productCode: string;
  prevQuantity: number;
  newQuantity: number;
  reason: string;
  userId?: string;
  userName?: string;
}): Promise<void> {
  const { storeId, storeName, productId, productName, productCode, prevQuantity, newQuantity, reason, userId, userName } = params;
  const difference = newQuantity - prevQuantity;

  await logInventoryMovement({
    type: "adjustment",
    productId,
    productName,
    productCode,
    storeId,
    storeName,
    prevQuantity,
    newQuantity,
    difference,
    reason: reason || "Manual stock adjustment",
    userId: userId || "",
    userName: userName || "Staff",
    voucherDate: new Date().toISOString().slice(0, 10),
  });

  const bincardId = `bin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const bincardRecord = {
    id: bincardId,
    date: new Date().toISOString().slice(0, 10),
    type: "adjustment",
    voucherId: `ADJ-${Date.now().toString().slice(-6)}`,
    storeId,
    storeName,
    productId,
    productName,
    productCode,
    quantity: difference,
    balance: newQuantity,
    remark: reason,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await createWithId(COLLECTIONS.BINCARD, bincardId, bincardRecord);
}

/**
 * Propagates updated product info across collections directly in Cloud Firestore
 */
export async function syncProductAcrossCollections(
  productId: string,
  info: { name: string; code: string; photoUrl?: string; categoryName?: string; quantityPerCarton?: number; size?: string }
): Promise<void> {
  const itemCollections = [
    COLLECTIONS.STOCK_IN,
    COLLECTIONS.POS_SALES,
    COLLECTIONS.TRANSFERS,
    COLLECTIONS.DAMAGE_RETURNS,
    COLLECTIONS.STORE_REQUESTS,
    COLLECTIONS.BINNING,
    COLLECTIONS.DIRECT_SALES,
  ];

  try {
    for (const colName of itemCollections) {
      const snap = await getDocs(collection(db, colName));
      for (const docSnap of snap.docs) {
        const docItem = docSnap.data();
        const items = docItem.items as Array<Record<string, unknown>> | undefined;
        if (!Array.isArray(items)) continue;
        let changed = false;
        const newItems = items.map(it => {
          if (it.productId !== productId) return it;
          changed = true;
          const updatedItem: Record<string, unknown> = {
            ...it,
            productName: info.name,
            productCode: info.code,
          };
          if ("photoUrl" in it && info.photoUrl !== undefined) updatedItem.photoUrl = info.photoUrl;
          if ("categoryName" in it && info.categoryName !== undefined) updatedItem.categoryName = info.categoryName;
          if ("quantityPerCarton" in it && info.quantityPerCarton !== undefined) updatedItem.quantityPerCarton = info.quantityPerCarton;
          if ("size" in it && info.size !== undefined) updatedItem.size = info.size;
          return updatedItem;
        });
        if (changed) {
          await updateDoc(doc(db, colName, docSnap.id), { items: newItems, updatedAt: new Date().toISOString() });
        }
      }
    }
  } catch (err) {
    console.warn("syncProductAcrossCollections background warning:", err);
  }
}

/**
 * Clear a collection directly from Cloud Firestore
 */
export async function clearCollection(collectionName: string): Promise<void> {
  setLocalCollection(collectionName, []);
  try {
    const snapshot = await getDocs(collection(db, collectionName));
    const batchSize = 500;
    let batch = writeBatch(db);
    let count = 0;
    for (const d of snapshot.docs) {
      batch.delete(d.ref);
      count++;
      if (count >= batchSize) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  } catch (e) {
    console.warn(`clearCollection error on ${collectionName}:`, e);
  }
}

export {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment,
  runTransaction,
  Timestamp,
};

export { db };
