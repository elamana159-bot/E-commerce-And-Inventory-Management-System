import { useState, useEffect, useRef } from "react";
import { Plus, Search, Eye, EyeOff, Ban, Trash2, Printer, FileDown, Share2, Pencil, CheckCircle, RotateCcw, FileText, ChevronDown, MoreHorizontal, Copy, Settings, Receipt } from "lucide-react";
import { fmt } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { getAll, getById, create, update, remove, COLLECTIONS, generateVoucherId, generateSerialVoucherId, logInventoryMovement, subscribeCollection } from "@/lib/firestore";
import { computeStockBalances } from "@/lib/stockUtils";
import { postSaleJournalEntry, voidJournalEntryByReference, reactivateJournalEntryByReference } from "@/lib/accountingEngine";
import { useAuth } from "@/lib/auth";
import { shareAsImage, shareAsPdf, exportToExcel, exportToPdf } from "@/lib/shareImage";
import { uploadImage } from "@/lib/cloudinary";
import type { Product, Store, Customer, Supplier, PosSale, SaleItem, PricingRecord, Account, AccountVoucher, SupplierPayment } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { BarcodeScannerButton } from "@/components/BarcodeScannerButton";
import { ReceiptActionBar } from "@/components/ReceiptActionBar";
import { ReceiptQRCode } from "@/components/ReceiptQRCode";
import { HabeshaDatePicker } from "@/components/HabeshaDatePicker";
import { CustomerSelect } from "@/components/CustomerSelect";
import { SupplierSelect } from "@/components/SupplierSelect";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { ReferencePhotoViewer } from "@/components/ReferencePhotoViewer";
import { ReceiptWithReferenceView } from "@/components/ReceiptWithReferenceView";
import { VoucherAuditSection, ReceiptCheckedByLine, AuditStatusBadge, performQuickAudit } from "@/components/VoucherAuditSection";
import { matchesVoucherSearch } from "@/lib/voucherSearchUtils";
import {
  PosVoucherType,
  PosVoucherTypeSettings,
  getLocalVoucherSettings,
  fetchVoucherSettings,
  saveVoucherSettings,
  getNextPosVoucherId,
  formatVoucherTypeLabel,
} from "@/lib/posVoucherConfig";
import * as XLSX from "xlsx";

export default function PosSales() {
  const [sales, setSales] = useState<PosSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showVoucher, setShowVoucher] = useState<PosSale | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [hideRefPhoto, setHideRefPhoto] = useState(false);

  // Voucher Type & Sequences state
  const [voucherSettings, setVoucherSettings] = useState<PosVoucherTypeSettings>(getLocalVoucherSettings());
  const [showVoucherSettingsDialog, setShowVoucherSettingsDialog] = useState(false);
  const [voucherTypeFilter, setVoucherTypeFilter] = useState<"all" | "cash_register" | "manual_receipt">("all");

  const [form, setForm] = useState({
    voucherId: "",
    voucherType: "cash_register" as PosVoucherType,
    customerId: "",
    storeId: "",
    paymentMethod: "cash" as "cash" | "transfer" | "credit",
    transferType: "supplier" as "supplier" | "account",
    supplierId: "",
    accountId: "",
    fsNumber: "",
    amountPaid: 0,
    remark: "",
    photoProofUrl: "",
    voucherDate: new Date().toISOString().slice(0, 10),
  });
  const [items, setItems] = useState<SaleItem[]>([]);
  const [storeStockMap, setStoreStockMap] = useState<Record<string, number>>({});
  const [byPieceSet, setByPieceSet] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();
  const { user, isAdmin, isAuditor, canAudit, registeredAuditors, activeAuditorName } = useAuth();
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (form.storeId) {
      computeStockBalances(form.storeId).then(m =>
        setStoreStockMap(Object.fromEntries(Object.entries(m).map(([k, v]) => [k, (v as {quantity: number}).quantity])))
      );
    } else {
      setStoreStockMap({});
    }
  }, [form.storeId]);

  async function loadData() {
    setLoading(true);
    const [s, p, st, c, pr, sups, accs, vCfg] = await Promise.all([
      getAll<PosSale>(COLLECTIONS.POS_SALES),
      getAll<Product>(COLLECTIONS.PRODUCTS),
      getAll<Store>(COLLECTIONS.STORES),
      getAll<Customer>(COLLECTIONS.CUSTOMERS),
      getAll<PricingRecord>(COLLECTIONS.PRICING),
      getAll<Supplier>(COLLECTIONS.SUPPLIERS),
      getAll<Account>(COLLECTIONS.ACCOUNTS),
      fetchVoucherSettings().catch(() => getLocalVoucherSettings()),
    ]);
    const safeSales = (s || []).map(sale => ({
      ...sale,
      items: Array.isArray(sale.items) ? sale.items : [],
    }));
    setSales(safeSales.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    setProducts(p);
    setStores(st);
    setCustomers(c);
    setPricing(pr);
    setSuppliers(sups);
    setAccounts(accs);
    if (vCfg) setVoucherSettings(vCfg);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const unsubSales = subscribeCollection<PosSale>(COLLECTIONS.POS_SALES, (data) => {
      const safeData = (data || []).map(sale => ({
        ...sale,
        items: Array.isArray(sale.items) ? sale.items : [],
      }));
      setSales(safeData.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    });
    const unsubProds = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, setProducts);
    const unsubStores = subscribeCollection<Store>(COLLECTIONS.STORES, setStores);
    const unsubCusts = subscribeCollection<Customer>(COLLECTIONS.CUSTOMERS, setCustomers);
    const unsubPricing = subscribeCollection<PricingRecord>(COLLECTIONS.PRICING, setPricing);
    const unsubSups = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, setSuppliers);
    const unsubAccs = subscribeCollection<Account>(COLLECTIONS.ACCOUNTS, setAccounts);

    return () => {
      unsubSales();
      unsubProds();
      unsubStores();
      unsubCusts();
      unsubPricing();
      unsubSups();
      unsubAccs();
    };
  }, []);

  // Listen for navigation from Customers page with customerId in query param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetCustId = params.get("customerId");
    if (targetCustId && customers.length > 0) {
      openNew(targetCustId);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [customers.length]);

  // Listen for navigation with editId/voucherId in query param (e.g. from Bincard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("editId") || params.get("voucherId");
    if (editId && sales.length > 0) {
      const saleToEdit = sales.find(s => s.id === editId || s.voucherId === editId);
      if (saleToEdit) {
        openEdit(saleToEdit);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [sales]);

  const filtered = sales.filter(s => {
    const matchesSearch = matchesVoucherSearch(s, search);
    if (!matchesSearch) return false;
    if (voucherTypeFilter === "cash_register") {
      return s.voucherType === "cash_register" || s.voucherType === "Cash Register" || (s.voucherId && s.voucherId.toUpperCase().startsWith("CR-"));
    }
    if (voucherTypeFilter === "manual_receipt") {
      return s.voucherType === "manual_receipt" || s.voucherType === "Manual Sales Receipt" || (s.voucherId && s.voucherId.toUpperCase().startsWith("MSR-"));
    }
    return true;
  });

  function getPrice(productId: string) {
    const p = pricing.find(pr => pr.productId === productId);
    return p?.sellingPrice || 0;
  }

  function toggleByPiece(productId: string) {
    setByPieceSet(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function addProduct(prod: Product) {
    const existing = items.find(i => i.productId === prod.id);
    if (existing) { toast({ title: "Product already added" }); return; }
    const defaultUnitPrice = getPrice(prod.id);
    const qpc = prod.quantityPerCarton > 0 ? prod.quantityPerCarton : 1;
    const cartonPrice = defaultUnitPrice * qpc;
    const initialCartons = 1;
    const initialQuantity = initialCartons * qpc;
    const initialTotal = defaultUnitPrice * initialQuantity;

    setItems(prev => [...prev, {
      productId: prod.id,
      productName: prod.name,
      productCode: prod.code,
      quantityPerCarton: qpc,
      photoUrl: prod.photoUrl || "",
      remainingStock: 0,
      sellingPrice: defaultUnitPrice,
      adjustedPrice: defaultUnitPrice,
      sellByCarton: false,
      cartons: initialCartons,
      quantity: initialQuantity,
      cartonPrice: cartonPrice,
      totalPrice: initialTotal,
    }]);
    setProductSearch("");
  }

  function updateItem(idx: number, field: string, value: number | boolean) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx] };
      const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;

      if (field === "cartons") {
        const ctns = Math.max(0, Math.round(Number(value) || 0));
        item.cartons = ctns;
        item.quantity = Math.round(ctns * qpc);
        item.totalPrice = Number((item.quantity * (item.adjustedPrice || 0)).toFixed(2));
      } else if (field === "quantity") {
        const pcs = Math.max(0, Math.round(Number(value) || 0));
        item.quantity = pcs;
        item.cartons = Math.round(pcs / qpc);
        item.totalPrice = Number((pcs * (item.adjustedPrice || 0)).toFixed(2));
      } else if (field === "adjustedPrice") {
        const adj = Math.max(0, Number(value));
        item.adjustedPrice = adj;
        item.cartonPrice = Number((adj * qpc).toFixed(2));
        item.totalPrice = Number((item.quantity * adj).toFixed(2));
      } else if (field === "cartonPrice") {
        const cp = Math.max(0, Number(value));
        item.cartonPrice = cp;
        item.adjustedPrice = Number((cp / qpc).toFixed(2));
        item.totalPrice = Number((item.quantity * item.adjustedPrice).toFixed(2));
      } else {
        (item as any)[field] = value;
      }

      updated[idx] = item;
      return updated;
    });
  }

  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  const totalCartons = Math.round(items.reduce((s, i) => s + (i.cartons ?? (i.quantityPerCarton > 0 ? Math.round(i.quantity / i.quantityPerCarton) : 0)), 0));
  const totalPieces = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
  const remaining = Math.max(0, subtotal - form.amountPaid);

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "sales");
      setForm(f => ({ ...f, photoProofUrl: url }));
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setUploading(false); }
  }

  async function openNew(targetCustomerId?: string, preferredType?: PosVoucherType) {
    resetForm();
    setShowForm(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const chosenType: PosVoucherType = preferredType || "cash_register";
      const nextId = getNextPosVoucherId(chosenType, sales, voucherSettings);
      setForm(f => ({
        ...f,
        voucherDate: today,
        voucherType: chosenType,
        voucherId: nextId,
        ...(targetCustomerId ? { customerId: targetCustomerId } : {})
      }));
    } catch {}
  }

  function handleVoucherTypeChange(newType: PosVoucherType) {
    const nextId = getNextPosVoucherId(newType, sales, voucherSettings);
    setForm(f => ({
      ...f,
      voucherType: newType,
      voucherId: nextId,
    }));
  }

  function duplicateSale(sale: PosSale) {
    resetForm();
    const detectedType: PosVoucherType = (sale.voucherType as PosVoucherType) ||
      (sale.voucherId && sale.voucherId.toUpperCase().startsWith("MSR") ? "manual_receipt" : "cash_register");
    setForm({
      voucherId: sale.voucherId || "", // Retains voucher ID (Double allowed!)
      voucherType: detectedType,
      customerId: sale.customerId || "",
      storeId: sale.storeId,
      paymentMethod: sale.paymentMethod,
      transferType: sale.transferType || "supplier",
      supplierId: sale.supplierId || "",
      accountId: sale.accountId || "",
      fsNumber: "",
      amountPaid: 0,
      remark: sale.remark ? `${sale.remark} (Copy)` : "Duplicate Voucher",
      photoProofUrl: sale.referencePhotoUrl || sale.photoProofUrl || "",
      voucherDate: new Date().toISOString().slice(0, 10),
    });
    setItems((sale.items || []).map(it => {
      const qpc = it.quantityPerCarton > 0 ? it.quantityPerCarton : 1;
      const adj = it.adjustedPrice ?? it.sellingPrice ?? 0;
      const ctns = it.cartons ?? Number((it.quantity / qpc).toFixed(2));
      return {
        ...it,
        quantityPerCarton: qpc,
        adjustedPrice: adj,
        cartons: ctns,
        cartonPrice: it.cartonPrice ?? Number((adj * qpc).toFixed(2)),
        totalPrice: it.totalPrice ?? Number((it.quantity * adj).toFixed(2)),
      };
    }));
    setShowForm(true);
    toast({ title: `Sale duplicated (ደብል/ቅጂ). Voucher ID: ${sale.voucherId || ""}` });
  }

  function openEdit(sale: PosSale) {
    setEditingId(sale.id);
    setHideRefPhoto(false);
    const detectedType: PosVoucherType = (sale.voucherType as PosVoucherType) ||
      (sale.voucherId && sale.voucherId.toUpperCase().startsWith("MSR") ? "manual_receipt" : "cash_register");
    setForm({
      voucherId: sale.voucherId || "",
      voucherType: detectedType,
      customerId: sale.customerId || "",
      storeId: sale.storeId,
      paymentMethod: sale.paymentMethod,
      transferType: sale.transferType || "supplier",
      supplierId: sale.supplierId || "",
      accountId: sale.accountId || "",
      fsNumber: sale.fsNumber || "",
      amountPaid: sale.amountPaid,
      remark: sale.remark || "",
      photoProofUrl: sale.referencePhotoUrl || sale.photoProofUrl || "",
      voucherDate: sale.voucherDate || new Date().toISOString().slice(0, 10),
    });
    setItems((sale.items || []).map(it => {
      const qpc = it.quantityPerCarton > 0 ? it.quantityPerCarton : 1;
      const adj = it.adjustedPrice ?? it.sellingPrice ?? 0;
      const ctns = it.cartons ?? Number((it.quantity / qpc).toFixed(2));
      return {
        ...it,
        quantityPerCarton: qpc,
        adjustedPrice: adj,
        cartons: ctns,
        cartonPrice: it.cartonPrice ?? Number((adj * qpc).toFixed(2)),
        totalPrice: it.totalPrice ?? Number((it.quantity * adj).toFixed(2)),
      };
    }));
    setShowForm(true);
  }

  function resetForm() {
    setEditingId(null);
    setHideRefPhoto(false);
    setForm({
      voucherId: "",
      voucherType: "cash_register",
      customerId: "",
      storeId: "",
      paymentMethod: "cash",
      transferType: "supplier",
      supplierId: "",
      accountId: "",
      fsNumber: "",
      amountPaid: 0,
      remark: "",
      photoProofUrl: "",
      voucherDate: new Date().toISOString().slice(0, 10)
    });
    setItems([]);
    setByPieceSet(new Set());
    setProductSearch("");
  }

  async function checkStockAvailability(): Promise<boolean> {
    if (!form.storeId) return true;
    const stockMap = await computeStockBalances(form.storeId);
    
    // When editing an existing sale, calculate previously allocated quantity for each item
    const oldSale = editingId ? sales.find(s => s.id === editingId) : null;
    const oldSaleItemsMap: Record<string, number> = {};
    if (oldSale && oldSale.status !== "voided" && oldSale.storeId === form.storeId) {
      for (const oldIt of oldSale.items || []) {
        oldSaleItemsMap[oldIt.productId] = (oldSaleItemsMap[oldIt.productId] || 0) + (oldIt.quantity || 0);
      }
    }

    for (const item of items) {
      const qty = item.quantity; // item.quantity is the total piece count
      const currentAvailable = stockMap[item.productId]?.quantity || 0;
      const originalInThisSale = oldSaleItemsMap[item.productId] || 0;
      const effectiveAvailable = currentAvailable + originalInThisSale;

      if (qty > effectiveAvailable) {
        toast({
          title: "Insufficient stock",
          description: `"${item.productName}" only has ${effectiveAvailable} unit(s) available in this store (${originalInThisSale} in original sale + ${currentAvailable} in stock, requested: ${qty} pcs).`,
          variant: "destructive",
        });
        return false;
      }
    }
    return true;
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (!form.storeId || items.length === 0) {
        toast({ title: "Select a store and add products", variant: "destructive" });
        return;
      }
      if (items.some(i => i.quantity <= 0)) {
        toast({ title: "Quantity must be greater than zero for all items", variant: "destructive" });
        return;
      }
      const stockOk = await checkStockAvailability();
      if (!stockOk) return;
      const store = stores.find(s => s.id === form.storeId);
      const customer = customers.find(c => c.id === form.customerId);
      const supplier = form.paymentMethod === "transfer" && form.transferType === "supplier"
        ? suppliers.find(s => s.id === form.supplierId) : undefined;
      const account = form.paymentMethod === "transfer" && form.transferType === "account"
        ? accounts.find(a => a.id === form.accountId) : undefined;
      const newSubtotal = items.reduce((s, i) => s + i.totalPrice, 0);
      const newRemaining = Math.max(0, newSubtotal - form.amountPaid);

      // FS Number uniqueness check
      if (form.paymentMethod === "transfer" && form.fsNumber) {
        const oldSale = editingId ? sales.find(s => s.id === editingId) : null;
        if (!oldSale || oldSale.fsNumber !== form.fsNumber) {
          const [existingSupp, existingCust, existingAccVouchers] = await Promise.all([
            getAll<SupplierPayment>(COLLECTIONS.SUPPLIER_PAYMENTS),
            getAll<{ fsNumber?: string }>(COLLECTIONS.CUSTOMER_PAYMENTS),
            getAll<AccountVoucher>(COLLECTIONS.ACCOUNT_VOUCHERS),
          ]);
          const inSupp = existingSupp.find(p => p.fsNumber === form.fsNumber);
          const inCust = existingCust.find(p => p.fsNumber === form.fsNumber);
          const inAcc = existingAccVouchers.find(v => v.fsNumber === form.fsNumber && !v.isVoided);
          if (inSupp || inCust || inAcc) {
            const where = inSupp ? "Supplier Payments" : inCust ? "Customer Payments" : "Account Vouchers";
            toast({ title: `FS Number "${form.fsNumber}" already used`, description: `Found in: ${where}`, variant: "destructive" });
            return;
          }
        }
      }

      // Preserve all detailed carton/pricing metrics
      const normalizedItems: SaleItem[] = items.map(item => {
        const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;
        const ctns = item.cartons ?? Number((item.quantity / qpc).toFixed(2));
        const adj = item.adjustedPrice ?? item.sellingPrice ?? 0;
        const ctnPrice = item.cartonPrice ?? Number((adj * qpc).toFixed(2));
        const prodObj = products.find(p => p.id === item.productId);
        return {
          ...item,
          photoUrl: item.photoUrl || prodObj?.photoUrl || "",
          quantityPerCarton: qpc,
          cartons: ctns,
          quantity: item.quantity,
          adjustedPrice: adj,
          cartonPrice: ctnPrice,
          totalPrice: item.totalPrice,
          sellByCarton: false,
        };
      });

      const transferFields = form.paymentMethod === "transfer" ? {
        transferType: form.transferType,
        supplierId: form.transferType === "supplier" ? form.supplierId : "",
        supplierName: form.transferType === "supplier" ? (supplier?.name || "") : "",
        accountId: form.transferType === "account" ? form.accountId : "",
        accountName: form.transferType === "account" ? (account ? `${account.bankName} - ${account.personName}` : "") : "",
        accountBankName: form.transferType === "account" ? (account?.bankName || "") : "",
        accountPersonName: form.transferType === "account" ? (account?.personName || "") : "",
        accountNumber: form.transferType === "account" ? (account?.accountNumber || "") : "",
        fsNumber: form.fsNumber,
      } : {};

      if (editingId) {
        const oldSale = sales.find(s => s.id === editingId);
        await update(COLLECTIONS.POS_SALES, editingId, {
          voucherId: form.voucherId?.trim() || oldSale?.voucherId || "POS-00001",
          voucherType: form.voucherType || oldSale?.voucherType || "cash_register",
          customerId: form.customerId,
          customerName: customer?.name || "Walk-in",
          storeId: form.storeId,
          storeName: store?.name || "",
          items: normalizedItems,
          subtotal: newSubtotal,
          totalAmount: newSubtotal,
          paymentMethod: form.paymentMethod,
          ...transferFields,
          amountPaid: form.amountPaid,
          remainingBalance: newRemaining,
          remark: form.remark,
          photoProofUrl: form.photoProofUrl,
          referencePhotoUrl: form.photoProofUrl,
          voucherDate: form.voucherDate,
        } as Record<string, unknown>);

        // Adjust customer debt balance on voucher/receipt edit
        if (oldSale) {
          const oldCustomerId = oldSale.customerId;
          const oldRemaining = oldSale.remainingBalance || 0;
          const newCustomerId = form.customerId;

          if (oldCustomerId === newCustomerId) {
            // Same customer (or both Walk-in)
            if (newCustomerId) {
              const balanceDiff = newRemaining - oldRemaining;
              if (balanceDiff !== 0) {
                const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, newCustomerId) || customers.find(c => c.id === newCustomerId);
                if (freshCust) {
                  const currentBal = freshCust.totalBalance || 0;
                  await update(COLLECTIONS.CUSTOMERS, newCustomerId, {
                    totalBalance: Math.max(0, currentBal + balanceDiff),
                  });
                }
              }
            }
          } else {
            // Customer changed!
            // 1. Deduct/reverse old debt from previous customer
            if (oldCustomerId && oldRemaining > 0) {
              const freshOldCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, oldCustomerId) || customers.find(c => c.id === oldCustomerId);
              if (freshOldCust) {
                const oldBal = freshOldCust.totalBalance || 0;
                await update(COLLECTIONS.CUSTOMERS, oldCustomerId, {
                  totalBalance: Math.max(0, oldBal - oldRemaining),
                });
              }
            }
            // 2. Apply new debt to the newly selected customer
            if (newCustomerId && newRemaining > 0) {
              const freshNewCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, newCustomerId) || customers.find(c => c.id === newCustomerId);
              if (freshNewCust) {
                const newBal = freshNewCust.totalBalance || 0;
                await update(COLLECTIONS.CUSTOMERS, newCustomerId, {
                  totalBalance: newBal + newRemaining,
                });
              }
            }
          }
        }
        toast({ title: "Sale updated (ደረሰኝ ተስተካክሏል)" });
      } else {
        const data: Omit<PosSale, "id"> & { customerDebtApplied?: boolean } = {
          voucherId: form.voucherId?.trim() || getNextPosVoucherId(form.voucherType, sales, voucherSettings),
          voucherType: form.voucherType || "cash_register",
          customerId: form.customerId,
          customerName: customer?.name || "Walk-in",
          storeId: form.storeId,
          storeName: store?.name || "",
          items: normalizedItems,
          subtotal: newSubtotal,
          totalAmount: newSubtotal,
          paymentMethod: form.paymentMethod,
          ...transferFields,
          amountPaid: form.amountPaid,
          remainingBalance: newRemaining,
          remark: form.remark,
          photoProofUrl: form.photoProofUrl,
          referencePhotoUrl: form.photoProofUrl,
          voucherDate: form.voucherDate,
          status: isAdmin ? "active" : "pending",
          createdByName: user?.name || "",
          customerDebtApplied: !!(form.customerId && newRemaining > 0),
        };
        const newId = await create(COLLECTIONS.POS_SALES, data as Record<string, unknown>);

        // Post automatic double-entry journal entry for accounting
        postSaleJournalEntry(data as PosSale).catch(err => console.warn("Automatic journal entry error:", err));

        // Record inventory movements for stock reduction
        for (const item of normalizedItems) {
          const curQty = storeStockMap[item.productId] || 0;
          await logInventoryMovement({
            type: "sale",
            productId: item.productId,
            productName: item.productName,
            productCode: item.productCode,
            storeId: form.storeId,
            storeName: store?.name || "",
            prevQuantity: curQty,
            newQuantity: Math.max(0, curQty - item.quantity),
            difference: -item.quantity,
            reason: `POS Sale ${data.voucherId}`,
            referenceVoucherId: data.voucherId,
            userId: user?.name || "Staff",
            userName: user?.name || "Staff",
            voucherDate: form.voucherDate,
          });
        }

        // Add unpaid balance from this receipt to customer's total debt balance
        if (form.customerId && newRemaining > 0) {
          const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, form.customerId) || customer;
          if (freshCust) {
            const currentBal = Number(freshCust.totalBalance || 0);
            await update(COLLECTIONS.CUSTOMERS, form.customerId, {
              totalBalance: currentBal + newRemaining,
            });
          }
        }
        // Supplier transfer: record payment to supplier (increases totalPaid, decreases totalBalance)
        if (supplier && form.amountPaid > 0) {
          const freshSupp = await getById<Supplier>(COLLECTIONS.SUPPLIERS, supplier.id) || supplier;
          const newPaid = Number(freshSupp?.totalPaid || 0) + form.amountPaid;
          const newBalance = Math.max(0, Number(freshSupp?.totalBalance || 0) - form.amountPaid);
          await Promise.all([
            create(COLLECTIONS.SUPPLIER_PAYMENTS, {
              supplierId: supplier.id,
              supplierName: supplier.name,
              amountPaid: form.amountPaid,
              remainingBalance: newBalance,
              fsNumber: form.fsNumber,
              note: form.remark,
              paymentDate: new Date().toISOString().slice(0, 10),
              photoProofUrl: form.photoProofUrl,
            }),
            update(COLLECTIONS.SUPPLIERS, supplier.id, { totalPaid: newPaid, totalBalance: newBalance }),
          ]);
        }
        // Account transfer: record deposit to account and recompute balance
        if (account && form.amountPaid > 0) {
          const avVoucherId = await generateSerialVoucherId("AV");
          await create(COLLECTIONS.ACCOUNT_VOUCHERS, {
            voucherId: avVoucherId,
            accountId: account.id,
            accountBankName: account.bankName,
            accountPersonName: account.personName,
            accountNumber: account.accountNumber,
            type: "deposit",
            amount: form.amountPaid,
            fsNumber: form.fsNumber,
            customerName: customer?.name || "Walk-in",
            note: form.remark,
            date: new Date().toISOString().slice(0, 10),
            photoProofUrl: form.photoProofUrl,
            createdByName: user?.name || "",
          } as Record<string, unknown>);
          // Recompute account balance
          const allVouchers = await getAll<AccountVoucher>(COLLECTIONS.ACCOUNT_VOUCHERS);
          const active = allVouchers.filter(v => v.accountId === account.id && !v.isVoided);
          const totalDeposit = active.filter(v => v.type === "deposit").reduce((s, v) => s + v.amount, 0);
          const totalWithdraw = active.filter(v => v.type === "withdraw").reduce((s, v) => s + v.amount, 0);
          await update(COLLECTIONS.ACCOUNTS, account.id, { totalDeposit, totalWithdraw, balance: totalDeposit - totalWithdraw });
        }
        toast({ title: isAdmin ? "Sale recorded (ሽያጭ ተመዝግቧል)" : "Submitted for admin approval" });
        setShowForm(false);
        resetForm();
        loadData();
        setShowVoucher({ ...data, id: newId } as PosSale);
        return;
      }

      setShowForm(false);
      resetForm();
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(sale: PosSale) {
    await update(COLLECTIONS.POS_SALES, sale.id, { status: "active" });
    if (!(sale as any).customerDebtApplied && sale.customerId && (sale.remainingBalance || 0) > 0) {
      const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, sale.customerId) || customers.find(c => c.id === sale.customerId);
      if (freshCust) {
        await update(COLLECTIONS.CUSTOMERS, freshCust.id, {
          totalBalance: Number(freshCust.totalBalance || 0) + (sale.remainingBalance || 0),
        });
        await update(COLLECTIONS.POS_SALES, sale.id, { customerDebtApplied: true });
      }
    }
    toast({ title: "Sale approved (ሽያጭ ጸድቋል)" });
    loadData();
  }

  function handleVoid(sale: PosSale) {
    confirmDelete(async () => {
      await update(COLLECTIONS.POS_SALES, sale.id, { status: "voided" });
      voidJournalEntryByReference(sale.voucherId || sale.id).catch(err => console.warn(err));
      if (sale.customerId && (sale.remainingBalance || 0) > 0) {
        const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, sale.customerId) || customers.find(c => c.id === sale.customerId);
        if (freshCust) {
          await update(COLLECTIONS.CUSTOMERS, freshCust.id, {
            totalBalance: Math.max(0, Number(freshCust.totalBalance || 0) - (sale.remainingBalance || 0)),
          });
        }
      }
      toast({ title: "Sale voided (ተሰርዟል)" });
      loadData();
    });
  }

  async function handleActivate(sale: PosSale) {
    await update(COLLECTIONS.POS_SALES, sale.id, { status: "active" });
    reactivateJournalEntryByReference(sale.voucherId || sale.id).catch(err => console.warn(err));
    if (sale.customerId && (sale.remainingBalance || 0) > 0) {
      const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, sale.customerId) || customers.find(c => c.id === sale.customerId);
      if (freshCust) {
        await update(COLLECTIONS.CUSTOMERS, freshCust.id, {
          totalBalance: Number(freshCust.totalBalance || 0) + (sale.remainingBalance || 0),
        });
      }
    }
    toast({ title: "Sale activated (ዳግም ነቅቷል)" });
    loadData();
  }

  function handleDelete(sale: PosSale) {
    confirmDelete(async () => {
      await remove(COLLECTIONS.POS_SALES, sale.id);
      voidJournalEntryByReference(sale.voucherId || sale.id).catch(err => console.warn(err));
      // Reverse customer balance only if it was active and not already voided
      if (sale.customerId && (sale.remainingBalance || 0) > 0 && sale.status !== "voided") {
        const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, sale.customerId) || customers.find(c => c.id === sale.customerId);
        if (freshCust) {
          await update(COLLECTIONS.CUSTOMERS, freshCust.id, {
            totalBalance: Math.max(0, Number(freshCust.totalBalance || 0) - (sale.remainingBalance || 0)),
          });
        }
      }
      toast({ title: "Sale deleted (ተሰርዟል)" });
      loadData();
    });
  }

  function handlePrint() {
    if (!receiptRef.current) return;
    printElement(receiptRef.current, "POS_Sales_Receipt");
  }
  const [sharingPdf, setSharingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingHistoryPdf, setExportingHistoryPdf] = useState(false);

  async function handleShare() {
    if (!receiptRef.current) return;
    setSharing(true);
    try {
      const r = await shareAsImage(receiptRef.current, `pos_${showVoucher?.voucherId || "receipt"}.png`);
      if (r === "shared") toast({ title: "Receipt shared successfully (ደረሰኝ ተጋርቷል)" });
      else if (r === "downloaded") toast({ title: "Receipt image downloaded (ደረሰኝ ወርዷል)" });
      else if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    } catch (err) {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  async function handleSharePdf() {
    if (showVoucher) {
      setSharingPdf(true);
      try {
        await exportSalePdf(showVoucher);
      } finally {
        setSharingPdf(false);
      }
      return;
    }
    if (!receiptRef.current) return;
    setSharingPdf(true);
    try {
      const r = await shareAsPdf(receiptRef.current, `pos_${showVoucher?.voucherId || "receipt"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch (err) {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingPdf(false);
    }
  }

  async function exportExcel(sale: PosSale) {
    setExportingExcel(true);
    try {
      const vTypeLabel = sale.voucherType === "manual_receipt" || sale.voucherType === "Manual Sales Receipt"
        ? "Manual Sales Receipt (የማኑዋል ደረሰኝ)"
        : "Cash Register (የካሽ ሬጂስተር)";

      const data = [
        ["POS SALES ATTACHMENT"],
        ["Voucher ID", sale.voucherId || "—"],
        ["Voucher Type", vTypeLabel],
        ["Date", sale.voucherDate || "—"],
        ["Store", sale.storeName || "—"],
        ["Customer", sale.customerName || "Walk-in"],
        ["Created By", sale.createdByName || "—"],
        ["Checked By", sale.checkedBy ? `${sale.checkedBy} (Verified / ትክክል ነው)` : "Pending Review (ያልተጣራ)"],
        [],
        ["No.", "Product", "Code", "Qty/Ctn", "Cartons", "Pieces", "Unit Price (ETB)", "Carton Price (ETB)", "Total Sales (ETB)"],
        ...(sale.items || []).map((i, idx) => {
          const qpc = Math.round(i.quantityPerCarton > 0 ? i.quantityPerCarton : 1);
          const pcs = Math.round(i.quantity || 0);
          const ctns = i.cartons ?? Math.floor(pcs / qpc);
          const unitP = Math.round(i.adjustedPrice ?? i.sellingPrice ?? 0);
          const ctnP = Math.round(i.cartonPrice ?? (unitP * qpc));
          return [
            idx + 1,
            i.productName,
            i.productCode || "",
            qpc,
            ctns,
            pcs,
            unitP,
            ctnP,
            Math.round(i.totalPrice || (unitP * pcs))
          ];
        }),
        [],
        ["", "", "", "", "", "Total Items:", (sale.items || []).length, "Grand Total Sales (ETB):", sale.totalAmount],
        ["", "", "", "", "", "Amount Paid (ETB):", sale.amountPaid, "Remaining Balance (ETB):", sale.remainingBalance]
      ];
      const res = await exportToExcel({
        data,
        sheetName: "POS Sale Attachment",
        filename: `POS_Sales_Attachment_${sale.voucherId || "sale"}.xlsx`,
      });
      if (res === "failed") {
        toast({ title: "Excel export failed", variant: "destructive" });
      } else {
        toast({ title: res === "shared" ? "Excel shared successfully" : "Excel exported successfully" });
      }
    } catch (err) {
      console.error("Excel export error:", err);
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally {
      setExportingExcel(false);
    }
  }

  async function exportSalePdf(sale: PosSale) {
    try {
      const pdfColumns = [
        { header: "#", key: "index", width: 8, align: "center" as const, isInteger: true },
        { header: "Product", key: "productName", width: 28, align: "left" as const },
        { header: "Code", key: "productCode", width: 14, align: "center" as const },
        { header: "Qty/Ctn", key: "qpc", width: 12, align: "right" as const, isInteger: true },
        { header: "Cartons", key: "cartons", width: 12, align: "right" as const, isInteger: true },
        { header: "Pieces", key: "pieces", width: 12, align: "right" as const, isInteger: true },
        { header: "Unit Price", key: "unitPrice", width: 14, align: "right" as const, isCurrency: true },
        { header: "Carton Price", key: "cartonPrice", width: 14, align: "right" as const, isCurrency: true },
        { header: "Total Sales (ETB)", key: "total", width: 16, align: "right" as const, isCurrency: true },
      ];

      const pdfRows = (sale.items || []).map((i, idx) => {
        const qpc = Math.round(i.quantityPerCarton > 0 ? i.quantityPerCarton : 1);
        const pcs = Math.round(i.quantity || 0);
        const ctns = i.cartons ?? Math.floor(pcs / qpc);
        const unitP = Math.round(i.adjustedPrice ?? i.sellingPrice ?? 0);
        const ctnP = Math.round(i.cartonPrice ?? (unitP * qpc));
        return {
          index: idx + 1,
          productName: i.productName,
          productCode: i.productCode || "",
          qpc,
          cartons: ctns,
          pieces: pcs,
          unitPrice: unitP,
          cartonPrice: ctnP,
          total: Math.round(i.totalPrice || (unitP * pcs)),
        };
      });

      pdfRows.push({
        index: "",
        productName: "GRAND TOTAL",
        productCode: "",
        qpc: "",
        cartons: sale.items.reduce((s, i) => s + (i.cartons || 0), 0),
        pieces: sale.items.reduce((s, i) => s + (i.quantity || 0), 0),
        unitPrice: "",
        cartonPrice: "",
        total: sale.totalAmount,
        _isGrandTotal: true,
      } as any);

      const vTypeStr = sale.voucherType === "manual_receipt" || sale.voucherType === "Manual Sales Receipt"
        ? "Manual Sales Receipt"
        : "Cash Register";

      await exportToPdf({
        title: "YESERAHUT POS SALES ATTACHMENT",
        subtitle: `Voucher: ${sale.voucherId} | Type: ${vTypeStr} | Date: ${sale.voucherDate || ""} | Store: ${sale.storeName || ""} | Customer: ${sale.customerName || "Walk-in"}`,
        filename: `POS_Sales_Attachment_${sale.voucherId || "sale"}.pdf`,
        orientation: "portrait",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Grand Total Sales", value: `${fmt(sale.totalAmount)} ETB` },
          { label: "Amount Paid", value: `${fmt(sale.amountPaid || 0)} ETB` },
          { label: "Remaining Balance", value: `${fmt(sale.remainingBalance || 0)} ETB` },
          { label: "Voucher Type", value: vTypeStr },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          return null;
        },
      });
      toast({ title: "Sale attachment exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    }
  }

  async function exportSalesHistoryPdf() {
    setExportingHistoryPdf(true);
    try {
      const pdfColumns = [
        { header: "Voucher ID", key: "voucherId", width: 14, align: "center" as const },
        { header: "Date", key: "voucherDate", width: 14, align: "center" as const },
        { header: "Customer", key: "customerName", width: 22, align: "left" as const },
        { header: "Store", key: "storeName", width: 16, align: "center" as const },
        { header: "Total Sales (ETB)", key: "totalAmount", width: 16, align: "right" as const, isCurrency: true },
        { header: "Payment", key: "paymentMethod", width: 14, align: "center" as const },
        { header: "Paid (ETB)", key: "amountPaid", width: 15, align: "right" as const, isCurrency: true },
        { header: "Balance (ETB)", key: "remainingBalance", width: 15, align: "right" as const, isCurrency: true },
        { header: "Status", key: "status", width: 12, align: "center" as const },
      ];

      let sumTotal = 0;
      let sumPaid = 0;
      let sumBalance = 0;

      const pdfRows = filtered.map(s => {
        sumTotal += s.totalAmount || 0;
        sumPaid += s.amountPaid || 0;
        sumBalance += s.remainingBalance || 0;
        return {
          voucherId: s.voucherId,
          voucherDate: s.voucherDate || "",
          customerName: s.customerName || "Walk-in",
          storeName: s.storeName || "",
          totalAmount: s.totalAmount,
          paymentMethod: (s.paymentMethod || "cash").toUpperCase(),
          amountPaid: s.amountPaid || 0,
          remainingBalance: s.remainingBalance || 0,
          status: s.status?.toUpperCase() || "ACTIVE",
        };
      });

      pdfRows.push({
        voucherId: "TOTAL",
        voucherDate: "",
        customerName: `${filtered.length} Sales Transactions`,
        storeName: "",
        totalAmount: sumTotal,
        paymentMethod: "",
        amountPaid: sumPaid,
        remainingBalance: sumBalance,
        status: "",
        _isGrandTotal: true,
      } as any);

      const dateStr = new Date().toISOString().slice(0, 10);
      await exportToPdf({
        title: "YESERAHUT POS SALES TRANSACTIONS REPORT",
        subtitle: `Total Records: ${filtered.length} | Export Date: ${dateStr}`,
        filename: `Sales_Report_${dateStr}.pdf`,
        orientation: "landscape",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Total Transactions", value: filtered.length },
          { label: "Gross Revenue (ETB)", value: fmt(sumTotal) },
          { label: "Total Collected (ETB)", value: fmt(sumPaid) },
          { label: "Outstanding Credit (ETB)", value: fmt(sumBalance) },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          return null;
        },
      });
      toast({ title: "Sales report exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    } finally {
      setExportingHistoryPdf(false);
    }
  }

  const productResults = products.filter(p =>
    Boolean(p) && Boolean(productSearch) && (
      (p.name || "").toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.code || "").toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.barcodeValue || "").toLowerCase().includes(productSearch.toLowerCase())
    )
  ).slice(0, 8);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">POS Sales</h1>
          <p className="text-muted-foreground text-sm mt-1">Point-of-sale transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowVoucherSettingsDialog(true)} className="gap-1.5">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="hidden sm:inline">Voucher Settings</span>
            <span>(መነሻ ቁጥር)</span>
          </Button>
          <Button variant="outline" onClick={exportSalesHistoryPdf} disabled={filtered.length === 0 || exportingHistoryPdf} className="text-rose-600 dark:text-rose-400 hover:text-rose-700">
            <FileText className="w-4 h-4 mr-2" /> {exportingHistoryPdf ? "Exporting PDF..." : "Export Sales PDF"}
          </Button>
          <Button onClick={() => openNew()} data-testid="button-new-sale" className="flex-shrink-0">
            <Plus className="w-4 h-4 mr-2" /> New Sale
          </Button>
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input className="pl-9" placeholder="Search by voucher ID, date, total cartons, store, customer, product, remark..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-sales" />
      </div>

      {/* Voucher Type Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
        <span className="text-muted-foreground font-semibold">ደረሰኝ ዓይነት (Voucher Type):</span>
        <button
          type="button"
          onClick={() => setVoucherTypeFilter("all")}
          className={`px-3 py-1 rounded-full border transition-all ${
            voucherTypeFilter === "all"
              ? "bg-primary text-primary-foreground border-primary font-semibold shadow-xs"
              : "bg-muted/50 hover:bg-muted text-muted-foreground border-border"
          }`}
        >
          All (ሁሉም) ({sales.length})
        </button>
        <button
          type="button"
          onClick={() => setVoucherTypeFilter("cash_register")}
          className={`px-3 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
            voucherTypeFilter === "cash_register"
              ? "bg-blue-600 text-white border-blue-600 font-semibold shadow-xs"
              : "bg-muted/50 hover:bg-muted text-muted-foreground border-border"
          }`}
        >
          <span>🏷️ Cash Register (የካሽ ሬጂስተር)</span>
          <span className="opacity-80 text-[10px]">
            ({sales.filter(s => s.voucherType === "cash_register" || s.voucherType === "Cash Register" || (s.voucherId && s.voucherId.toUpperCase().startsWith("CR-"))).length})
          </span>
        </button>
        <button
          type="button"
          onClick={() => setVoucherTypeFilter("manual_receipt")}
          className={`px-3 py-1 rounded-full border transition-all flex items-center gap-1.5 ${
            voucherTypeFilter === "manual_receipt"
              ? "bg-amber-600 text-white border-amber-600 font-semibold shadow-xs"
              : "bg-muted/50 hover:bg-muted text-muted-foreground border-border"
          }`}
        >
          <span>📝 Manual Sales Receipt (የማኑዋል ደረሰኝ)</span>
          <span className="opacity-80 text-[10px]">
            ({sales.filter(s => s.voucherType === "manual_receipt" || s.voucherType === "Manual Sales Receipt" || (s.voucherId && s.voucherId.toUpperCase().startsWith("MSR-"))).length})
          </span>
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Voucher", "Date", "Customer", "Store", "Total Sales", "Payment", "Paid", "Balance", "Status", "Audit", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(sale => (
                <tr key={sale.id} className="hover:bg-muted/30" data-testid={`row-sale-${sale.id}`}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setShowVoucher(sale)}
                        className="font-bold text-primary hover:underline cursor-pointer"
                        title="Click to view voucher attachment"
                      >
                        {sale.voucherId}
                      </button>
                      {sale.voucherType === "manual_receipt" || (sale.voucherId && sale.voucherId.toUpperCase().startsWith("MSR")) ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-50 text-amber-800 border-amber-300 font-sans" title="Manual Sales Receipt">
                          Manual
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-50 text-blue-800 border-blue-300 font-sans" title="Cash Register Receipt">
                          CR
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {sale.voucherDate ? formatEthDate(sale.voucherDate, { short: true }) : "—"}
                    </div>
                    {sale.voucherDate && (
                      <div className="text-[10px] text-muted-foreground">{sale.voucherDate}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">{sale.customerName || "Walk-in"}</td>
                  <td className="px-4 py-2">{sale.storeName}</td>
                  <td className="px-4 py-2 font-medium">{fmt(sale.totalAmount)}</td>
                  <td className="px-4 py-2 capitalize">{sale.paymentMethod}</td>
                  <td className="px-4 py-2 text-green-600">{fmt(sale.amountPaid)}</td>
                  <td className="px-4 py-2 text-red-500">{fmt(sale.remainingBalance)}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={sale.status === "active" ? "default" : sale.status === "pending" ? "outline" : "destructive"}
                      className={sale.status === "pending" ? "border-amber-500 text-amber-600 bg-amber-50" : ""}
                    >{sale.status}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <AuditStatusBadge
                      isChecked={sale.isChecked}
                      checkedBy={sale.checkedBy}
                      canAudit={canAudit}
                      onQuickCheck={() =>
                        performQuickAudit({
                          collectionName: COLLECTIONS.POS_SALES,
                          docId: sale.id,
                          currentChecked: sale.isChecked,
                          isAuditor,
                          isAdmin,
                          user,
                          registeredAuditors,
                          activeAuditorName,
                          toast,
                          onSuccess: (newChecked, auditorName) => {
                            setSales(prev => prev.map(item => item.id === sale.id ? { ...item, isChecked: newChecked, checkedBy: auditorName } : item));
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-xs" data-testid={`button-actions-${sale.id}`}>
                          Actions
                          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">
                          {sale.voucherId}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setShowVoucher({ ...sale, items: Array.isArray(sale.items) ? sale.items : [] })} data-testid={`button-view-${sale.id}`}>
                          <Eye className="w-4 h-4 mr-2" /> View Receipt
                        </DropdownMenuItem>
                        {isAdmin && sale.status === "pending" && (
                          <DropdownMenuItem onClick={() => handleApprove(sale)} className="text-emerald-600 focus:text-emerald-600" data-testid={`button-approve-${sale.id}`}>
                            <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> Approve
                          </DropdownMenuItem>
                        )}
                        {sale.status !== "voided" && (
                          <DropdownMenuItem onClick={() => openEdit(sale)} data-testid={`button-edit-${sale.id}`}>
                            <Pencil className="w-4 h-4 mr-2 text-amber-600" /> Edit Sale (አስተካክል)
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => duplicateSale(sale)} data-testid={`button-duplicate-${sale.id}`}>
                          <Copy className="w-4 h-4 mr-2 text-blue-600" /> Duplicate (ቅጂ/ደብል)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportExcel(sale)} data-testid={`button-export-${sale.id}`}>
                          <FileDown className="w-4 h-4 mr-2" /> Export Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportSalePdf(sale)} className="text-rose-600 focus:text-rose-600">
                          <FileText className="w-4 h-4 mr-2" /> Export PDF
                        </DropdownMenuItem>
                        {sale.status === "active" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleVoid(sale)} className="text-orange-600 focus:text-orange-600" data-testid={`button-void-${sale.id}`}>
                              <Ban className="w-4 h-4 mr-2 text-orange-500" /> Void Sale
                            </DropdownMenuItem>
                          </>
                        )}
                        {isAdmin && sale.status === "voided" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleActivate(sale)} className="text-emerald-600 focus:text-emerald-600" data-testid={`button-activate-${sale.id}`}>
                              <RotateCcw className="w-4 h-4 mr-2 text-emerald-600" /> Activate Sale
                            </DropdownMenuItem>
                          </>
                        )}
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(sale)} className="text-destructive focus:text-destructive" data-testid={`button-delete-${sale.id}`}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete Sale
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={10} className="text-center py-10 text-muted-foreground">No sales found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* New / Edit Sale Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); resetForm(); } }}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto transition-all ${form.photoProofUrl && !hideRefPhoto ? "max-w-6xl xl:max-w-7xl" : "max-w-4xl"}`}>
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <DialogTitle>{editingId ? "Edit POS Sale" : "New POS Sale"}</DialogTitle>
            {form.photoProofUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHideRefPhoto(!hideRefPhoto)}
                className="h-7 text-xs gap-1.5"
              >
                {hideRefPhoto ? (
                  <>
                    <Eye className="w-3.5 h-3.5 text-primary" />
                    Show Reference Photo (አሳይ)
                  </>
                ) : (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                    Hide Reference Photo (ደብቅ)
                  </>
                )}
              </Button>
            )}
          </DialogHeader>

          {form.photoProofUrl && hideRefPhoto && (
            <div className="p-2.5 px-3 rounded-lg bg-muted/50 border flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-primary" /> Reference photo is attached to this sale voucher.
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-primary font-semibold"
                onClick={() => setHideRefPhoto(false)}
              >
                Show Reference Photo (አሳይ)
              </Button>
            </div>
          )}

          <div className={form.photoProofUrl && !hideRefPhoto ? "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" : "space-y-4"}>
            <div className={form.photoProofUrl && !hideRefPhoto ? "lg:col-span-7 xl:col-span-7 space-y-4" : "space-y-4"}>
            
            {/* Voucher Type Selection Card */}
            <div className="bg-muted/40 border border-border/80 rounded-lg p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <Label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-primary" />
                  Voucher Type (የደረሰኝ ዓይነት) *
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-[11px] px-2 text-primary border-primary/30 hover:bg-primary/10 gap-1"
                  onClick={() => setShowVoucherSettingsDialog(true)}
                >
                  <Settings className="w-3 h-3" />
                  መነሻ ቁጥር ማስተካከያ (Starting Numbers)
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleVoucherTypeChange("cash_register")}
                  className={`flex items-center justify-center gap-2 p-2 rounded-md border text-xs font-semibold transition-all ${
                    form.voucherType === "cash_register"
                      ? "bg-blue-600 text-white border-blue-600 shadow-xs ring-1 ring-blue-500"
                      : "bg-background hover:bg-muted text-muted-foreground border-border"
                  }`}
                >
                  <span>🏷️ Cash Register (የካሽ ሬጂስተር)</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleVoucherTypeChange("manual_receipt")}
                  className={`flex items-center justify-center gap-2 p-2 rounded-md border text-xs font-semibold transition-all ${
                    form.voucherType === "manual_receipt"
                      ? "bg-amber-600 text-white border-amber-600 shadow-xs ring-1 ring-amber-500"
                      : "bg-background hover:bg-muted text-muted-foreground border-border"
                  }`}
                >
                  <span>📝 Manual Sales Receipt (የማኑዋል ደረሰኝ)</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    Voucher ID (የቫውቸር ቁጥር)
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[11px] text-primary"
                    onClick={() => {
                      const nextId = getNextPosVoucherId(form.voucherType, sales, voucherSettings);
                      setForm(f => ({ ...f, voucherId: nextId }));
                    }}
                    title="Regenerate Next Sequential Voucher ID"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" /> Auto ID
                  </Button>
                </div>
                <Input
                  value={form.voucherId}
                  onChange={e => setForm(f => ({ ...f, voucherId: e.target.value }))}
                  placeholder={form.voucherType === "cash_register" ? "e.g. CR-1001" : "e.g. MSR-1001"}
                  className="font-mono min-h-[38px] font-semibold"
                  data-testid="input-voucher-id"
                />
                <span className="text-[10px] text-muted-foreground block truncate">
                  {form.voucherType === "cash_register" ? "Cash Register ተከታታይ" : "Manual Receipt ተከታታይ"} (መነሻ: {form.voucherType === "cash_register" ? voucherSettings.cashRegister.startNumber : voucherSettings.manualReceipt.startNumber})
                </span>
              </div>
              <div>
                <CustomerSelect
                  label="Customer (ደንበኛ)"
                  value={form.customerId}
                  onValueChange={v => setForm(f => ({ ...f, customerId: v }))}
                  customers={customers}
                  allowWalkIn={true}
                  placeholder="Search customer by name, address, phone..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Store * (መጋዘን)</Label>
                <Select value={form.storeId} onValueChange={v => setForm(f => ({ ...f, storeId: v }))}>
                  <SelectTrigger data-testid="select-store" className="min-h-[38px]"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Method (የክፍያ ዘዴ)</Label>
                <Select
                  value={form.paymentMethod}
                  onValueChange={v => setForm(f => ({
                    ...f,
                    paymentMethod: v as "cash" | "transfer" | "credit",
                    ...(v === "credit" && f.amountPaid === subtotal ? { amountPaid: 0 } : {})
                  }))}
                >
                  <SelectTrigger className="min-h-[38px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash (ጥሬ ገንዘብ)</SelectItem>
                    <SelectItem value="transfer">Transfer (ዝውውር)</SelectItem>
                    <SelectItem value="credit">Credit (ብድር / በዱቤ)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Customer Debt Balance Indicator */}
            {(() => {
              const selectedCust = customers.find(c => c.id === form.customerId);
              if (!selectedCust) return null;
              const prevBal = Number(selectedCust.totalBalance || 0);
              const newTotalBal = prevBal + remaining;
              return (
                <div className="p-3 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-amber-900 dark:text-amber-200">ደንበኛ: {selectedCust.name}</span>
                    {selectedCust.phone && <span className="text-muted-foreground font-mono">({selectedCust.phone})</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <span className="text-muted-foreground">ነባር ቀሪ እዳ (Previous Debt): </span>
                      <span className="font-bold text-red-600">{fmt(prevBal)} ETB</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">በዚህ ደረሰኝ ያልተከፈለ (Unpaid on Receipt): </span>
                      <span className="font-bold text-amber-600">{fmt(remaining)} ETB</span>
                    </div>
                    <div className="pl-3 border-l border-amber-300 dark:border-amber-700">
                      <span className="text-slate-800 dark:text-slate-200 font-medium">አጠቃላይ አዲስ እዳ (New Total Balance): </span>
                      <span className="font-black text-red-600 text-sm">{fmt(newTotalBal)} ETB</span>
                    </div>
                  </div>
                </div>
              );
            })()}

            <div>
              <Label>Add Products</Label>
              <div className="relative">
                <div className="flex gap-2">
                  <Input
                    placeholder="Search by name, code or scan barcode…"
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && productResults.length === 1) addProduct(productResults[0]); }}
                    data-testid="input-product-search"
                    className="flex-1"
                  />
                  <BarcodeScannerButton onScan={val => {
                    const exact = products.find(p => (p.barcodeValue || "").toLowerCase() === val.toLowerCase() || p.code.toLowerCase() === val.toLowerCase());
                    if (exact) addProduct(exact);
                    else setProductSearch(val);
                  }} />
                </div>
                {productResults.length > 0 && (
                  <div className="absolute z-10 top-full left-0 right-0 bg-card border rounded-b shadow-lg max-h-72 overflow-y-auto">
                    {productResults.map(p => {
                      const unitP = getPrice(p.id);
                      const qpc = p.quantityPerCarton || 1;
                      const ctnP = unitP * qpc;
                      return (
                        <div key={p.id} className="px-3 py-2 hover:bg-muted cursor-pointer flex items-center gap-3" onClick={() => addProduct(p)}>
                          {p.photoUrl
                            ? <img src={p.photoUrl} alt={p.name} className="w-14 h-14 rounded-md object-cover flex-shrink-0 border" />
                            : <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0 border text-muted-foreground text-xs">No photo</div>
                          }
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.code} · {p.quantityPerCarton} pcs/ctn</div>
                            <div className="text-xs text-primary font-medium">Unit: {fmt(unitP)} · Ctn: {fmt(ctnP)}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>{["No.", "Product", "Qty/Ctn", "Cartons / Pieces", "Adj. Price", "Carton Price", "Total", ""].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const isPcs = byPieceSet.has(item.productId);
                      const avail = storeStockMap[item.productId] ?? 0;
                      const qpc = item.quantityPerCarton || 1;
                      const overstock = form.storeId && item.quantity > avail;
                      const prodObj = products.find(p => p.id === item.productId);
                      const photo = item.photoUrl || prodObj?.photoUrl || "";
                      return (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-3 py-2 text-xs font-bold text-muted-foreground text-center w-8">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {photo
                                ? <img src={photo} alt={item.productName} className="w-12 h-12 rounded-md object-cover flex-shrink-0 border" />
                                : <div className="w-12 h-12 rounded-md bg-muted flex-shrink-0 border" />
                              }
                              <div className="min-w-0">
                                <div className="font-medium text-xs truncate max-w-[170px]">{item.productName}</div>
                                <div className="text-[11px] text-muted-foreground font-mono">{item.productCode}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center text-xs font-medium">{item.quantityPerCarton}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col items-start gap-1">
                              <button
                                type="button"
                                onClick={() => toggleByPiece(item.productId)}
                                className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold transition-colors ${
                                  isPcs
                                    ? "bg-blue-100 border-blue-400 text-blue-700 dark:bg-blue-950 dark:border-blue-700 dark:text-blue-300"
                                    : "bg-muted border-muted-foreground/30 text-muted-foreground"
                                }`}
                              >
                                {isPcs ? "Pcs" : "Ctns"}
                              </button>
                              {isPcs ? (
                                <Input
                                  type="number"
                                  min={1}
                                  className={`w-24 h-7 text-xs ${overstock ? "border-red-500 text-red-600 font-semibold" : ""}`}
                                  value={item.quantity}
                                  onChange={e => updateItem(idx, "quantity", Number(e.target.value))}
                                />
                              ) : (
                                <Input
                                  type="number"
                                  min={0.1}
                                  step={0.5}
                                  className={`w-24 h-7 text-xs ${overstock ? "border-red-500 text-red-600 font-semibold" : ""}`}
                                  value={item.cartons}
                                  onChange={e => updateItem(idx, "cartons", Number(e.target.value))}
                                />
                              )}
                              {form.storeId && (
                                <span className={`text-[10px] ${overstock ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
                                  Avail: {avail} pcs ({Math.floor(avail / qpc)} ctns)
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-24 h-7 text-xs font-mono"
                              value={item.adjustedPrice}
                              onChange={e => updateItem(idx, "adjustedPrice", Number(e.target.value))}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-24 h-7 text-xs font-mono bg-muted/40"
                              value={item.cartonPrice}
                              onChange={e => updateItem(idx, "cartonPrice", Number(e.target.value))}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs font-semibold text-foreground whitespace-nowrap">
                            {fmt(item.totalPrice)}
                          </td>
                          <td className="px-3 py-2">
                            <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 font-semibold border-t">
                    <tr>
                      <td className="px-3 py-2 text-xs" colSpan={3}>Totals</td>
                      <td className="px-3 py-2 text-xs font-medium">
                        {Number(totalCartons.toFixed(2))} ctns ({totalPieces} pcs)
                      </td>
                      <td colSpan={2} />
                      <td className="px-3 py-2 text-xs font-bold">{fmt(subtotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {form.paymentMethod === "transfer" && (
              <div className="rounded-lg border bg-blue-50/50 p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Transfer Details</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Transfer To</Label>
                    <Select value={form.transferType} onValueChange={v => setForm(f => ({ ...f, transferType: v as "supplier" | "account", supplierId: "", accountId: "" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="supplier">Supplier</SelectItem>
                        <SelectItem value="account">Account</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.transferType === "supplier" ? (
                    <div>
                      <SupplierSelect
                        label="Supplier (አቅራቢ)"
                        value={form.supplierId}
                        onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}
                        suppliers={suppliers}
                        placeholder="Select or search supplier..."
                      />
                    </div>
                  ) : (
                    <div>
                      <Label>Account</Label>
                      <Select value={form.accountId} onValueChange={v => setForm(f => ({ ...f, accountId: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                        <SelectContent>
                          {accounts.map(a => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.bankName} — {a.personName} ({a.accountNumber})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div>
                  <Label>FS Number</Label>
                  <Input
                    placeholder="Fiscal / receipt number"
                    value={form.fsNumber}
                    onChange={e => setForm(f => ({ ...f, fsNumber: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount Paid (ETB)</Label>
                <Input type="number" min={0} step={0.01} value={form.amountPaid} onChange={e => setForm(f => ({ ...f, amountPaid: Number(e.target.value) }))} data-testid="input-amount-paid" />
              </div>
              <div>
                <Label>Balance Due (ETB)</Label>
                <Input value={remaining.toFixed(2)} readOnly className="bg-muted font-semibold text-red-500" />
              </div>
            </div>
            {form.customerId && remaining > 0 && (
              <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/20 px-2.5 py-1 rounded border border-amber-200 dark:border-amber-800/40">
                <span>✓ የዚህ ደረሰኝ ያልተከፈለ ቀሪ እዳ ({fmt(remaining)} ETB) በደንበኛው አጠቃላይ እዳ ላይ በራስ-ሰር ይደመራል (Unpaid balance will be added to customer debt).</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <HabeshaDatePicker
                  label="Date (የደረሰኝ ቀን)"
                  value={form.voucherDate}
                  onChange={async (v) => {
                    setForm(f => ({ ...f, voucherDate: v }));
                    if (!editingId) {
                      const nextId = getNextPosVoucherId(form.voucherType, sales, voucherSettings);
                      setForm(f => ({ ...f, voucherDate: v, voucherId: nextId }));
                    }
                  }}
                />
              </div>
              <div><Label>Remark</Label><Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} /></div>
            </div>

            {!form.photoProofUrl && (
              <div className="pt-2 border-t">
                <ReferencePhotoViewer
                  photoUrl=""
                  onPhotoChange={(url) => setForm(f => ({ ...f, photoProofUrl: url }))}
                  isEditable={true}
                  title="Reference Photo / Slip (ማጣቀሻ ፎቶ / ደረሰኝ)"
                  isUploading={uploading}
                  setIsUploading={setUploading}
                />
              </div>
            )}
            </div>

            {/* Right column: Reference Photo viewer when photo is attached and not hidden */}
            {form.photoProofUrl && !hideRefPhoto && (
              <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-0 space-y-2">
                <ReferencePhotoViewer
                  photoUrl={form.photoProofUrl}
                  onPhotoChange={(url) => setForm(f => ({ ...f, photoProofUrl: url }))}
                  onPhotoRemove={() => setForm(f => ({ ...f, photoProofUrl: "" }))}
                  onToggleHidden={(hidden) => setHideRefPhoto(hidden)}
                  isEditable={true}
                  title="Reference Document (ማጣቀሻ ሰነድ)"
                  isUploading={uploading}
                  setIsUploading={setUploading}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-sale">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Complete Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt */}
      <Dialog open={!!showVoucher} onOpenChange={() => setShowVoucher(null)}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto ${(showVoucher?.photoProofUrl || showVoucher?.referencePhotoUrl) ? "max-w-6xl xl:max-w-7xl" : "max-w-2xl"}`}>
          <DialogHeader className="flex flex-row items-center justify-between pb-1 border-b">
            <DialogTitle>POS Sales Attachment</DialogTitle>
            {showVoucher && showVoucher.status !== "voided" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-amber-700 hover:text-amber-800 dark:text-amber-400"
                onClick={() => {
                  const saleToEdit = showVoucher;
                  setShowVoucher(null);
                  openEdit(saleToEdit);
                }}
              >
                <Pencil className="w-4 h-4" /> Edit Sale (አስተካክል)
              </Button>
            )}
          </DialogHeader>
          {showVoucher && (
            <div className="space-y-4">
              <VoucherAuditSection
                collectionName={COLLECTIONS.POS_SALES}
                docId={showVoucher.id}
                isChecked={showVoucher.isChecked}
                checkedBy={showVoucher.checkedBy}
                checkedAt={showVoucher.checkedAt}
                checkedNote={showVoucher.checkedNote}
                voucherNumber={showVoucher.voucherId}
                onAuditChange={(newChecked, auditorName, note) => {
                  setShowVoucher(v => v ? { ...v, isChecked: newChecked, checkedBy: auditorName, checkedNote: note } : null);
                  setSales(prev => prev.map(item => item.id === showVoucher.id ? { ...item, isChecked: newChecked, checkedBy: auditorName, checkedNote: note } : item));
                }}
              />
              <ReceiptWithReferenceView
                referencePhotoUrl={showVoucher.referencePhotoUrl || showVoucher.photoProofUrl}
                voucherId={showVoucher.voucherId}
                receiptNode={
                  <div
                    ref={receiptRef}
                    className="receipt-a4 p-4 space-y-4 border rounded-lg bg-card shadow-xs relative"
                    style={{ position: "relative", overflow: "hidden" }}
                  >
                    {/* Big Background Watermark "ATTACHMENT" */}
                    <div
                      style={{
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%) rotate(-30deg)",
                        pointerEvents: "none",
                        zIndex: 0,
                        userSelect: "none",
                        whiteSpace: "nowrap",
                        textAlign: "center",
                        lineHeight: 1,
                      }}
                      aria-hidden="true"
                    >
                      <span
                        style={{
                          fontSize: "5.8rem",
                          fontWeight: 900,
                          color: "rgba(100, 116, 139, 0.08)",
                          letterSpacing: "0.16em",
                          textTransform: "uppercase",
                          fontFamily: "Arial, sans-serif",
                          display: "block",
                        }}
                      >
                        ATTACHMENT
                      </span>
                    </div>

                    {showVoucher.status === "voided" && (
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none", zIndex: 10 }}>
                        <span style={{ fontSize: "10rem", fontWeight: 900, color: "rgba(220,38,38,0.38)", transform: "rotate(-35deg)", letterSpacing: "0.12em", userSelect: "none", border: "10px solid rgba(220,38,38,0.38)", borderRadius: "8px", padding: "0 1.5rem", lineHeight: 1 }}>VOID</span>
                      </div>
                    )}
                    <div className="text-center border-b pb-4 relative z-10">
                      <h2 className="text-xl font-bold tracking-tight">POS SALES ATTACHMENT</h2>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <p className="text-sm text-muted-foreground">Voucher: <span className="font-mono font-bold text-foreground">{showVoucher.voucherId}</span></p>
                        {showVoucher.voucherType && (
                          <Badge variant="outline" className="text-xs px-2 py-0.5 bg-primary/10 text-primary border-primary/20 font-medium">
                            {showVoucher.voucherType === "cash_register" || showVoucher.voucherType === "Cash Register"
                              ? "Cash Register (የካሽ ሬጂስተር)"
                              : "Manual Sales Receipt (የማኑዋል ደረሰኝ)"}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm relative z-10" style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "0.5rem" }}>
                      <div><span className="text-muted-foreground">Customer: </span><span className="font-semibold">{showVoucher.customerName || "Walk-in"}</span></div>
                      <div><span className="text-muted-foreground">Store: </span><span className="font-medium">{showVoucher.storeName}</span></div>
                      <div><span className="text-muted-foreground">Date: </span><span className="font-semibold">{formatEthDate(showVoucher.voucherDate, { includeGregorian: true })}</span></div>
                      <div>
                        <span className="text-muted-foreground">Voucher Type: </span>
                        <span className="font-semibold">
                          {showVoucher.voucherType === "manual_receipt" || showVoucher.voucherType === "Manual Sales Receipt"
                            ? "Manual Sales Receipt"
                            : "Cash Register"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Payment: </span>
                        <span className="capitalize font-medium">{showVoucher.paymentMethod}</span>
                        {showVoucher.paymentMethod === "transfer" && showVoucher.transferType === "supplier" && showVoucher.supplierName && (
                          <span className="ml-1 text-blue-700 font-medium">→ {showVoucher.supplierName}</span>
                        )}
                        {showVoucher.paymentMethod === "transfer" && showVoucher.transferType === "account" && (
                          <span className="ml-1 text-blue-700 font-medium">
                            → {showVoucher.accountBankName} — {showVoucher.accountPersonName}
                            {showVoucher.accountNumber && <span className="text-xs text-muted-foreground ml-1">({showVoucher.accountNumber})</span>}
                          </span>
                        )}
                      </div>
                      {showVoucher.fsNumber && (
                        <div><span className="text-muted-foreground">FS Number: </span><span className="font-mono font-semibold">{showVoucher.fsNumber}</span></div>
                      )}
                      {showVoucher.remark && (
                        <div><span className="text-muted-foreground">Remark: </span>{showVoucher.remark}</div>
                      )}
                    </div>
                    <table className="w-full text-sm border-collapse border" style={{ width: "100%", borderCollapse: "collapse" }}>
                      <thead>
                        <tr className="bg-muted" style={{ backgroundColor: "#f1f5f9" }}>
                          {[
                            { label: "No.", width: "36px", align: "center", className: "" },
                            { label: "Photo", width: "68px", align: "center", className: "photo-col" },
                            { label: "Product", width: "auto", align: "left", className: "" },
                            { label: "Qty/Ctn", width: "52px", align: "center", className: "" },
                            { label: "Cartons", width: "52px", align: "center", className: "" },
                            { label: "Pieces", width: "52px", align: "center", className: "" },
                            { label: "Unit Price", width: "auto", align: "right", className: "" },
                            { label: "Carton Price", width: "auto", align: "right", className: "" },
                            { label: "Total", width: "auto", align: "right", className: "" },
                          ].map(h => (
                            <th
                              key={h.label}
                              className={`border px-2 py-1 text-xs font-semibold ${h.className}`}
                              style={{
                                border: "1px solid #cbd5e1",
                                padding: "5px 6px",
                                width: h.width,
                                textAlign: h.align as any,
                              }}
                            >
                              {h.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const safeItems = Array.isArray(showVoucher.items) ? showVoucher.items : [];
                          if (safeItems.length === 0) {
                            return (
                              <tr>
                                <td colSpan={9} className="border px-4 py-6 text-center text-xs text-muted-foreground italic">
                                  No item records found for this receipt.
                                </td>
                              </tr>
                            );
                          }
                          return safeItems.map((item, i) => {
                            const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;
                            const ctns = Math.round(item.cartons ?? (item.quantity / qpc));
                            const unitP = item.adjustedPrice ?? item.sellingPrice ?? 0;
                            const ctnP = item.cartonPrice ?? (unitP * qpc);
                            const prodObj = products.find(p => p.id === item.productId);
                            const photo = item.photoUrl || prodObj?.photoUrl || "";
                            return (
                              <tr key={i} className="align-middle">
                                <td className="border px-2 py-1 text-xs text-center font-bold text-muted-foreground w-8" style={{ border: "1px solid #cbd5e1", padding: "4px 6px", width: "36px", textAlign: "center" }}>
                                  {i + 1}
                                </td>
                                <td className="border px-1 py-1 text-center photo-col" style={{ border: "1px solid #cbd5e1", padding: "4px", width: "68px", minWidth: "68px", maxWidth: "72px", textAlign: "center" }}>
                                  {photo ? (
                                    <img
                                      src={photo}
                                      alt={item.productName}
                                      className="w-14 h-14 rounded-md object-cover mx-auto border receipt-photo"
                                      style={{ width: "56px", height: "56px", minWidth: "56px", minHeight: "56px", maxWidth: "56px", maxHeight: "56px", objectFit: "cover", borderRadius: "6px", display: "block", margin: "0 auto", border: "1px solid #cbd5e1" }}
                                      crossOrigin="anonymous"
                                    />
                                  ) : (
                                    <div
                                      className="w-14 h-14 rounded-md bg-muted/40 border flex items-center justify-center text-xs text-muted-foreground mx-auto"
                                      style={{ width: "56px", height: "56px", minWidth: "56px", minHeight: "56px", maxWidth: "56px", maxHeight: "56px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "6px", margin: "0 auto", border: "1px solid #cbd5e1", backgroundColor: "#f8fafc" }}
                                    >
                                      —
                                    </div>
                                  )}
                                </td>
                                <td className="border px-2 py-1 text-xs" style={{ border: "1px solid #cbd5e1", padding: "4px 6px" }}>
                                  <div className="font-medium">{item.productName}</div>
                                  {item.productCode && <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>}
                                </td>
                                <td className="border px-2 py-1 text-xs text-center" style={{ border: "1px solid #cbd5e1", padding: "4px 6px", width: "52px" }}>{qpc}</td>
                                <td className="border px-2 py-1 text-xs text-center font-semibold" style={{ border: "1px solid #cbd5e1", padding: "4px 6px", width: "52px" }}>{ctns}</td>
                                <td className="border px-2 py-1 text-xs text-center" style={{ border: "1px solid #cbd5e1", padding: "4px 6px", width: "52px" }}>{item.quantity}</td>
                                <td className="border px-2 py-1 text-xs text-right" style={{ border: "1px solid #cbd5e1", padding: "4px 6px", textAlign: "right" }}>{fmt(unitP)}</td>
                                <td className="border px-2 py-1 text-xs text-right" style={{ border: "1px solid #cbd5e1", padding: "4px 6px", textAlign: "right" }}>{fmt(ctnP)}</td>
                                <td className="border px-2 py-1 text-xs font-semibold text-foreground text-right" style={{ border: "1px solid #cbd5e1", padding: "4px 6px", textAlign: "right" }}>{fmt(item.totalPrice)}</td>
                              </tr>
                            );
                          });
                        })()}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold bg-muted/30" style={{ backgroundColor: "#f8fafc" }}>
                          <td className="border px-2 py-1 text-xs" colSpan={4} style={{ border: "1px solid #cbd5e1", padding: "4px 6px" }}>Totals</td>
                          <td className="border px-2 py-1 text-xs text-center font-bold" style={{ border: "1px solid #cbd5e1", padding: "4px 6px" }}>
                            {Math.round((showVoucher.items || []).reduce((s, i) => s + (i.cartons ?? (i.quantityPerCarton > 0 ? (i.quantity / i.quantityPerCarton) : 0)), 0))}
                          </td>
                          <td className="border px-2 py-1 text-xs text-center font-bold" style={{ border: "1px solid #cbd5e1", padding: "4px 6px" }}>
                            {(showVoucher.items || []).reduce((s, i) => s + (i.quantity || 0), 0)}
                          </td>
                          <td className="border px-2 py-1 text-xs" colSpan={2} style={{ border: "1px solid #cbd5e1", padding: "4px 6px" }} />
                          <td className="border px-2 py-1 text-xs font-bold text-right" style={{ border: "1px solid #cbd5e1", padding: "4px 6px", textAlign: "right" }}>{fmt(showVoucher.totalAmount || showVoucher.subtotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                    <div className="flex flex-col items-end gap-1 text-sm border-t pt-2" style={{ borderTop: "1px solid #cbd5e1", paddingTop: "8px" }}>
                      <div className="flex justify-end gap-8" style={{ display: "flex", justifyContent: "flex-end", gap: "2rem" }}>
                        <div><span className="text-muted-foreground">Paid at Sale (የተከፈለ): </span><span className="text-green-600 font-semibold" style={{ color: "#16a34a", fontWeight: 600 }}>{fmt(showVoucher.amountPaid)} ETB</span></div>
                        <div><span className="text-muted-foreground">Receipt Unpaid Balance (ቀሪ እዳ በደረሰኝ): </span><span className="text-red-500 font-semibold" style={{ color: "#ef4444", fontWeight: 600 }}>{fmt(showVoucher.remainingBalance)} ETB</span></div>
                      </div>
                      {(() => {
                        const receiptCustomer = customers.find(c => c.id === showVoucher.customerId);
                        if (!receiptCustomer) return null;
                        return (
                          <div className="text-xs text-slate-600 dark:text-slate-300 font-medium pt-1">
                            የደንበኛው አጠቃላይ ቀሪ እዳ (Customer Total Outstanding Debt): <span className="text-red-600 font-bold">{fmt(receiptCustomer.totalBalance || 0)} ETB</span>
                          </div>
                        );
                      })()}
                    </div>
                    <div className="border-t pt-3 mt-2 space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between"><span>Sold by / Store:</span><span className="font-medium text-foreground">{showVoucher.storeName}</span></div>
                      <div className="flex justify-between"><span>Customer:</span><span className="font-medium text-foreground">{showVoucher.customerName || "Walk-in"}</span></div>
                      {showVoucher.createdByName && <div className="flex justify-between"><span>Created by:</span><span className="font-medium text-foreground">{showVoucher.createdByName}</span></div>}
                      <ReceiptCheckedByLine checkedBy={showVoucher.checkedBy} isChecked={showVoucher.isChecked} checkedAt={showVoucher.checkedAt} />
                      <div className="flex justify-between mt-2"><span>Page 1 of 1</span><span>{showVoucher.voucherDate || new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span></div>
                    </div>

                    {/* Customer Digital Receipt QR Code - Hidden on print per user request */}
                    <div className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg no-print print:hidden" data-no-print="true">
                      <ReceiptQRCode
                        voucherId={showVoucher.voucherId}
                        voucherData={{
                          totalAmount: showVoucher.totalAmount || showVoucher.subtotal,
                          voucherDate: showVoucher.voucherDate,
                          storeName: showVoucher.storeName,
                          customerName: showVoucher.customerName,
                          paymentMethod: showVoucher.paymentMethod,
                          itemsCount: showVoucher.items?.length,
                          type: "pos",
                        }}
                        size={80}
                        showLink={true}
                      />
                      <div className="text-center sm:text-right text-[10px] text-muted-foreground space-y-1">
                        <div className="font-bold text-slate-800 dark:text-slate-200">
                          Scan for Digital Receipt
                        </div>
                        <div>ዲጂታል ደረሰኝ በስልክዎ ለማየት ይቃኙ</div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          {showVoucher.voucherId}
                        </div>
                      </div>
                    </div>
                  </div>
                }
              />
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <ReceiptActionBar
              receiptRef={receiptRef}
              referencePhotoUrl={showVoucher?.referencePhotoUrl || showVoucher?.photoProofUrl}
              voucherId={showVoucher?.voucherId}
              voucherTitle="POS SALES ATTACHMENT"
              voucherSubtitle={`Store: ${showVoucher?.storeName || ""} | Customer: ${showVoucher?.customerName || "Walk-in"}`}
              filenamePrefix="pos_sales_attachment"
              totalAmount={showVoucher?.totalAmount || showVoucher?.subtotal}
              customerName={showVoucher?.customerName}
              storeName={showVoucher?.storeName}
              voucherDate={showVoucher?.voucherDate}
              onExportExcel={() => showVoucher && exportExcel(showVoucher)}
              onSharePdf={handleSharePdf}
              onShare={handleShare}
              onPrint={() => handlePrint()}
              sharing={sharing}
              sharingPdf={sharingPdf}
              exportingExcel={exportingExcel}
            />
            <Button onClick={() => setShowVoucher(null)} className="w-full sm:w-auto">Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voucher Starting Number & Prefix Settings Dialog */}
      <Dialog open={showVoucherSettingsDialog} onOpenChange={setShowVoucherSettingsDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-primary" />
              Voucher Starting Numbers (የደረሰኝ መነሻ ቁጥር)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              ለ Cash Register እና Manual Sales Receipt መነሻ ቁጥር (Starting Number) እና ቅጥያ (Prefix) ያቀናብሩ።
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Cash Register Settings */}
            <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  🏷️ Cash Register (የካሽ ሬጂስተር)
                </Label>
                <Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-800 border-blue-300 font-mono">
                  Preview: {voucherSettings.cashRegister.prefix || ""}{String(voucherSettings.cashRegister.startNumber).padStart(voucherSettings.cashRegister.padding || 4, "0")}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Prefix (ቅጥያ)</Label>
                  <Input
                    value={voucherSettings.cashRegister.prefix}
                    onChange={e => setVoucherSettings(s => ({
                      ...s,
                      cashRegister: { ...s.cashRegister, prefix: e.target.value }
                    }))}
                    className="h-8 text-xs bg-white font-mono mt-1"
                    placeholder="e.g. CR-"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Starting Number (መነሻ ቁጥር) *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={voucherSettings.cashRegister.startNumber}
                    onChange={e => setVoucherSettings(s => ({
                      ...s,
                      cashRegister: { ...s.cashRegister, startNumber: Math.max(1, parseInt(e.target.value, 10) || 1) }
                    }))}
                    className="h-8 text-xs bg-white font-mono font-bold mt-1"
                  />
                </div>
              </div>
            </div>

            {/* Manual Sales Receipt Settings */}
            <div className="border border-amber-200 bg-amber-50/40 rounded-lg p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  📝 Manual Sales Receipt (የማኑዋል ደረሰኝ)
                </Label>
                <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-300 font-mono">
                  Preview: {voucherSettings.manualReceipt.prefix || ""}{String(voucherSettings.manualReceipt.startNumber).padStart(voucherSettings.manualReceipt.padding || 4, "0")}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[11px] text-muted-foreground">Prefix (ቅጥያ)</Label>
                  <Input
                    value={voucherSettings.manualReceipt.prefix}
                    onChange={e => setVoucherSettings(s => ({
                      ...s,
                      manualReceipt: { ...s.manualReceipt, prefix: e.target.value }
                    }))}
                    className="h-8 text-xs bg-white font-mono mt-1"
                    placeholder="e.g. MSR-"
                  />
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">Starting Number (መነሻ ቁጥር) *</Label>
                  <Input
                    type="number"
                    min={1}
                    value={voucherSettings.manualReceipt.startNumber}
                    onChange={e => setVoucherSettings(s => ({
                      ...s,
                      manualReceipt: { ...s.manualReceipt, startNumber: Math.max(1, parseInt(e.target.value, 10) || 1) }
                    }))}
                    className="h-8 text-xs bg-white font-mono font-bold mt-1"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVoucherSettingsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={async () => {
              await saveVoucherSettings(voucherSettings);
              setShowVoucherSettingsDialog(false);
              if (showForm && !editingId) {
                const nextId = getNextPosVoucherId(form.voucherType, sales, voucherSettings);
                setForm(f => ({ ...f, voucherId: nextId }));
              }
              toast({ title: "የደረሰኝ መነሻ ቁጥር ተቀምጧል (Settings Saved)" });
            }}>
              Save Settings (ቅንብሩን መዝግብ)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {DeleteAuthDialog}
    </div>
  );
}
