import { useState, useRef, useEffect } from "react";
import {
  Upload, Download, Trash2, Package, AlertTriangle, Loader2,
  FileText, ArrowUpDown, History, Search, PlusCircle, Filter, RefreshCw, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  getAll, create, clearCollection, COLLECTIONS, generateVoucherId,
  subscribeCollection, executeStockAdjustment
} from "@/lib/firestore";
import { computeStockBalances, StockBalance } from "@/lib/stockUtils";
import { shareAsPdf, exportToExcel, exportToPdf } from "@/lib/shareImage";
import { useAuth } from "@/lib/auth";
import type { Product, Category, Store, StoreBalance, InventoryMovement } from "@/lib/types";
import * as XLSX from "xlsx";

const ALL_DATA_COLLECTIONS = [
  COLLECTIONS.PRODUCTS,
  COLLECTIONS.CATEGORIES,
  COLLECTIONS.STORES,
  COLLECTIONS.SUPPLIERS,
  COLLECTIONS.CUSTOMERS,
  COLLECTIONS.STOCK_IN,
  COLLECTIONS.POS_SALES,
  COLLECTIONS.ORDER_VOUCHERS,
  COLLECTIONS.TRANSFERS,
  COLLECTIONS.DAMAGE_RETURNS,
  COLLECTIONS.EXPENSES,
  COLLECTIONS.PRICING,
  COLLECTIONS.STORE_BALANCE,
  COLLECTIONS.BINCARD,
  COLLECTIONS.SUPPLIER_PAYMENTS,
  COLLECTIONS.CUSTOMER_PAYMENTS,
  COLLECTIONS.PRODUCT_REQUESTS,
  COLLECTIONS.ACCOUNT_VOUCHERS,
  COLLECTIONS.ACCOUNTS,
  COLLECTIONS.COUNTERS,
  COLLECTIONS.INVENTORY_MOVEMENTS,
] as const;

export default function Inventory() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("stock-levels");
  
  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockBalances, setStockBalances] = useState<Record<string, StockBalance>>({});
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedStore, setSelectedStore] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [movementSearch, setMovementSearch] = useState<string>("");
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>("all");

  // Adjustment Modal
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [adjustForm, setAdjustForm] = useState({
    storeId: "",
    newQuantity: 0,
    currentQuantity: 0,
    reason: "Physical inventory audit count",
  });
  const [savingAdjustment, setSavingAdjustment] = useState(false);

  // Import / Export / Clear states
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [clearTarget, setClearTarget] = useState<"products" | "stock" | "all" | "">("");
  const [showClearDialog, setShowClearDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [importMode, setImportMode] = useState<"products" | "stock">("products");
  const fileRef = useRef<HTMLInputElement>(null);
  const inventoryPdfRef = useRef<HTMLDivElement>(null);
  const [sharingInventoryPdf, setSharingInventoryPdf] = useState(false);

  // Load and refresh live stock
  async function refreshStock() {
    try {
      const balances = await computeStockBalances(selectedStore === "all" ? undefined : selectedStore);
      setStockBalances(balances);
    } catch (err) {
      console.error("Error computing stock balances:", err);
    }
  }

  // Real-time subscriptions for multi-device sync
  useEffect(() => {
    setLoading(true);
    const unsubProducts = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, (prods) => {
      setProducts(prods.filter(p => !p.isVoided));
      refreshStock();
    });

    const unsubStores = subscribeCollection<Store>(COLLECTIONS.STORES, (sts) => {
      setStores(sts);
      refreshStock();
    });

    const unsubCategories = subscribeCollection<Category>(COLLECTIONS.CATEGORIES, (cats) => {
      setCategories(cats);
    });

    const unsubMovements = subscribeCollection<InventoryMovement>(COLLECTIONS.INVENTORY_MOVEMENTS, (movs) => {
      setMovements(movs.sort((a, b) => String(b.createdAt || b.voucherDate || "").localeCompare(String(a.createdAt || a.voucherDate || ""))));
      refreshStock();
    });

    const unsubDamages = subscribeCollection(COLLECTIONS.DAMAGE_RETURNS, () => {
      refreshStock();
    });

    refreshStock().finally(() => setLoading(false));

    return () => {
      unsubProducts();
      unsubStores();
      unsubCategories();
      unsubMovements();
      unsubDamages();
    };
  }, []);

  useEffect(() => {
    refreshStock();
  }, [selectedStore]);

  // Open adjustment modal for a specific product
  function openAdjustment(product: Product) {
    const storeId = selectedStore === "all" ? (stores[0]?.id || "") : selectedStore;
    const currentQty = stockBalances[product.id]?.quantity || 0;
    setAdjustingProduct(product);
    setAdjustForm({
      storeId,
      currentQuantity: currentQty,
      newQuantity: currentQty,
      reason: "Physical inventory audit count",
    });
    setShowAdjustModal(true);
  }

  async function handleSaveAdjustment() {
    if (!adjustingProduct || !adjustForm.storeId) {
      toast({ title: "Please select a store", variant: "destructive" });
      return;
    }

    setSavingAdjustment(true);
    try {
      const store = stores.find(s => s.id === adjustForm.storeId);
      await executeStockAdjustment({
        storeId: adjustForm.storeId,
        storeName: store?.name || "Store",
        productId: adjustingProduct.id,
        productName: adjustingProduct.name,
        productCode: adjustingProduct.code,
        prevQuantity: adjustForm.currentQuantity,
        newQuantity: Number(adjustForm.newQuantity),
        reason: adjustForm.reason,
        userId: user?.name || "Staff",
        userName: user?.name || "Staff",
      });

      toast({
        title: "Stock adjustment saved",
        description: `Updated "${adjustingProduct.name}" to ${adjustForm.newQuantity} units.`,
      });
      setShowAdjustModal(false);
      await refreshStock();
    } catch (err) {
      toast({
        title: "Failed to adjust stock",
        description: String(err instanceof Error ? err.message : err),
        variant: "destructive",
      });
    } finally {
      setSavingAdjustment(false);
    }
  }

  // Filter products for stock levels view
  const filteredProducts = products.filter(p => {
    if (!p) return false;
    const matchesSearch = !searchQuery ||
      (p.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.code || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.categoryName || "").toLowerCase().includes(searchQuery.toLowerCase());

    const qty = stockBalances[p.id]?.quantity || 0;
    const minAlert = (p.minCartonAlert || 1) * (p.quantityPerCarton || 1);

    if (statusFilter === "in_stock" && qty <= 0) return false;
    if (statusFilter === "out_of_stock" && qty > 0) return false;
    if (statusFilter === "low_stock" && (qty <= 0 || qty > minAlert)) return false;

    return matchesSearch;
  });

  // Filter inventory movements
  const filteredMovements = movements.filter(m => {
    const matchesSearch = !movementSearch ||
      (m.productName || "").toLowerCase().includes(movementSearch.toLowerCase()) ||
      (m.productCode || "").toLowerCase().includes(movementSearch.toLowerCase()) ||
      (m.storeName || "").toLowerCase().includes(movementSearch.toLowerCase()) ||
      (m.reason || "").toLowerCase().includes(movementSearch.toLowerCase()) ||
      (m.referenceVoucherId || "").toLowerCase().includes(movementSearch.toLowerCase());

    const matchesType = movementTypeFilter === "all" || m.type === movementTypeFilter;

    return matchesSearch && matchesType;
  });

  // Summary Metrics
  const totalItemsInStock = Object.values(stockBalances).reduce((acc, curr) => acc + Math.max(0, curr.quantity), 0);
  const lowStockCount = products.filter(p => {
    const q = stockBalances[p.id]?.quantity || 0;
    const alert = (p.minCartonAlert || 1) * (p.quantityPerCarton || 1);
    return q > 0 && q <= alert;
  }).length;
  const outOfStockCount = products.filter(p => (stockBalances[p.id]?.quantity || 0) <= 0).length;

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws);

      if (importMode === "products") {
        let imported = 0;
        for (const row of rows) {
          const name = String(row["Name"] || row["name"] || "").trim();
          const code = String(row["Code"] || row["code"] || "").trim();
          if (!name || !code) continue;
          const categoryName = String(row["Category"] || row["category"] || "").trim();
          const cat = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
          await create(COLLECTIONS.PRODUCTS, {
            name,
            code,
            categoryId: cat?.id || "",
            categoryName: cat?.name || categoryName,
            quantityPerCarton: Number(row["Qty Per Carton"] || row["qty_per_carton"] || 1),
            minCartonAlert: Number(row["Min Alert"] || row["min_alert"] || 1),
            description: String(row["Description"] || row["description"] || ""),
            photoUrl: "",
            barcodeValue: code,
            voucherId: generateVoucherId("PROD"),
            isVoided: false,
          } as Record<string, unknown>);
          imported++;
        }
        toast({ title: `Imported ${imported} products into Firebase` });
      } else {
        let imported = 0;
        for (const row of rows) {
          const productCode = String(row["Product Code"] || row["product_code"] || "").trim();
          const storeName = String(row["Store"] || row["store"] || "").trim();
          const quantity = Number(row["Balance"] || row["balance"] || row["Quantity"] || row["quantity"] || 0);
          if (!productCode || !storeName || quantity <= 0) continue;
          const product = products.find(p => p.code === productCode);
          const store = stores.find(s => s.name.toLowerCase() === storeName.toLowerCase());
          if (!product || !store) continue;

          await executeStockAdjustment({
            storeId: store.id,
            storeName: store.name,
            productId: product.id,
            productName: product.name,
            productCode: product.code,
            prevQuantity: 0,
            newQuantity: quantity,
            reason: "Initial imported stock balance",
            userName: "Import Tool",
          });
          imported++;
        }
        toast({ title: `Imported and adjusted ${imported} stock records in Firebase` });
      }
      await refreshStock();
    } catch (err) {
      toast({ title: "Import failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const wb = XLSX.utils.book_new();

      // Stock sheet
      const stockData = [
        ["Product Code", "Product Name", "Category", "Quantity (Pieces)", "Quantity (Cartons)", "Min Alert Cartons", "Status"],
        ...products.map(p => {
          const qty = stockBalances[p.id]?.quantity || 0;
          const qpc = p.quantityPerCarton || 1;
          const cartons = Math.floor(qty / qpc);
          const alert = p.minCartonAlert || 1;
          const status = qty <= 0 ? "Out of Stock" : qty <= (alert * qpc) ? "Low Stock" : "In Stock";
          return [p.code, p.name, p.categoryName || "", qty, cartons, alert, status];
        }),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stockData), "Stock Levels");

      // Movements sheet
      const movementData = [
        ["Date", "Voucher ID", "Type", "Store", "Product Code", "Product Name", "Change (+/-)", "Previous Qty", "New Qty", "Reason", "User"],
        ...movements.map(m => [
          m.voucherDate || (typeof m.createdAt === "string" ? m.createdAt.slice(0, 10) : "") || "",
          m.referenceVoucherId || "",
          m.type,
          m.storeName || "",
          m.productCode || "",
          m.productName || "",
          m.difference,
          m.prevQuantity,
          m.newQuantity,
          m.reason,
          m.userName || "",
        ]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(movementData), "Inventory Movements");

      await exportToExcel({
        workbook: wb,
        filename: `Inventory_Report_${new Date().toISOString().slice(0, 10)}.xlsx`,
        title: "YESERAHUT INVENTORY REPORT",
        subtitle: `Store: ${selectedStore} | Stock Items: ${stockBalances.length} | Movements: ${movements.length}`,
      });
      toast({ title: "Inventory report exported to Excel" });
    } catch (err) {
      toast({ title: "Export failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      const pdfColumns = [
        { header: "SKU / Code", key: "code", width: 14, align: "center" as const },
        { header: "Product Name", key: "name", width: 28, align: "left" as const },
        { header: "Category", key: "category", width: 18, align: "center" as const },
        { header: "Qty (Pieces)", key: "pieces", width: 14, align: "right" as const, isInteger: true },
        { header: "Qty (Cartons)", key: "cartons", width: 14, align: "right" as const, isInteger: true },
        { header: "Min Alert", key: "alert", width: 12, align: "center" as const, isInteger: true },
        { header: "Stock Status", key: "status", width: 16, align: "center" as const },
      ];

      let totalPcs = 0;
      let totalCtns = 0;

      const pdfRows = products.map(p => {
        const qty = stockBalances[p.id]?.quantity || 0;
        const qpc = p.quantityPerCarton || 1;
        const cartons = Math.floor(qty / qpc);
        const alert = p.minCartonAlert || 1;
        const status = qty <= 0 ? "Out of Stock" : qty <= (alert * qpc) ? "Low Stock" : "In Stock";
        totalPcs += qty;
        totalCtns += cartons;
        return {
          code: p.code || "",
          name: p.name || "",
          category: p.categoryName || "",
          pieces: qty,
          cartons: cartons,
          alert: alert,
          status: status,
          _isLowStock: qty <= (alert * qpc) && qty > 0,
          _isOutOfStock: qty <= 0,
        };
      });

      // Grand Total Row
      pdfRows.push({
        code: "TOTAL",
        name: `Grand Total Across ${products.length} Products`,
        category: "",
        pieces: totalPcs,
        cartons: totalCtns,
        alert: "",
        status: "",
        _isGrandTotal: true,
      } as any);

      const dateStr = new Date().toISOString().slice(0, 10);
      await exportToPdf({
        title: "YESERAHUT INVENTORY STOCK STATUS REPORT",
        subtitle: `Store: ${selectedStore === "all" ? "All Stores" : selectedStore} | Total Products: ${products.length}`,
        filename: `Inventory_Stock_Report_${dateStr}.pdf`,
        orientation: "portrait",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Total Catalog Items", value: products.length },
          { label: "Total Units in Stock", value: totalPcs },
          { label: "Total Cartons in Stock", value: totalCtns },
          { label: "Inventory Movements", value: movements.length },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          if (row._isOutOfStock) return { textColor: [220, 38, 38], bold: true };
          if (row._isLowStock) return { textColor: [217, 119, 6], bold: true };
          return null;
        },
      });
      toast({ title: "Inventory report exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleClear() {
    if (!clearTarget) return;
    setClearing(true);
    try {
      if (clearTarget === "stock" || clearTarget === "all") {
        await clearCollection(COLLECTIONS.INVENTORY_MOVEMENTS);
        await clearCollection(COLLECTIONS.STORE_BALANCE);
        await clearCollection(COLLECTIONS.BINCARD);
      }
      if (clearTarget === "products" || clearTarget === "all") {
        await clearCollection(COLLECTIONS.PRODUCTS);
      }
      const labels: Record<string, string> = { products: "all products", stock: "all stock balances & movements", all: "all products and stock" };
      toast({ title: `Cleared ${labels[clearTarget]} from Firebase` });
      setShowClearDialog(false);
      setClearTarget("");
      await refreshStock();
    } catch (err) {
      toast({ title: "Clear failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setClearing(false);
    }
  }

  async function handleResetAll() {
    if (resetConfirmText !== "DELETE") return;
    setResetting(true);
    try {
      await Promise.all(ALL_DATA_COLLECTIONS.map(col => clearCollection(col)));
      toast({ title: "All operational data deleted from Firebase", description: "User accounts have been preserved." });
      setShowResetDialog(false);
      setResetConfirmText("");
      await refreshStock();
    } catch (err) {
      toast({ title: "Reset failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inventory Management</h1>
          <p className="text-muted-foreground text-sm">Real-time stock tracking, audit history, and adjustment controls</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={refreshStock} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4 mr-1.5" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPdf} disabled={exportingPdf} className="text-rose-600 dark:text-rose-400 hover:text-rose-700">
            <FileText className="w-4 h-4 mr-1.5" /> {exportingPdf ? "Exporting PDF..." : "Export PDF"}
          </Button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Products</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{products.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Active catalog items</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Units in Stock</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{totalItemsInStock.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Pieces across stores</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Low Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">{lowStockCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Below minimum threshold</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Out of Stock Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{outOfStockCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires replenishment</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full sm:w-[480px]">
          <TabsTrigger value="stock-levels" className="flex items-center gap-2">
            <Package className="w-4 h-4" /> Stock Levels
          </TabsTrigger>
          <TabsTrigger value="movements" className="flex items-center gap-2">
            <History className="w-4 h-4" /> Movement Audit
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center gap-2">
            <Upload className="w-4 h-4" /> Data Tools
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Live Stock Levels */}
        <TabsContent value="stock-levels" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-3 rounded-lg border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by code, product name, or category..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>

            <div className="w-[180px]">
              <Select value={selectedStore} onValueChange={setSelectedStore}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="All Stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Stores (Total)</SelectItem>
                  {stores.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-[160px]">
              <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in_stock">In Stock</SelectItem>
                  <SelectItem value="low_stock">Low Stock</SelectItem>
                  <SelectItem value="out_of_stock">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Stock Table */}
          <div className="border rounded-lg overflow-hidden bg-background">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/60 text-muted-foreground font-semibold border-b">
                  <tr>
                    <th className="px-4 py-3">Code / SKU</th>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Available Stock</th>
                    <th className="px-4 py-3 text-right">Cartons</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProducts.map(p => {
                    const qty = stockBalances[p.id]?.quantity || 0;
                    const qpc = p.quantityPerCarton || 1;
                    const fullCartons = Math.floor(qty / qpc);
                    const remPieces = qty % qpc;
                    const cartonsDisplay = remPieces > 0 ? `${fullCartons} ctn + ${remPieces} pcs` : `${fullCartons} ctn`;
                    const alertThreshold = (p.minCartonAlert || 1) * qpc;
                    const isOutOfStock = qty <= 0;
                    const isLowStock = !isOutOfStock && qty <= alertThreshold;

                    return (
                      <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-medium">{p.code}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-foreground">{p.name}</div>
                          {p.brand && <span className="text-xs text-muted-foreground">Brand: {p.brand}</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{p.categoryName || "—"}</td>
                        <td className="px-4 py-3 text-right font-semibold">
                          <span className={isOutOfStock ? "text-red-600" : isLowStock ? "text-amber-600" : "text-foreground"}>
                            {qty.toLocaleString()} {p.unit || "pcs"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {cartonsDisplay} <span className="text-[11px]">({qpc}/ctn)</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isOutOfStock ? (
                            <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                          ) : isLowStock ? (
                            <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 bg-amber-50">Low Stock</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-emerald-500 text-emerald-600 bg-emerald-50">In Stock</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => openAdjustment(p)}>
                            <ArrowUpDown className="w-3.5 h-3.5 mr-1" /> Adjust
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredProducts.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                        <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No inventory records matching current filter
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Inventory Movement Audit Log */}
        <TabsContent value="movements" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-3 rounded-lg border">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search movements by product, store, voucher, or reason..."
                value={movementSearch}
                onChange={e => setMovementSearch(e.target.value)}
                className="pl-9 bg-background"
              />
            </div>

            <div className="w-[180px]">
              <Select value={movementTypeFilter} onValueChange={setMovementTypeFilter}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="All Movement Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="stock_in">Stock In (Purchase)</SelectItem>
                  <SelectItem value="sale">POS Sale</SelectItem>
                  <SelectItem value="adjustment">Stock Adjustment</SelectItem>
                  <SelectItem value="transfer">Store Transfer</SelectItem>
                  <SelectItem value="damage">Damage / Return</SelectItem>
                  <SelectItem value="direct_sale">Direct Sale</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden bg-background">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/60 text-muted-foreground font-semibold border-b">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Product</th>
                    <th className="px-4 py-3">Store</th>
                    <th className="px-4 py-3 text-right">Change (+/-)</th>
                    <th className="px-4 py-3 text-right">Prev → New</th>
                    <th className="px-4 py-3">Reason / Ref</th>
                    <th className="px-4 py-3">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredMovements.map(m => {
                    const isPositive = m.difference > 0;
                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {m.voucherDate || (typeof m.createdAt === "string" ? m.createdAt.slice(0, 10) : "") || "—"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs uppercase font-medium">
                            {m.type.replace("_", " ")}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{m.productName}</div>
                          <span className="text-xs font-mono text-muted-foreground">{m.productCode}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{m.storeName || "—"}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          <span className={isPositive ? "text-emerald-600" : "text-red-600"}>
                            {isPositive ? `+${m.difference}` : m.difference}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono">
                          {m.prevQuantity ?? "—"} → {m.newQuantity ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate" title={m.reason}>
                          {m.referenceVoucherId ? <span className="font-semibold text-foreground mr-1">[{m.referenceVoucherId}]</span> : null}
                          {m.reason || "—"}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{m.userName || "System"}</td>
                      </tr>
                    );
                  })}
                  {filteredMovements.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                        <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
                        No inventory movements recorded yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 3: Data Tools */}
        <TabsContent value="tools" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Import Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Upload className="w-4 h-4 text-primary" /> Bulk Import
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Upload an Excel (.xlsx) or CSV file to bulk import products or stock balances into Firebase.</p>
                <div>
                  <Label>Import Mode</Label>
                  <Select value={importMode} onValueChange={v => setImportMode(v as "products" | "stock")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="products">Products Master Catalog</SelectItem>
                      <SelectItem value="stock">Initial Stock Balances</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
                <Button className="w-full" onClick={() => fileRef.current?.click()} disabled={importing}>
                  {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  {importing ? "Importing to Firebase…" : "Select File to Import"}
                </Button>
              </CardContent>
            </Card>

            {/* Export Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="w-4 h-4 text-primary" /> Bulk Export
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">Download all current stock levels, inventory movement audit logs, and catalog data to Excel.</p>
                <Button className="w-full" variant="outline" onClick={handleExport} disabled={exporting}>
                  {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Export Excel Spreadsheet
                </Button>
              </CardContent>
            </Card>

            {/* Danger Zone */}
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-red-600">
                  <AlertTriangle className="w-4 h-4" /> Data Cleanup
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Permanently clear specific collections or reset the inventory database.</p>
                <Button variant="outline" className="w-full text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setClearTarget("stock"); setShowClearDialog(true); }}>
                  Clear Stock & Movements
                </Button>
                <Button variant="destructive" className="w-full" onClick={() => { setResetConfirmText(""); setShowResetDialog(true); }}>
                  Full System Reset
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Manual Stock Adjustment Dialog */}
      <Dialog open={showAdjustModal} onOpenChange={setShowAdjustModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust Stock Balance</DialogTitle>
            <DialogDescription>
              Record an audit-logged inventory count adjustment for <strong>{adjustingProduct?.name}</strong>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Target Store</Label>
              <Select value={adjustForm.storeId} onValueChange={s => setAdjustForm(f => ({ ...f, storeId: s }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map(st => (
                    <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Current Quantity</Label>
                <Input value={`${adjustForm.currentQuantity} ${adjustingProduct?.unit || "pcs"}`} disabled className="bg-muted" />
              </div>
              <div>
                <Label>New Quantity *</Label>
                <Input
                  type="number"
                  min={0}
                  value={adjustForm.newQuantity}
                  onChange={e => setAdjustForm(f => ({ ...f, newQuantity: Number(e.target.value) }))}
                />
              </div>
            </div>

            {/* Calculated Difference */}
            <div className="p-3 bg-muted/60 rounded-lg text-xs flex justify-between items-center">
              <span className="text-muted-foreground">Calculated Stock Difference:</span>
              <span className={`font-mono font-bold ${adjustForm.newQuantity - adjustForm.currentQuantity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {adjustForm.newQuantity - adjustForm.currentQuantity >= 0 ? `+${adjustForm.newQuantity - adjustForm.currentQuantity}` : adjustForm.newQuantity - adjustForm.currentQuantity} units
              </span>
            </div>

            <div>
              <Label>Reason for Adjustment *</Label>
              <Select value={adjustForm.reason} onValueChange={r => setAdjustForm(f => ({ ...f, reason: r }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Physical inventory audit count">Physical inventory audit count</SelectItem>
                  <SelectItem value="Damaged goods write-off">Damaged goods write-off</SelectItem>
                  <SelectItem value="Supplier discrepancy correction">Supplier discrepancy correction</SelectItem>
                  <SelectItem value="Customer return adjustment">Customer return adjustment</SelectItem>
                  <SelectItem value="Opening inventory balance setup">Opening inventory balance setup</SelectItem>
                  <SelectItem value="Expired stock removal">Expired stock removal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdjustModal(false)} disabled={savingAdjustment}>
              Cancel
            </Button>
            <Button onClick={handleSaveAdjustment} disabled={savingAdjustment}>
              {savingAdjustment ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Save Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Confirmation Dialog */}
      <Dialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Data Clearance</DialogTitle>
            <DialogDescription>
              Are you sure you want to clear <strong>{clearTarget}</strong> from Firebase? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowClearDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleClear} disabled={clearing}>
              {clearing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Confirm Clear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Confirmation Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600">Full System Reset</DialogTitle>
            <DialogDescription>
              Type <strong>DELETE</strong> to erase all operational transactions, stock balances, and orders from Firebase.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={resetConfirmText}
            onChange={e => setResetConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
            className="border-red-300"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleResetAll} disabled={resetConfirmText !== "DELETE" || resetting}>
              {resetting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Erase Database
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
