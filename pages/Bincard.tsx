import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { 
  Search, 
  FileDown, 
  Printer, 
  History, 
  Share2, 
  X, 
  Eye, 
  EyeOff, 
  FileText, 
  ChevronDown,
  ChevronUp,
  Layers,
  Table as TableIcon,
  RefreshCw,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
  TrendingUp,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { getAll, COLLECTIONS } from "@/lib/firestore";
import type { Product, StockIn, PosSale, DirectSale, Transfer, DamageReturn, Expense, Store, AppSettings } from "@/types";
import { useReactToPrint } from "react-to-print";
import { shareAsImage, shareAsPdf, exportToExcel } from "@/lib/shareImage";
import { exportBincardInteractiveExcel } from "@/bincardExcelExport";
import { useToast } from "@/hooks/use-toast";
import { ReceiptWithReferenceView } from "@/components/ReceiptWithReferenceView";
import { ReceiptActionBar } from "@/ReceiptActionBar";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { fmt } from "@/currency";
import * as XLSX from "xlsx";

import { toSafeIsoString, formatSafeDate, safeDateSort, todayIsoDate } from "@/lib/dateUtils";

function toDateStr(val: unknown): string {
  return toSafeIsoString(val, "");
}

export interface BincardEntry {
  id?: string;
  date: string;
  type: string;
  voucherId: string;
  storeName: string;
  quantity: number;
  cartons: number;
  direction: "in" | "out";
  balance: number;
  details: string;
  referencePhotoUrl?: string;
  sourceDoc?: any;
  productId?: string;
  productName?: string;
  productCode?: string;
  quantityPerCarton?: number;
}

export interface ProductBincardGroup {
  product: Product;
  entries: BincardEntry[];
  totalIn: number;
  totalOut: number;
  balance: number;
  totalInCartons: number;
  totalOutCartons: number;
  balanceCartons: number;
}

interface RawTransactions {
  stockIns: StockIn[];
  sales: PosSale[];
  directSales: DirectSale[];
  transfers: Transfer[];
  damages: DamageReturn[];
  expenses: Expense[];
}

export default function Bincard() {
  const [, setLocation] = useLocation();
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [rawTx, setRawTx] = useState<RawTransactions | null>(null);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [selectedStore, setSelectedStore] = useState("all");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [sharing, setSharing] = useState(false);
  const [sharingReceipt, setSharingReceipt] = useState(false);
  const [sharingReceiptPdf, setSharingReceiptPdf] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState<BincardEntry | null>(null);
  const [hideReceiptRefPhoto, setHideReceiptRefPhoto] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);

  // "See All Bin Card" states
  const [seeAllBincard, setSeeAllBincard] = useState(false);
  const [viewMode, setViewMode] = useState<"grouped" | "unified">("grouped");
  const [hideZeroMovements, setHideZeroMovements] = useState(true);
  const [expandedProductIds, setExpandedProductIds] = useState<Set<string>>(new Set());

  const tableRef = useRef<HTMLDivElement>(null);
  const voucherReceiptRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const handlePrintReceipt = useReactToPrint({ contentRef: voucherReceiptRef });

  async function loadAllData() {
    setLoading(true);
    try {
      const [prods, strList, stockIns, sales, directSales, transfers, damages, expenses, appSettingsList] = await Promise.all([
        getAll<Product>(COLLECTIONS.PRODUCTS),
        getAll<Store>(COLLECTIONS.STORES),
        getAll<StockIn>(COLLECTIONS.STOCK_IN),
        getAll<PosSale>(COLLECTIONS.POS_SALES),
        getAll<DirectSale>(COLLECTIONS.DIRECT_SALES),
        getAll<Transfer>(COLLECTIONS.TRANSFERS),
        getAll<DamageReturn>(COLLECTIONS.DAMAGE_RETURNS),
        getAll<Expense>(COLLECTIONS.EXPENSES),
        getAll<AppSettings>(COLLECTIONS.APP_SETTINGS),
      ]);
      setProducts(prods || []);
      setStores(strList || []);
      if (appSettingsList && appSettingsList.length > 0) {
        setSettings(appSettingsList[0]);
      }
      setRawTx({
        stockIns: stockIns || [],
        sales: sales || [],
        directSales: directSales || [],
        transfers: transfers || [],
        damages: damages || [],
        expenses: expenses || [],
      });
    } catch (err) {
      console.error("Failed to load bincard data:", err);
      toast({ title: "Failed to load stock data", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, []);

  const selectedStoreName = selectedStore === "all" ? null : stores.find(s => s.id === selectedStore)?.name || null;

  // Helper to compute Bincard entries and running balances for any product
  function computeProductBincard(product: Product, raw: RawTransactions, storeNameFilter: string | null): ProductBincardGroup {
    const allEntries: BincardEntry[] = [];
    const qpc = product.quantityPerCarton > 0 ? product.quantityPerCarton : 1;

    // 1. Stock In
    for (const si of raw.stockIns.filter(s => s.status !== "voided")) {
      if (storeNameFilter && si.storeName !== storeNameFilter) continue;
      for (const item of si.items || []) {
        if (item.productId === product.id) {
          const itemQpc = item.quantityPerCarton || qpc;
          const ctns = item.cartonsReceived || 0;
          const pcs = ctns * itemQpc;
          const vId = si.voucherId?.trim() || (si.id ? `STK-${si.id.slice(-6).toUpperCase()}` : "STK-00001");
          allEntries.push({
            id: `si-${si.id}-${item.productId}`,
            date: toDateStr((si as any).voucherDate || si.createdAt),
            type: "Stock In",
            voucherId: vId,
            storeName: si.storeName,
            quantity: pcs,
            cartons: Number(ctns.toFixed(2)),
            direction: "in",
            details: si.supplierName ? `From: ${si.supplierName}` : (si.remark || "Stock In"),
            referencePhotoUrl: si.referencePhotoUrl || (si as any).photoProofUrl || "",
            sourceDoc: si,
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            quantityPerCarton: itemQpc,
            balance: 0,
          });
        }
      }
    }

    // 2. POS Sales
    for (const sale of raw.sales.filter(s => s.status !== "voided")) {
      if (storeNameFilter && sale.storeName !== storeNameFilter) continue;
      for (const item of sale.items || []) {
        if (item.productId === product.id) {
          const itemQpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : qpc;
          const ctns = item.cartons ?? (item.quantity / itemQpc);
          const vId = sale.voucherId?.trim() || (sale as any).orderVoucherId || (sale as any).invoiceNumber || (sale.id ? `POS-${sale.id.slice(-6).toUpperCase()}` : "POS-00001");
          allEntries.push({
            id: `sale-${sale.id}-${item.productId}`,
            date: toDateStr((sale as any).voucherDate || sale.createdAt),
            type: "Sale",
            voucherId: vId,
            storeName: sale.storeName,
            quantity: item.quantity,
            cartons: Number(ctns.toFixed(2)),
            direction: "out",
            details: sale.customerName || "Walk-in",
            referencePhotoUrl: sale.referencePhotoUrl || (sale as any).photoProofUrl || "",
            sourceDoc: sale,
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            quantityPerCarton: itemQpc,
            balance: 0,
          });
        }
      }
    }

    // 2b. Direct Sales
    for (const ds of (raw.directSales || []).filter(s => s.status !== "voided")) {
      if (storeNameFilter && ds.storeName && ds.storeName !== storeNameFilter) continue;
      for (const item of ds.items || []) {
        if (item.productId === product.id) {
          const itemQpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : qpc;
          const ctns = item.cartons ?? (item.quantity / itemQpc);
          const vId = ds.voucherId?.trim() || (ds.id ? `DS-${ds.id.slice(-6).toUpperCase()}` : "DS-00001");
          allEntries.push({
            id: `ds-${ds.id}-${item.productId}`,
            date: toDateStr((ds as any).voucherDate || ds.createdAt),
            type: "Direct Sale",
            voucherId: vId,
            storeName: ds.storeName || "Store",
            quantity: item.quantity,
            cartons: Number(ctns.toFixed(2)),
            direction: "out",
            details: ds.soldByName ? `Sold by: ${ds.soldByName}` : "Direct Sale",
            referencePhotoUrl: ds.referencePhotoUrl || (ds as any).photoProofUrl || "",
            sourceDoc: ds,
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            quantityPerCarton: itemQpc,
            balance: 0,
          });
        }
      }
    }

    // 2c. Product Expenses (e.g. Staff Food consumed from inventory)
    for (const exp of (raw.expenses || []).filter(e => e.status !== "voided" && e.type === "product")) {
      if (storeNameFilter && exp.storeName && exp.storeName !== storeNameFilter) continue;
      for (const item of exp.items || []) {
        if (item.productId === product.id) {
          const pcs = item.isByCarton ? (item.quantity * qpc) : item.quantity;
          const ctns = item.isByCarton ? item.quantity : (item.quantity / qpc);
          const vId = exp.voucherId?.trim() || (exp.id ? `EXP-${exp.id.slice(-6).toUpperCase()}` : "EXP-00001");
          allEntries.push({
            id: `exp-${exp.id}-${item.productId}`,
            date: toDateStr((exp as any).voucherDate || exp.createdAt),
            type: "Staff Food / Expense",
            voucherId: vId,
            storeName: exp.storeName || "Store",
            quantity: pcs,
            cartons: Number(ctns.toFixed(2)),
            direction: "out",
            details: exp.remark || "Staff Food / Product Consumption",
            referencePhotoUrl: (exp as any).referencePhotoUrl || "",
            sourceDoc: exp,
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            quantityPerCarton: qpc,
            balance: 0,
          });
        }
      }
    }

    // 3. Transfers
    for (const t of raw.transfers.filter(t => t.status !== "voided")) {
      for (const item of t.items || []) {
        if (item.productId === product.id) {
          const itemQpc = item.quantityPerCarton || qpc;
          const ctns = item.quantity / itemQpc;
          const vId = t.voucherId?.trim() || (t.id ? `TRF-${t.id.slice(-6).toUpperCase()}` : "TRF-00001");
          if (!storeNameFilter || t.fromStoreName === storeNameFilter) {
            allEntries.push({
              id: `trf-out-${t.id}-${item.productId}`,
              date: toDateStr((t as any).voucherDate || t.createdAt),
              type: "Transfer Out",
              voucherId: vId,
              storeName: t.fromStoreName,
              quantity: item.quantity,
              cartons: Number(ctns.toFixed(2)),
              direction: "out",
              details: `→ ${t.toStoreName}`,
              referencePhotoUrl: t.referencePhotoUrl || (t as any).photoProofUrl || "",
              sourceDoc: t,
              productId: product.id,
              productName: product.name,
              productCode: product.code,
              quantityPerCarton: itemQpc,
              balance: 0,
            });
          }
          if (!storeNameFilter || t.toStoreName === storeNameFilter) {
            allEntries.push({
              id: `trf-in-${t.id}-${item.productId}`,
              date: toDateStr((t as any).voucherDate || t.createdAt),
              type: "Transfer In",
              voucherId: vId,
              storeName: t.toStoreName,
              quantity: item.quantity,
              cartons: Number(ctns.toFixed(2)),
              direction: "in",
              details: `← ${t.fromStoreName}`,
              referencePhotoUrl: t.referencePhotoUrl || (t as any).photoProofUrl || "",
              sourceDoc: t,
              productId: product.id,
              productName: product.name,
              productCode: product.code,
              quantityPerCarton: itemQpc,
              balance: 0,
            });
          }
        }
      }
    }

    // 4. Damage / Return
    for (const d of raw.damages.filter(d => d.status !== "voided")) {
      if (storeNameFilter && d.storeName !== storeNameFilter) continue;
      for (const item of d.items || []) {
        if (item.productId === product.id) {
          const isReturnIn = d.type === "return_in" || (d.type === "return" && (d as any).returnDirection !== "out");
          const isReturnOut = d.type === "return_out" || (d.type === "return" && (d as any).returnDirection === "out");
          const defaultPrefix = d.type === "damage" ? "DMG" : isReturnIn ? "RIN" : "ROUT";
          const vId = d.voucherId?.trim() || (d.id ? `${defaultPrefix}-${d.id.slice(-6).toUpperCase()}` : `${defaultPrefix}-00001`);
          const direction: "in" | "out" = isReturnIn ? "in" : "out";
          const entryType = d.type === "damage" ? "Damage" : isReturnIn ? "Return In" : "Return Out";
          const ctns = Number((item.quantity / qpc).toFixed(2));
          allEntries.push({
            id: `dmg-${d.id}-${item.productId}`,
            date: toDateStr((d as any).voucherDate || d.createdAt),
            type: entryType,
            voucherId: vId,
            storeName: d.storeName,
            quantity: item.quantity,
            cartons: ctns,
            direction,
            details: item.reason || (d.type === "damage" ? "Damaged write-off" : isReturnIn ? (d.customerName ? `Return In (from ${d.customerName})` : "Sales return in") : (d.supplierName ? `Return Out (to ${d.supplierName})` : "Stock return out")),
            referencePhotoUrl: d.referencePhotoUrl || (d as any).photoProofUrl || "",
            sourceDoc: d,
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            quantityPerCarton: qpc,
            balance: 0,
          });
        }
      }
    }

    // Sort chronologically
    allEntries.sort((a, b) => safeDateSort(a.date, b.date, "asc"));

    let runningBalance = 0;
    let totalIn = 0;
    let totalOut = 0;
    let totalInCartons = 0;
    let totalOutCartons = 0;

    const withBalance: BincardEntry[] = allEntries.map((e, idx) => {
      if (e.direction === "in") {
        runningBalance += e.quantity;
        totalIn += e.quantity;
        totalInCartons += e.cartons;
      } else {
        runningBalance -= e.quantity;
        totalOut += e.quantity;
        totalOutCartons += e.cartons;
      }
      return { ...e, balance: runningBalance, id: e.id || `entry-${product.id}-${idx}` };
    });

    const balanceCartons = Number((runningBalance / qpc).toFixed(2));

    return {
      product,
      entries: withBalance,
      totalIn,
      totalOut,
      balance: runningBalance,
      totalInCartons: Number(totalInCartons.toFixed(2)),
      totalOutCartons: Number(totalOutCartons.toFixed(2)),
      balanceCartons,
    };
  }

  // Precompute groups for all products
  const allProductGroups = useMemo<ProductBincardGroup[]>(() => {
    if (!rawTx) return [];
    const activeProds = products.filter(p => !p.isVoided);
    return activeProds.map(p => computeProductBincard(p, rawTx, selectedStoreName));
  }, [products, rawTx, selectedStoreName]);

  // Filtered product groups for "See All Bin Card" mode
  const displayedGroups = useMemo<ProductBincardGroup[]>(() => {
    return allProductGroups.filter(g => {
      if (hideZeroMovements && g.entries.length === 0) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      const prodMatch = (g.product.name || "").toLowerCase().includes(q) ||
                        (g.product.code || "").toLowerCase().includes(q) ||
                        (g.product.categoryId || "").toLowerCase().includes(q);
      if (prodMatch) return true;
      return g.entries.some(e =>
        (e.voucherId || "").toLowerCase().includes(q) ||
        (e.storeName || "").toLowerCase().includes(q) ||
        (e.type || "").toLowerCase().includes(q) ||
        (e.details || "").toLowerCase().includes(q)
      );
    });
  }, [allProductGroups, hideZeroMovements, search]);

  // Unified master list of entries across all displayed products
  const unifiedEntries = useMemo(() => {
    return displayedGroups.flatMap(g =>
      g.entries.map(e => ({
        ...e,
        productName: g.product.name,
        productCode: g.product.code,
        productPhoto: g.product.photoUrl,
        productQpc: g.product.quantityPerCarton,
      }))
    ).sort((a, b) => safeDateSort(a.date, b.date, "desc")); // newest first for unified master timeline
  }, [displayedGroups]);

  // Single-product group when looking at one product
  const singleGroup = useMemo<ProductBincardGroup | null>(() => {
    if (!selectedProduct || !rawTx) return null;
    const prod = products.find(p => p.id === selectedProduct);
    if (!prod) return null;
    return computeProductBincard(prod, rawTx, selectedStoreName);
  }, [selectedProduct, rawTx, products, selectedStoreName]);

  // Filtered single-product entries
  const filteredSingleEntries = useMemo(() => {
    if (!singleGroup) return [];
    if (!search.trim()) return singleGroup.entries;
    const q = search.toLowerCase().trim();
    return singleGroup.entries.filter(e =>
      (e.storeName || "").toLowerCase().includes(q) ||
      (e.voucherId || "").toLowerCase().includes(q) ||
      (e.type || "").toLowerCase().includes(q) ||
      (e.details || "").toLowerCase().includes(q)
    );
  }, [singleGroup, search]);

  // Overall totals across all displayed groups
  const overallTotals = useMemo(() => {
    let inPcs = 0;
    let outPcs = 0;
    let balPcs = 0;
    let inCtns = 0;
    let outCtns = 0;
    let balCtns = 0;
    for (const g of displayedGroups) {
      inPcs += g.totalIn;
      outPcs += g.totalOut;
      balPcs += g.balance;
      inCtns += g.totalInCartons;
      outCtns += g.totalOutCartons;
      balCtns += g.balanceCartons;
    }
    return {
      inPcs,
      outPcs,
      balPcs,
      inCtns: Number(inCtns.toFixed(2)),
      outCtns: Number(outCtns.toFixed(2)),
      balCtns: Number(balCtns.toFixed(2)),
      activeProductsCount: displayedGroups.filter(g => g.entries.length > 0).length,
    };
  }, [displayedGroups]);

  // Auto-expand products when search query is entered
  useEffect(() => {
    if (seeAllBincard && search.trim().length > 0) {
      setExpandedProductIds(new Set(displayedGroups.map(g => g.product.id)));
    }
  }, [seeAllBincard, search, displayedGroups]);

  function toggleExpand(productId: string) {
    setExpandedProductIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function expandAll() {
    setExpandedProductIds(new Set(displayedGroups.map(g => g.product.id)));
  }

  function collapseAll() {
    setExpandedProductIds(new Set());
  }

  const selectedProductName = products.find(p => p.id === selectedProduct)?.name;

  const handlePrint = useReactToPrint({ contentRef: tableRef });

  async function handleShare() {
    if (!tableRef.current) return;
    if (!seeAllBincard && !selectedProduct) return;
    setSharing(true);
    const fname = seeAllBincard
      ? `all_bincards_${selectedStoreName || "all_stores"}.png`
      : `bincard_${selectedProductName || "product"}.png`;
    const result = await shareAsImage(tableRef.current, fname);
    if (result === "failed") toast({ title: "Share failed", variant: "destructive" });
    setSharing(false);
  }

  async function handleShareReceipt() {
    if (!voucherReceiptRef.current || !viewingReceipt) return;
    setSharingReceipt(true);
    try {
      const result = await shareAsImage(voucherReceiptRef.current, `receipt_${viewingReceipt.voucherId}.png`);
      if (result === "failed") {
        toast({ title: "Share failed", variant: "destructive" });
      } else {
        toast({ title: "Receipt shared / saved" });
      }
    } catch {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setSharingReceipt(false);
    }
  }

  async function handleSharePdfReceipt() {
    if (!voucherReceiptRef.current || !viewingReceipt) return;
    setSharingReceiptPdf(true);
    try {
      const result = await shareAsPdf(
        voucherReceiptRef.current,
        `receipt_${viewingReceipt.voucherId}.pdf`
      );
      if (result === "failed") {
        toast({ title: "PDF export failed", variant: "destructive" });
      } else {
        toast({ title: "PDF exported / shared" });
      }
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingReceiptPdf(false);
    }
  }

  function openVoucherReceipt(entry: BincardEntry) {
    setHideReceiptRefPhoto(false);
    setViewingReceipt(entry);
  }

  function getEditLabel(type: string): string {
    if (type === "Sale") return "Edit Sale (አስተካክል)";
    if (type === "Stock In") return "Edit Stock In (አስተካክል)";
    if (type === "Transfer In" || type === "Transfer Out") return "Edit Transfer (አስተካክል)";
    return "Edit Record (አስተካክል)";
  }

  function handleEditVoucher(entry: BincardEntry) {
    if (!entry) return;
    const docId = entry.sourceDoc?.id || entry.voucherId;
    setViewingReceipt(null);

    if (entry.type === "Sale") {
      setLocation(`/pos-sales?editId=${encodeURIComponent(docId)}`);
    } else if (entry.type === "Stock In") {
      setLocation(`/stock-in?editId=${encodeURIComponent(docId)}`);
    } else if (entry.type === "Transfer In" || entry.type === "Transfer Out") {
      setLocation(`/transfers?editId=${encodeURIComponent(docId)}`);
    } else if (entry.type === "Damage" || entry.type === "Return In" || entry.type === "Return Out") {
      setLocation(`/damage-returns?editId=${encodeURIComponent(docId)}`);
    }
  }

  async function handleExportInteractiveExcel() {
    setExportingExcel(true);
    try {
      toast({
        title: "Exporting Bincard Excel...",
        description: "Generating interactive Dropdown & Grouped sheets",
      });

      // If See All Bincards is active, export all displayed groups
      // Otherwise export the selected product, while passing allProductGroups for the dropdown source
      let groupsToExport = displayedGroups;
      if (!seeAllBincard && selectedProduct) {
        const single = allProductGroups.find(g => g.product.id === selectedProduct);
        if (single) groupsToExport = [single];
      }

      const company = settings?.ecommerceName || (settings as any)?.companyName || "YESERAHUT STOCK MANAGEMENT";

      const res = await exportBincardInteractiveExcel({
        groups: groupsToExport,
        allGroups: allProductGroups,
        storeName: selectedStoreName,
        companyName: company,
        selectedProductName: selectedProductName || null,
      });

      if (res === "failed") {
        toast({ title: "Excel export failed", variant: "destructive" });
      } else {
        toast({
          title: "Bincard Excel Ready!",
          description: "Includes interactive Product Dropdown, Grouped cards, and Master Ledger.",
        });
      }
    } catch (err) {
      console.error("Export interactive excel failed:", err);
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally {
      setExportingExcel(false);
    }
  }

  async function handleExportClassicExcel() {
    setExportingExcel(true);
    try {
      const wb = XLSX.utils.book_new();
      if (seeAllBincard) {
        const data = [
          ["Product", "Product Code", "Date (ቀን)", "Type", "Details", "Voucher ID", "Store", "Cartons", "In (pcs)", "Out (pcs)", "Balance (pcs)"],
        ];
        for (const group of displayedGroups) {
          for (const e of group.entries) {
            data.push([
              group.product.name,
              group.product.code || "",
              e.date ? `${formatEthDate(e.date, { short: true })} (${e.date})` : "—",
              e.type,
              e.details || "",
              e.voucherId,
              e.storeName,
              e.cartons > 0 ? (Number.isInteger(e.cartons) ? String(e.cartons) : e.cartons.toFixed(2)) : "",
              e.direction === "in" ? String(e.quantity) : "0",
              e.direction === "out" ? String(e.quantity) : "0",
              String(e.balance),
            ]);
          }
        }
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "All Bincards");
        await exportToExcel({
          workbook: wb,
          filename: `all_bincards_${selectedStoreName || "all_stores"}_${todayIsoDate()}.xlsx`,
          title: "ALL PRODUCTS BINCARD LEDGER (የሁሉም እቃዎች ቢንካርድ)",
          subtitle: `Store: ${selectedStoreName || "All Stores"} | Products: ${displayedGroups.length}`,
        });
      } else {
        const data = [
          ["Date (ቀን)", "Type", "Details", "Voucher", "Store", "Ctns", "In (pcs)", "Out (pcs)", "Balance (pcs)"],
          ...filteredSingleEntries.map(e => [
            e.date ? `${formatEthDate(e.date, { short: true })} (${e.date})` : "—", 
            e.type, 
            e.details || "",
            e.voucherId, 
            e.storeName,
            e.cartons > 0 ? (Number.isInteger(e.cartons) ? e.cartons : Number(e.cartons.toFixed(2))) : "",
            e.direction === "in" ? e.quantity : 0,
            e.direction === "out" ? e.quantity : 0,
            e.balance,
          ]),
        ];
        const ws = XLSX.utils.aoa_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, "Bincard");
        await exportToExcel({
          workbook: wb,
          filename: `bincard_${selectedProductName || "product"}.xlsx`,
          title: `BINCARD LEDGER - ${selectedProductName || "PRODUCT"}`,
          subtitle: `Store: ${selectedStoreName || "All Stores"} | Records: ${filteredSingleEntries.length}`,
        });
      }
    } catch (err) {
      console.error("Export classic excel failed:", err);
      toast({ title: "Excel export failed", variant: "destructive" });
    } finally {
      setExportingExcel(false);
    }
  }

  // Default Excel Export action
  const exportExcel = handleExportInteractiveExcel;

  const filteredProducts = products.filter(p =>
    productSearch && (p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.code.toLowerCase().includes(productSearch.toLowerCase()))
  ).slice(0, 8);

  const typeColor = (type: string) => {
    if (type === "Stock In" || type === "Transfer In") return "default";
    if (type === "Sale") return "secondary";
    if (type === "Damage") return "destructive";
    return "outline";
  };

  const detailsColor = (type: string) => {
    if (type === "Sale") return "text-blue-600";
    if (type === "Transfer Out") return "text-orange-600";
    if (type === "Transfer In") return "text-emerald-600";
    return "text-muted-foreground";
  };

  function renderReceiptContent(entry: BincardEntry) {
    const doc = entry.sourceDoc;
    const type = entry.type;

    // 1. Stock In Receipt
    if (type === "Stock In") {
      const stockIn = doc as StockIn | undefined;
      const items = stockIn?.items && stockIn.items.length > 0 ? stockIn.items : [
        {
          productId: selectedProduct,
          productName: selectedProductName || "Product",
          productCode: "",
          quantityPerCarton: 1,
          cartonsReceived: entry.cartons,
          unitPrice: 0,
          cartonPrice: 0,
          totalPrice: 0,
        }
      ];
      const totalCtns = stockIn?.totalCartons ?? items.reduce((s, i) => s + (i.cartonsReceived || 0), 0);
      const totalUnits = items.reduce((s, i) => s + ((i.cartonsReceived || 0) * (i.quantityPerCarton || 1)), 0);
      const grandTotal = stockIn?.totalPrice ?? items.reduce((s, i) => s + (i.totalPrice || 0), 0);

      return (
        <div ref={voucherReceiptRef} className="receipt-a4 p-5 space-y-4 font-sans border rounded-lg bg-card shadow-xs text-card-foreground relative">
          {stockIn?.status === "voided" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="text-8xl font-black text-red-500/30 -rotate-35 border-8 border-red-500/30 rounded-lg px-6 py-2">VOID</span>
            </div>
          )}
          <div className="text-center border-b-2 border-primary/40 pb-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1">Multi-Store Inventory System</p>
            <h2 className="text-2xl font-extrabold uppercase tracking-wide">Stock In Voucher (የእቃ መረከቢያ ደረሰኝ)</h2>
            <p className="text-sm font-mono font-semibold text-primary mt-0.5">{entry.voucherId}</p>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs border-b pb-3">
            <div className="flex gap-1.5"><span className="text-muted-foreground w-20">Store:</span><strong className="text-foreground">{entry.storeName}</strong></div>
            <div className="flex gap-1.5"><span className="text-muted-foreground w-20">Supplier:</span><strong className="text-foreground">{stockIn?.supplierName || entry.details || "—"}</strong></div>
            <div className="flex gap-1.5"><span className="text-muted-foreground w-20">Date:</span><span>{formatEthDate(stockIn?.voucherDate || entry.date, { includeGregorian: true })}</span></div>
            <div className="flex gap-1.5">
              <span className="text-muted-foreground w-20">Status:</span>
              <span className={`font-bold ${(stockIn?.status || "active") === "active" ? "text-green-600" : "text-amber-600"}`}>
                {(stockIn?.status || "ACTIVE").toUpperCase()}
              </span>
            </div>
            <div className="flex gap-1.5"><span className="text-muted-foreground w-20">Prepared By:</span><span>{stockIn?.createdByName || "—"}</span></div>
            {stockIn?.fsNumber && (
              <div className="flex gap-1.5"><span className="text-muted-foreground w-20">FS Number:</span><span className="font-mono">{stockIn.fsNumber}</span></div>
            )}
            {stockIn?.remark && (
              <div className="col-span-2 flex gap-1.5"><span className="text-muted-foreground w-20">Remark:</span><span>{stockIn.remark}</span></div>
            )}
          </div>

          <table className="w-full text-xs border-collapse border border-gray-300 dark:border-gray-700">
            <thead>
              <tr className="bg-muted/80 text-muted-foreground">
                <th className="border px-1.5 py-1.5 text-center w-8">#</th>
                <th className="border px-1.5 py-1.5 text-left w-10">Photo</th>
                <th className="border px-1.5 py-1.5 text-left">Product</th>
                <th className="border px-1.5 py-1.5 text-center w-14">Qty/Ctn</th>
                <th className="border px-1.5 py-1.5 text-center w-14">Cartons</th>
                <th className="border px-1.5 py-1.5 text-center w-14">Units</th>
                <th className="border px-1.5 py-1.5 text-right w-20">Unit Cost</th>
                <th className="border px-1.5 py-1.5 text-right w-20">Ctn Cost</th>
                <th className="border px-1.5 py-1.5 text-right w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const qpc = item.quantityPerCarton || 1;
                const ctns = item.cartonsReceived || 0;
                const units = ctns * qpc;
                const prod = products.find(p => p.id === item.productId);
                const photo = item.photoUrl || prod?.photoUrl;
                return (
                  <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                    <td className="border px-1.5 py-1 text-center text-muted-foreground">{i + 1}</td>
                    <td className="border px-1.5 py-1 text-center">
                      {photo ? (
                        <img src={photo} alt={item.productName} className="w-8 h-8 rounded object-cover mx-auto" />
                      ) : (
                        <div className="w-8 h-8 bg-muted rounded flex items-center justify-center mx-auto text-[10px] text-muted-foreground">
                          —
                        </div>
                      )}
                    </td>
                    <td className="border px-1.5 py-1">
                      <div className="font-semibold text-foreground">{item.productName}</div>
                      {item.productCode && <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>}
                    </td>
                    <td className="border px-1.5 py-1 text-center">{qpc}</td>
                    <td className="border px-1.5 py-1 text-center font-bold text-blue-600">
                      {Number.isInteger(ctns) ? ctns : ctns.toFixed(2)}
                    </td>
                    <td className="border px-1.5 py-1 text-center font-bold text-green-600">{units}</td>
                    <td className="border px-1.5 py-1 text-right">{item.unitPrice > 0 ? fmt(item.unitPrice) : "—"}</td>
                    <td className="border px-1.5 py-1 text-right">{item.cartonPrice > 0 ? fmt(item.cartonPrice) : "—"}</td>
                    <td className="border px-1.5 py-1 text-right font-semibold">{item.totalPrice > 0 ? fmt(item.totalPrice) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/80 font-bold text-xs">
                <td colSpan={4} className="border px-2 py-1.5 text-right">TOTALS:</td>
                <td className="border px-1.5 py-1.5 text-center text-blue-700">{Number.isInteger(totalCtns) ? totalCtns : totalCtns.toFixed(2)} ctns</td>
                <td className="border px-1.5 py-1.5 text-center text-green-700">{totalUnits} units</td>
                <td colSpan={2} className="border px-1.5 py-1.5" />
                <td className="border px-1.5 py-1.5 text-right text-foreground">{grandTotal > 0 ? fmt(grandTotal) : "—"}</td>
              </tr>
            </tfoot>
          </table>

          <div className="grid grid-cols-3 gap-6 pt-6 text-xs border-t mt-4">
            {["Prepared By", "Checked By", "Received By"].map(label => (
              <div key={label} className="text-center">
                <div className="border-b border-foreground/30 mb-1 h-8" />
                <p className="font-semibold">{label}</p>
                <p className="text-[10px] text-muted-foreground">Signature / Date</p>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground text-right pt-1">
            Printed / Viewed from BinCard Ledger
          </div>
        </div>
      );
    }

    // 2. POS Sales Receipt
    if (type === "Sale") {
      const sale = doc as PosSale | undefined;
      const items = sale?.items && sale.items.length > 0 ? sale.items : [
        {
          productId: selectedProduct,
          productName: selectedProductName || "Product",
          productCode: "",
          quantityPerCarton: 1,
          cartons: entry.cartons,
          quantity: entry.quantity,
          adjustedPrice: 0,
          sellingPrice: 0,
          cartonPrice: 0,
          totalPrice: 0,
          sellByCarton: false,
          remainingStock: 0,
        }
      ];
      const subtotal = sale?.subtotal ?? items.reduce((s, i) => s + (i.totalPrice || 0), 0);
      const amountPaid = sale?.amountPaid ?? subtotal;
      const remaining = sale?.remainingBalance ?? Math.max(0, subtotal - amountPaid);

      return (
        <div ref={voucherReceiptRef} className="receipt-a4 p-5 space-y-4 font-sans border rounded-lg bg-card shadow-xs text-card-foreground relative">
          {sale?.status === "voided" && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <span className="text-8xl font-black text-red-500/30 -rotate-35 border-8 border-red-500/30 rounded-lg px-6 py-2">VOID</span>
            </div>
          )}
          <div className="text-center border-b pb-3">
            <h2 className="text-2xl font-bold uppercase tracking-wide">POS Sales Receipt (የሽያጭ ደረሰኝ)</h2>
            <p className="text-sm font-mono font-semibold text-primary mt-0.5">{entry.voucherId}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs border-b pb-3">
            <div><span className="text-muted-foreground">Customer: </span><strong className="text-foreground">{sale?.customerName || entry.details || "Walk-in"}</strong></div>
            <div><span className="text-muted-foreground">Store: </span><span className="font-medium text-foreground">{entry.storeName}</span></div>
            <div><span className="text-muted-foreground">Date: </span><span className="font-semibold">{formatEthDate(sale?.voucherDate || entry.date, { includeGregorian: true })}</span></div>
            <div>
              <span className="text-muted-foreground">Payment: </span>
              <span className="capitalize font-semibold text-foreground">{sale?.paymentMethod || "Cash"}</span>
              {sale?.paymentMethod === "transfer" && sale?.transferType === "supplier" && sale?.supplierName && (
                <span className="ml-1 text-blue-700 font-medium">→ {sale.supplierName}</span>
              )}
              {sale?.paymentMethod === "transfer" && sale?.transferType === "account" && sale?.accountBankName && (
                <span className="ml-1 text-blue-700 font-medium">→ {sale.accountBankName} ({sale.accountPersonName})</span>
              )}
            </div>
            {sale?.fsNumber && (
              <div><span className="text-muted-foreground">FS Number: </span><span className="font-mono font-semibold">{sale.fsNumber}</span></div>
            )}
            {sale?.createdByName && (
              <div><span className="text-muted-foreground">Cashier: </span><span>{sale.createdByName}</span></div>
            )}
            {sale?.remark && (
              <div className="col-span-2"><span className="text-muted-foreground">Remark: </span><span>{sale.remark}</span></div>
            )}
          </div>

          <table className="w-full text-xs border-collapse border">
            <thead>
              <tr className="bg-muted/80 text-muted-foreground">
                <th className="border px-2 py-1 text-center w-8">#</th>
                <th className="border px-2 py-1 text-left w-10">Photo</th>
                <th className="border px-2 py-1 text-left">Product</th>
                <th className="border px-2 py-1 text-center w-14">Qty/Ctn</th>
                <th className="border px-2 py-1 text-center w-14">Cartons</th>
                <th className="border px-2 py-1 text-center w-14">Pieces</th>
                <th className="border px-2 py-1 text-right w-20">Unit Price</th>
                <th className="border px-2 py-1 text-right w-20">Ctn Price</th>
                <th className="border px-2 py-1 text-right w-24">Total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;
                const ctns = item.cartons ?? (item.quantity / qpc);
                const unitP = item.adjustedPrice ?? item.sellingPrice ?? 0;
                const ctnP = item.cartonPrice ?? (unitP * qpc);
                const prod = products.find(p => p.id === item.productId);
                const photo = item.photoUrl || prod?.photoUrl;
                return (
                  <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                    <td className="border px-2 py-1 text-center text-muted-foreground">{i + 1}</td>
                    <td className="border px-2 py-1 text-center">
                      {photo ? (
                        <img src={photo} alt={item.productName} className="w-8 h-8 rounded object-cover mx-auto" />
                      ) : (
                        <div className="w-8 h-8 bg-muted rounded flex items-center justify-center mx-auto text-[10px] text-muted-foreground">—</div>
                      )}
                    </td>
                    <td className="border px-2 py-1">
                      <div className="font-semibold text-foreground">{item.productName}</div>
                      {item.productCode && <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>}
                    </td>
                    <td className="border px-2 py-1 text-center">{qpc}</td>
                    <td className="border px-2 py-1 text-center font-bold text-blue-600">
                      {ctns > 0 ? (Number.isInteger(ctns) ? ctns : ctns.toFixed(2)) : "—"}
                    </td>
                    <td className="border px-2 py-1 text-center font-bold text-green-600">{item.quantity}</td>
                    <td className="border px-2 py-1 text-right">{unitP > 0 ? fmt(unitP) : "—"}</td>
                    <td className="border px-2 py-1 text-right">{ctnP > 0 ? fmt(ctnP) : "—"}</td>
                    <td className="border px-2 py-1 text-right font-semibold">{item.totalPrice > 0 ? fmt(item.totalPrice) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-muted/60 font-semibold text-xs">
                <td colSpan={8} className="border px-2 py-1.5 text-right">Subtotal:</td>
                <td className="border px-2 py-1.5 text-right font-bold">{fmt(subtotal)}</td>
              </tr>
              <tr className="bg-muted/40 text-xs">
                <td colSpan={8} className="border px-2 py-1 text-right">Amount Paid:</td>
                <td className="border px-2 py-1 text-right font-bold text-green-600">{fmt(amountPaid)}</td>
              </tr>
              {remaining > 0 && (
                <tr className="bg-red-50 dark:bg-red-950/20 text-xs text-red-600">
                  <td colSpan={8} className="border px-2 py-1 text-right font-bold">Remaining Balance (Credit):</td>
                  <td className="border px-2 py-1 text-right font-bold">{fmt(remaining)}</td>
                </tr>
              )}
            </tfoot>
          </table>

          <div className="grid grid-cols-2 gap-8 pt-6 text-xs border-t mt-4">
            <div className="text-center">
              <div className="border-b border-foreground/30 mb-1 h-8" />
              <p className="font-semibold">Prepared By (Cashier)</p>
              <p className="text-[10px] text-muted-foreground">Signature / Date</p>
            </div>
            <div className="text-center">
              <div className="border-b border-foreground/30 mb-1 h-8" />
              <p className="font-semibold">Customer / Received By</p>
              <p className="text-[10px] text-muted-foreground">Signature / Date</p>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground text-right pt-1">
            Printed / Viewed from BinCard Ledger
          </div>
        </div>
      );
    }

    // 3. Stock Transfer Voucher
    if (type === "Transfer Out" || type === "Transfer In") {
      const trf = doc as Transfer | undefined;
      const items = trf?.items && trf.items.length > 0 ? trf.items : [
        {
          productId: selectedProduct,
          productName: selectedProductName || "Product",
          productCode: "",
          quantityPerCarton: 1,
          quantity: entry.quantity,
          availableQty: 0,
          price: 0,
        }
      ];

      return (
        <div ref={voucherReceiptRef} className="receipt-a4 p-5 space-y-4 font-sans border rounded-lg bg-card shadow-xs text-card-foreground relative">
          <div className="text-center border-b pb-3">
            <h2 className="text-2xl font-bold uppercase tracking-wide">Stock Transfer Voucher (የእቃ ዝውውር ቫውቸር)</h2>
            <p className="text-sm font-mono font-semibold text-primary mt-0.5">{entry.voucherId}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs border-b pb-3">
            <div><span className="text-muted-foreground">From Store: </span><strong className="text-foreground">{trf?.fromStoreName || "—"}</strong></div>
            <div><span className="text-muted-foreground">To Store: </span><strong className="text-foreground">{trf?.toStoreName || "—"}</strong></div>
            <div><span className="text-muted-foreground">Date: </span><span className="font-semibold">{formatEthDate(trf?.voucherDate || entry.date, { includeGregorian: true })}</span></div>
            <div><span className="text-muted-foreground">Created By: </span><span>{trf?.createdByName || "—"}</span></div>
            {trf?.remark && (
              <div className="col-span-2"><span className="text-muted-foreground">Remark: </span><span>{trf.remark}</span></div>
            )}
          </div>

          <table className="w-full text-xs border-collapse border">
            <thead>
              <tr className="bg-muted/80 text-muted-foreground">
                <th className="border px-2 py-1 text-center w-8">#</th>
                <th className="border px-2 py-1 text-left">Product</th>
                <th className="border px-2 py-1 text-center w-14">Qty/Ctn</th>
                <th className="border px-2 py-1 text-center w-24">Quantity</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => {
                const qpc = item.quantityPerCarton || 1;
                const ctns = Math.round(item.quantity / qpc);
                return (
                  <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                    <td className="border px-2 py-1 text-center text-muted-foreground">{i + 1}</td>
                    <td className="border px-2 py-1">
                      <div className="font-semibold text-foreground">{item.productName}</div>
                      {item.productCode && <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>}
                    </td>
                    <td className="border px-2 py-1 text-center">{qpc}</td>
                    <td className="border px-2 py-1 text-center font-bold text-foreground">
                      {item.quantity} pcs {ctns > 0 ? `(${ctns} ctns)` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="grid grid-cols-3 gap-6 pt-6 text-xs border-t mt-4">
            {["Dispatched By", "Transported / Checked By", "Received By"].map(label => (
              <div key={label} className="text-center">
                <div className="border-b border-foreground/30 mb-1 h-8" />
                <p className="font-semibold">{label}</p>
                <p className="text-[10px] text-muted-foreground">Signature / Date</p>
              </div>
            ))}
          </div>
          <div className="text-[10px] text-muted-foreground text-right pt-1">
            Printed / Viewed from BinCard Ledger
          </div>
        </div>
      );
    }

    // 4. Damage / Return Voucher
    const dmg = doc as DamageReturn | undefined;
    const items = dmg?.items && dmg.items.length > 0 ? dmg.items : [
      {
        productId: selectedProduct,
        productName: selectedProductName || "Product",
        productCode: "",
        sellBySingle: true,
        quantity: entry.quantity,
        unitPrice: 0,
        totalPrice: 0,
        reason: entry.details,
      }
    ];
    const totalAmount = dmg?.totalAmount ?? items.reduce((s, i) => s + (i.totalPrice || 0), 0);

    return (
      <div ref={voucherReceiptRef} className="receipt-a4 p-5 space-y-4 font-sans border rounded-lg bg-card shadow-xs text-card-foreground relative">
        <div className="text-center border-b pb-3">
          <h2 className="text-2xl font-bold uppercase tracking-wide">
            {type === "Damage"
              ? "Damage Voucher (የተበላሸ እቃ ሰነድ)"
              : type === "Return In"
              ? "Returns In Voucher (የተመለሰ እቃ ገቢ ሰነድ / Sales Return)"
              : "Return Voucher (ተመላሽ እቃ ሰነድ)"}
          </h2>
          <p className="text-sm font-mono font-semibold text-primary mt-0.5">{entry.voucherId}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs border-b pb-3">
          <div><span className="text-muted-foreground">Store: </span><strong className="text-foreground">{entry.storeName}</strong></div>
          <div><span className="text-muted-foreground">Type: </span><span className="font-semibold uppercase">{type}</span></div>
          {dmg?.customerName && (
            <div><span className="text-muted-foreground">Customer: </span><span className="font-semibold text-foreground">{dmg.customerName}</span></div>
          )}
          {dmg?.supplierName && (
            <div><span className="text-muted-foreground">Supplier: </span><span className="font-semibold text-foreground">{dmg.supplierName}</span></div>
          )}
          {dmg?.fsNumber && (
            <div><span className="text-muted-foreground">Ref / FS No: </span><span className="font-mono">{dmg.fsNumber}</span></div>
          )}
          <div><span className="text-muted-foreground">Date: </span><span className="font-semibold">{formatEthDate(dmg?.voucherDate || entry.date, { includeGregorian: true })}</span></div>
          <div><span className="text-muted-foreground">Created By: </span><span>{dmg?.createdByName || "—"}</span></div>
          {dmg?.remark && (
            <div className="col-span-2"><span className="text-muted-foreground">Remark: </span><span>{dmg.remark}</span></div>
          )}
        </div>

        <table className="w-full text-xs border-collapse border">
          <thead>
            <tr className="bg-muted/80 text-muted-foreground">
              <th className="border px-2 py-1 text-center w-8">#</th>
              <th className="border px-2 py-1 text-left">Product</th>
              <th className="border px-2 py-1 text-center w-16">Qty</th>
              <th className="border px-2 py-1 text-right w-20">Unit Cost</th>
              <th className="border px-2 py-1 text-right w-24">Total</th>
              <th className="border px-2 py-1 text-left">Reason</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/30"}>
                <td className="border px-2 py-1 text-center text-muted-foreground">{i + 1}</td>
                <td className="border px-2 py-1">
                  <div className="font-semibold text-foreground">{item.productName}</div>
                  {item.productCode && <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>}
                </td>
                <td className="border px-2 py-1 text-center font-bold text-red-600">{item.quantity}</td>
                <td className="border px-2 py-1 text-right">{item.unitPrice > 0 ? fmt(item.unitPrice) : "—"}</td>
                <td className="border px-2 py-1 text-right font-semibold">{item.totalPrice > 0 ? fmt(item.totalPrice) : "—"}</td>
                <td className="border px-2 py-1 text-muted-foreground">{item.reason || "—"}</td>
              </tr>
            ))}
          </tbody>
          {totalAmount > 0 && (
            <tfoot>
              <tr className="bg-muted/60 font-semibold text-xs">
                <td colSpan={4} className="border px-2 py-1.5 text-right">Total:</td>
                <td className="border px-2 py-1.5 text-right font-bold">{fmt(totalAmount)}</td>
                <td className="border" />
              </tr>
            </tfoot>
          )}
        </table>

        <div className="grid grid-cols-3 gap-6 pt-6 text-xs border-t mt-4">
          {["Reported By", "Inspected By", "Approved By"].map(label => (
            <div key={label} className="text-center">
              <div className="border-b border-foreground/30 mb-1 h-8" />
              <p className="font-semibold">{label}</p>
              <p className="text-[10px] text-muted-foreground">Signature / Date</p>
            </div>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground text-right pt-1">
          Printed / Viewed from BinCard Ledger
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bincard (Stock Card)</h1>
          <p className="text-muted-foreground text-sm">Full movement history per product with clickable vouchers and reference photos</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePrint()}
            disabled={!selectedProduct && !seeAllBincard}
            data-testid="btn-print-bincard"
          >
            <Printer className="w-4 h-4 mr-1.5" /> Print
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={(!selectedProduct && !seeAllBincard) || exportingExcel}
                data-testid="btn-excel-bincard"
                className="gap-1.5 border-emerald-600/30 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400 font-medium"
              >
                <FileDown className="w-4 h-4 text-emerald-600" />
                <span>{exportingExcel ? "Exporting…" : "Export to Excel"}</span>
                <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-0.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-1.5 shadow-lg">
              <DropdownMenuItem
                onClick={handleExportInteractiveExcel}
                className="flex flex-col items-start py-2.5 px-3 cursor-pointer rounded-md focus:bg-emerald-50 dark:focus:bg-emerald-950/30"
              >
                <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400 text-sm">
                  <Layers className="w-4 h-4 shrink-0 text-emerald-600" />
                  <span>Interactive Dropdown Workbook</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 pl-6 leading-relaxed">
                  Excel ላይ Drop Down እያደረጉ የእያንዳንዱን እቃ ገቢ፣ ወጪ እና ቀሪ ክምችት በሰንጠረዥና በካርድ ለመመልከት (የተሟላ)
                </p>
              </DropdownMenuItem>
              <DropdownMenuSeparator className="my-1" />
              <DropdownMenuItem
                onClick={handleExportClassicExcel}
                className="flex flex-col items-start py-2 px-3 cursor-pointer rounded-md"
              >
                <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                  <TableIcon className="w-4 h-4 shrink-0 text-slate-500" />
                  <span>Standard Flat Sheet (ቀላል ሰንጠረዥ)</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1 pl-6 leading-relaxed">
                  የተመረጠውን ገጽ ወደ አንድ ወጥ የሆነ ሰንጠረዥ ኤክስፖርት ለማድረግ
                </p>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="outline"
            size="sm"
            onClick={handleShare}
            disabled={(!selectedProduct && !seeAllBincard) || sharing}
            data-testid="btn-share-bincard"
          >
            <Share2 className="w-4 h-4 mr-1.5" /> {sharing ? "Sharing…" : "Share"}
          </Button>
        </div>
      </div>

      {/* Main Filter & Action Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Toggle: See All Bin card (የሁሉንም ቢንካርድ አሳይ) */}
        <div
          onClick={() => {
            const next = !seeAllBincard;
            setSeeAllBincard(next);
            if (next && displayedGroups.length > 0 && expandedProductIds.size === 0) {
              setExpandedProductIds(new Set(displayedGroups.map(g => g.product.id)));
            }
          }}
          className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-lg border text-sm font-semibold transition-all cursor-pointer select-none shadow-2xs ${
            seeAllBincard
              ? "bg-primary text-primary-foreground border-primary ring-2 ring-primary/25"
              : "bg-card hover:bg-muted/80 border-border text-foreground"
          }`}
          title="Toggle to view all products' bin cards together (የሁሉንም ቢንካርድ በአንድ ላይ አሳይ)"
          data-testid="checkbox-see-all-bincard-container"
        >
          <Checkbox
            id="see-all-bincard-chk"
            checked={seeAllBincard}
            onCheckedChange={v => {
              const next = Boolean(v);
              setSeeAllBincard(next);
              if (next && displayedGroups.length > 0 && expandedProductIds.size === 0) {
                setExpandedProductIds(new Set(displayedGroups.map(g => g.product.id)));
              }
            }}
            className="data-[state=checked]:bg-white data-[state=checked]:text-primary border-current pointer-events-none"
            data-testid="checkbox-see-all-bincard"
          />
          <label htmlFor="see-all-bincard-chk" className="cursor-pointer text-xs sm:text-sm font-semibold flex items-center gap-1.5 leading-none">
            <span>See All Bin card</span>
            <span className={`text-[11px] font-normal ${seeAllBincard ? "text-primary-foreground/90" : "text-muted-foreground"}`}>
              (የሁሉንም ቢንካርድ አሳይ)
            </span>
          </label>
        </div>

        {/* Product search (shown ONLY when NOT in seeAllBincard) */}
        {!seeAllBincard && (
          <div className="relative flex-1 min-w-[200px]">
            <Input
              placeholder="Search products by name or code…"
              value={productSearch}
              onChange={e => { setProductSearch(e.target.value); if (!e.target.value) setSelectedProduct(""); }}
              data-testid="input-product-search"
            />
            {filteredProducts.length > 0 && (
              <div className="absolute z-20 top-full left-0 right-0 bg-card border rounded-b shadow-lg max-h-72 overflow-y-auto">
                {filteredProducts.map(p => (
                  <div key={p.id} className="px-4 py-2 hover:bg-muted cursor-pointer text-sm flex items-center gap-3"
                    onClick={() => { setSelectedProduct(p.id); setProductSearch(""); }}>
                    {p.photoUrl
                      ? <img src={p.photoUrl} alt={p.name} className="w-8 h-8 rounded object-cover flex-shrink-0" />
                      : <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0"><History className="w-4 h-4 text-muted-foreground" /></div>}
                    <div>
                      <div className="font-medium">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.code}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Store Selector */}
        <Select value={selectedStore} onValueChange={setSelectedStore}>
          <SelectTrigger className="w-[180px]" data-testid="select-store-bincard">
            <SelectValue placeholder="All Stores" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stores</SelectItem>
            {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* Text Filter (Product, voucher ID, store, etc.) */}
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            className="pl-9"
            placeholder={seeAllBincard ? "Search products, vouchers, stores..." : "Filter entries..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search-bincard"
          />
        </div>

        {/* Refresh button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => loadAllData()}
          title="Refresh ledger data"
          className="h-9 w-9 flex-shrink-0"
          data-testid="btn-refresh-bincard"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-primary" : "text-muted-foreground"}`} />
        </Button>
      </div>

      {/* Single Product Card (when NOT in See All mode) */}
      {!seeAllBincard && selectedProduct && (() => {
        const sp = products.find(p => p.id === selectedProduct);
        if (!sp) return null;
        return (
          <div className="flex items-center gap-4 p-3 mb-4 rounded-lg border bg-card shadow-sm">
            {sp.photoUrl
              ? <img src={sp.photoUrl} alt={sp.name} className="w-14 h-14 rounded-lg object-cover flex-shrink-0 border" />
              : <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0"><History className="w-6 h-6 text-muted-foreground" /></div>}
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-base truncate">{sp.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{sp.code}</div>
              {sp.quantityPerCarton > 1 && <div className="text-xs text-muted-foreground">Qty/Carton: {sp.quantityPerCarton}</div>}
            </div>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setSelectedProduct(""); setProductSearch(""); }}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        );
      })()}

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-3">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : seeAllBincard ? (
        /* SEE ALL BIN CARD VIEW */
        <div ref={tableRef} className="space-y-4">
          {/* Summary Banner */}
          <div className="rounded-lg border bg-card p-4 shadow-2xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold flex items-center gap-2">
                  <span>All Products Bincard Ledger (የሁሉም እቃዎች ቢንካርድ)</span>
                  <Badge variant="secondary" className="font-mono text-xs">
                    {displayedGroups.length} Products
                  </Badge>
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Showing movements across {selectedStoreName ? `Store: ${selectedStoreName}` : "All Stores"}
                </p>
              </div>

              {/* Total metrics */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="px-3 py-1.5 rounded-md bg-green-50 border border-green-200 dark:bg-green-950/40 dark:border-green-900 text-green-700 dark:text-green-300">
                  <span className="font-medium text-[11px] block text-green-600/80">TOTAL IN</span>
                  <strong className="text-sm">+{overallTotals.inPcs.toLocaleString()} pcs</strong>
                  {overallTotals.inCtns > 0 && <span className="text-[10px] ml-1">({overallTotals.inCtns} ctn)</span>}
                </div>
                <div className="px-3 py-1.5 rounded-md bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-900 text-red-700 dark:text-red-300">
                  <span className="font-medium text-[11px] block text-red-600/80">TOTAL OUT</span>
                  <strong className="text-sm">-{overallTotals.outPcs.toLocaleString()} pcs</strong>
                  {overallTotals.outCtns > 0 && <span className="text-[10px] ml-1">({overallTotals.outCtns} ctn)</span>}
                </div>
                <div className={`px-3 py-1.5 rounded-md border ${
                  overallTotals.balPcs < 0
                    ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/40"
                    : "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40"
                }`}>
                  <span className="font-medium text-[11px] block text-muted-foreground">NET BALANCE</span>
                  <strong className="text-sm">{overallTotals.balPcs.toLocaleString()} pcs</strong>
                  {overallTotals.balCtns !== 0 && <span className="text-[10px] ml-1">({overallTotals.balCtns} ctn)</span>}
                </div>
              </div>
            </div>

            {/* Sub-controls: view mode, hide 0 movements, expand/collapse */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                {/* Hide zero movement checkbox */}
                <label className="flex items-center gap-2 cursor-pointer select-none text-muted-foreground hover:text-foreground">
                  <Checkbox
                    checked={hideZeroMovements}
                    onCheckedChange={v => setHideZeroMovements(Boolean(v))}
                  />
                  <span>Hide products with 0 movements (እንቅስቃሴ የሌላቸውን ደብቅ)</span>
                </label>

                {/* View Mode Toggle */}
                <div className="flex items-center rounded-md border bg-muted/30 p-0.5">
                  <button
                    type="button"
                    onClick={() => setViewMode("grouped")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      viewMode === "grouped"
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Grouped by Product (በየእቃው)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("unified")}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      viewMode === "unified"
                        ? "bg-card text-foreground shadow-2xs font-semibold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <TableIcon className="w-3.5 h-3.5" />
                    <span>Master Timeline (የተጠቃለለ)</span>
                  </button>
                </div>
              </div>

              {viewMode === "grouped" && (
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={expandAll} className="h-7 text-xs px-2">
                    Expand All (ሁሉንም ክፈት)
                  </Button>
                  <span className="text-muted-foreground">•</span>
                  <Button variant="ghost" size="sm" onClick={collapseAll} className="h-7 text-xs px-2">
                    Collapse All (ሁሉንም ዝጋ)
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Grouped View */}
          {viewMode === "grouped" && (
            <div className="space-y-4">
              {displayedGroups.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground border rounded-lg bg-card">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No products match the selected criteria.</p>
                  <p className="text-xs mt-1">Try unchecking "Hide products with 0 movements" or clearing the search filter.</p>
                </div>
              ) : (
                displayedGroups.map(group => {
                  const isExpanded = expandedProductIds.has(group.product.id);
                  return (
                    <div key={group.product.id} className="rounded-lg border bg-card shadow-xs overflow-hidden transition-all">
                      {/* Product Header Row */}
                      <div
                        onClick={() => toggleExpand(group.product.id)}
                        className="flex flex-wrap items-center justify-between p-3 sm:p-4 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors gap-3 select-none"
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {group.product.photoUrl ? (
                            <img
                              src={group.product.photoUrl}
                              alt={group.product.name}
                              className="w-11 h-11 rounded-lg object-cover flex-shrink-0 border shadow-2xs"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 border">
                              <Package className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-sm sm:text-base flex items-center gap-2 truncate">
                              <span className="truncate">{group.product.name}</span>
                              {group.product.code && (
                                <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-normal">
                                  {group.product.code}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                              {group.product.quantityPerCarton > 1 && (
                                <span>Qty/Ctn: {group.product.quantityPerCarton}</span>
                              )}
                              <span>•</span>
                              <span>{group.entries.length} movements recorded</span>
                            </div>
                          </div>
                        </div>

                        {/* Summary Badges & Quick Action */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900 font-medium">
                              +{group.totalIn} in
                            </span>
                            <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900 font-medium">
                              -{group.totalOut} out
                            </span>
                            <span className={`px-2.5 py-0.5 rounded font-bold border ${
                              group.balance < 0
                                ? "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800"
                                : "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300 dark:border-emerald-800"
                            }`}>
                              Bal: {group.balance} pcs
                              {group.balanceCartons !== 0 && ` (${group.balanceCartons} ctn)`}
                            </span>
                          </div>

                          {/* Switch to single product mode button */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs px-2.5"
                            onClick={e => {
                              e.stopPropagation();
                              setSeeAllBincard(false);
                              setSelectedProduct(group.product.id);
                            }}
                            title="View only this product's bincard (ይህንን እቃ ብቻ ለይተህ እይ)"
                          >
                            Single View
                          </Button>

                          {/* Expand/Collapse Chevron */}
                          <div className="text-muted-foreground p-1">
                            {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                          </div>
                        </div>
                      </div>

                      {/* Product Movement Table */}
                      {isExpanded && (
                        <div className="border-t overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/40 text-xs">
                              <tr>
                                {["Date (ቀን)", "Type", "Details", "Voucher ID", "Store", "Ctns", "In (+)", "Out (-)", "Balance"].map(h => (
                                  <th key={h} className="text-left px-3.5 py-2.5 font-medium text-muted-foreground">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y text-xs">
                              {group.entries.map((e, idx) => (
                                <tr key={e.id || idx} className="hover:bg-muted/30">
                                  <td className="px-3.5 py-2 text-xs whitespace-nowrap">
                                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                                      {e.date ? formatEthDate(e.date, { short: true }) : "—"}
                                    </div>
                                    {e.date && (
                                      <div className="text-[10px] text-muted-foreground">{formatSafeDate(e.date)}</div>
                                    )}
                                  </td>
                                  <td className="px-3.5 py-2">
                                    <Badge variant={typeColor(e.type)} className="text-[11px] whitespace-nowrap">
                                      {e.type}
                                    </Badge>
                                  </td>
                                  <td className={`px-3.5 py-2 font-medium max-w-[150px] truncate ${detailsColor(e.type)}`} title={e.details || undefined}>
                                    {e.details || "—"}
                                  </td>
                                  <td className="px-3.5 py-2 font-mono">
                                    <button
                                      type="button"
                                      onClick={() => openVoucherReceipt(e)}
                                      className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline transition-colors text-left"
                                      title="Click to view full voucher receipt & reference photo"
                                      data-testid={`voucher-link-${e.voucherId}`}
                                    >
                                      <span>{e.voucherId}</span>
                                      {e.referencePhotoUrl && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 shadow-2xs">
                                          📷 Ref
                                        </span>
                                      )}
                                    </button>
                                  </td>
                                  <td className="px-3.5 py-2">{e.storeName}</td>
                                  <td className="px-3.5 py-2 text-muted-foreground font-medium">
                                    {e.cartons > 0 ? (Number.isInteger(e.cartons) ? e.cartons : Number(e.cartons.toFixed(2))) : "—"}
                                  </td>
                                  <td className="px-3.5 py-2 text-green-600 font-semibold">{e.direction === "in" ? `+${e.quantity}` : ""}</td>
                                  <td className="px-3.5 py-2 text-red-500 font-semibold">{e.direction === "out" ? `-${e.quantity}` : ""}</td>
                                  <td className={`px-3.5 py-2 font-bold ${e.balance < 0 ? "text-red-600" : "text-foreground"}`}>{e.balance}</td>
                                </tr>
                              ))}
                              {group.entries.length === 0 && (
                                <tr>
                                  <td colSpan={9} className="text-center py-6 text-muted-foreground italic">
                                    No stock movements recorded in {selectedStoreName || "any store"}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                            {group.entries.length > 0 && (
                              <tfoot className="bg-muted/20 font-semibold border-t text-xs">
                                <tr>
                                  <td colSpan={6} className="px-3.5 py-2 text-right">Balance for {group.product.name}:</td>
                                  <td className="px-3.5 py-2 text-green-600 font-bold">+{group.totalIn}</td>
                                  <td className="px-3.5 py-2 text-red-500 font-bold">-{group.totalOut}</td>
                                  <td className={`px-3.5 py-2 font-bold ${group.balance < 0 ? "text-red-600" : "text-green-600"}`}>
                                    {group.balance} pcs {group.balanceCartons !== 0 && `(${group.balanceCartons} ctn)`}
                                  </td>
                                </tr>
                              </tfoot>
                            )}
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Master Timeline View */}
          {viewMode === "unified" && (
            <div className="rounded-lg border bg-card shadow-xs overflow-hidden">
              <div className="p-3 bg-muted/20 border-b flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground">
                  Showing {unifiedEntries.length} chronological stock movements across all products
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs">
                    <tr>
                      {["Date (ቀን)", "Product", "Type", "Details", "Voucher ID", "Store", "Ctns", "In (+)", "Out (-)", "Balance"].map(h => (
                        <th key={h} className="text-left px-3.5 py-2.5 font-medium text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y text-xs">
                    {unifiedEntries.map((e, idx) => (
                      <tr key={e.id || idx} className="hover:bg-muted/30">
                        <td className="px-3.5 py-2 text-xs whitespace-nowrap">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {e.date ? formatEthDate(e.date, { short: true }) : "—"}
                          </div>
                          {e.date && (
                            <div className="text-[10px] text-muted-foreground">{formatSafeDate(e.date)}</div>
                          )}
                        </td>
                        <td className="px-3.5 py-2">
                          <div className="font-semibold text-foreground flex items-center gap-2">
                            <span>{e.productName}</span>
                            {e.productCode && (
                              <span className="font-mono text-[10px] px-1 rounded bg-muted text-muted-foreground font-normal">
                                {e.productCode}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3.5 py-2">
                          <Badge variant={typeColor(e.type)} className="text-[11px] whitespace-nowrap">{e.type}</Badge>
                        </td>
                        <td className={`px-3.5 py-2 font-medium max-w-[140px] truncate ${detailsColor(e.type)}`} title={e.details || undefined}>
                          {e.details || "—"}
                        </td>
                        <td className="px-3.5 py-2 font-mono">
                          <button
                            type="button"
                            onClick={() => openVoucherReceipt(e)}
                            className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline transition-colors text-left"
                            title="Click to view voucher receipt & reference photo"
                          >
                            <span>{e.voucherId}</span>
                            {e.referencePhotoUrl && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 shadow-2xs">
                                📷 Ref
                              </span>
                            )}
                          </button>
                        </td>
                        <td className="px-3.5 py-2">{e.storeName}</td>
                        <td className="px-3.5 py-2 text-muted-foreground font-medium">
                          {e.cartons > 0 ? (Number.isInteger(e.cartons) ? e.cartons : Number(e.cartons.toFixed(2))) : "—"}
                        </td>
                        <td className="px-3.5 py-2 text-green-600 font-semibold">{e.direction === "in" ? `+${e.quantity}` : ""}</td>
                        <td className="px-3.5 py-2 text-red-500 font-semibold">{e.direction === "out" ? `-${e.quantity}` : ""}</td>
                        <td className={`px-3.5 py-2 font-bold ${e.balance < 0 ? "text-red-600" : "text-foreground"}`}>{e.balance}</td>
                      </tr>
                    ))}
                    {unifiedEntries.length === 0 && (
                      <tr>
                        <td colSpan={10} className="text-center py-10 text-muted-foreground italic">
                          No stock movements found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : !selectedProduct ? (
        /* PROMPT TO SELECT PRODUCT (when NOT in See All mode) */
        <div className="text-center py-20 text-muted-foreground border rounded-lg bg-card">
          <History className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-base font-medium">Search and select a product to view its bincard</p>
          <p className="text-xs text-muted-foreground mt-1">Or tick "See All Bin card (የሁሉንም ቢንካርድ አሳይ)" above to view all products together</p>
        </div>
      ) : (
        /* SINGLE PRODUCT BINCARD TABLE */
        <div ref={tableRef}>
          {selectedProductName && <h2 className="text-lg font-bold mb-3">{selectedProductName} — Movement History</h2>}
          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {["Date (ቀን)", "Type", "Details", "Voucher ID", "Store", "Ctns", "In (+)", "Out (-)", "Balance"].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSingleEntries.map((e, i) => (
                  <tr key={e.id || i} className="hover:bg-muted/30">
                    <td className="px-4 py-2 text-xs whitespace-nowrap">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">
                        {e.date ? formatEthDate(e.date, { short: true }) : "—"}
                      </div>
                      {e.date && (
                        <div className="text-[10px] text-muted-foreground">{formatSafeDate(e.date)}</div>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={typeColor(e.type)} className="text-xs whitespace-nowrap">{e.type}</Badge>
                    </td>
                    <td className={`px-4 py-2 text-xs font-medium max-w-[140px] truncate ${detailsColor(e.type)}`} title={e.details || undefined}>
                      {e.details || "—"}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      <button
                        type="button"
                        onClick={() => openVoucherReceipt(e)}
                        className="inline-flex items-center gap-1.5 font-bold text-primary hover:underline hover:text-primary/80 transition-colors cursor-pointer group text-left"
                        title="Click to view full voucher receipt & reference photo (ደረሰኝ እና ማጣቀሻ ፎቶ እይ)"
                        data-testid={`voucher-link-${e.voucherId}`}
                      >
                        <span>{e.voucherId}</span>
                        {e.referencePhotoUrl && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800 shadow-2xs" title="Reference document attached (ማጣቀሻ ሰነድ አለው)">
                            📷 Ref
                          </span>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2 text-xs">{e.storeName}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground font-medium">
                      {e.cartons > 0 ? (Number.isInteger(e.cartons) ? e.cartons : Number(e.cartons.toFixed(2))) : "—"}
                    </td>
                    <td className="px-4 py-2 text-green-600 font-medium">{e.direction === "in" ? `+${e.quantity}` : ""}</td>
                    <td className="px-4 py-2 text-red-500 font-medium">{e.direction === "out" ? `-${e.quantity}` : ""}</td>
                    <td className={`px-4 py-2 font-bold ${e.balance < 0 ? "text-red-600" : "text-foreground"}`}>{e.balance}</td>
                  </tr>
                ))}
                {filteredSingleEntries.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">No movement records found</td></tr>
                )}
              </tbody>
              {filteredSingleEntries.length > 0 && (
                <tfoot className="bg-muted/30 font-bold">
                  <tr>
                    <td colSpan={8} className="px-4 py-2 text-sm">Current Balance</td>
                    <td className={`px-4 py-2 text-lg font-bold ${(filteredSingleEntries[filteredSingleEntries.length - 1]?.balance || 0) < 0 ? "text-red-600" : "text-green-600"}`}>
                      {filteredSingleEntries[filteredSingleEntries.length - 1]?.balance || 0}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Voucher Receipt & Reference Photo Modal with ReceiptActionBar */}
      <Dialog open={!!viewingReceipt} onOpenChange={open => { if (!open) setViewingReceipt(null); }}>
        <DialogContent className={`max-h-[92vh] overflow-y-auto ${
          viewingReceipt?.referencePhotoUrl && !hideReceiptRefPhoto ? "max-w-6xl xl:max-w-7xl" : "max-w-3xl"
        }`}>
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <span>{viewingReceipt?.type} Voucher Receipt</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-muted font-normal">
                  {viewingReceipt?.voucherId}
                </span>
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {viewingReceipt?.storeName} • {formatEthDate(viewingReceipt?.date || "", { includeGregorian: true })}
              </p>
            </div>

            <div className="flex items-center gap-2 mr-6">
              {viewingReceipt && viewingReceipt.sourceDoc?.status !== "voided" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-amber-700 hover:text-amber-800 dark:text-amber-400 font-medium"
                  onClick={() => handleEditVoucher(viewingReceipt)}
                  data-testid="button-edit-voucher-bincard"
                >
                  <Pencil className="w-4 h-4" />
                  <span>{getEditLabel(viewingReceipt.type)}</span>
                </Button>
              )}

              {viewingReceipt?.referencePhotoUrl && (
                <Button
                  type="button"
                  variant={hideReceiptRefPhoto ? "default" : "outline"}
                  size="sm"
                  className="text-xs gap-1.5 h-8 font-medium"
                  onClick={() => setHideReceiptRefPhoto(!hideReceiptRefPhoto)}
                  data-testid="toggle-hide-ref-photo-bincard"
                >
                  {hideReceiptRefPhoto ? (
                    <>
                      <Eye className="w-3.5 h-3.5" />
                      <span>Show Reference Photo (አሳይ)</span>
                    </>
                  ) : (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>Hide Reference Photo (ደብቅ)</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </DialogHeader>

          {viewingReceipt && (
            <ReceiptWithReferenceView
              referencePhotoUrl={hideReceiptRefPhoto ? undefined : viewingReceipt.referencePhotoUrl}
              voucherId={viewingReceipt.voucherId}
              receiptNode={renderReceiptContent(viewingReceipt)}
            />
          )}

          <DialogFooter className="gap-2 flex-wrap sm:justify-between pt-3 border-t">
            <ReceiptActionBar
              receiptRef={voucherReceiptRef}
              referencePhotoUrl={hideReceiptRefPhoto ? undefined : viewingReceipt?.referencePhotoUrl}
              voucherId={viewingReceipt?.voucherId}
              voucherTitle={`${viewingReceipt?.type?.toUpperCase()} VOUCHER`}
              voucherSubtitle={`Store: ${viewingReceipt?.storeName || ""} | Date: ${viewingReceipt?.date ? formatEthDate(viewingReceipt.date, { includeGregorian: true }) : ""}`}
              filenamePrefix="bincard_voucher"
              onSharePdf={handleSharePdfReceipt}
              onShare={handleShareReceipt}
              onPrint={() => handlePrintReceipt()}
              sharing={sharingReceipt}
              sharingPdf={sharingReceiptPdf}
            />
            <Button variant="secondary" size="sm" onClick={() => setViewingReceipt(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

