/**
 * Professional ERP Accounting Engine
 * Double-Entry Bookkeeping, Chart of Accounts, Automatic Journal Entries,
 * General Ledger, Trial Balance, Financial Statements & Reporting.
 */

import { getAll, create, update, remove, COLLECTIONS, generateSerialVoucherId } from "../firestore";
import { collection, query, where, getDocs, limit } from "firebase/firestore";
import { db } from "../firebase";
import type {
  ChartAccount,
  JournalEntry,
  JournalLine,
  AccountCategory,
  GeneralLedgerLine,
  TrialBalanceRow,
  PosSale,
  DirectSale,
  StockIn,
  DamageReturn,
  Expense,
  AccountVoucher,
  PricingRecord,
  Product,
  CustomerPayment,
  SupplierPayment,
  Customer,
  Supplier,
} from "../types";
import { safeDateSort } from "./dateUtils";

// ── Standard ERP Chart of Accounts Template ──
// 1000–1999 Assets | 2000–2999 Liabilities | 3000–3999 Equity | 4000–4999 Revenue | 5000–6999 Expenses

export const DEFAULT_CHART_OF_ACCOUNTS: Omit<ChartAccount, "id">[] = [
  // ── 1000-1999 ASSETS (ሀብቶች) ──
  {
    code: "1000",
    name: "Current Assets",
    nameAmharic: "የአሁን ሀብቶች (Current Assets)",
    type: "asset",
    subType: "header",
    description: "Liquid and short-term assets",
    isActive: true,
    isSystem: true,
  },
  {
    code: "1010",
    name: "Cash on Hand",
    nameAmharic: "የእጅ በእጅ ጥሬ ገንዘብ (Cash)",
    type: "asset",
    subType: "cash",
    parentCode: "1000",
    parentName: "Current Assets",
    description: "Physical cash in register / drawer",
    isActive: true,
    isSystem: true,
  },
  {
    code: "1020",
    name: "Commercial Bank of Ethiopia (CBE)",
    nameAmharic: "የኢትዮጵያ ንግድ ባንክ (CBE)",
    type: "asset",
    subType: "bank",
    parentCode: "1000",
    parentName: "Current Assets",
    description: "CBE Bank operating account",
    isActive: true,
    isSystem: true,
  },
  {
    code: "1021",
    name: "Awash Bank",
    nameAmharic: "አዋሽ ባንክ (Awash Bank)",
    type: "asset",
    subType: "bank",
    parentCode: "1000",
    parentName: "Current Assets",
    description: "Awash Bank operating account",
    isActive: true,
    isSystem: true,
  },
  {
    code: "1022",
    name: "Dashen Bank",
    nameAmharic: "ዳሽን ባንክ (Dashen Bank)",
    type: "asset",
    subType: "bank",
    parentCode: "1000",
    parentName: "Current Assets",
    description: "Dashen Bank operating account",
    isActive: true,
    isSystem: true,
  },
  {
    code: "1030",
    name: "Telebirr Account",
    nameAmharic: "ቴሌብር አካውንት (Telebirr)",
    type: "asset",
    subType: "bank",
    parentCode: "1000",
    parentName: "Current Assets",
    description: "Telebirr mobile money account",
    isActive: true,
    isSystem: true,
  },
  {
    code: "1100",
    name: "Accounts Receivable (Debtors)",
    nameAmharic: "ተሰብሳቢ ሂሳቦች (የደንበኞች እዳ)",
    type: "asset",
    subType: "receivable",
    parentCode: "1000",
    parentName: "Current Assets",
    description: "Amounts owed by customers for credit sales",
    isActive: true,
    isSystem: true,
  },
  {
    code: "1200",
    name: "Merchandise Inventory",
    nameAmharic: "የሸቀጦች ክምችት / ስቶክ (Inventory)",
    type: "asset",
    subType: "inventory",
    parentCode: "1000",
    parentName: "Current Assets",
    description: "Total cost value of stock on hand",
    isActive: true,
    isSystem: true,
  },
  {
    code: "1500",
    name: "Fixed Assets & Store Equipment",
    nameAmharic: "ቋሚ ንብረቶችና የመደብር እቃዎች",
    type: "asset",
    subType: "fixed_asset",
    description: "Furniture, electronics, and warehouse equipment",
    isActive: true,
    isSystem: false,
  },

  // ── 2000-2999 LIABILITIES (እዳዎች) ──
  {
    code: "2000",
    name: "Current Liabilities",
    nameAmharic: "የአሁን እዳዎች (Current Liabilities)",
    type: "liability",
    subType: "header",
    description: "Short-term obligations and debts",
    isActive: true,
    isSystem: true,
  },
  {
    code: "2010",
    name: "Accounts Payable (Suppliers)",
    nameAmharic: "ተከፋይ ሂሳቦች (ለአቅራቢዎች)",
    type: "liability",
    subType: "payable",
    parentCode: "2000",
    parentName: "Current Liabilities",
    description: "Amounts owed to suppliers for inventory purchased on credit",
    isActive: true,
    isSystem: true,
  },
  {
    code: "2020",
    name: "Customer Advances & Deposits",
    nameAmharic: "ከደንበኞች በቅድሚያ የተቀበለ",
    type: "liability",
    subType: "payable",
    parentCode: "2000",
    parentName: "Current Liabilities",
    description: "Advance payments received from customers",
    isActive: true,
    isSystem: true,
  },
  {
    code: "2030",
    name: "Tax & VAT Payable",
    nameAmharic: "የሚከፈል ግብርና ታክስ (VAT/TOT)",
    type: "liability",
    subType: "payable",
    parentCode: "2000",
    parentName: "Current Liabilities",
    description: "Taxes collected to be remitted to revenue authority",
    isActive: true,
    isSystem: true,
  },

  // ── 3000-3999 EQUITY (የባለቤት ካፒታል) ──
  {
    code: "3000",
    name: "Owner's Equity",
    nameAmharic: "የባለቤት ካፒታል (Equity)",
    type: "equity",
    subType: "header",
    description: "Owner capital and retained earnings",
    isActive: true,
    isSystem: true,
  },
  {
    code: "3010",
    name: "Owner's Capital",
    nameAmharic: "የባለቤት መነሻ ካፒታል (Capital)",
    type: "equity",
    subType: "equity",
    parentCode: "3000",
    parentName: "Owner's Equity",
    description: "Initial and contributed capital by owner",
    isActive: true,
    isSystem: true,
  },
  {
    code: "3020",
    name: "Retained Earnings",
    nameAmharic: "የተከማቸ ትርፍ / ኪሳራ (Retained Earnings)",
    type: "equity",
    subType: "equity",
    parentCode: "3000",
    parentName: "Owner's Equity",
    description: "Cumulative net profit/loss retained in the business",
    isActive: true,
    isSystem: true,
  },
  {
    code: "3030",
    name: "Owner Drawings",
    nameAmharic: "የባለቤት ወጪ (Drawings)",
    type: "equity",
    subType: "equity",
    parentCode: "3000",
    parentName: "Owner's Equity",
    description: "Withdrawals by owner for personal use",
    isActive: true,
    isSystem: false,
  },

  // ── 4000-4999 REVENUE (ገቢዎች) ──
  {
    code: "4000",
    name: "Operating Revenue",
    nameAmharic: "የስራ ገቢዎች (Operating Revenue)",
    type: "revenue",
    subType: "header",
    description: "Revenue earned from core sales operations",
    isActive: true,
    isSystem: true,
  },
  {
    code: "4010",
    name: "POS Sales Revenue",
    nameAmharic: "የመደብር ሽያጭ ገቢ (POS Sales)",
    type: "revenue",
    subType: "operating_revenue",
    parentCode: "4000",
    parentName: "Operating Revenue",
    description: "Income generated from POS counter and retail sales",
    isActive: true,
    isSystem: true,
  },
  {
    code: "4020",
    name: "Direct Sales Revenue",
    nameAmharic: "የቀጥታ ሽያጭ ገቢ (Direct Sales)",
    type: "revenue",
    subType: "operating_revenue",
    parentCode: "4000",
    parentName: "Operating Revenue",
    description: "Income generated from direct warehouse / delivery sales",
    isActive: true,
    isSystem: true,
  },
  {
    code: "4030",
    name: "Ecommerce & Online Revenue",
    nameAmharic: "የኢኮሜርስና የመስመር ላይ ሽያጭ ገቢ",
    type: "revenue",
    subType: "operating_revenue",
    parentCode: "4000",
    parentName: "Operating Revenue",
    description: "Revenue from online storefront and delivery orders",
    isActive: true,
    isSystem: true,
  },
  {
    code: "4080",
    name: "Cash Overage",
    nameAmharic: "የካሽ መዝጊያ ትርፍ (Cash Overage)",
    type: "revenue",
    subType: "operating_revenue",
    parentCode: "4000",
    parentName: "Operating Revenue",
    description: "Surplus cash found in drawer during daily cash-up",
    isActive: true,
    isSystem: true,
  },
  {
    code: "4090",
    name: "Sales Returns & Discounts",
    nameAmharic: "የሽያጭ ቅናሾች እና ተመላሾች (Contra Revenue)",
    type: "revenue",
    subType: "contra_revenue",
    parentCode: "4000",
    parentName: "Operating Revenue",
    description: "Customer returns and promotional discounts allowed",
    isActive: true,
    isSystem: true,
  },
  {
    code: "4100",
    name: "Other Income / Interest",
    nameAmharic: "ሌሎች ተጨማሪ ገቢዎች",
    type: "revenue",
    subType: "other_income",
    description: "Non-operating income, gains and interest",
    isActive: true,
    isSystem: false,
  },

  // ── 5000-6999 EXPENSES (ወጪዎች) ──
  {
    code: "5000",
    name: "Cost of Sales",
    nameAmharic: "የተሸጡ እቃዎች ወጪ (Cost of Sales)",
    type: "expense",
    subType: "header",
    description: "Direct costs of inventory sold",
    isActive: true,
    isSystem: true,
  },
  {
    code: "5010",
    name: "Cost of Goods Sold (COGS)",
    nameAmharic: "የተሸጡ እቃዎች የመጀመሪያ ወጪ (COGS)",
    type: "expense",
    subType: "cost_of_sales",
    parentCode: "5000",
    parentName: "Cost of Sales",
    description: "Direct cost value of merchandise sold",
    isActive: true,
    isSystem: true,
  },
  {
    code: "5020",
    name: "Freight & Inward Shipping",
    nameAmharic: "የዕቃ ማጓጓዣ እና ጭነት ወጪ",
    type: "expense",
    subType: "cost_of_sales",
    parentCode: "5000",
    parentName: "Cost of Sales",
    description: "Transportation and port charges to receive inventory",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6000",
    name: "Operating Expenses",
    nameAmharic: "አስተዳደራዊ እና ጠቅላላ ወጪዎች (Operating Expenses)",
    type: "expense",
    subType: "header",
    description: "General, selling, and administrative expenses",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6010",
    name: "Damaged & Expired Stock Expense",
    nameAmharic: "የተበላሹ/ዳሜጅ እቃዎች ወጪ (Damaged Stock)",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "Cost of items written off due to damage, expiry or loss",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6020",
    name: "Staff Food & Welfare Expense",
    nameAmharic: "የሰራተኞች ምግብና እንክብካቤ ወጪ (Staff Food)",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "Meals, refreshments, and welfare provided to staff",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6030",
    name: "Salaries & Wages Expense",
    nameAmharic: "የሰራተኞች ደመወዝ እና አበል (Salaries)",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "Employee regular pay, commissions, and bonuses",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6040",
    name: "Rent Expense",
    nameAmharic: "የመደብር/መጋዘን ኪራይ ወጪ (Rent)",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "Monthly lease and rent for store / warehouse locations",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6050",
    name: "Utilities & Internet Expense",
    nameAmharic: "የመብራት፣ ውሃ እና ኢንተርኔት ወጪ (Utilities)",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "Electricity, water, telephone, and broadband services",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6060",
    name: "Transport & Fuel Expense",
    nameAmharic: "የትራንስፖርትና ነዳጅ ወጪ (Transport & Fuel)",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "Delivery transport, taxi, and vehicle fuel",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6070",
    name: "Maintenance & Repairs",
    nameAmharic: "የጥገና እና እድሳት ወጪ (Maintenance)",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "Equipment, shop fitting, and IT repairs",
    isActive: true,
    isSystem: false,
  },
  {
    code: "6080",
    name: "Bank & Telebirr Service Charges",
    nameAmharic: "የባንክና ቴሌብር የአገልግሎት ክፍያ",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "Transfer fees, transaction commissions, and bank charges",
    isActive: true,
    isSystem: true,
  },
  {
    code: "6090",
    name: "Miscellaneous Expense",
    nameAmharic: "የተለያዩ አጠቃላይ ወጪዎች (Miscellaneous)",
    type: "expense",
    subType: "operating_expense",
    parentCode: "6000",
    parentName: "Operating Expenses",
    description: "General sundry expenses not classified elsewhere",
    isActive: true,
    isSystem: true,
  },
];

/**
 * Automatically seeds the Chart of Accounts if empty
 */
export async function seedChartOfAccountsIfEmpty(): Promise<ChartAccount[]> {
  try {
    const existing = await getAll<ChartAccount>(COLLECTIONS.CHART_OF_ACCOUNTS);
    if (existing && existing.length > 0) {
      return existing;
    }

    const createdList: ChartAccount[] = [];
    for (const acc of DEFAULT_CHART_OF_ACCOUNTS) {
      const id = await create(COLLECTIONS.CHART_OF_ACCOUNTS, acc as Record<string, unknown>);
      createdList.push({ id, ...acc } as ChartAccount);
    }
    return createdList;
  } catch (err) {
    console.warn("Chart of Accounts seeding warning:", err);
    return [];
  }
}

/**
 * Creates a validated, balanced double-entry Journal Entry
 */
export async function createJournalEntry(params: {
  date?: string;
  voucherType: JournalEntry["voucherType"];
  referenceVoucherId?: string;
  memo: string;
  lines: JournalLine[];
  storeId?: string;
  storeName?: string;
  createdByName?: string;
  status?: "draft" | "posted" | "voided";
}): Promise<string> {
  const { date, voucherType, referenceVoucherId, memo, lines, storeId, storeName, createdByName } = params;

  const validLines = (lines || []).filter(l => l && (Number(l.debit) > 0 || Number(l.credit) > 0));
  const totalDebit = Math.round(validLines.reduce((s, l) => s + (Number(l.debit) || 0), 0) * 100) / 100;
  const totalCredit = Math.round(validLines.reduce((s, l) => s + (Number(l.credit) || 0), 0) * 100) / 100;
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.05;

  const targetStatus = params.status || (isBalanced ? "posted" : "draft");

  // Requirement 8: Accounting Double-Entry Validation
  // Every Journal Entry must satisfy TOTAL DEBIT = TOTAL CREDIT before it can be posted.
  if (targetStatus === "posted" && !isBalanced) {
    const diff = Math.abs(totalDebit - totalCredit).toFixed(2);
    const errorMsg = `Accounting Double-Entry Validation Error: Total Debit (${totalDebit.toFixed(2)}) must equal Total Credit (${totalCredit.toFixed(2)}). Imbalance: ${diff}. Journal entry cannot be posted.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Journal Entry Idempotency (ONE BUSINESS TRANSACTION = ONE JOURNAL ENTRY)
  if (referenceVoucherId && referenceVoucherId.trim()) {
    const cleanRef = referenceVoucherId.trim();

    try {
      const qSnap = await getDocs(
        query(collection(db, COLLECTIONS.JOURNAL_ENTRIES), where("referenceVoucherId", "==", cleanRef), limit(1))
      );
      if (!qSnap.empty) {
        const docItem = { id: qSnap.docs[0].id, ...qSnap.docs[0].data() } as JournalEntry;
        if (docItem.status !== "voided") {
          return docItem.id;
        }
      }
    } catch (e) {
      console.warn("Direct Firestore idempotency check warning:", e);
    }
  }

  const entryNumber = await generateSerialVoucherId("JE", date);

  const payload: Omit<JournalEntry, "id"> = {
    entryNumber,
    date: date || new Date().toISOString().slice(0, 10),
    voucherType,
    referenceVoucherId: referenceVoucherId || "",
    memo: memo || `${voucherType.toUpperCase()} Transaction`,
    lines: validLines,
    totalDebit,
    totalCredit,
    isBalanced,
    status: targetStatus,
    storeId: storeId || "",
    storeName: storeName || "",
    createdByName: createdByName || "System",
  };

  return create(COLLECTIONS.JOURNAL_ENTRIES, payload as Record<string, unknown>);
}

/**
 * Voids any Journal Entry linked to a reference voucher (e.g. POS-..., DS-..., SI-..., etc.)
 */
export async function voidJournalEntryByReference(referenceVoucherId: string): Promise<boolean> {
  if (!referenceVoucherId) return false;
  try {
    const entries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
    const target = entries.find(e => (e.referenceVoucherId === referenceVoucherId || e.id === referenceVoucherId) && e.status !== "voided");
    if (target && target.id) {
      await update(COLLECTIONS.JOURNAL_ENTRIES, target.id, { status: "voided" });
      return true;
    }
  } catch (err) {
    console.warn("Failed to void journal entry:", err);
  }
  return false;
}

/**
 * Reactivates a previously voided Journal Entry linked to a reference voucher
 */
export async function reactivateJournalEntryByReference(referenceVoucherId: string): Promise<boolean> {
  if (!referenceVoucherId) return false;
  try {
    const entries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
    const target = entries.find(e => (e.referenceVoucherId === referenceVoucherId || e.id === referenceVoucherId) && e.status === "voided");
    if (target && target.id) {
      await update(COLLECTIONS.JOURNAL_ENTRIES, target.id, { status: "posted" });
      return true;
    }
  } catch (err) {
    console.warn("Failed to reactivate journal entry:", err);
  }
  return false;
}

// ── Automatic Transaction Integration Mappers ──

/**
 * Builds a comprehensive, approved unit cost basis map for all inventory items
 * Sources:
 * 1. PricingRecord.unitCost (approved management pricing)
 * 2. Product.unitCost / Product.purchasePrice (catalog cost)
 * 3. StockInItem.unitPrice (actual historical purchase cost from supplier GRNs)
 * NO ARBITRARY PERCENTAGES (e.g. NEVER 0.7)!
 */
export async function buildProductCostMap(): Promise<Record<string, number>> {
  const [pricingList, products, stockIns] = await Promise.all([
    getAll<PricingRecord>(COLLECTIONS.PRICING).catch(() => []),
    getAll<Product>(COLLECTIONS.PRODUCTS).catch(() => []),
    getAll<StockIn>(COLLECTIONS.STOCK_IN).catch(() => []),
  ]);

  const costMap: Record<string, number> = {};

  // 1. Stock In supplier unit purchase price (actual GRN cost)
  for (const si of stockIns.filter(s => s && s.status !== "voided")) {
    for (const it of si.items || []) {
      if (it.productId && Number(it.unitPrice) > 0) {
        costMap[it.productId] = Number(it.unitPrice);
      }
    }
  }

  // 2. Product master recorded unitCost / purchasePrice
  for (const p of products) {
    if (p && p.id && !p.isVoided) {
      if (p.purchasePrice && Number(p.purchasePrice) > 0) {
        costMap[p.id] = Number(p.purchasePrice);
      }
      if (p.unitCost && Number(p.unitCost) > 0) {
        costMap[p.id] = Number(p.unitCost);
      }
    }
  }

  // 3. Approved Pricing records (highest priority approved management cost basis)
  for (const pr of pricingList) {
    if (pr.productId && Number(pr.unitCost) > 0) {
      costMap[pr.productId] = Number(pr.unitCost);
    }
  }

  return costMap;
}

/**
 * Automatically creates Journal Entry for a POS Sale
 * Double Entry:
 *   Debit Cash (1010) / Bank (1020) / Telebirr (1030) for amountPaid
 *   Debit Accounts Receivable (1100) for remaining customer debt
 *   Credit POS Sales Revenue (4010) for total sales amount
 *   Debit Cost of Goods Sold (5010) for inventory cost (actual cost basis)
 *   Credit Merchandise Inventory (1200) for inventory cost
 */
export async function postSaleJournalEntry(
  sale: PosSale,
  costMap?: Record<string, number>
): Promise<string | null> {
  if (!sale || sale.status === "voided") return null;

  // Avoid duplicate posting for same voucher
  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => e.referenceVoucherId === sale.voucherId && e.status !== "voided")) {
    return null;
  }

  const date = sale.voucherDate || (sale.createdAt ? String(sale.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const lines: JournalLine[] = [];

  const amountPaid = Number(sale.amountPaid) || 0;
  const remaining = Number(sale.remainingBalance) || 0;
  const totalAmount = Number(sale.totalAmount) || (amountPaid + remaining);

  // 1. Debit Cash / Bank / Telebirr for amount collected
  if (amountPaid > 0) {
    let debitCode = "1010";
    let debitName = "Cash on Hand";
    const bankDesc = (sale.accountBankName || sale.remark || "").toLowerCase();

    if (sale.paymentMethod === "transfer" || bankDesc.includes("telebirr") || bankDesc.includes("ቴሌብር")) {
      if (bankDesc.includes("telebirr") || bankDesc.includes("ቴሌብር")) {
        debitCode = "1030";
        debitName = "Telebirr Account";
      } else if (bankDesc.includes("awash") || bankDesc.includes("አዋሽ")) {
        debitCode = "1021";
        debitName = "Awash Bank";
      } else if (bankDesc.includes("dashen") || bankDesc.includes("ዳሽን")) {
        debitCode = "1022";
        debitName = "Dashen Bank";
      } else {
        debitCode = "1020";
        debitName = "Commercial Bank of Ethiopia (CBE)";
      }
    }

    lines.push({
      accountId: debitCode,
      accountCode: debitCode,
      accountName: debitName,
      accountType: "asset",
      debit: amountPaid,
      credit: 0,
      description: `Payment received via ${debitName}`,
    });
  }

  // 2. Debit Accounts Receivable if sold on credit / debt
  if (remaining > 0) {
    lines.push({
      accountId: "1100",
      accountCode: "1100",
      accountName: "Accounts Receivable (Debtors)",
      accountType: "asset",
      debit: remaining,
      credit: 0,
      description: `Customer credit receivable - ${sale.customerName || "Customer"}`,
    });
  }

  // 3. Credit Sales Revenue for total gross sale
  if (totalAmount > 0) {
    lines.push({
      accountId: "4010",
      accountCode: "4010",
      accountName: "POS Sales Revenue",
      accountType: "revenue",
      debit: 0,
      credit: totalAmount,
      description: `Sales revenue for ${sale.voucherId}`,
    });
  }

  // 4. Calculate COGS and Inventory Reduction from actual approved cost basis (NO 0.7 FAKE RATIO)
  const cm = costMap || await buildProductCostMap();
  let totalCost = 0;
  for (const it of sale.items || []) {
    const unitCost = cm[it.productId] ?? ((it as any).unitCost || 0);
    const qty = Number(it.quantity) || 1;
    totalCost += (unitCost * qty);
  }
  totalCost = Math.round(totalCost * 100) / 100;

  if (totalCost > 0) {
    lines.push({
      accountId: "5010",
      accountCode: "5010",
      accountName: "Cost of Goods Sold (COGS)",
      accountType: "expense",
      debit: totalCost,
      credit: 0,
      description: `Cost of goods sold for ${sale.voucherId}`,
    });
    lines.push({
      accountId: "1200",
      accountCode: "1200",
      accountName: "Merchandise Inventory",
      accountType: "asset",
      debit: 0,
      credit: totalCost,
      description: `Inventory reduction for ${sale.voucherId}`,
    });
  }

  return createJournalEntry({
    date,
    voucherType: "pos_sale",
    referenceVoucherId: sale.voucherId,
    memo: `POS Sale to ${sale.customerName || "Walk-in Customer"} (${sale.storeName || "Store"})`,
    lines,
    storeId: sale.storeId,
    storeName: sale.storeName,
    createdByName: sale.createdByName,
  });
}

/**
 * Automatically creates Journal Entry for Direct Sale
 * Double Entry:
 *   Debit Cash (1010) for amount received
 *   Credit Direct Sales Revenue (4020) for sales value
 *   Debit Cost of Goods Sold (5010) for inventory cost (actual cost basis)
 *   Credit Merchandise Inventory (1200) for inventory cost
 */
export async function postDirectSaleJournalEntry(
  sale: DirectSale,
  costMap?: Record<string, number>
): Promise<string | null> {
  if (!sale || sale.status === "voided") return null;

  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => e.referenceVoucherId === sale.voucherId && e.status !== "voided")) {
    return null;
  }

  const date = sale.voucherDate || (sale.createdAt ? String(sale.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const lines: JournalLine[] = [];
  const totalAmount = Number(sale.totalAmount) || 0;
  if (totalAmount <= 0) return null;

  // 1. Debit Cash on Hand (1010)
  lines.push({
    accountId: "1010",
    accountCode: "1010",
    accountName: "Cash on Hand",
    accountType: "asset",
    debit: totalAmount,
    credit: 0,
    description: `Direct sale cash received (${sale.soldByName || "Direct"})`,
  });

  // 2. Credit Direct Sales Revenue (4020)
  lines.push({
    accountId: "4020",
    accountCode: "4020",
    accountName: "Direct Sales Revenue",
    accountType: "revenue",
    debit: 0,
    credit: totalAmount,
    description: `Direct sales revenue for ${sale.voucherId}`,
  });

  // 3. COGS & Inventory Reduction from actual approved cost basis (NO 0.7 FAKE RATIO)
  const cm = costMap || await buildProductCostMap();
  let totalCost = 0;
  for (const it of sale.items || []) {
    const unitCost = cm[it.productId] ?? ((it as any).unitCost || 0);
    const qty = Number(it.quantity) || 1;
    totalCost += (unitCost * qty);
  }
  totalCost = Math.round(totalCost * 100) / 100;

  if (totalCost > 0) {
    lines.push({
      accountId: "5010",
      accountCode: "5010",
      accountName: "Cost of Goods Sold (COGS)",
      accountType: "expense",
      debit: totalCost,
      credit: 0,
      description: `COGS for direct sale ${sale.voucherId}`,
    });
    lines.push({
      accountId: "1200",
      accountCode: "1200",
      accountName: "Merchandise Inventory",
      accountType: "asset",
      debit: 0,
      credit: totalCost,
      description: `Inventory reduction for direct sale ${sale.voucherId}`,
    });
  }

  return createJournalEntry({
    date,
    voucherType: "direct_sale",
    referenceVoucherId: sale.voucherId,
    memo: `Direct Sale by ${sale.soldByName || "Direct"} (${sale.storeName || "Store"})`,
    lines,
    storeId: sale.storeId,
    storeName: sale.storeName,
    createdByName: sale.createdByName,
  });
}

/**
 * Automatically creates Journal Entry for Stock In (Purchases)
 * Double Entry:
 *   Debit Merchandise Inventory (1200) for total purchase value
 *   Credit Cash (1010) / Bank (1020) for amount paid
 *   Credit Accounts Payable (2010) for remaining supplier balance
 */
export async function postStockInJournalEntry(stockIn: StockIn): Promise<string | null> {
  if (!stockIn || stockIn.status === "voided") return null;

  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => e.referenceVoucherId === stockIn.voucherId && e.status !== "voided")) {
    return null;
  }

  const date = stockIn.voucherDate || (stockIn.createdAt ? String(stockIn.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const lines: JournalLine[] = [];

  const totalPrice = Number(stockIn.totalPrice) || 0;
  const amountPaid = Number(stockIn.amountPaid) || 0;
  const remaining = Number(stockIn.remainingBalance) || Math.max(0, totalPrice - amountPaid);

  if (totalPrice <= 0) return null;

  // 1. Debit Merchandise Inventory
  lines.push({
    accountId: "1200",
    accountCode: "1200",
    accountName: "Merchandise Inventory",
    accountType: "asset",
    debit: totalPrice,
    credit: 0,
    description: `Goods receiving / purchase from ${stockIn.supplierName || "Supplier"}`,
  });

  // 2. Credit Cash / Bank for amount paid
  if (amountPaid > 0) {
    lines.push({
      accountId: "1010",
      accountCode: "1010",
      accountName: "Cash on Hand",
      accountType: "asset",
      debit: 0,
      credit: amountPaid,
      description: `Payment to ${stockIn.supplierName || "Supplier"} for ${stockIn.voucherId}`,
    });
  }

  // 3. Credit Accounts Payable for supplier debt
  if (remaining > 0) {
    lines.push({
      accountId: "2010",
      accountCode: "2010",
      accountName: "Accounts Payable (Suppliers)",
      accountType: "liability",
      debit: 0,
      credit: remaining,
      description: `Accounts payable to ${stockIn.supplierName || "Supplier"}`,
    });
  }

  return createJournalEntry({
    date,
    voucherType: "stock_in",
    referenceVoucherId: stockIn.voucherId,
    memo: `Stock In GRN from ${stockIn.supplierName || "Supplier"} (${stockIn.storeName || "Store"})`,
    lines,
    storeId: stockIn.storeId,
    storeName: stockIn.storeName,
    createdByName: stockIn.createdByName,
  });
}

/**
 * Automatically creates Journal Entry for Damaged Stock or Returns
 * Double Entry:
 *   Damage Write-off:
 *     Debit Damaged Stock Expense (6010) for inventory write-off value
 *     Credit Merchandise Inventory (1200)
 *   Customer Return (Returns In):
 *     Debit Sales Returns & Discounts (4090) for sales value
 *     Credit Accounts Receivable (1100) if credit / debt reduced, or Cash (1010) if refunded
 *     Debit Merchandise Inventory (1200) for cost basis
 *     Credit Cost of Goods Sold (5010) for cost basis
 *   Supplier Return (Returns Out):
 *     Debit Accounts Payable (2010) if credit debt reduced, or Cash (1010) if refunded
 *     Credit Merchandise Inventory (1200) for purchase value
 */
export async function postDamageJournalEntry(
  damage: DamageReturn,
  costMap?: Record<string, number>
): Promise<string | null> {
  if (!damage || damage.status === "voided") return null;

  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => e.referenceVoucherId === damage.voucherId && e.status !== "voided")) {
    return null;
  }

  const date = damage.voucherDate || (damage.createdAt ? String(damage.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amount = Number(damage.totalAmount) || 0;
  if (amount <= 0) return null;

  const lines: JournalLine[] = [];
  const isReturnIn = damage.type === "return_in" || (damage.type === "return" && (damage as any).returnDirection !== "out");
  const isReturnOut = damage.type === "return_out" || (damage.type === "return" && (damage as any).returnDirection === "out");

  if (isReturnIn) {
    // ── Customer Sales Return (Returns In) ──
    // 1. Debit Sales Returns & Discounts (4090) (contra revenue)
    lines.push({
      accountId: "4090",
      accountCode: "4090",
      accountName: "Sales Returns & Discounts",
      accountType: "revenue",
      debit: amount,
      credit: 0,
      description: `Customer sales return (contra-revenue) for ${damage.voucherId}`,
    });

    // 2. Credit Accounts Receivable (1100) or Cash on Hand (1010)
    if (damage.customerId) {
      lines.push({
        accountId: "1100",
        accountCode: "1100",
        accountName: "Accounts Receivable (Debtors)",
        accountType: "asset",
        debit: 0,
        credit: amount,
        description: `Customer debt credit for returned goods - ${damage.customerName || "Customer"}`,
      });
    } else {
      lines.push({
        accountId: "1010",
        accountCode: "1010",
        accountName: "Cash on Hand",
        accountType: "asset",
        debit: 0,
        credit: amount,
        description: `Cash refund for customer return ${damage.voucherId}`,
      });
    }

    // 3. Restock inventory at true cost basis (reversing COGS)
    const cm = costMap || await buildProductCostMap();
    let returnedCost = 0;
    for (const it of damage.items || []) {
      const uCost = (it as any).unitCost || cm[it.productId] || (it.unitPrice > 0 ? it.unitPrice : 0);
      const qty = Number(it.quantity) || 1;
      returnedCost += (uCost * qty);
    }
    returnedCost = Math.round(returnedCost * 100) / 100;

    if (returnedCost > 0) {
      lines.push({
        accountId: "1200",
        accountCode: "1200",
        accountName: "Merchandise Inventory",
        accountType: "asset",
        debit: returnedCost,
        credit: 0,
        description: `Inventory restocked from customer return ${damage.voucherId}`,
      });
      lines.push({
        accountId: "5010",
        accountCode: "5010",
        accountName: "Cost of Goods Sold (COGS)",
        accountType: "expense",
        debit: 0,
        credit: returnedCost,
        description: `COGS reversal for returned stock ${damage.voucherId}`,
      });
    }
  } else if (isReturnOut) {
    // ── Supplier Purchase Return (Returns Out) ──
    // Debit Accounts Payable (2010) or Cash (1010)
    if (damage.supplierId) {
      lines.push({
        accountId: "2010",
        accountCode: "2010",
        accountName: "Accounts Payable (Suppliers)",
        accountType: "liability",
        debit: amount,
        credit: 0,
        description: `Supplier debt reduction for purchase return to ${damage.supplierName || "Supplier"}`,
      });
    } else {
      lines.push({
        accountId: "1010",
        accountCode: "1010",
        accountName: "Cash on Hand",
        accountType: "asset",
        debit: amount,
        credit: 0,
        description: `Cash refund from supplier for returned purchase ${damage.voucherId}`,
      });
    }

    // Credit Merchandise Inventory (1200)
    lines.push({
      accountId: "1200",
      accountCode: "1200",
      accountName: "Merchandise Inventory",
      accountType: "asset",
      debit: 0,
      credit: amount,
      description: `Inventory reduction for return out to supplier ${damage.voucherId}`,
    });
  } else {
    // ── Damaged or Expired Stock Write-off ──
    lines.push({
      accountId: "6010",
      accountCode: "6010",
      accountName: "Damaged & Expired Stock Expense",
      accountType: "expense",
      debit: amount,
      credit: 0,
      description: `Damaged stock write-off for ${damage.voucherId}`,
    });
    lines.push({
      accountId: "1200",
      accountCode: "1200",
      accountName: "Merchandise Inventory",
      accountType: "asset",
      debit: 0,
      credit: amount,
      description: `Inventory write-off for damage ${damage.voucherId}`,
    });
  }

  return createJournalEntry({
    date,
    voucherType: "damage",
    referenceVoucherId: damage.voucherId,
    memo: `Damage & Return voucher (${damage.type.toUpperCase()}) - ${damage.storeName || "Store"}`,
    lines,
    storeId: damage.storeId,
    storeName: damage.storeName,
    createdByName: damage.createdByName,
  });
}

/**
 * Automatically creates Journal Entry for Expenses (Staff Food, Rent, General)
 * Double Entry:
 *   Product expense (Staff food): Debit 6020 (Staff Food), Credit 1200 (Inventory)
 *   General operating expense: Debit Expense Account, Credit Cash (1010) / Bank (1020)
 */
export async function postExpenseJournalEntry(expense: Expense): Promise<string | null> {
  if (!expense || expense.status === "voided") return null;

  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => e.referenceVoucherId === expense.voucherId && e.status !== "voided")) {
    return null;
  }

  const date = expense.voucherDate || (expense.createdAt ? String(expense.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amount = Number(expense.totalAmount) || 0;
  if (amount <= 0) return null;

  const lines: JournalLine[] = [];
  const remarkLower = (expense.remark || "").toLowerCase();

  if (expense.type === "product" || remarkLower.includes("food") || remarkLower.includes("ምግብ") || remarkLower.includes("staff")) {
    // Staff Food & Welfare consumed from stock
    lines.push({
      accountId: "6020",
      accountCode: "6020",
      accountName: "Staff Food & Welfare Expense",
      accountType: "expense",
      debit: amount,
      credit: 0,
      description: `Staff food & welfare expense for ${expense.voucherId}`,
    });
    lines.push({
      accountId: "1200",
      accountCode: "1200",
      accountName: "Merchandise Inventory",
      accountType: "asset",
      debit: 0,
      credit: amount,
      description: `Inventory reduction for staff consumption ${expense.voucherId}`,
    });
  } else {
    // General Operating Expense
    let expCode = "6090";
    let expName = "Miscellaneous Expense";

    if (remarkLower.includes("rent") || remarkLower.includes("ኪራይ")) {
      expCode = "6040";
      expName = "Rent Expense";
    } else if (remarkLower.includes("salary") || remarkLower.includes("ደመወዝ") || remarkLower.includes("wage")) {
      expCode = "6030";
      expName = "Salaries & Wages Expense";
    } else if (remarkLower.includes("transport") || remarkLower.includes("ትራንስፖርት") || remarkLower.includes("ነዳጅ") || remarkLower.includes("fuel")) {
      expCode = "6060";
      expName = "Transport & Fuel Expense";
    } else if (remarkLower.includes("utility") || remarkLower.includes("መብራት") || remarkLower.includes("ውሃ") || remarkLower.includes("internet")) {
      expCode = "6050";
      expName = "Utilities & Internet Expense";
    }

    lines.push({
      accountId: expCode,
      accountCode: expCode,
      accountName: expName,
      accountType: "expense",
      debit: amount,
      credit: 0,
      description: expense.remark || expName,
    });
    lines.push({
      accountId: "1010",
      accountCode: "1010",
      accountName: "Cash on Hand",
      accountType: "asset",
      debit: 0,
      credit: amount,
      description: `Cash disbursement for ${expense.voucherId}`,
    });
  }

  return createJournalEntry({
    date,
    voucherType: "expense",
    referenceVoucherId: expense.voucherId,
    memo: `Expense voucher: ${expense.remark || "Operating Expense"}`,
    lines,
    storeId: expense.storeId,
    storeName: expense.storeName,
    createdByName: expense.createdByName,
  });
}

/**
 * Automatically creates Journal Entry for Bank / Cash Account Vouchers (Deposit / Withdraw)
 */
export async function postAccountVoucherJournalEntry(voucher: AccountVoucher): Promise<string | null> {
  if (!voucher || voucher.isVoided) return null;

  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => e.referenceVoucherId === voucher.voucherId && e.status !== "voided")) {
    return null;
  }

  const date = voucher.date || (voucher.createdAt ? String(voucher.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amount = Number(voucher.amount) || 0;
  if (amount <= 0) return null;

  const lines: JournalLine[] = [];
  const bankName = (voucher.accountBankName || "").toLowerCase();

  // Prioritize selected Chart of Account from voucher
  let bankCode = voucher.chartOfAccountCode?.trim() || "";
  let bankAccountName = voucher.chartOfAccountName?.trim() || "";

  if (bankCode && !bankAccountName) {
    try {
      const coas = await getAll<ChartAccount>(COLLECTIONS.CHART_OF_ACCOUNTS);
      const match = coas.find(c => c.code === bankCode);
      if (match) {
        bankAccountName = match.name;
      }
    } catch {
      // ignore
    }
  }

  if (!bankCode) {
    if (bankName.includes("telebirr") || bankName.includes("ቴሌብር")) {
      bankCode = "1030";
      bankAccountName = "Telebirr Account";
    } else if (bankName.includes("awash") || bankName.includes("አዋሽ")) {
      bankCode = "1021";
      bankAccountName = "Awash Bank";
    } else if (bankName.includes("dashen") || bankName.includes("ዳሽን")) {
      bankCode = "1022";
      bankAccountName = "Dashen Bank";
    } else {
      bankCode = "1020";
      bankAccountName = "Commercial Bank of Ethiopia (CBE)";
    }
  }
  if (!bankAccountName) {
    bankAccountName = `${voucher.accountBankName || "Bank"} (${bankCode})`;
  }

  if (voucher.type === "deposit") {
    // Debit Bank account
    lines.push({
      accountId: bankCode,
      accountCode: bankCode,
      accountName: bankAccountName,
      accountType: "asset",
      debit: amount,
      credit: 0,
      description: `Deposit into ${bankAccountName} - ${voucher.voucherId}`,
    });
    // Credit Customer Receivable or Cash on Hand
    if (voucher.customerName) {
      lines.push({
        accountId: "1100",
        accountCode: "1100",
        accountName: "Accounts Receivable (Debtors)",
        accountType: "asset",
        debit: 0,
        credit: amount,
        description: `Customer debt payment from ${voucher.customerName}`,
      });
    } else {
      lines.push({
        accountId: "1010",
        accountCode: "1010",
        accountName: "Cash on Hand",
        accountType: "asset",
        debit: 0,
        credit: amount,
        description: `Cash deposit into ${bankAccountName}`,
      });
    }
  } else {
    // Withdrawal: Credit Bank
    lines.push({
      accountId: bankCode,
      accountCode: bankCode,
      accountName: bankAccountName,
      accountType: "asset",
      debit: 0,
      credit: amount,
      description: `Withdrawal from ${bankAccountName} - ${voucher.voucherId}`,
    });
    // Debit Supplier Payable or Operating Expense
    if (voucher.supplierId || voucher.supplierName) {
      lines.push({
        accountId: "2010",
        accountCode: "2010",
        accountName: "Accounts Payable (Suppliers)",
        accountType: "liability",
        debit: amount,
        credit: 0,
        description: `Supplier payment to ${voucher.supplierName || "Supplier"}`,
      });
    } else {
      lines.push({
        accountId: "6090",
        accountCode: "6090",
        accountName: "Miscellaneous Expense",
        accountType: "expense",
        debit: amount,
        credit: 0,
        description: voucher.reason || "Bank withdrawal disbursement",
      });
    }
  }

  return createJournalEntry({
    date,
    voucherType: "account_voucher",
    referenceVoucherId: voucher.voucherId,
    memo: `Bank ${voucher.type.toUpperCase()} - ${voucher.accountBankName} (${voucher.accountNumber})`,
    lines,
    createdByName: voucher.createdByName,
  });
}

/**
 * Automatically creates Journal Entry for Customer Credit Payments (Debt collection)
 * Debit: Cash (1010) or Bank (1020/1021/1022/1030)
 * Credit: Accounts Receivable (1100)
 */
export async function postCustomerPaymentJournalEntry(payment: CustomerPayment): Promise<string | null> {
  if (!payment || payment.voided) return null;

  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => (e.referenceVoucherId === payment.id || (payment.fsNumber && e.referenceVoucherId === payment.fsNumber)) && e.status !== "voided")) {
    return null;
  }

  const date = payment.paymentDate || (payment.createdAt ? String(payment.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amount = Number(payment.amountPaid) || 0;
  if (amount <= 0) return null;

  const lines: JournalLine[] = [];
  const noteLower = (payment.note || "").toLowerCase();
  const accNameLower = (payment.accountName || "").toLowerCase();

  let targetCode = "1010";
  let targetName = "Cash on Hand";
  let targetType: "asset" = "asset";

  if (payment.payVia === "account" || payment.accountId || accNameLower.includes("bank") || accNameLower.includes("cbe") || noteLower.includes("cbe") || noteLower.includes("transfer")) {
    if (accNameLower.includes("telebirr") || noteLower.includes("telebirr") || noteLower.includes("ቴሌብር")) {
      targetCode = "1030";
      targetName = "Telebirr Account";
    } else if (accNameLower.includes("awash") || noteLower.includes("awash") || noteLower.includes("አዋሽ")) {
      targetCode = "1021";
      targetName = "Awash Bank";
    } else if (accNameLower.includes("dashen") || noteLower.includes("dashen") || noteLower.includes("ዳሽን")) {
      targetCode = "1022";
      targetName = "Dashen Bank";
    } else {
      targetCode = "1020";
      targetName = "Commercial Bank of Ethiopia (CBE)";
    }
  } else if (payment.payVia === "supplier" || payment.supplierId) {
    // Settled directly to supplier: reduces Accounts Payable
    targetCode = "2010";
    targetName = "Accounts Payable (Suppliers)";
    targetType = "liability" as any;
  }

  // Debit: Cash/Bank (increases asset) OR Accounts Payable (decreases supplier debt)
  lines.push({
    accountId: targetCode,
    accountCode: targetCode,
    accountName: targetName,
    accountType: targetType,
    debit: amount,
    credit: 0,
    description: `Debt payment received from customer ${payment.customerName}${payment.saleVoucherId ? ` (${payment.saleVoucherId})` : ""}`,
  });

  // Credit: Accounts Receivable (reduces customer receivable)
  lines.push({
    accountId: "1100",
    accountCode: "1100",
    accountName: "Accounts Receivable (Debtors)",
    accountType: "asset",
    debit: 0,
    credit: amount,
    description: `Debt reduction for ${payment.customerName}`,
  });

  return createJournalEntry({
    date,
    voucherType: "customer_payment",
    referenceVoucherId: payment.fsNumber || payment.id,
    memo: `Customer Debt Settlement: ${payment.customerName} - ETB ${amount.toFixed(2)}`,
    lines,
    createdByName: "Cashier",
  });
}

/**
 * Automatically creates Journal Entry for Supplier Payments (Debt settlement)
 * Debit: Accounts Payable (2010) (Decreases liability)
 * Credit: Cash (1010) or Bank (1020/1021/1022/1030) (Decreases asset)
 */
export async function postSupplierPaymentJournalEntry(payment: SupplierPayment): Promise<string | null> {
  if (!payment || payment.voided) return null;

  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => (e.referenceVoucherId === payment.id || (payment.fsNumber && e.referenceVoucherId === payment.fsNumber)) && e.status !== "voided")) {
    return null;
  }

  const date = payment.paymentDate || (payment.createdAt ? String(payment.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amount = Number(payment.amountPaid) || 0;
  if (amount <= 0) return null;

  const lines: JournalLine[] = [];
  const noteLower = (payment.note || "").toLowerCase();

  let bankCode = "1010";
  let bankName = "Cash on Hand";

  if (noteLower.includes("bank") || noteLower.includes("transfer") || noteLower.includes("cbe") || noteLower.includes("ባንክ")) {
    if (noteLower.includes("telebirr") || noteLower.includes("ቴሌብር")) {
      bankCode = "1030";
      bankName = "Telebirr Account";
    } else if (noteLower.includes("awash") || noteLower.includes("አዋሽ")) {
      bankCode = "1021";
      bankName = "Awash Bank";
    } else if (noteLower.includes("dashen") || noteLower.includes("ዳሽን")) {
      bankCode = "1022";
      bankName = "Dashen Bank";
    } else {
      bankCode = "1020";
      bankName = "Commercial Bank of Ethiopia (CBE)";
    }
  }

  // Debit: Accounts Payable (reduces debt owed to supplier)
  lines.push({
    accountId: "2010",
    accountCode: "2010",
    accountName: "Accounts Payable (Suppliers)",
    accountType: "liability",
    debit: amount,
    credit: 0,
    description: `Debt payment to supplier ${payment.supplierName}${payment.stockInVoucherId ? ` (${payment.stockInVoucherId})` : ""}`,
  });

  // Credit: Cash or Bank (disbursement)
  lines.push({
    accountId: bankCode,
    accountCode: bankCode,
    accountName: bankName,
    accountType: "asset",
    debit: 0,
    credit: amount,
    description: `Cash disbursement to supplier ${payment.supplierName}`,
  });

  return createJournalEntry({
    date,
    voucherType: "supplier_payment",
    referenceVoucherId: payment.fsNumber || payment.id,
    memo: `Supplier Debt Payment: ${payment.supplierName} - ETB ${amount.toFixed(2)}`,
    lines,
    createdByName: "Cashier / Procurement",
  });
}

/**
 * Automatically creates Opening Balance Journal Entry for a Customer with beginning balance
 * Debit: Accounts Receivable (1100) (increases asset)
 * Credit: Owner's Capital / Opening Balance Equity (3010) (records equity contribution)
 */
export async function postCustomerOpeningBalanceJournalEntry(customer: Customer): Promise<string | null> {
  if (!customer || !customer.beginningBalance || Number(customer.beginningBalance) <= 0) return null;
  const refId = `CUST-OPEN-${customer.id}`;
  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => e.referenceVoucherId === refId && e.status !== "voided")) {
    return null;
  }

  const date = customer.beginningDate || (customer.createdAt ? String(customer.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amount = Number(customer.beginningBalance);

  const lines: JournalLine[] = [
    {
      accountId: "1100",
      accountCode: "1100",
      accountName: "Accounts Receivable (Debtors)",
      accountType: "asset",
      debit: amount,
      credit: 0,
      description: `Opening receivable balance for customer ${customer.name}`,
    },
    {
      accountId: "3010",
      accountCode: "3010",
      accountName: "Owner's Capital",
      accountType: "equity",
      debit: 0,
      credit: amount,
      description: `Opening equity offset for customer receivable (${customer.name})`,
    },
  ];

  return createJournalEntry({
    date,
    voucherType: "opening_balance",
    referenceVoucherId: refId,
    memo: `Customer Opening Balance: ${customer.name}`,
    lines,
    createdByName: "System Migration",
  });
}

/**
 * Automatically creates Opening Balance Journal Entry for a Supplier with beginning balance
 * Debit: Owner's Capital / Opening Balance Equity (3010) (equity adjustment)
 * Credit: Accounts Payable (2010) (increases liability owed to supplier)
 */
export async function postSupplierOpeningBalanceJournalEntry(supplier: Supplier): Promise<string | null> {
  if (!supplier || !supplier.beginningBalance || Number(supplier.beginningBalance) <= 0) return null;
  const refId = `SUPP-OPEN-${supplier.id}`;
  const existingEntries = await getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES);
  if (existingEntries.some(e => e.referenceVoucherId === refId && e.status !== "voided")) {
    return null;
  }

  const date = supplier.beginningDate || (supplier.createdAt ? String(supplier.createdAt).slice(0, 10) : new Date().toISOString().slice(0, 10));
  const amount = Number(supplier.beginningBalance);

  const lines: JournalLine[] = [
    {
      accountId: "3010",
      accountCode: "3010",
      accountName: "Owner's Capital",
      accountType: "equity",
      debit: amount,
      credit: 0,
      description: `Opening equity offset for supplier payable (${supplier.name})`,
    },
    {
      accountId: "2010",
      accountCode: "2010",
      accountName: "Accounts Payable (Suppliers)",
      accountType: "liability",
      debit: 0,
      credit: amount,
      description: `Opening payable balance to supplier ${supplier.name}`,
    },
  ];

  return createJournalEntry({
    date,
    voucherType: "opening_balance",
    referenceVoucherId: refId,
    memo: `Supplier Opening Balance: ${supplier.name}`,
    lines,
    createdByName: "System Migration",
  });
}

/**
 * Daily Cash-Up Tool: Automatically posts Cash Over / Shortage journal adjustments
 */
export async function postDailyCashUpJournalEntry(params: {
  storeId?: string;
  storeName?: string;
  countedCash: number;
  systemCash: number;
  cashierName?: string;
  date?: string;
  notes?: string;
}): Promise<string | null> {
  const date = params.date || new Date().toISOString().slice(0, 10);
  const diff = Math.round((params.countedCash - params.systemCash) * 100) / 100;
  if (Math.abs(diff) < 0.01) return null; // Balanced

  const lines: JournalLine[] = [];

  if (diff > 0) {
    // Cash Over (Extra cash found in drawer)
    lines.push({
      accountId: "1010",
      accountCode: "1010",
      accountName: "Cash on Hand",
      accountType: "asset",
      debit: diff,
      credit: 0,
      description: `Cash drawer overage adjustment: Counted ETB ${params.countedCash.toFixed(2)} vs System ETB ${params.systemCash.toFixed(2)}`,
    });
    lines.push({
      accountId: "4080",
      accountCode: "4080",
      accountName: "Cash Overage",
      accountType: "revenue",
      debit: 0,
      credit: diff,
      description: `Cash overage recorded during daily cash-up by ${params.cashierName || "Cashier"}`,
    });
  } else {
    // Cash Shortage (Missing cash in drawer)
    const shortage = Math.abs(diff);
    lines.push({
      accountId: "6090",
      accountCode: "6090",
      accountName: "Miscellaneous Expense (Cash Shortage)",
      accountType: "expense",
      debit: shortage,
      credit: 0,
      description: `Cash drawer shortage deficit: Counted ETB ${params.countedCash.toFixed(2)} vs System ETB ${params.systemCash.toFixed(2)}`,
    });
    lines.push({
      accountId: "1010",
      accountCode: "1010",
      accountName: "Cash on Hand",
      accountType: "asset",
      debit: 0,
      credit: shortage,
      description: `Cash reduction for drawer shortage during daily cash-up`,
    });
  }

  return createJournalEntry({
    date,
    voucherType: "cash_up",
    referenceVoucherId: `CUP-${date.replace(/-/g, "")}`,
    memo: `Daily Cash-Up Reconciliation (${params.storeName || "Store"}) - Difference: ETB ${diff > 0 ? `+${diff}` : diff}`,
    lines,
    storeId: params.storeId,
    storeName: params.storeName,
    createdByName: params.cashierName || "Head Cashier",
  });
}

// ── Financial Period Closing & Audit Lock ──

export function getFinancialPeriodLock(): { isLocked: boolean; lockDate: string | null } {
  try {
    const raw = localStorage.getItem("nexus_financial_period_lock");
    if (raw) return JSON.parse(raw);
  } catch {}
  return { isLocked: false, lockDate: null };
}

export function setFinancialPeriodLock(isLocked: boolean, lockDate: string | null): void {
  try {
    localStorage.setItem("nexus_financial_period_lock", JSON.stringify({ isLocked, lockDate }));
  } catch {}
}

/**
 * One-click comprehensive sync: Backfills Journal Entries for all historical transactions!
 */
export async function syncAllHistoricalTransactionsToJournal(): Promise<{
  processedCustomerOpenings: number;
  processedSupplierOpenings: number;
  processedSales: number;
  processedDirectSales: number;
  processedPurchases: number;
  processedDamages: number;
  processedExpenses: number;
  processedVouchers: number;
  processedCustomerPayments: number;
  processedSupplierPayments: number;
  totalNewEntries: number;
}> {
  await seedChartOfAccountsIfEmpty();

  const [
    sales,
    directSales,
    stockIns,
    damages,
    expenses,
    vouchers,
    customerPayments,
    supplierPayments,
    customers,
    suppliers,
  ] = await Promise.all([
    getAll<PosSale>(COLLECTIONS.POS_SALES).catch(() => []),
    getAll<DirectSale>(COLLECTIONS.DIRECT_SALES).catch(() => []),
    getAll<StockIn>(COLLECTIONS.STOCK_IN).catch(() => []),
    getAll<DamageReturn>(COLLECTIONS.DAMAGE_RETURNS).catch(() => []),
    getAll<Expense>(COLLECTIONS.EXPENSES).catch(() => []),
    getAll<AccountVoucher>(COLLECTIONS.ACCOUNT_VOUCHERS).catch(() => []),
    getAll<CustomerPayment>(COLLECTIONS.CUSTOMER_PAYMENTS).catch(() => []),
    getAll<SupplierPayment>(COLLECTIONS.SUPPLIER_PAYMENTS).catch(() => []),
    getAll<Customer>(COLLECTIONS.CUSTOMERS).catch(() => []),
    getAll<Supplier>(COLLECTIONS.SUPPLIERS).catch(() => []),
  ]);

  const costMap = await buildProductCostMap();

  let countCustomerOpenings = 0;
  for (const c of customers) {
    if (c.beginningBalance && Number(c.beginningBalance) > 0) {
      const res = await postCustomerOpeningBalanceJournalEntry(c);
      if (res) countCustomerOpenings++;
    }
  }

  let countSupplierOpenings = 0;
  for (const s of suppliers) {
    if (s.beginningBalance && Number(s.beginningBalance) > 0) {
      const res = await postSupplierOpeningBalanceJournalEntry(s);
      if (res) countSupplierOpenings++;
    }
  }

  let countSales = 0;
  for (const s of sales) {
    if (s.status !== "voided") {
      const res = await postSaleJournalEntry(s, costMap);
      if (res) countSales++;
    }
  }

  let countDirectSales = 0;
  for (const ds of directSales) {
    if (ds.status !== "voided") {
      const res = await postDirectSaleJournalEntry(ds, costMap);
      if (res) countDirectSales++;
    }
  }

  let countPurchases = 0;
  for (const si of stockIns) {
    if (si.status !== "voided") {
      const res = await postStockInJournalEntry(si);
      if (res) countPurchases++;
    }
  }

  let countDamages = 0;
  for (const d of damages) {
    if (d.status !== "voided") {
      const res = await postDamageJournalEntry(d, costMap);
      if (res) countDamages++;
    }
  }

  let countExpenses = 0;
  for (const e of expenses) {
    if (e.status !== "voided") {
      const res = await postExpenseJournalEntry(e);
      if (res) countExpenses++;
    }
  }

  let countVouchers = 0;
  for (const v of vouchers) {
    if (!v.isVoided) {
      const res = await postAccountVoucherJournalEntry(v);
      if (res) countVouchers++;
    }
  }

  let countCustPays = 0;
  for (const cp of customerPayments) {
    if (!cp.voided) {
      const res = await postCustomerPaymentJournalEntry(cp);
      if (res) countCustPays++;
    }
  }

  let countSuppPays = 0;
  for (const sp of supplierPayments) {
    if (!sp.voided) {
      const res = await postSupplierPaymentJournalEntry(sp);
      if (res) countSuppPays++;
    }
  }

  return {
    processedCustomerOpenings: countCustomerOpenings,
    processedSupplierOpenings: countSupplierOpenings,
    processedSales: countSales,
    processedDirectSales: countDirectSales,
    processedPurchases: countPurchases,
    processedDamages: countDamages,
    processedExpenses: countExpenses,
    processedVouchers: countVouchers,
    processedCustomerPayments: countCustPays,
    processedSupplierPayments: countSuppPays,
    totalNewEntries:
      countCustomerOpenings +
      countSupplierOpenings +
      countSales +
      countDirectSales +
      countPurchases +
      countDamages +
      countExpenses +
      countVouchers +
      countCustPays +
      countSuppPays,
  };
}

// ── General Ledger & Report Calculations ──

/**
 * Computes General Ledger entries with running balance for a given account or all accounts
 */
export function computeGeneralLedger(
  entries: JournalEntry[],
  selectedAccountCode?: string,
  startDate?: string,
  endDate?: string,
  search?: string
): GeneralLedgerLine[] {
  // Requirement 8: Only posted entries affect financial reports
  const activeEntries = (entries || [])
    .filter(e => e && e.status === "posted")
    .sort((a, b) => safeDateSort(a.date, b.date, "asc"));

  const lines: GeneralLedgerLine[] = [];
  const runningByAccount: Record<string, number> = {};

  for (const entry of activeEntries) {
    if (startDate && entry.date < startDate) continue;
    if (endDate && entry.date > endDate) continue;

    for (const l of entry.lines || []) {
      if (selectedAccountCode && l.accountCode !== selectedAccountCode) continue;

      if (search) {
        const q = search.toLowerCase();
        const match =
          l.accountCode.toLowerCase().includes(q) ||
          l.accountName.toLowerCase().includes(q) ||
          entry.entryNumber.toLowerCase().includes(q) ||
          (entry.referenceVoucherId || "").toLowerCase().includes(q) ||
          (entry.memo || "").toLowerCase().includes(q);
        if (!match) continue;
      }

      const debit = Number(l.debit) || 0;
      const credit = Number(l.credit) || 0;

      if (!runningByAccount[l.accountCode]) runningByAccount[l.accountCode] = 0;

      // Normal balance logic
      if (l.accountType === "asset" || l.accountType === "expense") {
        runningByAccount[l.accountCode] += (debit - credit);
      } else {
        runningByAccount[l.accountCode] += (credit - debit);
      }

      lines.push({
        id: `${entry.id}_${l.accountCode}_${lines.length}`,
        date: entry.date,
        entryNumber: entry.entryNumber,
        referenceVoucherId: entry.referenceVoucherId,
        voucherType: entry.voucherType,
        accountCode: l.accountCode,
        accountName: l.accountName,
        accountType: l.accountType,
        memo: l.description || entry.memo,
        debit,
        credit,
        runningBalance: Math.round(runningByAccount[l.accountCode] * 100) / 100,
      });
    }
  }

  return lines;
}

/**
 * Computes Trial Balance: Debits vs Credits by Account
 */
export function computeTrialBalance(
  entries: JournalEntry[],
  accounts: ChartAccount[],
  startDate?: string,
  endDate?: string
): {
  rows: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  difference: number;
} {
  // Requirement 8: Only posted entries affect financial reports
  const activeEntries = (entries || []).filter(e => e && e.status === "posted");
  const accountMap: Record<string, { debit: number; credit: number; type: AccountCategory; name: string }> = {};

  // Initialize from Chart of Accounts
  for (const acc of accounts) {
    if (!acc.isActive || acc.subType === "header") continue;
    accountMap[acc.code] = {
      debit: 0,
      credit: 0,
      type: acc.type,
      name: acc.name,
    };
  }

  // Accumulate journal lines
  for (const entry of activeEntries) {
    if (startDate && entry.date < startDate) continue;
    if (endDate && entry.date > endDate) continue;

    for (const line of entry.lines || []) {
      if (!accountMap[line.accountCode]) {
        accountMap[line.accountCode] = {
          debit: 0,
          credit: 0,
          type: line.accountType,
          name: line.accountName,
        };
      }
      accountMap[line.accountCode].debit += (Number(line.debit) || 0);
      accountMap[line.accountCode].credit += (Number(line.credit) || 0);
    }
  }

  let totalDebit = 0;
  let totalCredit = 0;

  const rows: TrialBalanceRow[] = Object.entries(accountMap)
    .filter(([_, d]) => d.debit > 0 || d.credit > 0)
    .map(([code, d]) => {
      const net = (d.type === "asset" || d.type === "expense")
        ? d.debit - d.credit
        : d.credit - d.debit;

      totalDebit += d.debit;
      totalCredit += d.credit;

      return {
        accountCode: code,
        accountName: d.name,
        accountType: d.type,
        debit: Math.round(d.debit * 100) / 100,
        credit: Math.round(d.credit * 100) / 100,
        netBalance: Math.round(net * 100) / 100,
      };
    })
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  const difference = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;
  const isBalanced = difference < 0.05;

  return { rows, totalDebit, totalCredit, isBalanced, difference };
}

/**
 * Computes Financial Statements (Profit & Loss, Balance Sheet, Cash Flow)
 */
export function computeFinancialStatements(
  entries: JournalEntry[],
  accounts: ChartAccount[],
  startDate?: string,
  endDate?: string
) {
  const trial = computeTrialBalance(entries, accounts, startDate, endDate);

  // ── Profit & Loss Statement (Income Statement) ──
  const revenueRows = trial.rows.filter(r => r.accountType === "revenue");
  const expenseRows = trial.rows.filter(r => r.accountType === "expense");

  const totalRevenue = Math.round(
    revenueRows.reduce((s, r) => s + (r.accountCode === "4090" ? -r.debit : r.netBalance), 0) * 100
  ) / 100;

  const cogsRow = expenseRows.find(r => r.accountCode === "5010");
  const cogs = cogsRow ? cogsRow.netBalance : 0;
  const grossProfit = Math.round((totalRevenue - cogs) * 100) / 100;

  const operatingExpenseRows = expenseRows.filter(r => r.accountCode !== "5010");
  const totalOperatingExpenses = Math.round(
    operatingExpenseRows.reduce((s, r) => s + r.netBalance, 0) * 100
  ) / 100;

  const netProfit = Math.round((grossProfit - totalOperatingExpenses) * 100) / 100;

  // ── Balance Sheet ──
  const assetRows = trial.rows.filter(r => r.accountType === "asset");
  const liabilityRows = trial.rows.filter(r => r.accountType === "liability");
  const equityRows = trial.rows.filter(r => r.accountType === "equity");

  const totalAssets = Math.round(assetRows.reduce((s, r) => s + r.netBalance, 0) * 100) / 100;
  const totalLiabilities = Math.round(liabilityRows.reduce((s, r) => s + r.netBalance, 0) * 100) / 100;
  const baseEquity = Math.round(equityRows.reduce((s, r) => s + r.netBalance, 0) * 100) / 100;
  const totalEquity = Math.round((baseEquity + netProfit) * 100) / 100;

  const balanceSheetBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.1;

  // ── Cash Flow Statement ──
  const cashAccounts = ["1010", "1020", "1021", "1022", "1030"];
  let cashReceipts = 0;
  let cashExpenseDisbursements = 0;
  let cashSupplierDisbursements = 0;

  for (const entry of (entries || []).filter(e => e && e.status === "posted")) {
    if (startDate && entry.date < startDate) continue;
    if (endDate && entry.date > endDate) continue;

    for (const line of entry.lines || []) {
      if (cashAccounts.includes(line.accountCode)) {
        if (line.debit > 0) {
          cashReceipts += line.debit;
        }
        if (line.credit > 0) {
          if (entry.voucherType === "stock_in" || entry.memo.toLowerCase().includes("supplier")) {
            cashSupplierDisbursements += line.credit;
          } else {
            cashExpenseDisbursements += line.credit;
          }
        }
      }
    }
  }

  const netOperatingCashFlow = Math.round((cashReceipts - (cashExpenseDisbursements + cashSupplierDisbursements)) * 100) / 100;

  const cashBalance = Math.round(
    assetRows.filter(r => cashAccounts.includes(r.accountCode)).reduce((s, r) => s + r.netBalance, 0) * 100
  ) / 100;

  return {
    profitAndLoss: {
      revenueRows,
      totalRevenue,
      cogs,
      grossProfit,
      operatingExpenseRows,
      totalOperatingExpenses,
      netProfit,
    },
    balanceSheet: {
      assetRows,
      totalAssets,
      liabilityRows,
      totalLiabilities,
      equityRows,
      baseEquity,
      currentPeriodProfit: netProfit,
      totalEquity,
      isBalanced: balanceSheetBalanced,
    },
    cashFlow: {
      cashReceipts,
      cashExpenseDisbursements,
      cashSupplierDisbursements,
      netOperatingCashFlow,
      endingCashBalance: cashBalance,
    },
  };
}
