import { Timestamp } from "firebase/firestore";

export interface BaseDoc {
  id: string;
  createdAt?: Timestamp | Date | string;
  updatedAt?: Timestamp | Date | string;
  isVoided?: boolean;
  isChecked?: boolean;
  checkedBy?: string;
  checkedById?: string;
  checkedAt?: Timestamp | Date | string;
  checkedNote?: string;
  syncStatus?: "synced" | "pending" | "syncing" | "failed";
  deviceId?: string;
  version?: number;
}

export interface AppUser extends BaseDoc {
  uid: string;
  email: string;
  name: string;
  displayName?: string;
  username?: string;
  role: "admin" | "user" | "auditor";
  permissions: string[];
  canAudit?: boolean;
  password?: string;
}

export interface ProductEditHistoryItem {
  previousName: string;
  previousCode: string;
  newName: string;
  newCode: string;
  editedAt: string;
  editedBy?: string;
  note?: string;
}

export interface Product extends BaseDoc {
  name: string;
  code: string; // SKU code
  sku?: string;
  barcodeValue: string;
  categoryId: string;
  categoryName?: string;
  brand?: string;
  description?: string;
  unitCost?: number;
  purchasePrice?: number;
  sellingPrice?: number;
  piecePrice?: number;
  cartonPrice?: number;
  quantityPerCarton: number;
  minCartonAlert: number;
  minStock?: number;
  maxStock?: number;
  unit?: string;
  size?: string; // Formatted size list e.g. "38, 39, 40, 41, 42, 43, 44"
  sizes?: string[]; // Array of individual sizes e.g. ["38", "39", "40", "41", "42", "43", "44"]
  sizeRange?: string; // Summary range e.g. "38-44"
  cartonBreakdown?: CartonSizeItem[]; // Pieces breakdown per size in 1 carton
  cartonCategoryBreakdown?: CartonCategorySummary[]; // Pieces breakdown per category in 1 carton
  currentStock?: number;
  photoUrl?: string;
  photoUrls?: string[];
  supplierId?: string;
  supplierName?: string;
  status?: "active" | "inactive" | "discontinued";
  voucherId: string;
  // Memo for details before editing (Before Edit: Name & Code)
  previousName?: string;
  previousCode?: string;
  beforeEditMemo?: string;
  editHistory?: ProductEditHistoryItem[];
  lastEditedAt?: string;
  lastEditedBy?: string;
}

export interface InventoryMovement extends BaseDoc {
  type: "stock_in" | "stock_out" | "sale" | "adjustment" | "transfer_in" | "transfer_out" | "damage" | "return";
  productId: string;
  productName: string;
  productCode: string;
  storeId?: string;
  storeName?: string;
  prevQuantity: number;
  newQuantity: number;
  difference: number;
  reason?: string;
  referenceVoucherId?: string;
  userId?: string;
  userName?: string;
  voucherDate?: string;
}

export interface CartonSizeItem {
  size: string;
  count: number;
  categoryId?: string;
  categoryName?: string;
  percentage?: number;
}

export interface CartonCategorySummary {
  categoryId?: string;
  categoryName: string;
  count: number;
  percentage: number;
  sizes?: string[];
}

export interface Category extends BaseDoc {
  name: string;
  description?: string;
  minSize?: number | string;
  maxSize?: number | string;
  sizeRange?: string; // e.g. "39-45"
  sizes?: string[]; // e.g. ["39", "40", "41", "42", "43", "44", "45"]
}

export interface Store extends BaseDoc {
  name: string;
  level: string;
  address: string;
  voucherId: string;
}

export interface Supplier extends BaseDoc {
  name: string;
  address: string;
  phone: string;
  totalPaid: number;
  totalBalance: number;
  photoProofUrl?: string;
  beginningBalance?: number;
  beginningDate?: string;
  beginningPaid?: number;
  beginningPaidDate?: string;
}

export interface Customer extends BaseDoc {
  name: string;
  address: string;
  phone: string;
  totalPaid: number;
  totalBalance: number;
  voucherId: string;
  beginningBalance?: number;
  beginningDate?: string;
  beginningNote?: string;
  beginningPhotoUrl?: string;
}

export interface StockInItem {
  productId: string;
  productName: string;
  productCode: string;
  quantityPerCarton: number;
  cartonsReceived: number;
  unitPrice: number;
  cartonPrice: number;
  totalPrice: number;
  photoUrl?: string;
}

export interface StockIn extends BaseDoc {
  voucherId: string;
  supplierId: string;
  supplierName: string;
  storeId: string;
  storeName: string;
  categoryId?: string;
  categoryName?: string;
  items: StockInItem[];
  totalCartons: number;
  totalPrice: number;
  amountPaid: number;
  remainingBalance: number;
  fsNumber?: string;
  remark?: string;
  photoProofUrl?: string;
  referencePhotoUrl?: string;
  voucherDate?: string;
  status: "active" | "voided" | "pending";
  createdByName?: string;
  updatedByName?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

export interface PricingRecord extends BaseDoc {
  productId: string;
  productName: string;
  productCode: string;
  unitCost: number;
  profitMargin: number;
  sellingPrice: number;
  ecommercePiecePrice?: number;
}

export interface PurchaseCostRecord extends BaseDoc {
  productId: string;
  productName: string;
  productCode: string;
  date: string; // YYYY-MM-DD
  voucherId?: string;
  supplierId?: string;
  supplierName?: string;
  storeId?: string;
  storeName?: string;
  cartonsReceived?: number;
  quantityPerCarton?: number;
  unitCost: number; // Unit purchase price per piece
  cartonPrice?: number; // Purchase price per carton
  totalCost?: number;
  notes?: string;
  source?: "stock_in" | "manual" | "initial";
  createdByName?: string;
}

export interface SaleItem {
  productId: string;
  productName: string;
  productCode: string;
  quantityPerCarton: number;
  photoUrl?: string;
  remainingStock: number;
  sellingPrice: number;
  adjustedPrice: number;
  sellByCarton: boolean;
  quantity: number;
  cartons?: number;
  cartonPrice?: number;
  totalPrice: number;
}

export interface PosSale extends BaseDoc {
  voucherId: string;
  voucherType?: "cash_register" | "manual_receipt" | "Cash Register" | "Manual Sales Receipt" | string;
  customerId?: string;
  customerName?: string;
  storeId: string;
  storeName: string;
  items: SaleItem[];
  subtotal: number;
  totalAmount: number;
  paymentMethod: "cash" | "transfer" | "credit";
  transferType?: "supplier" | "account";
  supplierId?: string;
  supplierName?: string;
  accountId?: string;
  accountName?: string;
  accountBankName?: string;
  accountPersonName?: string;
  accountNumber?: string;
  fsNumber?: string;
  amountPaid: number;
  remainingBalance: number;
  remark?: string;
  photoProofUrl?: string;
  referencePhotoUrl?: string;
  voucherDate?: string;
  status: "active" | "voided" | "pending";
  createdByName?: string;
  updatedByName?: string;
}

export interface EcommerceOrder extends BaseDoc {
  orderVoucherId: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  items: Array<{
    productId: string;
    productName: string;
    productCode: string;
    photoUrl?: string;
    price: number;
    quantity: number;
    totalPrice: number;
  }>;
  totalAmount: number;
  status: "pending" | "approved" | "denied" | "converted";
  storeId?: string;
  createdByName?: string;
  photoProofUrl?: string;
  referencePhotoUrl?: string;
  isChecked?: boolean;
  checkedBy?: string;
  checkedAt?: Timestamp | Date | string;
  checkedById?: string;
  auditorNotes?: string;
}

export interface TransferItem {
  productId: string;
  productName: string;
  productCode: string;
  photoUrl?: string;
  quantityPerCarton: number;
  availableQty: number;
  price: number;
  quantity: number;
  sellByCarton?: boolean;
}

export interface Transfer extends BaseDoc {
  voucherId: string;
  fromStoreId: string;
  fromStoreName: string;
  toStoreId: string;
  toStoreName: string;
  items: TransferItem[];
  voucherDate?: string;
  remark?: string;
  photoProofUrl?: string;
  referencePhotoUrl?: string;
  status: "active" | "voided" | "pending";
  isChecked?: boolean;
  checkedBy?: string;
  checkedAt?: Timestamp | Date | string;
  checkedById?: string;
  auditorNotes?: string;
  createdByName?: string;
  updatedByName?: string;
}

export interface DamageReturnItem {
  productId: string;
  productName: string;
  productCode: string;
  sellBySingle: boolean;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  reason?: string;
}

export type DamageReturnType = "damage" | "return" | "return_in" | "return_out";

export interface DamageReturn extends BaseDoc {
  voucherId: string;
  storeId: string;
  storeName: string;
  type: DamageReturnType;
  returnDirection?: "in" | "out";
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  fsNumber?: string;
  salesVoucherId?: string;
  items: DamageReturnItem[];
  totalAmount: number;
  voucherDate?: string;
  remark?: string;
  photoProofUrl?: string;
  referencePhotoUrl?: string;
  status: "active" | "voided" | "pending";
  createdByName?: string;
  updatedByName?: string;
}

export interface Expense extends BaseDoc {
  voucherId: string;
  storeId?: string;
  storeName?: string;
  type: "product" | "general";
  items: Array<{
    productId?: string;
    productName?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    isByCarton?: boolean;
  }>;
  totalAmount: number;
  remark?: string;
  voucherDate?: string;
  status: "active" | "voided" | "pending";
  createdByName?: string;
  updatedByName?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

export interface StoreBalance {
  storeId: string;
  storeName: string;
  productId: string;
  productName: string;
  productCode: string;
  photoUrl?: string;
  quantity: number;
  unitPrice?: number;
}

export interface BincardEntry {
  date: string;
  type: "stock_in" | "sale" | "transfer_in" | "transfer_out" | "damage" | "return";
  voucherId: string;
  storeId: string;
  storeName: string;
  quantity: number;
  balance: number;
  remark?: string;
}

export interface ProductRequest extends BaseDoc {
  voucherId: string;
  requestingStoreId: string;
  requestingStoreName: string;
  sourceStoreId: string;
  sourceStoreName: string;
  items: Array<{
    productId: string;
    productName: string;
    productCode: string;
    requestedQty: number;
    availableQty: number;
  }>;
  status: "pending" | "approved" | "denied";
}

export interface StoreRequest extends BaseDoc {
  voucherId: string;
  fromStoreId: string;
  fromStoreName: string;
  toStoreId: string;
  toStoreName: string;
  items: StoreRequestItem[];
  status: "pending" | "approved" | "received" | "voided";
  approvedBy?: string;
  approvedAt?: Timestamp | Date | string;
  receivedBy?: string;
  receivedAt?: Timestamp | Date | string;
  remark?: string;
  voucherDate?: string;
  createdByName?: string;
  isChecked?: boolean;
  checkedBy?: string;
  checkedAt?: Timestamp | Date | string;
  checkedById?: string;
  checkedNote?: string;
  referencePhotoUrl?: string;
  photoProofUrl?: string;
}

export interface StoreRequestItem {
  productId: string;
  productName: string;
  productCode: string;
  photoUrl?: string;
  categoryName?: string;
  quantityPerCarton: number;
  availableQtyFrom: number;
  availableQtyTo: number;
  price: number;
  quantity: number;
  sellByCarton: boolean;
  cartons?: number;
  loosePieces?: number;
}

export interface Account extends BaseDoc {
  bankName: string;
  personName: string;
  accountNumber: string;
  totalDeposit: number;
  totalWithdraw: number;
  balance: number;
}

export interface AccountVoucher extends BaseDoc {
  voucherId: string;
  accountId: string;
  accountBankName: string;
  accountPersonName: string;
  accountNumber: string;
  type: "deposit" | "withdraw";
  amount: number;
  fsNumber?: string;
  customerName?: string;
  reason?: string;
  date?: string;
  photoProofUrl?: string;
  note?: string;
  remark?: string;
  isVoided?: boolean;
  createdByName?: string;
  updatedByName?: string;
  supplierId?: string;
  supplierName?: string;
  chartOfAccountId?: string;
  chartOfAccountCode?: string;
  chartOfAccountName?: string;
}

export interface Promotion extends BaseDoc {
  title: string;
  description?: string;
  link?: string;
  photoUrl?: string;
  videoUrl?: string;
  productIds: string[];
  productNames: string[];
  isActive: boolean;
  showBanner: boolean;
  showPopup: boolean;
  showHighlight: boolean;
  showVideo?: boolean;
  displaySeconds?: number;
}

export interface BinningItem {
  productId: string;
  productName: string;
  productCode: string;
  photoUrl?: string;
  quantityPerCarton: number;
  cartons: number;
  units: number;
  unitPrice: number;
  cartonPrice: number;
}

export interface BinningVoucher extends BaseDoc {
  voucherId: string;
  storeId: string;
  storeName: string;
  items: BinningItem[];
  totalCartons: number;
  totalUnits: number;
  status: "draft" | "approved" | "voided";
  voucherDate?: string;
  remark?: string;
  photoProofUrl?: string;
  referencePhotoUrl?: string;
  approvedAt?: string;
  approvedBy?: string;
  stockInId?: string;
  createdByName?: string;
  isChecked?: boolean;
  checkedBy?: string;
  checkedAt?: Timestamp | Date | string;
  checkedById?: string;
  checkedNote?: string;
}

export interface DirectSaleItem {
  productId: string;
  productName: string;
  productCode: string;
  photoUrl?: string;
  quantityPerCarton: number;
  quantity: number;
  sellByCarton: boolean;
  unitPrice: number;
  totalPrice: number;
  cartons?: number;
}

export interface DirectSale extends BaseDoc {
  voucherId: string;
  storeId: string;
  storeName: string;
  soldByName: string;
  items: DirectSaleItem[];
  totalAmount: number;
  remark?: string;
  voucherDate?: string;
  status: "active" | "approved" | "voided";
  approvedBy?: string;
  approvedAt?: Timestamp | Date | string;
  posVoucherId?: string;
  isChecked?: boolean;
  checkedBy?: string;
  checkedAt?: Timestamp | Date | string;
  checkedById?: string;
  auditorNotes?: string;
  createdByName?: string;
  updatedByName?: string;
  referencePhotoUrl?: string;
  photoProofUrl?: string;
}

export interface AppSettings extends BaseDoc {
  brandName?: string;
  companyName?: string;
  systemTitle?: string;
  ecommerceLogo?: string;
  ecommerceName?: string;
  ecommerceTagline?: string;
  ecommerceHeroText?: string;
  ecommerceFooterText?: string;
  ecommerceUsername?: string;
  ecommercePassword?: string;
  primaryColor?: string;
  fontStyle?: string;
  menuStyle?: "horizontal" | "sidebar";
  companyPhone?: string;
  phone?: string;
  companyAddress?: string;
  address?: string;
}

export interface InventorySystem extends BaseDoc {
  name: string;
  adminEmail: string;
  createdAt: string;
  createdBy: string;
}

export interface SupplierPayment extends BaseDoc {
  supplierId: string;
  supplierName: string;
  stockInVoucherId?: string;
  amountPaid: number;
  remainingBalance: number;
  photoProofUrl?: string;
  fsNumber?: string;
  note?: string;
  paymentDate?: string;
  voided?: boolean;
}

export interface CustomerPayment extends BaseDoc {
  customerId: string;
  customerName: string;
  saleVoucherId?: string;
  amountPaid: number;
  remainingBalance: number;
  photoProofUrl?: string;
  fsNumber?: string;
  note?: string;
  paymentDate?: string;
  payVia?: "none" | "supplier" | "account";
  supplierId?: string;
  supplierName?: string;
  accountId?: string;
  accountName?: string;
  accountNumber?: string;
  voided?: boolean;
}

// ── ERP Professional Accounting & Financial Module Types ──

export type AccountCategory = "asset" | "liability" | "equity" | "revenue" | "expense";

export interface ChartAccount extends BaseDoc {
  code: string;               // 1000-1999 Asset, 2000-2999 Liability, 3000-3999 Equity, 4000-4999 Revenue, 5000-6999 Expense
  name: string;               // e.g. "Cash on Hand", "Sales Revenue", "COGS"
  nameAmharic?: string;       // e.g. "የእጅ በእጅ ጥሬ ገንዘብ"
  type: AccountCategory;
  subType?: string;           // "current_asset", "bank", "cash", "receivable", "inventory", "payable", "equity", "operating_revenue", "cost_of_sales", "operating_expense", etc.
  parentCode?: string;        // Code of header/parent account (e.g. "1000")
  parentName?: string;
  description?: string;
  isActive: boolean;
  isSystem?: boolean;         // Protected standard system account
  openingBalance?: number;
  openingBalanceType?: "debit" | "credit";
  currency?: string;          // ETB
}

export interface JournalLine {
  accountId: string;          // ChartAccount id or code
  accountCode: string;        // e.g. "1010"
  accountName: string;        // e.g. "Cash on Hand"
  accountType: AccountCategory;
  debit: number;              // Amount debited (>= 0)
  credit: number;             // Amount credited (>= 0)
  description?: string;
}

export interface JournalEntry extends BaseDoc {
  entryNumber: string;        // e.g. "JE-20260925-0001"
  date: string;               // YYYY-MM-DD
  voucherType: "pos_sale" | "direct_sale" | "stock_in" | "damage" | "expense" | "transfer" | "account_voucher" | "manual" | "customer_payment" | "supplier_payment" | "cash_up" | "opening_balance";
  referenceVoucherId?: string;// Reference code e.g. "POS-20260925-0001"
  memo: string;
  lines: JournalLine[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  status: "posted" | "draft" | "voided";
  storeId?: string;
  storeName?: string;
  createdByName?: string;
}

export interface GeneralLedgerLine {
  id: string;
  date: string;
  entryNumber: string;
  referenceVoucherId?: string;
  voucherType: string;
  accountCode: string;
  accountName: string;
  accountType: AccountCategory;
  memo: string;
  debit: number;
  credit: number;
  runningBalance: number;
}

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountCategory;
  debit: number;
  credit: number;
  netBalance: number;
}

