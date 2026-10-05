import { useState, useEffect, useRef, useMemo } from "react";
import {
  Search,
  FileDown,
  Printer,
  Package,
  Trash2,
  AlertTriangle,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { getAll, COLLECTIONS, clearCollection, subscribeCollection } from "@/lib/firestore";
import { computeStockBalances } from "@/lib/stockUtils";
import type { Store, StockIn as StockInType, AppSettings } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { fmt } from "@/lib/currency";
import { exportToExcel } from "@/lib/shareImage";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { auth } from "@/lib/firebase";
import { EmailAuthProvider, reauthenticateWithCredential } from "firebase/auth";
import { safeDateSort, formatSafeDate } from "@/lib/dateUtils";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import InventorySheetDialog, { InventorySheetItem } from "@/components/InventorySheetDialog";
import { exportStoreBalancePdf } from "@/storeBalancePdfExport";
import { exportInventorySheetPdf } from "@/inventorySheetPdfExport";
import * as XLSX from "xlsx";

const BALANCE_COLLECTIONS = [
  COLLECTIONS.STOCK_IN,
  COLLECTIONS.POS_SALES,
  COLLECTIONS.TRANSFERS,
  COLLECTIONS.DAMAGE_RETURNS,
  COLLECTIONS.DIRECT_SALES,
  COLLECTIONS.ORDER_VOUCHERS,
  COLLECTIONS.STORE_REQUESTS,
];

interface BalanceRow {
  productId: string;
  productName: string;
  productCode: string;
  photoUrl: string;
  quantity: number;
  quantityPerCarton: number;
  unitPrice: number;
  cartonPrice: number;
}

export default function StoreBalance() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { toast } = useToast();

  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState("");
  const [balance, setBalance] = useState<BalanceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const [showClearDialog, setShowClearDialog] = useState(false);
  const [clearEmail, setClearEmail] = useState("");
  const [clearPassword, setClearPassword] = useState("");
  const [clearing, setClearing] = useState(false);

  // Professional Inventory Sheet states
  const [showInventorySheet, setShowInventorySheet] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingSheetPdf, setExportingSheetPdf] = useState(false);

  const calcSeqRef = useRef(0);
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => {
    getAll<Store>(COLLECTIONS.STORES).then(sts => {
      setStores(sts);
      if (sts.length > 0 && !selectedStore) {
        const saved = localStorage.getItem("nexus_selected_store_balance");
        if (saved && (saved === "all" || sts.some(s => s.id === saved))) {
          setSelectedStore(saved);
        } else {
          setSelectedStore(sts[0].id);
        }
      }
    });
    getAll<AppSettings>(COLLECTIONS.APP_SETTINGS).then(list => {
      if (list && list.length > 0) setSettings(list[0]);
    });
  }, []);

  async function handleClearAll() {
    if (!clearEmail.trim() || !clearPassword.trim()) {
      toast({ title: "Email and password required", variant: "destructive" });
      return;
    }
    setClearing(true);
    try {
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) throw new Error("Not signed in");
      const cred = EmailAuthProvider.credential(clearEmail.trim(), clearPassword);
      await reauthenticateWithCredential(firebaseUser, cred);
      await Promise.all(BALANCE_COLLECTIONS.map(col => clearCollection(col)));
      setBalance([]);
      setShowClearDialog(false);
      setClearEmail("");
      setClearPassword("");
      toast({ title: "Store balance cleared successfully" });
      if (selectedStore) calculateBalance(selectedStore, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("wrong-password") || msg.includes("invalid-credential") || msg.includes("INVALID_PASSWORD")) {
        toast({ title: "Incorrect email or password", variant: "destructive" });
      } else {
        toast({ title: "Clear failed", description: msg, variant: "destructive" });
      }
    } finally {
      setClearing(false);
    }
  }

  async function calculateBalance(storeId: string, isInitial = false) {
    if (!storeId) {
      setBalance([]);
      setLoading(false);
      return;
    }

    const currentSeq = ++calcSeqRef.current;

    // Only display skeleton placeholder on initial load when there is no existing data to view
    if (isInitial && balance.length === 0) {
      setLoading(true);
    }

    try {
      const targetStoreId = storeId === "all" ? undefined : storeId;
      const [balanceMap, allStockIns] = await Promise.all([
        computeStockBalances(targetStoreId),
        getAll<StockInType>(COLLECTIONS.STOCK_IN),
      ]);

      // Discard stale calculation result if a newer request was dispatched
      if (currentSeq !== calcSeqRef.current) return;

      const activeStockIns = (allStockIns || [])
        .filter(si => si && si.status !== "voided")
        .sort((a, b) => safeDateSort(a.createdAt, b.createdAt, "desc"));

      const priceMap: Record<string, { unitPrice: number; cartonPrice: number }> = {};
      for (const si of activeStockIns) {
        for (const item of (si.items || [])) {
          if (!item || !item.productId) continue;
          const uPrice = Number(item.unitPrice) || 0;
          const cPrice = Number(item.cartonPrice) || 0;
          if (!priceMap[item.productId] && (uPrice > 0 || cPrice > 0)) {
            priceMap[item.productId] = {
              unitPrice: uPrice,
              cartonPrice: cPrice,
            };
          }
        }
      }

      const rows: BalanceRow[] = Object.values(balanceMap)
        .map(b => ({
          productId: b.productId,
          productName: b.productName || "Unknown Product",
          productCode: b.productCode || "",
          photoUrl: b.photoUrl || "",
          quantity: Number(b.quantity) || 0,
          quantityPerCarton: Math.max(1, Number(b.quantityPerCarton) || 1),
          unitPrice: priceMap[b.productId]?.unitPrice ?? 0,
          cartonPrice: priceMap[b.productId]?.cartonPrice ?? 0,
        }))
        .sort((a, b) => (a.productName || "").localeCompare(b.productName || ""));

      setBalance(rows);
    } catch (err) {
      console.error("Failed to calculate store balance:", err);
    } finally {
      if (currentSeq === calcSeqRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!selectedStore) return;
    localStorage.setItem("nexus_selected_store_balance", selectedStore);

    // Initial load for this store
    calculateBalance(selectedStore, true);

    const scheduleRecalc = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        calculateBalance(selectedStore, false);
      }, 300);
    };

    const unsubDamages = subscribeCollection(COLLECTIONS.DAMAGE_RETURNS, scheduleRecalc);
    const unsubStockIn = subscribeCollection(COLLECTIONS.STOCK_IN, scheduleRecalc);
    const unsubSales = subscribeCollection(COLLECTIONS.POS_SALES, scheduleRecalc);
    const unsubTransfers = subscribeCollection(COLLECTIONS.TRANSFERS, scheduleRecalc);
    const unsubDirect = subscribeCollection(COLLECTIONS.DIRECT_SALES, scheduleRecalc);
    const unsubExpenses = subscribeCollection(COLLECTIONS.EXPENSES, scheduleRecalc);
    const unsubMovements = subscribeCollection(COLLECTIONS.INVENTORY_MOVEMENTS, scheduleRecalc);
    const unsubProds = subscribeCollection(COLLECTIONS.PRODUCTS, scheduleRecalc);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      unsubDamages();
      unsubStockIn();
      unsubSales();
      unsubTransfers();
      unsubDirect();
      unsubExpenses();
      unsubMovements();
      unsubProds();
    };
  }, [selectedStore]);

  const filtered = useMemo(() => {
    return balance.filter(b =>
      Boolean(b) && (
        (b.productName || "").toLowerCase().includes(search.toLowerCase()) ||
        (b.productCode || "").toLowerCase().includes(search.toLowerCase())
      )
    );
  }, [balance, search]);

  const selectedStoreName = selectedStore === "all"
    ? "All Stores (ሁሉም መጋዘኖች)"
    : stores.find(s => s.id === selectedStore)?.name || "";

  // Prepare structured items for the Professional Inventory Sheet
  const inventorySheetItems: InventorySheetItem[] = useMemo(() => {
    return filtered.map(b => {
      const qpc = b.quantityPerCarton > 0 ? b.quantityPerCarton : 1;
      const ctns = Math.floor(b.quantity / qpc);
      return {
        productId: b.productId,
        productName: b.productName,
        productCode: b.productCode,
        photoUrl: b.photoUrl,
        quantityPerCarton: qpc,
        systemQuantity: b.quantity,
        systemCartons: ctns,
      };
    });
  }, [filtered]);

  function handlePrint() {
    if (!tableRef.current) return;
    printElement(tableRef.current, {
      title: `Store_Balance_${selectedStoreName || "Report"}_${new Date().toISOString().slice(0, 10)}`,
      orientation: "landscape",
    });
  }

  // Export Store Balance to Excel with Landscape Page Setup & Generous Column Widths
  async function exportExcel() {
    if (!selectedStore) {
      toast({ title: "Please select a store first", variant: "destructive" });
      return;
    }
    const storeName = selectedStoreName || "Store";
    const wb = XLSX.utils.book_new();
    const totalUnits = filtered.reduce((s, b) => s + b.quantity, 0);
    const totalCartons = filtered.reduce(
      (s, b) => s + (b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : 0),
      0
    );
    const grandTotalValue = filtered.reduce(
      (s, b) => s + (b.unitPrice > 0 ? b.unitPrice * b.quantity : 0),
      0
    );
    const ethDate = formatEthDate(new Date(), { includeGregorian: true });

    const data: any[][] = [
      [
        "No. (ተ.ቁ)",
        "Product Name (የእቃ ስም)",
        "Product Code (የእቃ ኮድ)",
        "Qty/Carton (ፍሬ/ካርቶን)",
        "Unit Price (የአንዱ ዋጋ)",
        "Balance Units (ቀሪ ፍሬ)",
        "Cartons (ካርቶን)",
        "Total Value (ጠቅላላ ዋጋ)",
      ],
      ...filtered.map((b, i) => {
        const cartons = b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : 0;
        const rowTotal = b.unitPrice > 0 ? b.unitPrice * b.quantity : 0;
        return [
          i + 1,
          b.productName,
          b.productCode || "—",
          b.quantityPerCarton > 0 ? b.quantityPerCarton : "—",
          b.unitPrice > 0 ? b.unitPrice : "—",
          b.quantity,
          cartons > 0 ? cartons : "—",
          rowTotal > 0 ? rowTotal : "—",
        ];
      }),
      [
        "TOTAL",
        `${filtered.length} Products in Stock`,
        "",
        "",
        "",
        totalUnits,
        totalCartons,
        grandTotalValue > 0 ? grandTotalValue : "—",
      ],
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Landscape Page Setup for Excel
    ws["!pageSetup"] = {
      orientation: "landscape",
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
      fitToPage: true,
    };

    // Measured column widths so no column is cut off or hidden
    ws["!cols"] = [
      { wch: 8 },  // No.
      { wch: 38 }, // Product Name
      { wch: 18 }, // Code
      { wch: 14 }, // Qty/Ctn
      { wch: 16 }, // Unit Price
      { wch: 18 }, // Balance Units
      { wch: 16 }, // Cartons
      { wch: 22 }, // Total Value
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Store_Balance");
    await exportToExcel({
      workbook: wb,
      filename: `${storeName.replace(/\s+/g, "_")}_Store_Balance_${new Date().toISOString().slice(0, 10)}.xlsx`,
      title: `YESERAHUT STORE BALANCE - ${storeName.toUpperCase()}`,
      subtitle: `Date: ${ethDate} | Total Products: ${filtered.length} | Balance Units: ${totalUnits} | Cartons: ${totalCartons}`,
    });
    toast({ title: "Store Balance exported to Excel (Landscape)" });
  }

  // Export Store Balance to PDF (Landscape A4, Zero Cutoff, Summary Cards)
  async function exportPdf() {
    if (!selectedStore) {
      toast({ title: "Please select a store first", variant: "destructive" });
      return;
    }
    setExportingPdf(true);
    try {
      const storeName = selectedStoreName || "Store";
      const totalUnits = filtered.reduce((s, b) => s + b.quantity, 0);
      const totalCartons = filtered.reduce(
        (s, b) => s + (b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : 0),
        0
      );
      const grandTotalValue = filtered.reduce(
        (s, b) => s + (b.unitPrice > 0 ? b.unitPrice * b.quantity : 0),
        0
      );
      const ethDate = formatEthDate(new Date(), { includeGregorian: true });

      const pdfItems = filtered.map(b => {
        const cartons = b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : 0;
        const totalPrice = b.unitPrice > 0 ? b.unitPrice * b.quantity : 0;
        return {
          productName: b.productName,
          productCode: b.productCode,
          quantityPerCarton: b.quantityPerCarton,
          unitPrice: b.unitPrice,
          quantity: b.quantity,
          cartons,
          totalPrice,
        };
      });

      const res = await exportStoreBalancePdf({
        storeName,
        companyName: settings?.ecommerceName || "YESERAHUT STOCK MANAGEMENT",
        dateStr: ethDate,
        items: pdfItems,
        totals: {
          totalProducts: filtered.length,
          totalUnits,
          totalCartons,
          grandTotalValue,
        },
      });

      if (res === "shared") {
        toast({ title: "Store Balance PDF shared successfully" });
      } else if (res === "downloaded") {
        toast({ title: "Store Balance PDF downloaded (Landscape)" });
      }
    } catch (err) {
      console.error("Store balance PDF export failed:", err);
      toast({ title: "PDF export failed", description: String(err), variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  }

  // Direct Export of Professional Inventory Count & Audit Sheet (Requested by User)
  async function handleDirectExportInventorySheet() {
    if (!selectedStore) {
      toast({ title: "Please select a store first", variant: "destructive" });
      return;
    }

    try {
      const storeName = selectedStoreName || "Store";
      const wb = XLSX.utils.book_new();
      const ethDate = formatEthDate(new Date(), { includeGregorian: true });
      const compName = settings?.ecommerceName || "YESERAHUT STOCK MANAGEMENT";

      const headerAoa: any[][] = [
        [compName.toUpperCase()],
        [`PHYSICAL INVENTORY COUNT & AUDIT SHEET (የእቃ ቆጠራ እና የክምችት ቁጥጥር ሰነድ)`],
        [`Store Name: ${storeName.toUpperCase()} | Audit Date: ${ethDate}`],
        [`Total Items Listed: ${filtered.length} | Status: Physical Wall-to-Wall Inventory Count`],
        [""],
        [
          "No. (ተ.ቁ)",
          "Product Code (የእቃ ኮድ)",
          "Product Name (የእቃ ስም)",
          "Qty/Ctn (ፍሬ/ካርቶን)",
          "System Balance [Pcs] (ሲስተም ቀሪ ፍሬ)",
          "System Balance [Ctns] (ሲስተም ቀሪ ካርቶን)",
          "Verified [Tick ✓] (ማረጋገጫ ቲክ)",
          "Physical Count [Ctns] (የተቆጠረ ካርቶን)",
          "Physical Count [Pcs] (የተቆጠረ ፍሬ)",
          "Total Physical [Pcs] (ጠቅላላ የተቆጠረ ፍሬ)",
          "Damage / Expired [Pcs] (ዳሜጅ/ብልሽት ፍሬ)",
          "Variance [Pcs] (ልዩነት)",
          "Remark / Notes (ማስታወሻ)",
        ],
      ];

      let totalSysPcs = 0;
      let totalSysCtns = 0;

      for (let i = 0; i < filtered.length; i++) {
        const b = filtered[i];
        const qpc = b.quantityPerCarton > 0 ? b.quantityPerCarton : 1;
        const ctns = Math.floor(b.quantity / qpc);
        totalSysPcs += b.quantity;
        totalSysCtns += ctns;

        headerAoa.push([
          i + 1,
          b.productCode || "—",
          b.productName,
          qpc,
          b.quantity,
          ctns,
          "[   ]", // Verification tick box
          "",     // Physical ctns
          "",     // Physical pcs
          "",     // Total counted
          "",     // Damage / expired
          "",     // Variance
          "",     // Remark
        ]);
      }

      // Summary totals row
      headerAoa.push([
        "TOTALS",
        "",
        `${filtered.length} Products`,
        "",
        totalSysPcs,
        totalSysCtns,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);

      // Official Signatures Block
      headerAoa.push([""]);
      headerAoa.push(["OFFICIAL AUDIT & VERIFICATION SIGNATURES"]);
      headerAoa.push([
        "Prepared By: __________________________",
        "",
        "Auditor / Counter: __________________________",
        "",
        "Storekeeper: __________________________",
        "",
        "Approved By: __________________________",
      ]);
      headerAoa.push([
        "Signature & Date: __________________________",
        "",
        "Signature & Date: __________________________",
        "",
        "Signature & Date: __________________________",
        "",
        "Signature & Date: __________________________",
      ]);

      const ws = XLSX.utils.aoa_to_sheet(headerAoa);

      // Landscape Page Setup for Excel
      ws["!pageSetup"] = {
        orientation: "landscape",
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9,
        fitToPage: true,
      };

      ws["!cols"] = [
        { wch: 8 },  // No.
        { wch: 18 }, // Code
        { wch: 38 }, // Name
        { wch: 12 }, // Qty/Ctn
        { wch: 18 }, // System Pcs
        { wch: 18 }, // System Ctns
        { wch: 14 }, // Verified
        { wch: 16 }, // Physical Ctns
        { wch: 16 }, // Physical Pcs
        { wch: 18 }, // Total Counted
        { wch: 18 }, // Damage
        { wch: 14 }, // Variance
        { wch: 30 }, // Remark
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Inventory_Count_Sheet");

      await exportToExcel({
        workbook: wb,
        filename: `Inventory_Count_Sheet_${storeName.replace(/\s+/g, "_")}.xlsx`,
        title: `PHYSICAL INVENTORY COUNT SHEET - ${storeName.toUpperCase()}`,
        subtitle: `Date: ${ethDate} | Total Products: ${filtered.length}`,
      });

      toast({ title: "Professional Inventory Sheet exported to Excel (Landscape)!" });
    } catch (err) {
      console.error("Failed to export inventory sheet:", err);
      toast({ title: "Export failed", description: String(err), variant: "destructive" });
    }
  }

  // Direct Export of Professional Inventory Count Sheet to PDF (Landscape A4)
  async function handleDirectExportInventorySheetPdf() {
    if (!selectedStore) {
      toast({ title: "Please select a store first", variant: "destructive" });
      return;
    }

    setExportingSheetPdf(true);
    try {
      const storeName = selectedStoreName || "Store";
      const ethDate = formatEthDate(new Date(), { includeGregorian: true });

      const sheetItems = filtered.map(b => {
        const qpc = b.quantityPerCarton > 0 ? b.quantityPerCarton : 1;
        const ctns = Math.floor(b.quantity / qpc);
        return {
          productId: b.productId,
          productCode: b.productCode,
          productName: b.productName,
          quantityPerCarton: b.quantityPerCarton,
          systemQuantity: b.quantity,
          systemCartons: ctns,
          verified: false,
          physicalCartons: "",
          physicalPieces: "",
          totalPhysical: "",
          damagePieces: "",
          variance: "",
          remark: "",
        };
      });

      const totalSysPcs = filtered.reduce((s, b) => s + b.quantity, 0);
      const totalSysCtns = filtered.reduce(
        (s, b) => s + (b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : 0),
        0
      );

      const res = await exportInventorySheetPdf({
        storeName,
        companyName: settings?.ecommerceName || "YESERAHUT STOCK MANAGEMENT",
        dateStr: ethDate,
        items: sheetItems,
        totals: {
          totalProducts: filtered.length,
          totalSysPcs,
          totalSysCtns,
          totalPhysPcs: 0,
          totalDamagePcs: 0,
          verifiedCount: 0,
        },
      });

      if (res === "shared") {
        toast({ title: "Inventory Count Sheet PDF shared successfully" });
      } else if (res === "downloaded") {
        toast({ title: "Inventory Count Sheet PDF downloaded (Landscape)" });
      }
    } catch (err) {
      console.error("Direct sheet PDF export failed:", err);
      toast({ title: "PDF export failed", description: String(err), variant: "destructive" });
    } finally {
      setExportingSheetPdf(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store Balance</h1>
          <p className="text-muted-foreground text-sm">View current inventory balance per store</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 lg:w-auto items-center">
          {/* Inventory Count Sheet Actions */}
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              className="flex-1 sm:flex-none bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs min-h-[42px]"
              onClick={() => setShowInventorySheet(true)}
              disabled={!selectedStore}
              data-testid="btn-print-inventory-sheet"
              title="Open and print professional inventory count sheet with tick boxes, count boxes, and damage entries"
            >
              <ClipboardList className="w-4 h-4 mr-2" /> Print Inventory Sheet
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  className="flex-1 sm:flex-none border-emerald-300 text-emerald-800 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40 font-semibold shadow-xs min-h-[42px]"
                  variant="outline"
                  disabled={!selectedStore || exportingSheetPdf}
                  data-testid="btn-export-inventory-sheet"
                  title="Export inventory audit sheet to Excel or PDF"
                >
                  {exportingSheetPdf ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin text-emerald-600" />
                  ) : (
                    <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
                  )}
                  Export Inventory Sheet
                  <ChevronDown className="w-3.5 h-3.5 ml-1.5 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem
                  onClick={handleDirectExportInventorySheet}
                  className="cursor-pointer font-medium py-2.5"
                  data-testid="menu-export-sheet-excel"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" />
                  <div>
                    <div>Export to Excel (ኤክሴል)</div>
                    <div className="text-xs text-muted-foreground">Landscape with audit boxes</div>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={handleDirectExportInventorySheetPdf}
                  disabled={exportingSheetPdf}
                  className="cursor-pointer font-medium py-2.5"
                  data-testid="menu-export-sheet-pdf"
                >
                  <FileText className="w-4 h-4 mr-2 text-rose-600" />
                  <div>
                    <div>Export to PDF (ፒዲኤፍ)</div>
                    <div className="text-xs text-muted-foreground">Landscape A4 print-ready</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Store Balance Report Actions */}
          <div className="flex flex-wrap gap-2 w-full sm:w-auto">
            <Button
              className="flex-1 sm:flex-none min-h-[42px]"
              variant="outline"
              onClick={() => handlePrint()}
              disabled={!selectedStore}
              data-testid="btn-print-balance"
              title="Print Store Balance report (Landscape)"
            >
              <Printer className="w-4 h-4 mr-2" /> Print Balance
            </Button>

            <Button
              className="flex-1 sm:flex-none min-h-[42px]"
              variant="outline"
              onClick={exportExcel}
              disabled={!selectedStore}
              data-testid="btn-excel-balance"
              title="Export Store Balance to Excel (Landscape)"
            >
              <FileDown className="w-4 h-4 mr-2 text-emerald-600" /> Excel Balance
            </Button>

            <Button
              className="flex-1 sm:flex-none border-rose-200 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40 min-h-[42px]"
              variant="outline"
              onClick={exportPdf}
              disabled={!selectedStore || exportingPdf}
              data-testid="btn-pdf-balance"
              title="Export Store Balance to PDF (Landscape A4 - no columns cut off)"
            >
              {exportingPdf ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin text-rose-600" />
              ) : (
                <FileText className="w-4 h-4 mr-2 text-rose-600" />
              )}
              PDF Balance
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center">
        <Select value={selectedStore} onValueChange={setSelectedStore}>
          <SelectTrigger className="w-full sm:w-64" data-testid="select-store">
            <SelectValue placeholder="Select a store" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stores (ሁሉም መጋዘኖች)</SelectItem>
            {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="relative w-full sm:max-w-sm sm:flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input className="pl-9" placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-balance" />
        </div>
      </div>

      {!selectedStore ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p>Select a store to view its balance</p>
        </div>
      ) : loading && balance.length === 0 ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}</div>
      ) : (
        <>
          {/* ── Summary Cards ── */}
          {filtered.length > 0 && (() => {
            const totalUnits = filtered.reduce((s, b) => s + b.quantity, 0);
            const totalCartons = filtered.reduce((s, b) => s + (b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : 0), 0);
            const totalUnitValue = filtered.reduce((s, b) => s + (b.unitPrice > 0 ? b.unitPrice * b.quantity : 0), 0);
            const totalCartonValue = filtered.reduce((s, b) => {
              const cartons = b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : 0;
              return s + (b.cartonPrice > 0 ? b.cartonPrice * cartons : 0);
            }, 0);
            const grandTotal = filtered.reduce((s, b) => s + (b.unitPrice > 0 ? b.unitPrice * b.quantity : 0), 0);
            return (
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5 print-hide">
                {[
                  { label: "Total Products", value: filtered.length, unit: "items", color: "from-slate-600 to-slate-800", text: "text-white" },
                  { label: "Balance Units", value: totalUnits.toLocaleString(), unit: "units", color: "from-emerald-500 to-green-700", text: "text-white" },
                  { label: "Balance Cartons", value: totalCartons.toLocaleString(), unit: "cartons", color: "from-blue-500 to-blue-700", text: "text-white" },
                  { label: "Total Carton Value", value: fmt(totalCartonValue), unit: "carton × ctns", color: "from-purple-500 to-purple-700", text: "text-white" },
                ].map(card => (
                  <div key={card.label} className={`rounded-xl p-4 bg-gradient-to-br ${card.color} shadow-sm`}>
                    <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-1">{card.label}</p>
                    <p className={`text-xl font-extrabold ${card.text} leading-tight`}>{card.value}</p>
                    <p className="text-[10px] text-white/50 mt-0.5">{card.unit}</p>
                  </div>
                ))}
                {/* Grand Total spanning full width */}
                <div className="col-span-2 sm:col-span-2 lg:col-span-4 rounded-xl p-4 flex items-center justify-between bg-gradient-to-r from-amber-400 to-yellow-500 shadow-md">
                  <div>
                    <p className="text-xs font-bold text-amber-900/70 uppercase tracking-wider">Grand Total — All Products</p>
                    <p className="text-xs text-amber-900/60 mt-0.5">{selectedStoreName} · {formatSafeDate(new Date())}</p>
                  </div>
                  <p className="text-3xl font-extrabold text-amber-900">{fmt(grandTotal)}</p>
                </div>
              </div>
            );
          })()}

        <div ref={tableRef} className="receipt-a4 w-full max-w-full overflow-x-auto overscroll-x-contain rounded-xl print:overflow-visible" style={{ background: "#fff", borderRadius: 12, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
          {/* Print header */}
          <div className="hidden print:block mb-4 border-b pb-3">
            <h2 className="text-lg font-bold">Store Balance Report</h2>
            <p className="text-sm">Store: <strong>{selectedStoreName}</strong></p>
            <p className="text-sm">Date: {formatSafeDate(new Date())}</p>
          </div>
          <table className="w-full min-w-[900px] print:min-w-0" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "#f1f5f9" }}>
                <th style={{ textAlign: "left", padding: "10px 14px", color: "#475569", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" }}>Photo</th>
                <th style={{ textAlign: "left", padding: "10px 14px", color: "#475569", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" }}>Product Name</th>
                <th style={{ textAlign: "left", padding: "10px 14px", color: "#475569", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" }}>Code</th>
                <th style={{ textAlign: "right", padding: "10px 14px", color: "#475569", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" }}>Qty/Ctn</th>
                <th style={{ textAlign: "right", padding: "10px 14px", color: "#475569", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" }}>Unit Price</th>
                <th style={{ textAlign: "right", padding: "10px 14px", color: "#475569", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em" }}>Balance (Units)</th>
                <th style={{ textAlign: "right", padding: "10px 14px", color: "#1d4ed8", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", background: "#eff6ff" }}>Cartons</th>
                <th style={{ textAlign: "right", padding: "10px 14px", color: "#92400e", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.07em", background: "#fef3c7" }}>Total Price</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b, i) => (
                <tr
                  key={b.productId}
                  style={{ background: b.quantity <= 0 ? "#fef2f2" : i % 2 === 0 ? "#fff" : "#f9fafb", opacity: b.quantity <= 0 ? 0.6 : 1 }}
                  data-testid={`row-balance-${b.productId}`}
                >
                  <td style={{ padding: "10px 14px" }}>
                    {b.photoUrl ? (
                      <img src={b.photoUrl} alt={b.productName} style={{ width: 40, height: 40, borderRadius: 6, objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: 6, background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Package style={{ width: 20, height: 20, color: "#94a3b8" }} />
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", fontWeight: 600, color: "#111827" }}>{b.productName}</td>
                  <td style={{ padding: "10px 14px", color: "#6b7280", fontSize: 12 }}>{b.productCode}</td>
                  <td style={{ padding: "10px 14px", textAlign: "right", color: "#6b7280" }}>
                    {b.quantityPerCarton > 0 ? b.quantityPerCarton : <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "#ea580c" }}>
                    {b.unitPrice > 0 ? fmt(b.unitPrice) : <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 800, fontSize: 15, color: b.quantity <= 0 ? "#ef4444" : b.quantity < 10 ? "#d97706" : "#16a34a" }}>
                    {b.quantity}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, fontSize: 14, color: "#1d4ed8", background: i % 2 === 0 ? "#f0f7ff" : "#e8f2ff" }}>
                    {b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right", background: i % 2 === 0 ? "#fffbeb" : "#fef9e7" }}>
                    {b.unitPrice > 0
                      ? <span style={{ fontWeight: 700, color: "#92400e" }}>{fmt(b.unitPrice * b.quantity)}</span>
                      : <span style={{ color: "#d1d5db" }}>—</span>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af", fontSize: 13 }}>No products found for this store</td></tr>
              )}
              {filtered.length > 0 && (() => {
                const totalUnits = filtered.reduce((s, b) => s + b.quantity, 0);
                const totalCartons = filtered.reduce((s, b) => s + (b.quantityPerCarton > 0 ? Math.floor(b.quantity / b.quantityPerCarton) : 0), 0);
                const grandTotalPrice = filtered.reduce((s, b) => s + (b.unitPrice > 0 ? b.unitPrice * b.quantity : 0), 0);
                return (
                  <tr style={{ background: "#fef9e7", borderTop: "2px solid #fde68a" }}>
                    <td style={{ padding: "12px 14px" }} />
                    <td style={{ padding: "12px 14px", fontWeight: 800, color: "#111827", fontSize: 13 }}>TOTAL</td>
                    <td style={{ padding: "12px 14px", color: "#6b7280", fontSize: 12 }}>All Products</td>
                    <td style={{ padding: "12px 14px" }} />
                    <td style={{ padding: "12px 14px" }} />
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, fontSize: 16, color: "#16a34a" }}>{totalUnits}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, fontSize: 16, color: "#1d4ed8", background: "#eff6ff" }}>{totalCartons}</td>
                    <td style={{ padding: "12px 14px", textAlign: "right", background: "#fef3c7" }}>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <span style={{ fontSize: 10, color: "#92400e", opacity: 0.7 }}>Grand Total</span>
                        <span style={{ fontWeight: 800, fontSize: 16, color: "#92400e" }}>{fmt(grandTotalPrice)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
        </>
      )}

      {/* Professional Physical Inventory Count & Audit Sheet Modal */}
      {showInventorySheet && Boolean(selectedStore) && (
        <InventorySheetDialog
          open={showInventorySheet}
          onOpenChange={setShowInventorySheet}
          storeId={selectedStore}
          storeName={selectedStoreName || "Store"}
          items={inventorySheetItems}
          companyName={settings?.ecommerceName || "YESERAHUT STOCK MANAGEMENT"}
          companyPhone={settings?.companyPhone || settings?.phone}
          companyAddress={settings?.companyAddress || settings?.address}
          companyLogo={settings?.ecommerceLogo}
        />
      )}
    </div>
  );
}
