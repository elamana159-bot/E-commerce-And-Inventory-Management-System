import { useState, useRef, useMemo } from "react";
import {
  Printer,
  FileDown,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Search,
  Check,
  AlertTriangle,
  ClipboardList,
  RotateCcw,
  Sparkles,
  UserCheck,
  Package,
  X,
  FileText,
  Loader2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { printElement } from "@/lib/printUtils";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { formatSafeDate } from "@/lib/dateUtils";
import { exportToExcel } from "@/lib/shareImage";
import { useToast } from "@/hooks/use-toast";
import { exportInventorySheetPdf } from "@/inventorySheetPdfExport";
import * as XLSX from "xlsx";

export interface InventorySheetItem {
  productId: string;
  productName: string;
  productCode: string;
  photoUrl?: string;
  quantityPerCarton: number;
  systemQuantity: number; // in pieces / units
  systemCartons: number; // in full cartons
}

export interface InventoryItemCountState {
  verified: boolean;
  physicalCartons: string;
  physicalPieces: string;
  damagePieces: string;
  remark: string;
}

interface InventorySheetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeName: string;
  storeId: string;
  items: InventorySheetItem[];
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
  companyLogo?: string;
}

export default function InventorySheetDialog({
  open,
  onOpenChange,
  storeName,
  items,
  companyName = "YESERAHUT STOCK MANAGEMENT",
  companyPhone,
  companyAddress,
  companyLogo,
}: InventorySheetDialogProps) {
  const { toast } = useToast();
  const printSheetRef = useRef<HTMLDivElement>(null);

  // Filter & Search states
  const [searchTerm, setSearchTerm] = useState("");
  const [hideZeroBalance, setHideZeroBalance] = useState(false);
  const [blankCountMode, setBlankCountMode] = useState(false);

  // Metadata states
  const [auditorName, setAuditorName] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [countRefNo] = useState(() => {
    const d = new Date();
    const datePart = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const rand = Math.floor(100 + Math.random() * 900);
    return `INV-${datePart}-${rand}`;
  });

  // Per-item counting state (for interactive verification on laptop/tablet)
  const [itemStates, setItemStates] = useState<Record<string, InventoryItemCountState>>({});
  const [exportingPdf, setExportingPdf] = useState(false);

  // Initialize or get item state helper
  const getItemState = (productId: string): InventoryItemCountState => {
    return (
      itemStates[productId] || {
        verified: false,
        physicalCartons: "",
        physicalPieces: "",
        damagePieces: "",
        remark: "",
      }
    );
  };

  const updateItemState = (productId: string, patch: Partial<InventoryItemCountState>) => {
    setItemStates(prev => ({
      ...prev,
      [productId]: {
        ...(prev[productId] || {
          verified: false,
          physicalCartons: "",
          physicalPieces: "",
          damagePieces: "",
          remark: "",
        }),
        ...patch,
      },
    }));
  };

  // Filtered item list
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (hideZeroBalance && item.systemQuantity <= 0) return false;
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        (item.productName || "").toLowerCase().includes(q) ||
        (item.productCode || "").toLowerCase().includes(q)
      );
    });
  }, [items, searchTerm, hideZeroBalance]);

  // Overall totals calculation
  const totals = useMemo(() => {
    let totalSysPcs = 0;
    let totalSysCtns = 0;
    let totalPhysPcs = 0;
    let totalDamagePcs = 0;
    let verifiedCount = 0;

    for (const item of filteredItems) {
      totalSysPcs += item.systemQuantity;
      totalSysCtns += item.systemCartons;
      const st = itemStates[item.productId];
      if (st?.verified) verifiedCount++;
      if (st?.damagePieces) {
        totalDamagePcs += Number(st.damagePieces) || 0;
      }
      const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;
      const ctnVal = st?.physicalCartons ? Number(st.physicalCartons) || 0 : 0;
      const pcsVal = st?.physicalPieces ? Number(st.physicalPieces) || 0 : 0;
      if (st?.physicalCartons !== "" || st?.physicalPieces !== "") {
        totalPhysPcs += ctnVal * qpc + pcsVal;
      }
    }

    return {
      totalProducts: filteredItems.length,
      totalSysPcs,
      totalSysCtns,
      totalPhysPcs,
      totalDamagePcs,
      verifiedCount,
    };
  }, [filteredItems, itemStates]);

  // Quick Action: Verify All
  const handleVerifyAll = () => {
    const next: Record<string, InventoryItemCountState> = { ...itemStates };
    for (const item of filteredItems) {
      const cur = next[item.productId] || {
        verified: false,
        physicalCartons: "",
        physicalPieces: "",
        damagePieces: "",
        remark: "",
      };
      next[item.productId] = { ...cur, verified: true };
    }
    setItemStates(next);
    toast({ title: "All visible items marked verified", description: `${filteredItems.length} products verified.` });
  };

  // Quick Action: Fill Physical Counts from System
  const handleFillFromSystem = () => {
    const next: Record<string, InventoryItemCountState> = { ...itemStates };
    for (const item of filteredItems) {
      const cur = next[item.productId] || {
        verified: false,
        physicalCartons: "",
        physicalPieces: "",
        damagePieces: "",
        remark: "",
      };
      const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;
      const ctns = Math.floor(Math.max(0, item.systemQuantity) / qpc);
      const remPcs = Math.max(0, item.systemQuantity) % qpc;
      next[item.productId] = {
        ...cur,
        verified: true,
        physicalCartons: ctns > 0 ? String(ctns) : "0",
        physicalPieces: remPcs > 0 ? String(remPcs) : "0",
      };
    }
    setItemStates(next);
    toast({ title: "Pre-filled physical counts from system balance" });
  };

  // Quick Action: Reset All Counts
  const handleResetCounts = () => {
    setItemStates({});
    toast({ title: "Count inputs reset" });
  };

  // Print Handler (Full landscape A4 print)
  const handlePrint = () => {
    if (!printSheetRef.current) return;
    printElement(printSheetRef.current, {
      title: `Inventory_Count_Sheet_${(storeName || "Store").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}`,
      orientation: "landscape",
    });
  };

  // Excel Export Handler (Landscape with optimal column widths)
  const handleExportExcel = async () => {
    try {
      const wb = XLSX.utils.book_new();
      const ethDate = formatEthDate(new Date(), { includeGregorian: true });

      const headerAoa: any[][] = [
        [companyName.toUpperCase()],
        [`PHYSICAL INVENTORY COUNT & AUDIT SHEET (የእቃ ቆጠራ እና የክምችት ቁጥጥር ሰነድ)`],
        [`Store Name: ${storeName.toUpperCase()} | Audit Ref: ${countRefNo}`],
        [`Date: ${ethDate} | Auditor / Counter: ${auditorName || "____________________"}`],
        [`Supervisor: ${supervisorName || "____________________"} | Total Items: ${filteredItems.length}`],
        [""],
        [
          "No. (ተ.ቁ)",
          "Product Code (የእቃ ኮድ)",
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

      for (let i = 0; i < filteredItems.length; i++) {
        const it = filteredItems[i];
        const st = getItemState(it.productId);
        const qpc = it.quantityPerCarton > 0 ? it.quantityPerCarton : 1;
        const ctnNum = st.physicalCartons !== "" ? Number(st.physicalCartons) : null;
        const pcsNum = st.physicalPieces !== "" ? Number(st.physicalPieces) : null;
        let totalCounted: number | string = "";
        let variance: number | string = "";

        if (ctnNum !== null || pcsNum !== null) {
          const tot = (ctnNum || 0) * qpc + (pcsNum || 0);
          totalCounted = tot;
          variance = tot - it.systemQuantity;
        }

        headerAoa.push([
          i + 1,
          it.productCode || "—",
          it.quantityPerCarton || 1,
          blankCountMode ? "" : it.systemQuantity,
          blankCountMode ? "" : it.systemCartons,
          st.verified ? "[ ✓ ]" : "[   ]",
          st.physicalCartons !== "" ? st.physicalCartons : "",
          st.physicalPieces !== "" ? st.physicalPieces : "",
          totalCounted,
          st.damagePieces !== "" ? st.damagePieces : "",
          variance,
          st.remark || "",
        ]);
      }

      // Summary Footer Row
      headerAoa.push([
        "TOTALS",
        `${filteredItems.length} Products`,
        "",
        blankCountMode ? "" : totals.totalSysPcs,
        blankCountMode ? "" : totals.totalSysCtns,
        `${totals.verifiedCount} Verified`,
        "",
        "",
        totals.totalPhysPcs > 0 ? totals.totalPhysPcs : "",
        totals.totalDamagePcs > 0 ? totals.totalDamagePcs : "",
        "",
        "",
      ]);

      // Signatures
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

      // Landscape Page Setup for Excel Printing
      ws["!pageSetup"] = {
        orientation: "landscape",
        fitToWidth: 1,
        fitToHeight: 0,
        paperSize: 9, // A4
        fitToPage: true,
      };

      // Set generous column widths to eliminate any clipping
      ws["!cols"] = [
        { wch: 8 },  // No
        { wch: 22 }, // Code
        { wch: 12 }, // Qty/Ctn
        { wch: 18 }, // Sys Pcs
        { wch: 18 }, // Sys Ctns
        { wch: 14 }, // Verified
        { wch: 16 }, // Phys Ctns
        { wch: 16 }, // Phys Pcs
        { wch: 18 }, // Total Counted
        { wch: 18 }, // Damage
        { wch: 14 }, // Variance
        { wch: 32 }, // Remark
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Inventory_Count_Sheet");

      await exportToExcel({
        workbook: wb,
        filename: `Inventory_Count_Sheet_${(storeName || "Store").replace(/\s+/g, "_")}.xlsx`,
        title: `PHYSICAL INVENTORY COUNT SHEET - ${storeName.toUpperCase()}`,
        subtitle: `Generated: ${ethDate} | Ref: ${countRefNo}`,
      });

      toast({ title: "Inventory Count Sheet exported to Excel (Landscape)" });
    } catch (err) {
      console.error("Excel export error:", err);
      toast({ title: "Export failed", description: String(err), variant: "destructive" });
    }
  };

  // PDF Export Handler (Landscape A4, all 13 columns, zero cutoff)
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const sheetItems = filteredItems.map(it => {
        const st = getItemState(it.productId);
        const qpc = it.quantityPerCarton > 0 ? it.quantityPerCarton : 1;
        const ctnNum = st.physicalCartons !== "" ? Number(st.physicalCartons) : null;
        const pcsNum = st.physicalPieces !== "" ? Number(st.physicalPieces) : null;
        let totalCounted: number | string = "";
        let variance: number | string = "";

        if (ctnNum !== null || pcsNum !== null) {
          const tot = (ctnNum || 0) * qpc + (pcsNum || 0);
          totalCounted = tot;
          const diff = tot - it.systemQuantity;
          variance = diff > 0 ? `+${diff}` : String(diff);
        }

        return {
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          quantityPerCarton: it.quantityPerCarton,
          systemQuantity: it.systemQuantity,
          systemCartons: it.systemCartons,
          verified: st.verified,
          physicalCartons: st.physicalCartons,
          physicalPieces: st.physicalPieces,
          totalPhysical: totalCounted,
          damagePieces: st.damagePieces,
          variance,
          remark: st.remark,
        };
      });

      const res = await exportInventorySheetPdf({
        storeName,
        companyName,
        companyAddress,
        companyPhone,
        companyLogo,
        auditRef: countRefNo,
        auditorName,
        supervisorName,
        items: sheetItems,
        blankCountMode,
        totals,
      });

      if (res === "shared") {
        toast({ title: "Inventory Sheet PDF shared successfully" });
      } else if (res === "downloaded") {
        toast({ title: "Inventory Sheet PDF downloaded (Landscape)" });
      }
    } catch (err) {
      console.error("PDF export error:", err);
      toast({ title: "PDF export failed", description: String(err), variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl max-h-[96vh] flex flex-col p-3 sm:p-6 overflow-hidden">
        <DialogHeader className="pb-3 border-b flex-shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <DialogTitle className="text-base sm:text-xl font-bold flex items-center gap-2 flex-wrap">
                <ClipboardList className="w-5 h-5 text-primary flex-shrink-0" />
                <span>Physical Inventory Count & Audit Sheet</span>
                <Badge variant="secondary" className="font-mono text-xs font-semibold">
                  {storeName}
                </Badge>
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                የእቃ ቆጠራ እና የክምችት ቁጥጥር ሰነድ — Print ready with product codes, system balance, verification tick boxes, count & damage entry cells.
              </p>
            </div>

            {/* Header Actions: Responsive on Mobile, Tablet, and PC */}
            <div className="flex items-center gap-1.5 flex-wrap self-stretch sm:self-auto justify-end">
              <Button
                variant="default"
                size="sm"
                onClick={handlePrint}
                className="flex-1 sm:flex-initial gap-1.5 font-semibold shadow-xs min-h-[38px] sm:min-h-[36px]"
                data-testid="btn-modal-print-inventory-sheet"
                title="Print count sheet (Landscape A4)"
              >
                <Printer className="w-4 h-4" />
                <span className="whitespace-nowrap">Print Sheet (አትም)</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportExcel}
                className="flex-1 sm:flex-initial gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950/40 font-semibold min-h-[38px] sm:min-h-[36px]"
                data-testid="btn-modal-excel-inventory-sheet"
                title="Export count sheet to Excel (Landscape)"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span className="whitespace-nowrap">Excel (ኤክሴል)</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportPdf}
                disabled={exportingPdf}
                className="flex-1 sm:flex-initial gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40 font-semibold min-h-[38px] sm:min-h-[36px]"
                data-testid="btn-modal-pdf-inventory-sheet"
                title="Export count sheet to PDF (Landscape A4, zero cutoff)"
              >
                {exportingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                ) : (
                  <FileText className="w-4 h-4 text-rose-600" />
                )}
                <span className="whitespace-nowrap">PDF (ፒዲኤፍ)</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Interactive Controls & Options Bar */}
        <div className="py-2.5 px-3 bg-muted/30 border rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs flex-shrink-0 my-2">
          {/* Search and Filters */}
          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-[260px]">
            <div className="relative w-48 sm:w-60">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search code or product..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-muted-foreground hover:text-foreground">
              <Checkbox
                checked={hideZeroBalance}
                onCheckedChange={v => setHideZeroBalance(Boolean(v))}
              />
              <span>Hide 0 Balance</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none text-muted-foreground hover:text-foreground" title="Hide system numbers for blind counting">
              <Checkbox
                checked={blankCountMode}
                onCheckedChange={v => setBlankCountMode(Boolean(v))}
              />
              <span>Blind Count Sheet (ባዶ ቆጠራ)</span>
            </label>
          </div>

          {/* Quick interactive helpers */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleVerifyAll}
              className="h-7 text-[11px] px-2 gap-1 text-primary"
              title="Tick all verified boxes"
            >
              <CheckSquare className="w-3.5 h-3.5" /> Tick All (ሁሉንም ማረጋገጫ)
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleFillFromSystem}
              className="h-7 text-[11px] px-2 gap-1 text-emerald-700 dark:text-emerald-300"
              title="Pre-fill physical count inputs with system numbers"
            >
              <Sparkles className="w-3.5 h-3.5" /> Fill from System
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetCounts}
              className="h-7 text-[11px] px-2 gap-1 text-muted-foreground hover:text-destructive"
              title="Reset entered physical counts"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </Button>
          </div>
        </div>

        {/* Printable & Interactive Inventory Count Sheet Content */}
        <div className="flex-1 overflow-y-auto pr-1 border rounded-lg bg-card">
          <div
            ref={printSheetRef}
            className="p-4 sm:p-6 bg-white text-black font-sans print:p-0 print:m-0"
            style={{ minWidth: "900px" }}
          >
            {/* Print Only CSS */}
            <style type="text/css">{`
              @media print {
                @page {
                  size: A4 landscape;
                  margin: 8mm;
                }
                body {
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                  background: #fff !important;
                  color: #000 !important;
                }
                .no-print { display: none !important; }
                .print-only { display: block !important; }
                table { page-break-inside: auto; }
                tr { page-break-inside: avoid; page-break-after: auto; }
                thead { display: table-header-group; }
                tfoot { display: table-footer-group; }
              }
            `}</style>

            {/* Official Document Header */}
            <div className="border-b-2 border-black pb-4 mb-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {companyLogo ? (
                    <img src={companyLogo} alt="Logo" className="w-12 h-12 object-contain" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-slate-900 text-white flex items-center justify-center font-bold text-lg">
                      YS
                    </div>
                  )}
                  <div>
                    <h1 className="text-lg sm:text-xl font-extrabold uppercase tracking-tight text-black">
                      {companyName}
                    </h1>
                    <h2 className="text-sm font-bold text-slate-800 tracking-normal flex items-center gap-2">
                      <span>PHYSICAL INVENTORY COUNT & AUDIT SHEET</span>
                      <span className="font-normal text-xs text-slate-600">(የእቃ ቆጠራ እና የክምችት ቁጥጥር ሰነድ)</span>
                    </h2>
                    {(companyPhone || companyAddress) && (
                      <p className="text-[11px] text-slate-600">
                        {[companyAddress, companyPhone && `Tel: ${companyPhone}`].filter(Boolean).join(" • ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="text-right text-xs space-y-1">
                  <div className="inline-block px-2.5 py-1 bg-slate-100 border border-slate-300 rounded font-mono font-bold text-[11px]">
                    REF: {countRefNo}
                  </div>
                  <div className="text-[11px] text-slate-700">
                    <strong>Date (ቀን):</strong> {formatSafeDate(new Date())}
                  </div>
                  <div className="text-[11px] text-slate-700">
                    <strong>Ethiopian Date:</strong> {formatEthDate(new Date(), { short: false })}
                  </div>
                </div>
              </div>

              {/* Audit Meta Grid */}
              <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-slate-300 text-xs bg-slate-50/80 p-2.5 rounded border">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">STORE / WAREHOUSE (ስቶር)</span>
                  <strong className="text-xs text-black font-extrabold">{storeName}</strong>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">AUDITOR / COUNTER (የቆጠረው)</span>
                  <input
                    type="text"
                    placeholder="Name / Signature..."
                    value={auditorName}
                    onChange={e => setAuditorName(e.target.value)}
                    className="w-full bg-transparent border-b border-dotted border-slate-400 focus:outline-none focus:border-black text-xs font-semibold py-0.5 print:border-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">SUPERVISOR (ተቆጣጣሪ)</span>
                  <input
                    type="text"
                    placeholder="Supervisor Name..."
                    value={supervisorName}
                    onChange={e => setSupervisorName(e.target.value)}
                    className="w-full bg-transparent border-b border-dotted border-slate-400 focus:outline-none focus:border-black text-xs font-semibold py-0.5 print:border-none"
                  />
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">COUNT TYPE (የቆጠራ አይነት)</span>
                  <span className="font-semibold text-slate-800">Physical Stock Count / 100% Audit</span>
                </div>
              </div>
            </div>

            {/* Inventory Count Table */}
            <div className="overflow-x-auto">
              <table
                className="w-full border-collapse text-xs"
                style={{ border: "1.5px solid #000", width: "100%" }}
              >
                <thead>
                  <tr style={{ background: "#f1f5f9", borderBottom: "1.5px solid #000" }}>
                    <th className="p-1.5 border border-slate-400 text-center w-8 font-bold text-slate-900">#</th>
                    <th className="p-1.5 border border-slate-400 text-left w-28 font-bold text-slate-900">Code (ኮድ)</th>
                    <th className="p-1.5 border border-slate-400 text-center w-16 font-bold text-slate-900">Qty/Ctn</th>
                    
                    {/* Expected System Balance */}
                    <th colSpan={2} className="p-1.5 border border-slate-400 text-center bg-blue-50/70 font-extrabold text-blue-950">
                      System Balance (ያሉኝ Product Balance)
                    </th>

                    {/* Tick Box Check */}
                    <th className="p-1.5 border border-slate-400 text-center w-16 bg-slate-100 font-bold text-slate-900" title="Tick when verified">
                      Tick [ ✓ ]
                    </th>

                    {/* Physical Counted Balance */}
                    <th colSpan={2} className="p-1.5 border border-slate-400 text-center bg-amber-50/70 font-extrabold text-amber-950">
                      Physical Count (የተቆጠረ ቀሪ)
                    </th>

                    {/* Damage / Expired Box */}
                    <th className="p-1.5 border border-slate-400 text-center w-24 bg-red-50/60 font-bold text-red-950">
                      Damage / Expired (ዳሜጅ/ብልሽት)
                    </th>

                    {/* Variance */}
                    <th className="p-1.5 border border-slate-400 text-center w-16 font-bold text-slate-900">
                      Variance (+/-)
                    </th>

                    {/* Remark */}
                    <th className="p-1.5 border border-slate-400 text-left w-36 font-bold text-slate-900">
                      Remark (ማስታወሻ)
                    </th>
                  </tr>
                  {/* Secondary Header Row for Subdivisions */}
                  <tr style={{ background: "#f8fafc", borderBottom: "1.5px solid #000" }} className="text-[10px] text-slate-700">
                    <th className="border border-slate-400" colSpan={3}></th>
                    <th className="p-1 border border-slate-400 text-right w-16 bg-blue-50/40 font-bold">Pcs (ፍሬ)</th>
                    <th className="p-1 border border-slate-400 text-right w-16 bg-blue-50/40 font-bold">Ctns (ካርቶን)</th>
                    <th className="p-1 border border-slate-400 text-center bg-slate-100 font-semibold">Verify</th>
                    <th className="p-1 border border-slate-400 text-center w-16 bg-amber-50/40 font-bold">Ctns</th>
                    <th className="p-1 border border-slate-400 text-center w-16 bg-amber-50/40 font-bold">Pcs</th>
                    <th className="p-1 border border-slate-400 text-center bg-red-50/30 font-bold">Pcs</th>
                    <th className="p-1 border border-slate-400 text-center font-semibold">Diff</th>
                    <th className="p-1 border border-slate-400 text-left font-semibold">Notes / Location</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredItems.map((item, idx) => {
                    const st = getItemState(item.productId);
                    const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;
                    const ctnVal = st.physicalCartons !== "" ? Number(st.physicalCartons) : null;
                    const pcsVal = st.physicalPieces !== "" ? Number(st.physicalPieces) : null;
                    const hasCount = ctnVal !== null || pcsVal !== null;
                    const totalPhysical = hasCount ? (ctnVal || 0) * qpc + (pcsVal || 0) : null;
                    const diff = totalPhysical !== null ? totalPhysical - item.systemQuantity : null;

                    return (
                      <tr
                        key={item.productId}
                        className={`hover:bg-slate-50/80 transition-colors ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                        style={{ borderBottom: "1px solid #cbd5e1" }}
                      >
                        {/* 1. Sequential Index */}
                        <td className="p-1.5 border border-slate-300 text-center font-mono text-slate-500 font-medium">
                          {idx + 1}
                        </td>

                        {/* 2. Product Code */}
                        <td className="p-1.5 border border-slate-300 font-mono font-bold text-black whitespace-nowrap">
                          {item.productCode || "—"}
                        </td>

                        {/* 3. Qty per Carton */}
                        <td className="p-1.5 border border-slate-300 text-center text-slate-600 font-medium">
                          {item.quantityPerCarton || 1}
                        </td>

                        {/* 4. System Balance Pieces */}
                        <td className="p-1.5 border border-slate-300 text-right font-bold text-blue-900 bg-blue-50/20">
                          {blankCountMode ? (
                            <span className="text-slate-300">____</span>
                          ) : (
                            <span className={item.systemQuantity < 0 ? "text-red-600" : ""}>
                              {item.systemQuantity}
                            </span>
                          )}
                        </td>

                        {/* 6. System Balance Cartons */}
                        <td className="p-1.5 border border-slate-300 text-right font-semibold text-slate-700 bg-blue-50/20">
                          {blankCountMode ? (
                            <span className="text-slate-300">____</span>
                          ) : (
                            <span>{item.systemCartons}</span>
                          )}
                        </td>

                        {/* 7. Verification Tick Box */}
                        <td className="p-1.5 border border-slate-300 text-center bg-slate-50/60">
                          <div className="flex items-center justify-center">
                            {/* Interactive screen checkbox */}
                            <button
                              type="button"
                              onClick={() => updateItemState(item.productId, { verified: !st.verified })}
                              className="print:hidden w-5 h-5 rounded border border-slate-400 flex items-center justify-center hover:border-black transition-colors focus:outline-none"
                              title="Click to mark item as verified"
                            >
                              {st.verified ? (
                                <Check className="w-4 h-4 text-emerald-600 stroke-[3]" />
                              ) : null}
                            </button>

                            {/* Crisp print-only check square */}
                            <span
                              className="hidden print:inline-block w-4 h-4 border border-black text-center leading-3 font-bold text-xs"
                              style={{ width: "16px", height: "16px", borderWidth: "1.5px" }}
                            >
                              {st.verified ? "✓" : ""}
                            </span>
                          </div>
                        </td>

                        {/* 8. Physical Count Cartons Box */}
                        <td className="p-1 border border-slate-300 text-center bg-amber-50/20">
                          <input
                            type="number"
                            min="0"
                            placeholder="ctn"
                            value={st.physicalCartons}
                            onChange={e => updateItemState(item.productId, { physicalCartons: e.target.value })}
                            className="w-12 text-center border border-slate-300 rounded px-1 py-0.5 text-xs font-bold text-black focus:outline-none focus:border-amber-600 print:hidden"
                          />
                          <span className="hidden print:inline-block w-12 text-center text-xs border-b border-black">
                            {st.physicalCartons || "\u00A0\u00A0\u00A0\u00A0\u00A0"}
                          </span>
                        </td>

                        {/* 8b. Physical Count Pieces Box */}
                        <td className="p-1 border border-slate-300 text-center bg-amber-50/20">
                          <input
                            type="number"
                            min="0"
                            placeholder="pcs"
                            value={st.physicalPieces}
                            onChange={e => updateItemState(item.productId, { physicalPieces: e.target.value })}
                            className="w-12 text-center border border-slate-300 rounded px-1 py-0.5 text-xs font-bold text-black focus:outline-none focus:border-amber-600 print:hidden"
                          />
                          <span className="hidden print:inline-block w-12 text-center text-xs border-b border-black">
                            {st.physicalPieces || "\u00A0\u00A0\u00A0\u00A0\u00A0"}
                          </span>
                        </td>

                        {/* 9. Damage / Expired / Expense Box */}
                        <td className="p-1 border border-slate-300 text-center bg-red-50/20">
                          <input
                            type="number"
                            min="0"
                            placeholder="dmg"
                            value={st.damagePieces}
                            onChange={e => updateItemState(item.productId, { damagePieces: e.target.value })}
                            className="w-14 text-center border border-red-300 rounded px-1 py-0.5 text-xs font-semibold text-red-700 focus:outline-none focus:border-red-600 print:hidden"
                          />
                          <span className="hidden print:inline-block w-14 text-center text-xs border-b border-black text-red-800">
                            {st.damagePieces || "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0"}
                          </span>
                        </td>

                        {/* 10. Variance (+/-) */}
                        <td className="p-1.5 border border-slate-300 text-center font-bold">
                          {diff !== null ? (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[11px] ${
                                diff === 0
                                  ? "text-emerald-700 bg-emerald-50 print:bg-transparent"
                                  : diff > 0
                                  ? "text-blue-700 bg-blue-50 print:bg-transparent"
                                  : "text-red-700 bg-red-50 print:bg-transparent"
                              }`}
                            >
                              {diff > 0 ? `+${diff}` : diff}
                            </span>
                          ) : (
                            <span className="text-slate-300 print:text-black">____</span>
                          )}
                        </td>

                        {/* 11. Remark / Notes */}
                        <td className="p-1 border border-slate-300">
                          <input
                            type="text"
                            placeholder="Location / condition..."
                            value={st.remark}
                            onChange={e => updateItemState(item.productId, { remark: e.target.value })}
                            className="w-full bg-transparent border border-slate-200 rounded px-1.5 py-0.5 text-xs text-slate-800 focus:outline-none focus:border-black print:hidden"
                          />
                          <span className="hidden print:inline-block w-full text-xs text-slate-800">
                            {st.remark || "\u00A0"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={11} className="text-center py-10 text-slate-500 italic">
                        No products match the selected criteria.
                      </td>
                    </tr>
                  )}
                </tbody>

                {/* Table Footer Totals */}
                <tfoot style={{ borderTop: "2px solid #000", background: "#f8fafc" }}>
                  <tr className="font-extrabold text-slate-900">
                    <td colSpan={3} className="p-2 border border-slate-400 text-right uppercase tracking-wider">
                      TOTALS ({filteredItems.length} Products):
                    </td>
                    <td className="p-2 border border-slate-400 text-right text-blue-900 bg-blue-50/40 font-black">
                      {blankCountMode ? "—" : totals.totalSysPcs.toLocaleString()}
                    </td>
                    <td className="p-2 border border-slate-400 text-right text-slate-800 bg-blue-50/40 font-bold">
                      {blankCountMode ? "—" : totals.totalSysCtns.toLocaleString()}
                    </td>
                    <td className="p-2 border border-slate-400 text-center text-emerald-800 bg-slate-100">
                      {totals.verifiedCount}/{filteredItems.length} ✓
                    </td>
                    <td colSpan={2} className="p-2 border border-slate-400 text-center bg-amber-50/40 text-amber-900">
                      {totals.totalPhysPcs > 0 ? `${totals.totalPhysPcs.toLocaleString()} pcs` : "—"}
                    </td>
                    <td className="p-2 border border-slate-400 text-center bg-red-50/30 text-red-700">
                      {totals.totalDamagePcs > 0 ? `${totals.totalDamagePcs.toLocaleString()} pcs` : "—"}
                    </td>
                    <td colSpan={2} className="p-2 border border-slate-400 text-left text-slate-500 text-[10px]">
                      Physical Count Summary
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Official Signatures and Audit Sign-off Block */}
            <div className="mt-8 pt-4 border-t-2 border-slate-800 space-y-4">
              <div className="text-[11px] text-slate-600 italic">
                <strong>መግለጫ / Audit Note:</strong> ይህ የእቃ ቆጠራ ሰነድ በመጋዘኑ ውስጥ ያሉትን እቃዎች በአካል በመቁጠር ትክክለኝነታቸው የተረጋገጠበት ይፋዊ ሰነድ ነው። የተገኘው የቆጠራ ልዩነት ወይም ብልሽት ወዲያውኑ ለኦዲት እና አስተዳደር መቅረብ አለበት። (This inventory sheet certifies the physical count of stock items. All discrepancies and damages must be reconciled.)
              </div>

              <div className="grid grid-cols-4 gap-4 pt-3">
                {/* 1. Prepared By */}
                <div className="border p-2.5 rounded bg-slate-50/60 text-xs">
                  <span className="font-bold text-slate-700 block uppercase text-[10px]">PREPARED BY (ያዘጋጀው)</span>
                  <div className="mt-4 pt-2 border-t border-slate-400 space-y-1">
                    <div className="text-[10px] text-slate-500">Name: ______________________</div>
                    <div className="text-[10px] text-slate-500">Sign & Date: ________________</div>
                  </div>
                </div>

                {/* 2. Audited / Counted By */}
                <div className="border p-2.5 rounded bg-slate-50/60 text-xs">
                  <span className="font-bold text-slate-700 block uppercase text-[10px]">AUDITOR / COUNTER (የቆጠረው)</span>
                  <div className="mt-4 pt-2 border-t border-slate-400 space-y-1">
                    <div className="text-[10px] text-slate-500">Name: {auditorName || "______________________"}</div>
                    <div className="text-[10px] text-slate-500">Sign & Date: ________________</div>
                  </div>
                </div>

                {/* 3. Storekeeper */}
                <div className="border p-2.5 rounded bg-slate-50/60 text-xs">
                  <span className="font-bold text-slate-700 block uppercase text-[10px]">STOREKEEPER (የስቶር ኃላፊ)</span>
                  <div className="mt-4 pt-2 border-t border-slate-400 space-y-1">
                    <div className="text-[10px] text-slate-500">Name: ______________________</div>
                    <div className="text-[10px] text-slate-500">Sign & Date: ________________</div>
                  </div>
                </div>

                {/* 4. Approved By */}
                <div className="border p-2.5 rounded bg-slate-50/60 text-xs">
                  <span className="font-bold text-slate-700 block uppercase text-[10px]">APPROVED BY (ያጸደቀው ኃላፊ)</span>
                  <div className="mt-4 pt-2 border-t border-slate-400 space-y-1">
                    <div className="text-[10px] text-slate-500">Name: {supervisorName || "______________________"}</div>
                    <div className="text-[10px] text-slate-500">Sign & Date: ________________</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <DialogFooter className="pt-3 border-t flex-shrink-0 sm:justify-between items-center gap-3">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span>{filteredItems.length} Products listed</span>
            <span>•</span>
            <span className="text-blue-700 dark:text-blue-400 font-semibold">
              {totals.totalSysPcs.toLocaleString()} Total System Units ({totals.totalSysCtns} Cartons)
            </span>
            {totals.verifiedCount > 0 && (
              <>
                <span>•</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                  {totals.verifiedCount} Verified
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportExcel}
              className="gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Export Excel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handlePrint}
              className="gap-1.5 font-semibold"
            >
              <Printer className="w-4 h-4" /> Print Sheet
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
