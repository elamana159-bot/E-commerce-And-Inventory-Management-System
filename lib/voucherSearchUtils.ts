import { formatSafeDate } from "@/lib/dateUtils";
import { formatEthDate } from "@/lib/ethiopianCalendar";

export interface SearchableVoucherRow {
  voucherId?: string;
  voucherDate?: string;
  createdAt?: string | number | any;
  totalCartons?: number;
  totalUnits?: number;
  totalAmount?: number;
  totalPrice?: number;
  subtotal?: number;
  amountPaid?: number;
  remainingBalance?: number;
  storeName?: string;
  fromStoreName?: string;
  toStoreName?: string;
  supplierName?: string;
  customerName?: string;
  fsNumber?: string;
  paymentMethod?: string;
  transferType?: string;
  accountBankName?: string;
  accountPersonName?: string;
  remark?: string;
  notes?: string;
  status?: string;
  createdByName?: string;
  type?: string; // e.g. "damage" | "return"
  shelf?: string;
  bin?: string;
  items?: Array<{
    productName?: string;
    productCode?: string;
    barcodeValue?: string;
    categoryName?: string;
    cartonsReceived?: number;
    cartons?: number;
    quantity?: number;
    units?: number;
    unitPrice?: number;
    cartonPrice?: number;
    totalPrice?: number;
    adjustedPrice?: number;
    sellingPrice?: number;
    reason?: string;
    shelf?: string;
    bin?: string;
  }>;
  [key: string]: any;
}

const ETHIOPIAN_MONTHS_EN: Record<string, string> = {
  "መስከረም": "meskerem",
  "ጥቅምት": "tikimt tekemt",
  "ህዳር": "hidar hedar",
  "ታህሳስ": "tahsas",
  "ጥር": "tir ter",
  "የካቲት": "yekatit",
  "መጋቢት": "megabit",
  "ሚያዝያ": "miyazya",
  "ግንቦት": "ginbot",
  "ሰኔ": "sene",
  "ሐምሌ": "hamle",
  "ነሐሴ": "nehase",
  "ጳጉሜን": "pagume pagumen",
};

/**
 * Matches a transaction / voucher record against a search query.
 * Matches:
 * 1. Voucher Creation Date / Voucher Date (ISO, formatted Gregorian, Ethiopian date & transliterations)
 * 2. Total Cartons (exact or included, e.g. "10", "10 ctn", "10 cartons")
 * 3. All row data (Voucher ID, Store, Customer, Supplier, FS Number, Status, Amounts, Items, Remarks, etc.)
 */
export function matchesVoucherSearch(row: SearchableVoucherRow, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  // Build searchable text corpus for this row
  const parts: string[] = [];

  // 1. Voucher ID
  if (row.voucherId) parts.push(String(row.voucherId));

  // 2. Dates (voucherDate and createdAt)
  const dates = [row.voucherDate, row.createdAt].filter(Boolean);
  for (const d of dates) {
    const isoStr = typeof d === "string" ? d : "";
    if (isoStr) parts.push(isoStr);

    try {
      const safeG = formatSafeDate(d);
      if (safeG && safeG !== "—") {
        parts.push(safeG);
      }
    } catch {}

    try {
      const ethStr = formatEthDate(d, { includeGregorian: true });
      if (ethStr) {
        parts.push(ethStr);
        for (const [am, en] of Object.entries(ETHIOPIAN_MONTHS_EN)) {
          if (ethStr.includes(am)) {
            parts.push(en);
          }
        }
      }
    } catch {}
  }

  // 3. Total Cartons
  let calculatedCartons = row.totalCartons ?? 0;
  if (!calculatedCartons && row.items && row.items.length > 0) {
    calculatedCartons = row.items.reduce((s, i) => s + (i.cartonsReceived || i.cartons || 0), 0);
  }
  if (calculatedCartons > 0) {
    const cStr = Number.isInteger(calculatedCartons) ? String(calculatedCartons) : calculatedCartons.toFixed(2);
    parts.push(cStr);
    parts.push(`${cStr} ctn`);
    parts.push(`${cStr} ctns`);
    parts.push(`${cStr} carton`);
    parts.push(`${cStr} cartons`);
  }

  // Total Units
  const units = row.totalUnits ?? (row.items ? row.items.reduce((s, i) => s + (i.quantity || i.units || 0), 0) : 0);
  if (units > 0) {
    parts.push(String(units));
    parts.push(`${units} pcs`);
    parts.push(`${units} units`);
  }

  // 4. Stores & People
  if (row.storeName) parts.push(row.storeName);
  if (row.fromStoreName) parts.push(row.fromStoreName);
  if (row.toStoreName) parts.push(row.toStoreName);
  if (row.supplierName) parts.push(row.supplierName);
  if (row.customerName) parts.push(row.customerName);
  if (row.createdByName) parts.push(row.createdByName);

  // 5. Financial & Document Info
  if (row.fsNumber) parts.push(row.fsNumber);
  if (row.paymentMethod) {
    parts.push(row.paymentMethod);
    if (row.paymentMethod === "cash") parts.push("ጥሬ ገንዘብ");
    if (row.paymentMethod === "transfer") parts.push("ዝውውር");
    if (row.paymentMethod === "credit") parts.push("ብድር ዱቤ");
  }
  if (row.transferType) parts.push(row.transferType);
  if (row.accountBankName) parts.push(row.accountBankName);
  if (row.accountPersonName) parts.push(row.accountPersonName);

  // Amounts
  const amounts = [
    row.totalPrice,
    row.totalAmount,
    row.subtotal,
    row.amountPaid,
    row.remainingBalance,
  ].filter(a => typeof a === "number" && a > 0);
  for (const amt of amounts) {
    parts.push(String(amt));
    parts.push(Number(amt).toLocaleString());
  }

  // Status & Remark
  if (row.status) parts.push(row.status);
  if (row.remark) parts.push(row.remark);
  if (row.notes) parts.push(row.notes);
  if (row.type) {
    parts.push(row.type);
    if (row.type === "damage") parts.push("የተበላሸ damage");
    if (row.type === "return" || row.type === "return_in") parts.push("ተመላሽ ተመላሽ ገቢ return returns in sales return customer return");
    if (row.type === "return_out") parts.push("ተመላሽ ተመላሽ ወጪ return returns out supplier return");
  }
  if (row.shelf) parts.push(`shelf ${row.shelf}`);
  if (row.bin) parts.push(`bin ${row.bin}`);

  // 6. All items in voucher
  if (Array.isArray(row.items)) {
    for (const it of row.items) {
      if (it.productName) parts.push(it.productName);
      if (it.productCode) parts.push(it.productCode);
      if (it.barcodeValue) parts.push(it.barcodeValue);
      if (it.categoryName) parts.push(it.categoryName);
      if (it.reason) parts.push(it.reason);
      if (it.shelf) parts.push(it.shelf);
      if (it.bin) parts.push(it.bin);
      if (typeof it.quantity === "number") parts.push(String(it.quantity));
      if (typeof it.cartonsReceived === "number" && it.cartonsReceived > 0) {
        parts.push(String(it.cartonsReceived));
      }
      if (typeof it.cartons === "number" && it.cartons > 0) {
        parts.push(String(it.cartons));
      }
    }
  }

  const haystack = parts.join(" ").toLowerCase();

  // All query tokens must match the haystack
  return tokens.every(token => haystack.includes(token));
}
