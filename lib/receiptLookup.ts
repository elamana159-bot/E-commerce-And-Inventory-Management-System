/**
 * Universal Digital Receipt Lookup Service
 * Retrieves transaction details across POS Sales, Direct Sales, Orders, Returns, and more,
 * with IndexedDB caching and real-time Firestore fallback.
 */

import { getAll, COLLECTIONS } from "@/firestore";
import type { PosSale, DirectSale, EcommerceOrder, DamageReturn, Product, Store, Customer } from "@/types";
import { getStoredBrandName } from "./brandConfig";
import { toSafeIsoDate } from "./dateUtils";

export interface DigitalReceiptItem {
  productId: string;
  productName: string;
  productCode?: string;
  photoUrl?: string;
  quantity: number;
  cartons?: number;
  quantityPerCarton?: number;
  unitPrice: number;
  cartonPrice?: number;
  totalPrice: number;
  reason?: string;
}

export interface UniversalReceiptData {
  id: string;
  voucherId: string;
  type: "pos" | "direct_sale" | "order" | "damage_return" | "stock_in" | "transfer" | "expense" | "general";
  title: string;
  subtitle?: string;
  voucherDate: string;
  createdAt?: string;
  storeId?: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  supplierName?: string;
  paymentMethod?: string;
  transferType?: string;
  accountBankName?: string;
  accountPersonName?: string;
  accountNumber?: string;
  fsNumber?: string;
  items: DigitalReceiptItem[];
  subtotal: number;
  tax?: number;
  discount?: number;
  totalAmount: number;
  amountPaid?: number;
  remainingBalance?: number;
  customerTotalBalance?: number;
  remark?: string;
  createdByName?: string;
  checkedBy?: string;
  isChecked?: boolean;
  checkedAt?: string;
  referencePhotoUrl?: string;
  status?: string;
  brandName: string;
}

/**
 * Fetch a receipt by voucher ID (e.g. POS-2026-0001) or document ID
 */
export async function lookupReceipt(voucherOrDocId: string): Promise<UniversalReceiptData | null> {
  const query = (voucherOrDocId || "").trim();
  if (!query) return null;

  const brandName = getStoredBrandName();

  // Load products, stores, customers for enrichment
  const [products, stores, customers] = await Promise.all([
    getAll<Product>(COLLECTIONS.PRODUCTS).catch(() => [] as Product[]),
    getAll<Store>(COLLECTIONS.STORES).catch(() => [] as Store[]),
    getAll<Customer>(COLLECTIONS.CUSTOMERS).catch(() => [] as Customer[]),
  ]);

  const productMap = new Map<string, Product>();
  products.forEach((p) => {
    if (p.id) productMap.set(p.id, p);
  });

  const storeMap = new Map<string, Store>();
  stores.forEach((s) => {
    if (s.id) storeMap.set(s.id, s);
  });

  const customerMap = new Map<string, Customer>();
  customers.forEach((c) => {
    if (c.id) customerMap.set(c.id, c);
  });

  // 1. Try POS Sales
  try {
    const posList = await getAll<PosSale>(COLLECTIONS.POS_SALES);
    const pos = posList.find((p) => p.voucherId?.toLowerCase() === query.toLowerCase() || p.id === query);
    if (pos) {
      const storeObj = pos.storeId ? storeMap.get(pos.storeId) : undefined;
      const custObj = pos.customerId ? customerMap.get(pos.customerId) : undefined;
      const safeItems: DigitalReceiptItem[] = (pos.items || []).map((i) => {
        const prod = productMap.get(i.productId);
        return {
          productId: i.productId,
          productName: i.productName || prod?.name || "Product",
          productCode: i.productCode || prod?.code,
          photoUrl: i.photoUrl || prod?.photoUrl,
          quantity: i.quantity || 0,
          cartons: i.cartons,
          quantityPerCarton: i.quantityPerCarton,
          unitPrice: i.adjustedPrice ?? i.sellingPrice ?? 0,
          cartonPrice: i.cartonPrice,
          totalPrice: i.totalPrice || 0,
        };
      });

      return {
        id: pos.id,
        voucherId: pos.voucherId,
        type: "pos",
        title: "POS SALES RECEIPT (የሽያጭ ደረሰኝ)",
        subtitle: "Official Point of Sale Customer Receipt",
        voucherDate: toSafeIsoDate(pos.voucherDate || pos.createdAt),
        createdAt: toSafeIsoDate(pos.createdAt),
        storeId: pos.storeId,
        storeName: pos.storeName || storeObj?.name || "Main Store",
        storeAddress: storeObj?.address,
        storePhone: custObj?.phone,
        customerId: pos.customerId,
        customerName: pos.customerName || custObj?.name || "Walk-in Customer",
        customerPhone: custObj?.phone,
        paymentMethod: pos.paymentMethod || "cash",
        transferType: pos.transferType,
        accountBankName: pos.accountBankName,
        accountPersonName: pos.accountPersonName,
        accountNumber: pos.accountNumber,
        fsNumber: pos.fsNumber,
        items: safeItems,
        subtotal: pos.subtotal || pos.totalAmount || 0,
        totalAmount: pos.totalAmount || 0,
        amountPaid: pos.amountPaid ?? pos.totalAmount,
        remainingBalance: pos.remainingBalance ?? 0,
        customerTotalBalance: custObj?.totalBalance,
        remark: pos.remark,
        createdByName: pos.createdByName,
        checkedBy: pos.checkedBy,
        isChecked: pos.isChecked,
        checkedAt: pos.checkedAt ? toSafeIsoDate(pos.checkedAt) : undefined,
        referencePhotoUrl: pos.referencePhotoUrl || pos.photoProofUrl,
        status: pos.status,
        brandName,
      };
    }
  } catch {}

  // 2. Try Direct Sales
  try {
    const directList = await getAll<DirectSale>(COLLECTIONS.DIRECT_SALES);
    const direct = directList.find((d) => d.voucherId?.toLowerCase() === query.toLowerCase() || d.id === query);
    if (direct) {
      const storeObj = direct.storeId ? storeMap.get(direct.storeId) : undefined;
      const safeItems: DigitalReceiptItem[] = (direct.items || []).map((i) => {
        const prod = productMap.get(i.productId);
        return {
          productId: i.productId,
          productName: i.productName || prod?.name || "Product",
          productCode: i.productCode || prod?.code,
          photoUrl: prod?.photoUrl,
          quantity: i.sellByCarton ? i.quantity * (i.quantityPerCarton || 1) : i.quantity,
          cartons: i.sellByCarton ? i.quantity : undefined,
          quantityPerCarton: i.quantityPerCarton,
          unitPrice: i.unitPrice || 0,
          totalPrice: i.totalPrice || 0,
        };
      });

      return {
        id: direct.id,
        voucherId: direct.voucherId,
        type: "direct_sale",
        title: "DIRECT SALE VOUCHER (ቀጥታ ሽያጭ ደረሰኝ)",
        subtitle: "Direct Warehouse / Store Sale Receipt",
        voucherDate: toSafeIsoDate(direct.voucherDate || direct.createdAt),
        createdAt: toSafeIsoDate(direct.createdAt),
        storeId: direct.storeId,
        storeName: direct.storeName || storeObj?.name || "Store",
        storeAddress: storeObj?.address,
        customerName: "Store Customer",
        items: safeItems,
        subtotal: direct.totalAmount || 0,
        totalAmount: direct.totalAmount || 0,
        amountPaid: direct.totalAmount,
        remainingBalance: 0,
        remark: direct.remark,
        createdByName: direct.soldByName,
        checkedBy: direct.checkedBy,
        isChecked: direct.isChecked,
        checkedAt: direct.checkedAt ? toSafeIsoDate(direct.checkedAt) : undefined,
        status: direct.status,
        brandName,
      };
    }
  } catch {}

  // 3. Try Ecommerce Orders / Order Vouchers
  try {
    const orderList = await getAll<EcommerceOrder>(COLLECTIONS.ORDER_VOUCHERS);
    const ord = orderList.find((o) => o.orderVoucherId?.toLowerCase() === query.toLowerCase() || o.id === query);
    if (ord) {
      const storeObj = ord.storeId ? storeMap.get(ord.storeId) : undefined;
      const custObj = ord.customerId ? customerMap.get(ord.customerId) : undefined;
      const safeItems: DigitalReceiptItem[] = (ord.items || []).map((i) => {
        const prod = productMap.get(i.productId);
        return {
          productId: i.productId,
          productName: i.productName || prod?.name || "Product",
          productCode: i.productCode || prod?.code,
          photoUrl: i.photoUrl || prod?.photoUrl,
          quantity: i.quantity || 0,
          unitPrice: i.price || 0,
          totalPrice: i.totalPrice || 0,
        };
      });

      return {
        id: ord.id,
        voucherId: ord.orderVoucherId,
        type: "order",
        title: "ORDER VOUCHER RECEIPT (የትዕዛዝ ደረሰኝ)",
        subtitle: "Customer Order Confirmation",
        voucherDate: toSafeIsoDate(ord.createdAt),
        createdAt: toSafeIsoDate(ord.createdAt),
        storeId: ord.storeId,
        storeName: storeObj?.name || "Store",
        storeAddress: storeObj?.address,
        customerId: ord.customerId,
        customerName: ord.customerName || custObj?.name || "Customer",
        customerPhone: ord.customerPhone || custObj?.phone,
        items: safeItems,
        subtotal: ord.totalAmount || 0,
        totalAmount: ord.totalAmount || 0,
        amountPaid: ord.totalAmount,
        remainingBalance: 0,
        createdByName: ord.createdByName,
        checkedBy: ord.checkedBy,
        isChecked: ord.isChecked,
        checkedAt: ord.checkedAt ? toSafeIsoDate(ord.checkedAt) : undefined,
        referencePhotoUrl: ord.photoProofUrl || ord.referencePhotoUrl,
        status: ord.status,
        brandName,
      };
    }
  } catch {}

  // 4. Try Damage / Returns
  try {
    const retList = await getAll<DamageReturn>(COLLECTIONS.DAMAGE_RETURNS);
    const ret = retList.find((r) => r.voucherId?.toLowerCase() === query.toLowerCase() || r.id === query);
    if (ret) {
      const isRetIn = ret.type === "return_in" || (ret.type === "return" && ret.returnDirection !== "out");
      const safeItems: DigitalReceiptItem[] = (ret.items || []).map((i) => {
        const prod = productMap.get(i.productId);
        return {
          productId: i.productId,
          productName: i.productName || prod?.name || "Product",
          productCode: i.productCode || prod?.code,
          photoUrl: prod?.photoUrl,
          quantity: i.quantity || 0,
          unitPrice: i.unitPrice || 0,
          totalPrice: i.totalPrice || 0,
          reason: i.reason,
        };
      });

      return {
        id: ret.id,
        voucherId: ret.voucherId,
        type: "damage_return",
        title: isRetIn
          ? "RETURNS IN VOUCHER (የተመለሰ እቃ ገቢ ደረሰኝ)"
          : ret.type === "damage"
          ? "DAMAGE VOUCHER (የተበላሸ እቃ ማስወገጃ ደረሰኝ)"
          : "RETURNS OUT VOUCHER (የተመለሰ እቃ ወጪ ደረሰኝ)",
        subtitle: isRetIn ? "Restocked Return Receipt" : "Damage / Supplier Return Voucher",
        voucherDate: toSafeIsoDate(ret.voucherDate || ret.createdAt),
        createdAt: toSafeIsoDate(ret.createdAt),
        storeId: ret.storeId,
        storeName: ret.storeName || "Store",
        customerId: ret.customerId,
        customerName: ret.customerName,
        supplierName: ret.supplierName,
        fsNumber: ret.fsNumber,
        items: safeItems,
        subtotal: ret.totalAmount || 0,
        totalAmount: ret.totalAmount || 0,
        remark: ret.remark,
        createdByName: ret.createdByName,
        checkedBy: ret.checkedBy,
        isChecked: ret.isChecked,
        checkedAt: ret.checkedAt ? toSafeIsoDate(ret.checkedAt) : undefined,
        referencePhotoUrl: ret.referencePhotoUrl || ret.photoProofUrl,
        status: ret.status,
        brandName,
      };
    }
  } catch {}

  return null;
}
