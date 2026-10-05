import { getAll, COLLECTIONS } from "@/lib/firestore";
import type { StockIn, PosSale, Transfer, DamageReturn, Expense, DirectSale, InventoryMovement, Product } from "@/lib/types";

export interface StockBalance {
  productId: string;
  productName: string;
  productCode: string;
  photoUrl: string;
  quantity: number;
  quantityPerCarton: number;
}

/**
 * Compute live stock balances by replaying all transactions in Firebase.
 * If storeId is provided, returns balances for that store only.
 * If storeId is omitted, returns totals summed across all stores.
 */
export async function computeStockBalances(storeId?: string): Promise<Record<string, StockBalance>> {
  const [products, stockIns, sales, transfers, damages, expenses, directSales, movements] = await Promise.all([
    getAll<Product>(COLLECTIONS.PRODUCTS).catch(() => []),
    getAll<StockIn>(COLLECTIONS.STOCK_IN).catch(() => []),
    getAll<PosSale>(COLLECTIONS.POS_SALES).catch(() => []),
    getAll<Transfer>(COLLECTIONS.TRANSFERS).catch(() => []),
    getAll<DamageReturn>(COLLECTIONS.DAMAGE_RETURNS).catch(() => []),
    getAll<Expense>(COLLECTIONS.EXPENSES).catch(() => []),
    getAll<DirectSale>(COLLECTIONS.DIRECT_SALES).catch(() => []),
    getAll<InventoryMovement>(COLLECTIONS.INVENTORY_MOVEMENTS).catch(() => []),
  ]);

  const balance: Record<string, StockBalance> = {};

  function ensureRow(pid: string, name: string, code: string, photo: string, qpc = 1) {
    if (!pid) return;
    const safeQpc = Math.max(1, Number(qpc) || 1);
    if (!balance[pid]) {
      balance[pid] = {
        productId: pid,
        productName: name || "Unknown Product",
        productCode: code || "",
        photoUrl: photo || "",
        quantity: 0,
        quantityPerCarton: safeQpc,
      };
    } else {
      if (name && (!balance[pid].productName || balance[pid].productName === "Unknown Product")) {
        balance[pid].productName = name;
      }
      if (code && !balance[pid].productCode) {
        balance[pid].productCode = code;
      }
      if (photo && !balance[pid].photoUrl) {
        balance[pid].photoUrl = photo;
      }
      if (safeQpc > 1 && balance[pid].quantityPerCarton <= 1) {
        balance[pid].quantityPerCarton = safeQpc;
      }
    }
  }

  // Pre-seed catalog products so metadata (name, code, photo) is always available
  for (const p of products) {
    if (p && p.id && !p.isVoided) {
      ensureRow(p.id, p.name, p.code, p.photoUrl || "", p.quantityPerCarton || 1);
    }
  }

  // 1. Stock In (Purchases) → adds
  for (const si of stockIns.filter(s => s && s.status !== "voided" && (!storeId || s.storeId === storeId))) {
    for (const item of (si.items || [])) {
      if (!item || !item.productId) continue;
      const qpc = Math.max(1, Number(item.quantityPerCarton || 1) || 1);
      const cartons = Number(item.cartonsReceived ?? (item as any).cartons ?? 0) || 0;
      const pcs = (item as any).quantity != null && (item as any).cartonsReceived == null
        ? Number((item as any).quantity) || 0
        : cartons * qpc;
      ensureRow(item.productId, item.productName, item.productCode, item.photoUrl || "", qpc);
      balance[item.productId].quantity += pcs;
    }
  }

  // 2. Adjustments → adds / subtracts difference
  for (const mov of movements.filter(m => m && m.type === "adjustment" && (!storeId || m.storeId === storeId))) {
    if (!mov || !mov.productId) continue;
    ensureRow(mov.productId, mov.productName, mov.productCode, "");
    balance[mov.productId].quantity += (Number(mov.difference) || 0);
  }

  // 3. Sales → deducts
  for (const sale of sales.filter(s => s && s.status !== "voided" && (!storeId || s.storeId === storeId))) {
    for (const item of (sale.items || [])) {
      if (!item || !item.productId) continue;
      ensureRow(item.productId, item.productName, item.productCode, item.photoUrl || "");
      balance[item.productId].quantity -= (Number(item.quantity) || 0);
    }
  }

  // 4. Transfers Out → deducts
  for (const t of transfers.filter(tr => tr && tr.status !== "voided" && (!storeId || tr.fromStoreId === storeId))) {
    for (const item of (t.items || [])) {
      if (!item || !item.productId) continue;
      const qpc = Math.max(1, Number(item.quantityPerCarton || 1) || 1);
      ensureRow(item.productId, item.productName, item.productCode, item.photoUrl || "", qpc);
      balance[item.productId].quantity -= (Number(item.quantity) || 0);
    }
  }

  // 5. Transfers In → adds
  for (const t of transfers.filter(tr => tr && tr.status !== "voided" && (!storeId || tr.toStoreId === storeId))) {
    for (const item of (t.items || [])) {
      if (!item || !item.productId) continue;
      const qpc = Math.max(1, Number(item.quantityPerCarton || 1) || 1);
      ensureRow(item.productId, item.productName, item.productCode, item.photoUrl || "", qpc);
      balance[item.productId].quantity += (Number(item.quantity) || 0);
    }
  }

  // 6. Damages & Returns
  for (const d of damages.filter(dm => dm && dm.status !== "voided" && (!storeId || dm.storeId === storeId))) {
    for (const item of (d.items || [])) {
      if (!item || !item.productId) continue;
      ensureRow(item.productId, item.productName, item.productCode, "");
      const isReturnIn = d.type === "return_in" || (d.type === "return" && (d as any).returnDirection !== "out");
      const qty = Number(item.quantity) || 0;
      if (isReturnIn) {
        // Returns In (Customer/Sales return): goods returned back into stock
        balance[item.productId].quantity += qty;
      } else {
        // Damage or Returns Out (Supplier return): goods written off or removed from stock
        balance[item.productId].quantity -= qty;
      }
    }
  }

  // 7. Product Expenses → deducts
  for (const exp of expenses.filter(e => e && e.type === "product" && e.status !== "voided" && (!storeId || e.storeId === storeId))) {
    for (const item of ((exp.items || []) as Array<{ productId?: string; productName?: string; productCode?: string; quantity: number }>)) {
      if (!item || !item.productId) continue;
      ensureRow(item.productId, item.productName || "", item.productCode || "", "");
      balance[item.productId].quantity -= (Number(item.quantity) || 0);
    }
  }

  // 8. Direct Sales → deducts
  for (const ds of directSales.filter(d => d && d.status !== "voided" && (!storeId || d.storeId === storeId))) {
    for (const item of (ds.items || [])) {
      if (!item || !item.productId) continue;
      const qpc = Math.max(1, Number(item.quantityPerCarton || 1) || 1);
      ensureRow(item.productId, item.productName, item.productCode, item.photoUrl || "", qpc);
      const itemQty = Number(item.quantity) || 0;
      const actualQty = item.sellByCarton ? itemQty * qpc : itemQty;
      balance[item.productId].quantity -= actualQty;
    }
  }

  return balance;
}
