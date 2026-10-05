import { useState, useEffect, useRef } from "react";
import {
  Plus, Search, Trash2, Printer, FileDown, ChevronDown, X,
  Pencil, Calculator, Sparkles, TrendingUp, History,
  Info, ArrowRight, CheckCircle2, ChevronRight, RefreshCw, BarChart2,
  Box, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { getAll, create, update, remove, COLLECTIONS, subscribeCollection } from "@/lib/firestore";
import { fmt } from "@/lib/currency";
import type { Product, PricingRecord, StockIn, PurchaseCostRecord } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { exportToExcel } from "@/lib/shareImage";
import {
  calculateWeightedAverageCost,
  calculateSellingPrice,
  simulateNewPurchaseWAC,
  type WeightedAverageCostResult,
  type SellingPriceCalculationResult
} from "@/lib/pricingCalculations";
import * as XLSX from "xlsx";

export default function Pricing() {
  const [products, setProducts] = useState<Product[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [stockIns, setStockIns] = useState<StockIn[]>([]);
  const [manualCostRecords, setManualCostRecords] = useState<PurchaseCostRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [editRecord, setEditRecord] = useState<PricingRecord | null>(null);
  const [form, setForm] = useState({ productId: "", unitCost: 0, profitMargin: 20, sellingPrice: 0, ecommercePiecePrice: 0 });
  const [productSearch, setProductSearch] = useState("");
  const [productDropdown, setProductDropdown] = useState(false);
  
  // WAC calculation states
  const [wacResult, setWacResult] = useState<WeightedAverageCostResult | null>(null);
  const [selectedCostMode, setSelectedCostMode] = useState<"wac" | "latest" | "custom">("wac");
  const [showBatchBreakdown, setShowBatchBreakdown] = useState(false);

  // New purchase simulation states
  const [showSimulateNewPurchase, setShowSimulateNewPurchase] = useState(false);
  const [simulatedQty, setSimulatedQty] = useState<number>(0);
  const [simulatedUnitCost, setSimulatedUnitCost] = useState<number>(0);

  // Inspection modal state from main table
  const [inspectModalOpen, setInspectModalOpen] = useState(false);
  const [inspectProduct, setInspectProduct] = useState<Product | null>(null);
  const [inspectWacResult, setInspectWacResult] = useState<WeightedAverageCostResult | null>(null);

  const productSearchRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();
  const tableRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    if (!tableRef.current) return;
    printElement(tableRef.current, "Pricing_List");
  }

  async function loadData() {
    setLoading(true);
    const [prods, prices, stkIns, manualRecs] = await Promise.all([
      getAll<Product>(COLLECTIONS.PRODUCTS),
      getAll<PricingRecord>(COLLECTIONS.PRICING),
      getAll<StockIn>(COLLECTIONS.STOCK_IN).catch(() => []),
      getAll<PurchaseCostRecord>(COLLECTIONS.PURCHASE_COST_HISTORY).catch(() => []),
    ]);
    setProducts(prods.filter(p => !p.isVoided));
    setPricing(prices);
    setStockIns(stkIns.filter(s => !s.isVoided && s.status !== "voided"));
    setManualCostRecords(manualRecs.filter(m => !m.isVoided));
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const unsubPricing = subscribeCollection<PricingRecord>(COLLECTIONS.PRICING, (data) => {
      setPricing(data);
    });
    const unsubProds = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, (p) => setProducts(p.filter(x => !x.isVoided)));
    const unsubStk = subscribeCollection<StockIn>(COLLECTIONS.STOCK_IN, (s) => setStockIns(s.filter(x => !x.isVoided && x.status !== "voided")));
    const unsubManual = subscribeCollection<PurchaseCostRecord>(COLLECTIONS.PURCHASE_COST_HISTORY, (m) => setManualCostRecords(m.filter(x => !x.isVoided)));

    return () => {
      unsubPricing();
      unsubProds();
      unsubStk();
      unsubManual();
    };
  }, []);

  const selectedProduct = products.find(p => p.id === form.productId);

  // Auto-recalculate selling price when unitCost or profitMargin changes
  useEffect(() => {
    const cost = form.unitCost;
    const margin = form.profitMargin;
    const calc = calculateSellingPrice(cost, margin, selectedProduct?.quantityPerCarton || 1);
    setForm(f => ({ ...f, sellingPrice: calc.sellingPrice }));
  }, [form.unitCost, form.profitMargin, selectedProduct?.quantityPerCarton]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (productSearchRef.current && !productSearchRef.current.contains(e.target as Node)) {
        setProductDropdown(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = pricing.filter(p =>
    (p.productName || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.productCode || "").toLowerCase().includes(search.toLowerCase())
  );

  // Products not yet priced (for add mode)
  const unpricedProducts = products.filter(p => !p.isVoided && !pricing.some(r => r.productId === p.id));
  // For edit mode, include the currently edited product too
  const availableProducts = editRecord
    ? products.filter(p => !p.isVoided && (!pricing.some(r => r.productId === p.id) || p.id === editRecord.productId))
    : unpricedProducts;

  const filteredProductOptions = availableProducts.filter(p =>
    Boolean(p) && (
      (p.name || "").toLowerCase().includes(productSearch.toLowerCase()) ||
      (p.code || "").toLowerCase().includes(productSearch.toLowerCase())
    )
  );

  // Primary function: when selecting a product to calculate Weighted Average Cost and auto-populate
  function selectProductForPricing(prod: Product) {
    const result = calculateWeightedAverageCost(prod.id, stockIns, manualCostRecords, prod);
    setWacResult(result);
    setSelectedCostMode("wac");
    setShowBatchBreakdown(false);
    setShowSimulateNewPurchase(false);
    setSimulatedQty(0);
    setSimulatedUnitCost(0);

    const defaultMargin = form.profitMargin > 0 ? form.profitMargin : 20;
    const chosenCost = result.weightedAverageCost > 0
      ? result.weightedAverageCost
      : (prod.purchasePrice || prod.unitCost || 0);

    const calc = calculateSellingPrice(chosenCost, defaultMargin, prod.quantityPerCarton);

    setForm(f => ({
      ...f,
      productId: prod.id,
      unitCost: chosenCost,
      profitMargin: defaultMargin,
      sellingPrice: calc.sellingPrice,
    }));
    setProductSearch(`${prod.name} (${prod.code})`);
    setProductDropdown(false);
  }

  function handleCostModeChange(mode: "wac" | "latest" | "custom") {
    setSelectedCostMode(mode);
    if (!wacResult) return;

    let newCost = form.unitCost;
    if (mode === "wac") {
      newCost = wacResult.weightedAverageCost;
    } else if (mode === "latest") {
      newCost = wacResult.latestPurchaseCost;
    }
    setForm(f => ({ ...f, unitCost: newCost }));
  }

  function applySimulatedCost() {
    if (!wacResult || simulatedQty <= 0 || simulatedUnitCost <= 0) return;
    const sim = simulateNewPurchaseWAC(wacResult, simulatedQty, simulatedUnitCost, form.profitMargin);
    setForm(f => ({
      ...f,
      unitCost: sim.simulatedResult.weightedAverageCost,
      sellingPrice: sim.simulatedSellingPrice.sellingPrice,
    }));
    setSelectedCostMode("custom");
    toast({
      title: "አዲሱ አማካይ ዋጋ ተተግብሯል",
      description: `አማካይ ዋጋ ወደ ${fmt(sim.simulatedResult.weightedAverageCost)} ተቀይሯል።`,
    });
  }

  function openAdd() {
    setEditRecord(null);
    setWacResult(null);
    setSelectedCostMode("wac");
    setShowBatchBreakdown(false);
    setShowSimulateNewPurchase(false);
    setSimulatedQty(0);
    setSimulatedUnitCost(0);
    setForm({ productId: "", unitCost: 0, profitMargin: 20, sellingPrice: 0, ecommercePiecePrice: 0 });
    setProductSearch("");
    setShowDialog(true);
  }

  function openEdit(r: PricingRecord) {
    setEditRecord(r);
    const prod = products.find(p => p.id === r.productId);
    if (prod) {
      const result = calculateWeightedAverageCost(prod.id, stockIns, manualCostRecords, prod);
      setWacResult(result);
      if (Math.abs(r.unitCost - result.weightedAverageCost) < 0.01) {
        setSelectedCostMode("wac");
      } else if (Math.abs(r.unitCost - result.latestPurchaseCost) < 0.01) {
        setSelectedCostMode("latest");
      } else {
        setSelectedCostMode("custom");
      }
    } else {
      setWacResult(null);
    }
    setShowBatchBreakdown(false);
    setShowSimulateNewPurchase(false);
    setSimulatedQty(0);
    setSimulatedUnitCost(0);
    setForm({
      productId: r.productId,
      unitCost: r.unitCost,
      profitMargin: r.profitMargin,
      sellingPrice: r.sellingPrice,
      ecommercePiecePrice: r.ecommercePiecePrice || 0,
    });
    setProductSearch(prod ? `${prod.name} (${prod.code})` : "");
    setShowDialog(true);
  }

  function openInspectModal(r: PricingRecord) {
    const prod = products.find(p => p.id === r.productId);
    if (!prod) return;
    const result = calculateWeightedAverageCost(prod.id, stockIns, manualCostRecords, prod);
    setInspectProduct(prod);
    setInspectWacResult(result);
    setInspectModalOpen(true);
  }

  async function handleSave() {
    if (!form.productId) { toast({ title: "Select a product", variant: "destructive" }); return; }
    if (!editRecord && pricing.some(r => r.productId === form.productId)) {
      toast({ title: "Price already exists", description: "This product already has a pricing record. Edit it instead.", variant: "destructive" }); return;
    }
    const prod = products.find(p => p.id === form.productId);
    const data = { ...form, productName: prod?.name || "", productCode: prod?.code || "" };
    if (editRecord) {
      await update(COLLECTIONS.PRICING, editRecord.id, data);
      toast({ title: "Price updated" });
    } else {
      await create(COLLECTIONS.PRICING, data);
      toast({ title: "Price saved" });
    }

    // Sync product's sellingPrice & piecePrice so POS & Sales reflect the pricing immediately
    if (prod && data.sellingPrice > 0) {
      await update(COLLECTIONS.PRODUCTS, prod.id, {
        sellingPrice: data.sellingPrice,
        piecePrice: data.sellingPrice,
        cartonPrice: (prod.quantityPerCarton || 1) > 1 ? Math.round(data.sellingPrice * prod.quantityPerCarton) : undefined,
      }).catch(err => console.warn("Failed updating product sellingPrice:", err));
    }

    setShowDialog(false);
    loadData();
  }

  function handleDelete(r: PricingRecord) {
    confirmDelete(async () => {
      await remove(COLLECTIONS.PRICING, r.id);
      toast({ title: "Deleted" });
      loadData();
    });
  }

  async function exportExcel() {
    const wb = XLSX.utils.book_new();
    const data = [
      ["Product", "Code", "Description", "Unit Cost (ETB)", "Margin %", "Selling Price (ETB)", "Carton Price (ETB)", "Units/Carton"],
      ...filtered.map(r => {
        const prod = products.find(p => p.id === r.productId);
        return [
          r.productName,
          r.productCode,
          prod?.description || "",
          r.unitCost,
          r.profitMargin,
          r.sellingPrice,
          r.sellingPrice * (prod?.quantityPerCarton || 1),
          prod?.quantityPerCarton || 1,
        ];
      }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, "Pricing");
    await exportToExcel({
      workbook: wb,
      filename: `pricing_list_${new Date().toISOString().slice(0, 10)}.xlsx`,
      title: "YESERAHUT PRICING MANAGEMENT REPORT",
      subtitle: `Total Pricing Records: ${pricing.length} | Export Date: ${new Date().toLocaleDateString()}`,
    });
  }

  // Calculated selling metrics
  const sellingCalc: SellingPriceCalculationResult = calculateSellingPrice(
    form.unitCost,
    form.profitMargin,
    selectedProduct?.quantityPerCarton || 1
  );

  // Simulated metrics if user typed into simulation fields
  const simulationResult = (wacResult && simulatedQty > 0 && simulatedUnitCost > 0)
    ? simulateNewPurchaseWAC(wacResult, simulatedQty, simulatedUnitCost, form.profitMargin)
    : null;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Pricing Management</h1>
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20 text-xs">
              WAC Moving Average Engine
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            በተለያየ ጊዜ የተገዙ ግዢዎችን እና የቆየውን ክምችት መሰረት በማድረግ የሚመዘን አማካይ ዋጋ (Weighted Average Cost) እና የሽያጭ ዋጋ መወሰኛ
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => handlePrint()} disabled={filtered.length === 0}>
            <Printer className="w-4 h-4 mr-2" /> Print
          </Button>
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0}>
            <FileDown className="w-4 h-4 mr-2" /> Excel
          </Button>
          <Button onClick={openAdd} data-testid="button-add-price" className="bg-primary text-primary-foreground shadow">
            <Plus className="w-4 h-4 mr-2" /> Add Price
          </Button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input
          className="pl-9"
          placeholder="Search products by name or code..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          data-testid="input-search-pricing"
        />
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : (
        <div ref={tableRef} className="rounded-md border overflow-x-auto bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Product", "Code", "Description", "Unit Cost (WAC)", "Margin %", "Unit Price", "E-com Price", "Carton Price", "Actions"].map(h => (
                  <th key={h} className="text-left px-4 py-3 font-semibold text-muted-foreground text-xs">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(r => {
                const prod = products.find(p => p.id === r.productId);
                const cartonPrice = r.sellingPrice * (prod?.quantityPerCarton || 1);
                return (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors" data-testid={`row-pricing-${r.id}`}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        {prod?.photoUrl && (
                          <img src={prod.photoUrl} alt="" className="w-7 h-7 rounded object-cover border flex-shrink-0" />
                        )}
                        <div>
                          <div className="font-semibold text-foreground">{r.productName}</div>
                          {prod && (
                            <span className="text-[11px] text-muted-foreground">
                              Stock: {prod.currentStock || 0} pcs
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs font-mono">{r.productCode}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs max-w-32 truncate">{prod?.description || "—"}</td>
                    <td className="px-4 py-3 text-xs font-medium">
                      <div className="flex items-center gap-1.5">
                        <span>{fmt(r.unitCost)}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50/50 text-blue-700 border-blue-200">
                          Cost
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-emerald-700">+{r.profitMargin}%</td>
                    <td className="px-4 py-3 font-bold text-primary">{fmt(r.sellingPrice)}</td>
                    <td className="px-4 py-3 text-xs font-medium text-violet-600">
                      {r.ecommercePiecePrice && r.ecommercePiecePrice > 0
                        ? <span className="font-semibold">{fmt(r.ecommercePiecePrice)}</span>
                        : <span className="text-muted-foreground text-xs italic">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-blue-600">
                      {prod && (prod.quantityPerCarton || 1) > 1
                        ? <span>{fmt(cartonPrice)}<span className="text-muted-foreground font-normal text-[11px]"> /{prod.quantityPerCarton} pcs</span></span>
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="px-4 py-3 print:hidden">
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-50"
                          onClick={() => openInspectModal(r)}
                          title="View Weighted Average Cost & Purchase Batches Analysis"
                        >
                          <BarChart2 className="w-3.5 h-3.5 mr-1" />
                          WAC Analysis
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-xs" data-testid={`button-actions-${r.id}`}>
                              Actions
                              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
                              {r.productName}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => openInspectModal(r)}>
                              <BarChart2 className="w-4 h-4 mr-2 text-blue-600" /> WAC Analysis
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openEdit(r)} data-testid={`button-edit-${r.id}`}>
                              <Pencil className="w-4 h-4 mr-2 text-amber-600" /> Edit Price
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(r)} className="text-destructive focus:text-destructive" data-testid={`button-delete-${r.id}`}>
                              <Trash2 className="w-4 h-4 mr-2" /> Delete Price
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Calculator className="w-8 h-8 text-muted-foreground/50" />
                      <p className="font-medium">ምንም የዋጋ መዝገብ አልተገኘም (No pricing records found)</p>
                      <p className="text-xs">Add Price የሚለውን በመጫን አዲስ የመሸጫ ዋጋ በአማካይ ወጪ ማስላት ይችላሉ።</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ADD / EDIT PRICE DIALOG WITH WAC ENGINE */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[92vh] overflow-y-auto max-w-3xl sm:max-w-3xl p-6">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Calculator className="w-4 h-4" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold">
                  {editRecord ? "Edit Product Price (የሽያጭ ዋጋ ማስተካከያ)" : "Add Product Price (አዲስ የሽያጭ ዋጋ መመዝገቢያ)"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  የአንድ ዕቃ በተለያየ ጊዜ የተገዛበትን ዋጋና የቆየውን ክምችት በማካተት የሚመዘን አማካይ ዋጋ (WAC) ማስያዣ
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* 1. Product Search & Selection */}
            <div>
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Product Selection (እቃውን ይምረጡ) *
              </Label>
              <div ref={productSearchRef} className="relative mt-1.5">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9 pr-8 h-10 text-sm font-medium"
                    placeholder="Search product by name or code… (ስም ወይም ኮድ ይፈልጉ)"
                    value={productSearch}
                    onChange={e => {
                      setProductSearch(e.target.value);
                      setProductDropdown(true);
                      if (!e.target.value) {
                        setForm(f => ({ ...f, productId: "" }));
                        setWacResult(null);
                      }
                    }}
                    onFocus={() => setProductDropdown(true)}
                    data-testid="input-product-search"
                  />
                  {form.productId && (
                    <button
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1"
                      onClick={() => {
                        setForm(f => ({ ...f, productId: "" }));
                        setProductSearch("");
                        setWacResult(null);
                        setProductDropdown(true);
                      }}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Dropdown Options */}
                {productDropdown && filteredProductOptions.length > 0 && (
                  <div className="absolute z-50 w-full bg-popover border rounded-lg shadow-xl mt-1 max-h-56 overflow-y-auto divide-y">
                    {filteredProductOptions.map(p => (
                      <button
                        key={p.id}
                        className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/80 flex items-center justify-between gap-3 transition-colors"
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => selectProductForPricing(p)}
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          {p.photoUrl ? (
                            <img src={p.photoUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0 border" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                              <Box className="w-4 h-4" />
                            </div>
                          )}
                          <div className="truncate">
                            <div className="font-semibold text-foreground truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span className="font-mono">{p.code}</span>
                              {p.currentStock !== undefined && (
                                <span>• Stock: <strong className="text-foreground">{p.currentStock}</strong></span>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[11px] flex-shrink-0 bg-primary/5 text-primary border-primary/20">
                          ይምረጡ
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}

                {productDropdown && filteredProductOptions.length === 0 && productSearch && (
                  <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 px-4 py-3 text-xs text-muted-foreground">
                    {editRecord ? "ምንም የሚዛመድ ዕቃ አልተገኘም" : "ያልተመዘገበ ዕቃ አልተገኘም — ሁሉም ዕቃዎች ዋጋ ተመድቦላቸው ሊሆን ይችላል"}
                  </div>
                )}
              </div>

              {selectedProduct && (
                <div className="flex items-center justify-between text-xs mt-2 px-3 py-1.5 bg-muted/40 rounded-md border">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">የተመረጠው ዕቃ:</span>
                    <span className="font-semibold text-foreground">{selectedProduct.name}</span>
                    <Badge variant="secondary" className="font-mono text-[10px]">{selectedProduct.code}</Badge>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <span>ክምችት (Stock): <strong className="text-foreground">{selectedProduct.currentStock || 0}</strong></span>
                    {selectedProduct.quantityPerCarton && selectedProduct.quantityPerCarton > 1 && (
                      <span>በካርቶን: <strong className="text-foreground">{selectedProduct.quantityPerCarton}</strong> ፍሬ</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. WEIGHTED AVERAGE COST (WAC) ENGINE ANALYSIS CARD */}
            {wacResult && selectedProduct && (
              <div className="border border-blue-200 bg-gradient-to-br from-blue-50/60 via-background to-indigo-50/40 rounded-xl p-4 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm text-blue-950">
                        የሚመዘን አማካይ ዋጋ ስሌት (Weighted Average Cost Analysis)
                      </h3>
                      <p className="text-[11px] text-blue-700">
                        የቆየውን ክምችት መጠንና የተለያየ ጊዜ የተገዛበትን ወጪ በማካተት የተሰላ
                      </p>
                    </div>
                  </div>
                  <Badge className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
                    {wacResult.batches.length} የተመዘገቡ ግዢዎች/ክምችት
                  </Badge>
                </div>

                {/* 4 Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Card 1: Prior Stock */}
                  <div className="bg-white/80 border border-blue-100 rounded-lg p-2.5 shadow-xs">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      1. የቆየ ክምችት (Prior Stock)
                    </span>
                    <div className="font-bold text-sm text-foreground mt-0.5">
                      {wacResult.priorStockQuantity.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">pcs</span>
                    </div>
                    <div className="text-[11px] text-blue-700 mt-0.5">
                      ጠቅላላ: {fmt(wacResult.priorStockTotalCost)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      @{fmt(wacResult.priorStockUnitCost)}/pc
                    </div>
                  </div>

                  {/* Card 2: Recorded Purchases */}
                  <div className="bg-white/80 border border-blue-100 rounded-lg p-2.5 shadow-xs">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      2. አዲስ ግዢዎች (Purchases)
                    </span>
                    <div className="font-bold text-sm text-foreground mt-0.5">
                      {wacResult.newPurchasesQuantity.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">pcs</span>
                    </div>
                    <div className="text-[11px] text-indigo-700 mt-0.5">
                      ጠቅላላ: {fmt(wacResult.newPurchasesTotalCost)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {wacResult.batches.filter(b => b.source !== "initial_inventory").length} ዙር ግዢዎች
                    </div>
                  </div>

                  {/* Card 3: Total Cost & Total Qty */}
                  <div className="bg-white/80 border border-blue-100 rounded-lg p-2.5 shadow-xs">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                      3. ጠቅላላ ወጪና ብዛት
                    </span>
                    <div className="font-bold text-sm text-foreground mt-0.5">
                      {wacResult.totalQuantity.toLocaleString()} <span className="text-xs font-normal text-muted-foreground">pcs</span>
                    </div>
                    <div className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                      ድምር: {fmt(wacResult.totalCost)}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      የጠቅላላ ወጪ ድምር
                    </div>
                  </div>

                  {/* Card 4: Weighted Average Cost */}
                  <div className="bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-lg p-2.5 shadow-sm">
                    <span className="text-[10px] font-semibold text-blue-100 uppercase tracking-wider block">
                      4. አማካይ የመግዣ ዋጋ (WAC)
                    </span>
                    <div className="font-extrabold text-base mt-0.5">
                      {fmt(wacResult.weightedAverageCost)}
                    </div>
                    <div className="text-[11px] text-blue-100">
                      በአንድ ፍሬ (per pc)
                    </div>
                    {(selectedProduct.quantityPerCarton || 1) > 1 && (
                      <div className="text-[10px] text-blue-200 mt-0.5">
                        ካርቶን: {fmt(wacResult.cartonWeightedAverageCost)}
                      </div>
                    )}
                  </div>
                </div>

                {/* Formula Highlight Banner */}
                <div className="bg-blue-100/70 border border-blue-200 rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-800 flex-shrink-0" />
                    <span className="font-medium text-blue-900">
                      የስሌት ቀመር: <strong>{wacResult.totalCost.toLocaleString()} ብር (ጠቅላላ ወጪ)</strong> ÷ <strong>{wacResult.totalQuantity.toLocaleString()} ፍሬ (ጠቅላላ ብዛት)</strong> = <strong className="text-blue-950 underline">{wacResult.weightedAverageCost.toFixed(2)} ብር/ፍሬ</strong>
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-blue-800 hover:text-blue-900 hover:bg-blue-200/60 font-semibold"
                    onClick={() => setShowBatchBreakdown(!showBatchBreakdown)}
                  >
                    <History className="w-3.5 h-3.5 mr-1" />
                    {showBatchBreakdown ? "ዝርዝር ደብቅ" : "የግዢዎች ታሪክ (" + wacResult.batches.length + ")"}
                  </Button>
                </div>

                {/* Collapsible Purchase Batches Breakdown Table */}
                {showBatchBreakdown && (
                  <div className="rounded-lg border bg-white overflow-hidden text-xs shadow-xs animate-in fade-in-50">
                    <div className="bg-muted/60 px-3 py-2 font-semibold text-muted-foreground flex items-center justify-between border-b">
                      <span>የተለያየ ጊዜ የተገዛበት ዋጋና ብዛት ዝርዝር (Purchase Batches History)</span>
                      <span className="text-[11px] font-normal">ቀን | ቫውቸር | ብዛት | ነጠላ ዋጋ | ጠቅላላ</span>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y">
                      {wacResult.batches.map((b, idx) => (
                        <div key={b.id || idx} className="px-3 py-2 flex items-center justify-between hover:bg-muted/30">
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground font-mono text-[11px]">{b.date}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${
                                b.source === "initial_inventory"
                                  ? "bg-amber-50 text-amber-800 border-amber-200"
                                  : "bg-blue-50 text-blue-800 border-blue-200"
                              }`}
                            >
                              {b.source === "initial_inventory" ? "የቆየ ክምችት" : (b.voucherId || "Stock-In")}
                            </Badge>
                            <span className="text-foreground font-medium truncate max-w-44">
                              {b.supplierName || "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-right">
                            <div>
                              <span className="font-semibold text-foreground">{b.quantity.toLocaleString()}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">pcs</span>
                            </div>
                            <div className="w-20 text-muted-foreground">
                              @{fmt(b.unitCost)}
                            </div>
                            <div className="w-24 font-bold text-foreground">
                              {fmt(b.totalCost)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. SIMULATE INCOMING NEW PURCHASE ("አዲሱ ግዢ ሲካሄድ የቆየውን ክምችት መጠንና ጠቅላላ ዋጋ በማካተት") */}
                <div className="border border-indigo-200/80 bg-indigo-50/40 rounded-lg p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-indigo-700" />
                      <span className="text-xs font-bold text-indigo-950">
                        አዲስ ግዢ ሲካሄድ የሚኖረውን አማካይ ዋጋ አስላ (Simulate New Purchase Batch)
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] border-indigo-200 text-indigo-800 hover:bg-indigo-100"
                      onClick={() => setShowSimulateNewPurchase(!showSimulateNewPurchase)}
                    >
                      {showSimulateNewPurchase ? "አጥፋ" : "+ አዲስ ግዢ ሞክር"}
                    </Button>
                  </div>

                  {showSimulateNewPurchase && (
                    <div className="space-y-3 pt-1 animate-in fade-in-50">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-[11px] text-indigo-900 font-semibold">
                            አዲስ የሚገዛ ብዛት (New Purchase Qty - pcs)
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            step={1}
                            placeholder="e.g. 50"
                            value={simulatedQty || ""}
                            onChange={e => setSimulatedQty(Math.max(0, Number(e.target.value)))}
                            className="h-8 text-xs bg-white border-indigo-200 mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] text-indigo-900 font-semibold">
                            አዲስ የተገዛበት ነጠላ ዋጋ (New Unit Cost - ETB)
                          </Label>
                          <Input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder="e.g. 150.00"
                            value={simulatedUnitCost || ""}
                            onChange={e => setSimulatedUnitCost(Math.max(0, Number(e.target.value)))}
                            className="h-8 text-xs bg-white border-indigo-200 mt-1"
                          />
                        </div>
                      </div>

                      {simulationResult && (
                        <div className="p-2.5 bg-white border border-indigo-300 rounded-md text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground font-medium">የቆየ ክምችት + አዲሱ ግዢ ድምር:</span>
                            <span className="font-bold text-foreground">
                              {simulationResult.simulatedResult.totalQuantity.toLocaleString()} pcs | {fmt(simulationResult.simulatedResult.totalCost)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-indigo-900 font-semibold">አዲስ የሚመዘን አማካይ ዋጋ (New WAC):</span>
                            <span className="font-extrabold text-indigo-700 text-sm">
                              {fmt(simulationResult.simulatedResult.weightedAverageCost)}
                              <span className="text-[11px] font-normal ml-1 text-muted-foreground">
                                ({simulationResult.costDiff >= 0 ? `+${simulationResult.costDiff}` : simulationResult.costDiff} ብር ለውጥ)
                              </span>
                            </span>
                          </div>
                          <div className="flex items-center justify-between border-t pt-1.5">
                            <span className="text-emerald-800 font-semibold">በ {form.profitMargin}% ትርፍ የሚመጣ የሽያጭ ዋጋ:</span>
                            <span className="font-extrabold text-emerald-700 text-sm">
                              {fmt(simulationResult.simulatedSellingPrice.sellingPrice)}
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="w-full h-7 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold mt-1"
                            onClick={applySimulatedCost}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                            ይህንን አዲስ አማካይ ዋጋ ተጠቀም ({fmt(simulationResult.simulatedResult.weightedAverageCost)})
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* 4. COST BASIS SELECTOR */}
                <div>
                  <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
                    የመሰረት መግዣ ዋጋ ይምረጡ (Select Cost Basis)
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleCostModeChange("wac")}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        selectedCostMode === "wac"
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300"
                          : "bg-white hover:bg-muted text-foreground border-border"
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>WAC (አማካይ ዋጋ)</span>
                        {selectedCostMode === "wac" && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div className="text-sm font-extrabold mt-0.5">
                        {fmt(wacResult.weightedAverageCost)}
                      </div>
                      <div className={`text-[10px] ${selectedCostMode === "wac" ? "text-blue-100" : "text-muted-foreground"}`}>
                        የሚመከር (Recommended)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCostModeChange("latest")}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        selectedCostMode === "latest"
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300"
                          : "bg-white hover:bg-muted text-foreground border-border"
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>የቅርብ ጊዜ ዋጋ</span>
                        {selectedCostMode === "latest" && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div className="text-sm font-extrabold mt-0.5">
                        {fmt(wacResult.latestPurchaseCost)}
                      </div>
                      <div className={`text-[10px] ${selectedCostMode === "latest" ? "text-blue-100" : "text-muted-foreground"}`}>
                        የመጨረሻ ግዢ ዋጋ
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCostModeChange("custom")}
                      className={`text-left p-2.5 rounded-lg border text-xs transition-all ${
                        selectedCostMode === "custom"
                          ? "bg-blue-600 text-white border-blue-600 shadow-sm ring-2 ring-blue-300"
                          : "bg-white hover:bg-muted text-foreground border-border"
                      }`}
                    >
                      <div className="font-bold flex items-center justify-between">
                        <span>በእጅ የሚሞላ</span>
                        {selectedCostMode === "custom" && <CheckCircle2 className="w-3.5 h-3.5" />}
                      </div>
                      <div className="text-sm font-extrabold mt-0.5">
                        {fmt(form.unitCost)}
                      </div>
                      <div className={`text-[10px] ${selectedCostMode === "custom" ? "text-blue-100" : "text-muted-foreground"}`}>
                        Custom Cost Input
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 3. COST & PROFIT MARGIN INPUTS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-semibold">የመግዣ ዋጋ (Unit Cost - ETB) *</Label>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.unitCost}
                    onChange={e => {
                      setSelectedCostMode("custom");
                      setForm(f => ({ ...f, unitCost: Number(e.target.value) }));
                    }}
                    data-testid="input-unit-cost"
                    className="h-10 text-sm font-semibold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ETB</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {selectedCostMode === "wac" ? "✓ ከሚመዘን አማካይ ዋጋ የተወሰደ" : "በእጅ የተሞላ የመግዣ ወጪ"}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">የትርፍ መቶኛ (Profit Margin %) *</Label>
                  <span className="text-[11px] font-bold text-emerald-700">+{form.profitMargin}%</span>
                </div>
                <div className="relative mt-1">
                  <Input
                    type="number"
                    min={0}
                    step={0.1}
                    value={form.profitMargin}
                    onChange={e => setForm(f => ({ ...f, profitMargin: Number(e.target.value) }))}
                    data-testid="input-margin"
                    className="h-10 text-sm font-semibold"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                </div>
                {/* Quick Preset Buttons */}
                <div className="flex items-center gap-1 mt-1.5">
                  {[10, 15, 20, 25, 30, 40].map(pct => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, profitMargin: pct }))}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                        form.profitMargin === pct
                          ? "bg-emerald-600 text-white border-emerald-600 font-bold"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 4. FINAL SELLING PRICE SHOWCASE CARD */}
            <div className="border border-emerald-300 bg-gradient-to-br from-emerald-50 via-background to-teal-50/40 rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-emerald-600" />
                  ትክክለኛው የሽያጭ ዋጋ (Calculated Selling Price)
                </span>
                <Badge variant="outline" className="bg-emerald-100/70 text-emerald-800 border-emerald-300 text-[11px] font-semibold">
                  Gross Margin: {sellingCalc.grossProfitRatePercent}%
                </Badge>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                {/* Unit Selling Price */}
                <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-xs">
                  <span className="text-[11px] font-medium text-muted-foreground block">
                    ነጠላ የሽያጭ ዋጋ (Per Piece)
                  </span>
                  <div className="text-xl font-black text-emerald-700 mt-0.5 tracking-tight">
                    {fmt(form.sellingPrice)}
                  </div>
                  <span className="text-[10px] text-muted-foreground">የደንበኛ መሸጫ ዋጋ</span>
                </div>

                {/* Profit Amount per Piece */}
                <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-xs">
                  <span className="text-[11px] font-medium text-muted-foreground block">
                    የትርፍ መጠን (Profit/Piece)
                  </span>
                  <div className="text-xl font-extrabold text-blue-700 mt-0.5 tracking-tight">
                    +{fmt(sellingCalc.profitAmountPerPiece)}
                  </div>
                  <span className="text-[10px] text-muted-foreground">በአንድ ፍሬ የሚገኝ ትርፍ</span>
                </div>

                {/* Carton Selling Price */}
                <div className="bg-white p-3 rounded-lg border border-emerald-200 shadow-xs col-span-2 sm:col-span-1">
                  <span className="text-[11px] font-medium text-muted-foreground block">
                    የካርቶን ዋጋ (Carton Price)
                  </span>
                  <div className="text-xl font-bold text-violet-700 mt-0.5 tracking-tight">
                    {fmt(sellingCalc.cartonSellingPrice)}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    / {selectedProduct?.quantityPerCarton || 1} pcs per ctn
                  </span>
                </div>
              </div>

              <div className="text-xs text-muted-foreground bg-emerald-100/40 rounded-md px-3 py-1.5 border border-emerald-200/60 flex items-center justify-between">
                <span>
                  💡 <strong>ፎርሙላ:</strong> {fmt(form.unitCost)} (አማካይ ወጪ) + {fmt(sellingCalc.profitAmountPerPiece)} ({form.profitMargin}% ትርፍ) = <strong>{fmt(form.sellingPrice)}</strong>
                </span>
                <span className="text-[11px] font-medium text-emerald-800">ትክክለኛ ስሌት</span>
              </div>
            </div>

            {/* 5. E-commerce Optional Field */}
            <div className="border rounded-lg p-3 bg-muted/30 space-y-1">
              <Label className="text-xs font-semibold">E-commerce Piece Price (ETB) - Optional</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={form.ecommercePiecePrice}
                onChange={e => setForm(f => ({ ...f, ecommercePiecePrice: Number(e.target.value) }))}
                placeholder="0.00"
                data-testid="input-ecommerce-piece-price"
                className="h-9 text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                በኦንላይን ድረገጽ ላይ የሚታይ ልዩ ዋጋ። 0 ከሆነ መደበኛው የሽያጭ ዋጋ ጥቅም ላይ ይውላል።
              </p>
            </div>
          </div>

          <DialogFooter className="mt-4 pt-3 border-t">
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} data-testid="button-save-price" className="bg-primary text-primary-foreground font-semibold px-6">
              Save Price (ዋጋውን መዝግብ)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* INSPECT WAC MODAL FROM MAIN TABLE */}
      <Dialog open={inspectModalOpen} onOpenChange={setInspectModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <BarChart2 className="w-5 h-5 text-blue-600" />
              Weighted Average Cost Analysis — {inspectProduct?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              የዚህ እቃ በተለያየ ጊዜ የተገዛበት ዋጋና የቆየው ክምችት ስሌት ዝርዝር
            </DialogDescription>
          </DialogHeader>

          {inspectWacResult && inspectProduct && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-muted/40 rounded-lg border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">የቆየ ክምችት</span>
                  <div className="font-bold text-sm">{inspectWacResult.priorStockQuantity} pcs</div>
                  <div className="text-xs text-muted-foreground">{fmt(inspectWacResult.priorStockTotalCost)}</div>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">አዲስ ግዢዎች</span>
                  <div className="font-bold text-sm">{inspectWacResult.newPurchasesQuantity} pcs</div>
                  <div className="text-xs text-muted-foreground">{fmt(inspectWacResult.newPurchasesTotalCost)}</div>
                </div>
                <div className="p-3 bg-muted/40 rounded-lg border">
                  <span className="text-[10px] text-muted-foreground uppercase font-semibold">ጠቅላላ ወጪ ድምር</span>
                  <div className="font-bold text-sm text-emerald-700">{fmt(inspectWacResult.totalCost)}</div>
                  <div className="text-xs text-muted-foreground">{inspectWacResult.totalQuantity} pcs</div>
                </div>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <span className="text-[10px] text-blue-700 uppercase font-semibold">አማካይ ዋጋ (WAC)</span>
                  <div className="font-extrabold text-base text-blue-900">{fmt(inspectWacResult.weightedAverageCost)}</div>
                  <div className="text-xs text-blue-700">per piece</div>
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-md text-xs text-blue-900 font-medium">
                {inspectWacResult.formulaDescriptionAmharic}
              </div>

              <div>
                <Label className="text-xs font-semibold uppercase text-muted-foreground block mb-2">
                  የተገዛበት ታሪክ (Batches)
                </Label>
                <div className="border rounded-md divide-y text-xs max-h-56 overflow-y-auto">
                  {inspectWacResult.batches.map((b, i) => (
                    <div key={i} className="p-2.5 flex items-center justify-between hover:bg-muted/40">
                      <div>
                        <div className="font-medium text-foreground">{b.supplierName || b.voucherId}</div>
                        <div className="text-[11px] text-muted-foreground font-mono">{b.date} • {b.source === "initial_inventory" ? "የቆየ ክምችት" : "Stock-In"}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold">{b.quantity} pcs @ {fmt(b.unitCost)}</div>
                        <div className="text-[11px] text-muted-foreground">ጠቅላላ: {fmt(b.totalCost)}</div>
                      </div>
                    </div>
                  ))}
                  {inspectWacResult.batches.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground">ምንም የተመዘገበ የግዢ ታሪክ የለም</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setInspectModalOpen(false)}>
              ዝጋ (Close)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {DeleteAuthDialog}
    </div>
  );
}
