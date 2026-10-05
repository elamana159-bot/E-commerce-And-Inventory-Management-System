/**
 * Inventory Pricing & Weighted Average Cost (WAC) Engine
 * 
 * Computes Weighted Average Cost (የሚመዘን አማካይ ዋጋ ዘዴ - WAC) for products
 * across multiple stock-in purchases, initial inventory batches, and historical costs.
 * 
 * Formula (ፎርሙላ):
 * 1. የጠቅላላው ወጪ ድምር (Total Cost) = (የቆየው ክምችት መጠን × የቆየው ነጠላ ዋጋ) + ∑(የአዲስ ግዢ ብዛት × የአዲስ ግዢ ነጠላ ዋጋ)
 * 2. የጠቅላላው ብዛት ድምር (Total Quantity) = የቆየው ክምችት መጠን + ∑(የአዲስ ግዢ ብዛት)
 * 3. የሚመዘን አማካይ ዋጋ (Weighted Average Cost) = የጠቅላላው ወጪ ድምር ÷ የጠቅላላው ብዛት ድምር
 * 4. የትርፍ መጠን (Profit Amount) = አማካይ ዋጋ × (የትርፍ መቶኛ ÷ 100)
 * 5. ትክክለኛው የሽያጭ ዋጋ (Selling Price) = አማካይ ዋጋ + የትርፍ መጠን = አማካይ ዋጋ × (1 + የትርፍ መቶኛ ÷ 100)
 */

import type { Product, StockIn, PurchaseCostRecord } from "@/lib/types";
import { safeDateSort } from "./dateUtils";

export interface PurchaseBatchItem {
  id: string;
  date: string; // YYYY-MM-DD
  voucherId?: string;
  supplierName?: string;
  quantity: number; // in pieces
  cartons: number;
  unitCost: number; // cost per piece
  cartonPrice: number; // cost per carton
  totalCost: number; // quantity * unitCost
  source: "stock_in" | "manual" | "initial_inventory" | "simulated";
  notes?: string;
}

export interface WeightedAverageCostResult {
  productId: string;
  productName: string;
  productCode: string;
  batches: PurchaseBatchItem[];
  priorStockQuantity: number;
  priorStockUnitCost: number;
  priorStockTotalCost: number;
  newPurchasesQuantity: number;
  newPurchasesTotalCost: number;
  totalQuantity: number; // total pieces
  totalCost: number; // total ETB
  weightedAverageCost: number; // Average cost per piece
  cartonWeightedAverageCost: number; // Average cost per carton
  latestPurchaseCost: number; // Most recent batch cost
  oldestPurchaseCost: number; // Earliest batch cost
  batchCount: number;
  hasBatches: boolean;
  quantityPerCarton: number;
  currentStock: number;
  formulaDescription: string;
  formulaDescriptionAmharic: string;
}

export interface SellingPriceCalculationResult {
  unitCost: number; // Base cost (Weighted Average Cost)
  profitMarginPercent: number; // e.g. 20%
  profitAmountPerPiece: number; // sellingPrice - unitCost
  sellingPrice: number; // Unit selling price per piece
  cartonSellingPrice: number; // Selling price per carton
  grossProfitRatePercent: number; // (profit / sellingPrice) * 100
}

export interface InventoryPurchaseBatch {
  date?: string;
  voucherId?: string;
  supplierName?: string;
  quantity: number; // ብዛት (pieces)
  unitCost: number; // ነጠላ የመግዣ ዋጋ (ETB/piece)
  totalCost?: number; // quantity * unitCost
  notes?: string;
}

export interface PriorStockInput {
  quantity: number; // የቆየው ክምችት መጠን (pieces)
  unitCost?: number; // የቆየው ክምችት ነጠላ ዋጋ
  totalCost?: number; // የቆየው ክምችት ጠቅላላ ዋጋ (quantity * unitCost)
}

export interface WACSellingPriceResult {
  priorStock: {
    quantity: number;
    unitCost: number;
    totalCost: number;
  };
  purchases: Array<{
    date?: string;
    voucherId?: string;
    quantity: number;
    unitCost: number;
    totalCost: number;
  }>;
  totalQuantity: number;
  totalCost: number;
  weightedAverageCost: number;
  profitMarginPercent: number;
  profitAmountPerPiece: number;
  sellingPrice: number;
  cartonSellingPrice: number;
  grossProfitRatePercent: number;
  formulaAmharic: string;
  formulaEnglish: string;
}

/**
 * Pure function: Computes Weighted Average Cost & Selling Price
 * incorporating prior inventory balance and multiple purchase batches.
 * 
 * @param priorStock የቆየው ክምችት መጠንና ዋጋ
 * @param purchases በተለያየ ጊዜ የተገዛበት ዋጋና ብዛት
 * @param profitMarginPercent የትርፍ መቶኛ (ለምሳሌ 20%)
 * @param quantityPerCarton በአንድ ካርቶን ያለው ብዛት
 */
export function computeWeightedAverageSellingPrice(
  priorStock: PriorStockInput,
  purchases: InventoryPurchaseBatch[] = [],
  profitMarginPercent: number = 20,
  quantityPerCarton: number = 1
): WACSellingPriceResult {
  const priorQty = Math.max(0, Number(priorStock.quantity) || 0);
  const priorUnitCost = Math.max(0, Number(priorStock.unitCost) || 0);
  const priorTotalCost = priorStock.totalCost !== undefined && priorStock.totalCost > 0
    ? Number(priorStock.totalCost)
    : Math.round(priorQty * priorUnitCost * 100) / 100;

  // Process and sanitize purchase batches
  const processedPurchases = purchases
    .filter(p => Number(p.quantity) > 0 && Number(p.unitCost) > 0)
    .map(p => {
      const q = Number(p.quantity);
      const c = Number(p.unitCost);
      const tot = p.totalCost !== undefined && p.totalCost > 0 ? Number(p.totalCost) : Math.round(q * c * 100) / 100;
      return {
        date: p.date || new Date().toISOString().slice(0, 10),
        voucherId: p.voucherId || "BATCH",
        quantity: q,
        unitCost: c,
        totalCost: tot,
      };
    });

  const purchasesQty = processedPurchases.reduce((sum, p) => sum + p.quantity, 0);
  const purchasesTotalCost = processedPurchases.reduce((sum, p) => sum + p.totalCost, 0);

  const totalQuantity = priorQty + purchasesQty;
  const totalCost = Math.round((priorTotalCost + purchasesTotalCost) * 100) / 100;

  let weightedAverageCost = 0;
  if (totalQuantity > 0 && totalCost > 0) {
    weightedAverageCost = Math.round((totalCost / totalQuantity) * 100) / 100;
  } else if (priorUnitCost > 0) {
    weightedAverageCost = priorUnitCost;
  }

  const margin = Math.max(0, Number(profitMarginPercent) || 0);
  const rawSellingPrice = weightedAverageCost * (1 + margin / 100);
  const sellingPrice = Math.round(rawSellingPrice * 100) / 100;
  const profitAmountPerPiece = Math.round((sellingPrice - weightedAverageCost) * 100) / 100;
  const qpc = quantityPerCarton > 0 ? quantityPerCarton : 1;
  const cartonSellingPrice = Math.round(sellingPrice * qpc * 100) / 100;

  const grossProfitRatePercent = sellingPrice > 0
    ? Math.round(((sellingPrice - weightedAverageCost) / sellingPrice) * 1000) / 10
    : 0;

  const formulaAmharic = totalQuantity > 0
    ? `ጠቅላላ ወጪ (${totalCost.toLocaleString()} ብር) ÷ ጠቅላላ ብዛት (${totalQuantity.toLocaleString()} ፍሬ) = አማካይ ዋጋ ${weightedAverageCost.toFixed(2)} ብር + ${margin}% ትርፍ = ${sellingPrice.toFixed(2)} ብር`
    : "ምንም የተመዘገበ ግዢ የለም";

  const formulaEnglish = totalQuantity > 0
    ? `Total Cost (${totalCost.toLocaleString()} ETB) ÷ Total Qty (${totalQuantity.toLocaleString()} pcs) = WAC ${weightedAverageCost.toFixed(2)} ETB/pc + ${margin}% Margin = ${sellingPrice.toFixed(2)} ETB`
    : "No purchase batches recorded";

  return {
    priorStock: {
      quantity: priorQty,
      unitCost: priorUnitCost,
      totalCost: priorTotalCost,
    },
    purchases: processedPurchases,
    totalQuantity,
    totalCost,
    weightedAverageCost,
    profitMarginPercent: margin,
    profitAmountPerPiece,
    sellingPrice,
    cartonSellingPrice,
    grossProfitRatePercent,
    formulaAmharic,
    formulaEnglish,
  };
}

/**
 * Calculates the exact Weighted Average Cost (WAC) for a specific product
 * taking into account all historical stock-in vouchers, prior inventory balances,
 * and purchase records.
 */
export function calculateWeightedAverageCost(
  productId: string,
  stockIns: StockIn[] = [],
  manualCostRecords: PurchaseCostRecord[] = [],
  product?: Product | null
): WeightedAverageCostResult {
  const pName = product?.name || "Product";
  const pCode = product?.code || "";
  const qpc = product?.quantityPerCarton && product.quantityPerCarton > 0 ? product.quantityPerCarton : 1;
  const currentStock = Number(product?.currentStock) || 0;

  const batches: PurchaseBatchItem[] = [];

  // 1. Gather all batches from active Stock-In vouchers
  for (const voucher of stockIns) {
    if (voucher.isVoided || voucher.status === "voided") continue;
    if (!voucher.items || !Array.isArray(voucher.items)) continue;

    const vDate = voucher.voucherDate || (voucher.createdAt ? String(voucher.createdAt).slice(0, 10) : "");

    for (const item of voucher.items) {
      if (!item) continue;
      // Match by productId or productCode
      const isMatch = item.productId === productId || (pCode && item.productCode === pCode);
      if (!isMatch) continue;

      const itemQpc = Number(item.quantityPerCarton) || qpc;
      const ctns = Number(item.cartonsReceived) || 0;
      const totalPcs = Math.round(ctns * itemQpc);
      const uCost = Number(item.unitPrice) || 0;
      const cPrice = Number(item.cartonPrice) || Math.round(uCost * itemQpc);
      const total = Number(item.totalPrice) || Math.round(uCost * totalPcs);

      if (totalPcs > 0 && uCost > 0) {
        batches.push({
          id: `stk_${voucher.id}_${item.productId || pCode}`,
          date: vDate || "2026-01-01",
          voucherId: voucher.voucherId || "STOCK-IN",
          supplierName: voucher.supplierName || "Supplier",
          quantity: totalPcs,
          cartons: ctns,
          unitCost: uCost,
          cartonPrice: cPrice,
          totalCost: total,
          source: "stock_in",
          notes: voucher.remark || "",
        });
      }
    }
  }

  // 2. Gather from manual/historical purchase cost records
  for (const rec of manualCostRecords) {
    if (rec.isVoided) continue;
    const isMatch = rec.productId === productId || (pCode && rec.productCode === pCode);
    if (!isMatch) continue;

    const recQpc = Number(rec.quantityPerCarton) || qpc;
    const ctns = Number(rec.cartonsReceived) || 1;
    const totalPcs = Math.round(ctns * recQpc);
    const uCost = Number(rec.unitCost) || 0;
    const cPrice = Number(rec.cartonPrice) || Math.round(uCost * recQpc);
    const total = Number(rec.totalCost) || Math.round(uCost * totalPcs);

    if (uCost > 0 && totalPcs > 0) {
      batches.push({
        id: `manual_${rec.id}`,
        date: rec.date || "2026-01-01",
        voucherId: rec.voucherId || "PURCHASE-RECORD",
        supplierName: rec.supplierName || "—",
        quantity: totalPcs,
        cartons: ctns,
        unitCost: uCost,
        cartonPrice: cPrice,
        totalCost: total,
        source: "manual",
        notes: rec.notes || "",
      });
    }
  }

  // 3. Handle Prior / Initial Inventory Stock Balance:
  // "ሲስተምህ አዲሱ ግዢ ሲካሄድ የቆየውን ክምችት መጠንና ጠቅላላ ዋጋ እንደሚያካትት አስብ።"
  const recordedPurchasedQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);
  const baselineCost = product?.purchasePrice ?? product?.unitCost ?? product?.piecePrice ?? 0;

  let priorStockQuantity = 0;
  let priorStockUnitCost = baselineCost;
  let priorStockTotalCost = 0;

  if (batches.length === 0) {
    if (baselineCost > 0) {
      const initQty = currentStock > 0 ? currentStock : qpc;
      const initCartons = Math.floor(initQty / qpc);
      priorStockQuantity = initQty;
      priorStockUnitCost = baselineCost;
      priorStockTotalCost = Math.round(baselineCost * initQty);
      batches.push({
        id: `initial_${productId}`,
        date: product?.createdAt ? String(product.createdAt).slice(0, 10) : "2026-01-01",
        voucherId: "INITIAL-STOCK",
        supplierName: product?.supplierName || "Initial Inventory",
        quantity: initQty,
        cartons: initCartons > 0 ? initCartons : 1,
        unitCost: baselineCost,
        cartonPrice: product?.cartonPrice || Math.round(baselineCost * qpc),
        totalCost: priorStockTotalCost,
        source: "initial_inventory",
        notes: "Opening inventory stock balance",
      });
    }
  } else {
    // If currentStock exceeds recorded stock-ins (meaning an opening balance existed before recorded vouchers)
    if (currentStock > recordedPurchasedQuantity && baselineCost > 0) {
      priorStockQuantity = currentStock - recordedPurchasedQuantity;
      priorStockUnitCost = baselineCost;
      priorStockTotalCost = Math.round(baselineCost * priorStockQuantity);
      const priorCartons = Math.floor(priorStockQuantity / qpc);
      batches.unshift({
        id: `prior_balance_${productId}`,
        date: product?.createdAt ? String(product.createdAt).slice(0, 10) : "2026-01-01",
        voucherId: "PRIOR-BALANCE",
        supplierName: "Prior Existing Stock",
        quantity: priorStockQuantity,
        cartons: priorCartons > 0 ? priorCartons : 1,
        unitCost: baselineCost,
        cartonPrice: Math.round(baselineCost * qpc),
        totalCost: priorStockTotalCost,
        source: "initial_inventory",
        notes: "Prior existing inventory stock balance",
      });
    }
  }

  // Sort batches chronologically
  batches.sort((a, b) => safeDateSort(a.date, b.date, "asc"));

  // Calculate Weighted Average Cost
  const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);
  const totalCost = batches.reduce((sum, b) => sum + b.totalCost, 0);

  const newPurchasesQuantity = batches.filter(b => b.source !== "initial_inventory").reduce((sum, b) => sum + b.quantity, 0);
  const newPurchasesTotalCost = batches.filter(b => b.source !== "initial_inventory").reduce((sum, b) => sum + b.totalCost, 0);

  let weightedAverageCost = 0;
  if (totalQuantity > 0 && totalCost > 0) {
    weightedAverageCost = Math.round((totalCost / totalQuantity) * 100) / 100;
  } else if (baselineCost > 0) {
    weightedAverageCost = baselineCost;
  }

  const cartonWeightedAverageCost = Math.round(weightedAverageCost * qpc * 100) / 100;
  const latestBatch = batches.length > 0 ? batches[batches.length - 1] : null;
  const oldestBatch = batches.length > 0 ? batches[0] : null;

  const formulaDescription = totalQuantity > 0
    ? `Total Cost (${totalCost.toLocaleString()} ETB) ÷ Total Quantity (${totalQuantity.toLocaleString()} pcs) = ${weightedAverageCost.toFixed(2)} ETB/pc`
    : "No purchase batches recorded";

  const formulaDescriptionAmharic = totalQuantity > 0
    ? `ጠቅላላ ወጪ (${totalCost.toLocaleString()} ብር) ÷ ጠቅላላ ብዛት (${totalQuantity.toLocaleString()} ፍሬ) = ${weightedAverageCost.toFixed(2)} ብር/ፍሬ`
    : "ምንም የተመዘገበ ግዢ የለም";

  return {
    productId,
    productName: pName,
    productCode: pCode,
    batches,
    priorStockQuantity,
    priorStockUnitCost,
    priorStockTotalCost,
    newPurchasesQuantity,
    newPurchasesTotalCost,
    totalQuantity,
    totalCost,
    weightedAverageCost,
    cartonWeightedAverageCost,
    latestPurchaseCost: latestBatch ? latestBatch.unitCost : weightedAverageCost,
    oldestPurchaseCost: oldestBatch ? oldestBatch.unitCost : weightedAverageCost,
    batchCount: batches.length,
    hasBatches: batches.length > 0,
    quantityPerCarton: qpc,
    currentStock,
    formulaDescription,
    formulaDescriptionAmharic,
  };
}

/**
 * Simulates how adding a new incoming purchase batch modifies the moving Weighted Average Cost
 * taking into account the product's prior inventory stock and prior cost.
 */
export function simulateNewPurchaseWAC(
  currentResult: WeightedAverageCostResult,
  newPurchaseQuantity: number,
  newPurchaseUnitCost: number,
  profitMarginPercent: number = 20
): {
  simulatedResult: WeightedAverageCostResult;
  simulatedSellingPrice: SellingPriceCalculationResult;
  costDiff: number;
} {
  const newQty = Math.max(0, Number(newPurchaseQuantity) || 0);
  const newCost = Math.max(0, Number(newPurchaseUnitCost) || 0);
  const newTotal = Math.round(newQty * newCost * 100) / 100;

  const combinedQty = currentResult.totalQuantity + newQty;
  const combinedTotalCost = Math.round((currentResult.totalCost + newTotal) * 100) / 100;

  const newWac = combinedQty > 0
    ? Math.round((combinedTotalCost / combinedQty) * 100) / 100
    : currentResult.weightedAverageCost;

  const simulatedBatches = [...currentResult.batches];
  if (newQty > 0 && newCost > 0) {
    const qpc = currentResult.quantityPerCarton || 1;
    simulatedBatches.push({
      id: `simulated_new_${Date.now()}`,
      date: new Date().toISOString().slice(0, 10),
      voucherId: "SIMULATED-PURCHASE",
      supplierName: "አዲስ የታቀደ ግዢ (Simulated)",
      quantity: newQty,
      cartons: Math.floor(newQty / qpc) || 1,
      unitCost: newCost,
      cartonPrice: Math.round(newCost * qpc),
      totalCost: newTotal,
      source: "simulated",
      notes: "አዲስ የታቀደ ግዢ",
    });
  }

  const simulatedResult: WeightedAverageCostResult = {
    ...currentResult,
    batches: simulatedBatches,
    totalQuantity: combinedQty,
    totalCost: combinedTotalCost,
    weightedAverageCost: newWac,
    cartonWeightedAverageCost: Math.round(newWac * (currentResult.quantityPerCarton || 1) * 100) / 100,
    latestPurchaseCost: newCost > 0 ? newCost : currentResult.latestPurchaseCost,
    batchCount: simulatedBatches.length,
    formulaDescription: `${combinedTotalCost.toLocaleString()} ETB ÷ ${combinedQty.toLocaleString()} pcs = ${newWac.toFixed(2)} ETB/pc`,
    formulaDescriptionAmharic: `ጠቅላላ ወጪ (${combinedTotalCost.toLocaleString()} ብር) ÷ ጠቅላላ ብዛት (${combinedQty.toLocaleString()} ፍሬ) = ${newWac.toFixed(2)} ብር/ፍሬ`,
  };

  const simulatedSellingPrice = calculateSellingPrice(newWac, profitMarginPercent, currentResult.quantityPerCarton);
  const costDiff = Math.round((newWac - currentResult.weightedAverageCost) * 100) / 100;

  return {
    simulatedResult,
    simulatedSellingPrice,
    costDiff,
  };
}

/**
 * Computes exact Selling Price from a Base Unit Cost and Profit Margin %
 * 
 * Selling Price = Unit Cost * (1 + Margin% / 100)
 */
export function calculateSellingPrice(
  unitCost: number,
  profitMarginPercent: number,
  quantityPerCarton: number = 1
): SellingPriceCalculationResult {
  const cost = Number(unitCost) || 0;
  const margin = Number(profitMarginPercent) || 0;
  const qpc = quantityPerCarton > 0 ? quantityPerCarton : 1;

  const rawSellingPrice = cost * (1 + margin / 100);
  const sellingPrice = Math.round(rawSellingPrice * 100) / 100;
  const profitAmountPerPiece = Math.round((sellingPrice - cost) * 100) / 100;
  const cartonSellingPrice = Math.round(sellingPrice * qpc * 100) / 100;

  // Gross profit margin rate % = (Selling Price - Cost) / Selling Price
  const grossProfitRatePercent = sellingPrice > 0
    ? Math.round(((sellingPrice - cost) / sellingPrice) * 1000) / 10
    : 0;

  return {
    unitCost: cost,
    profitMarginPercent: margin,
    profitAmountPerPiece,
    sellingPrice,
    cartonSellingPrice,
    grossProfitRatePercent,
  };
}
