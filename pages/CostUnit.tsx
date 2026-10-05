import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Calculator,
  Search,
  Plus,
  History,
  TrendingUp,
  TrendingDown,
  Minus,
  FileSpreadsheet,
  Printer,
  Calendar,
  Truck,
  Store,
  Boxes,
  ArrowUpDown,
  Filter,
  Eye,
  Edit,
  Package,
  CheckCircle2,
  RefreshCw,
  Clock,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  ChevronRight,
  ChevronDown,
  X,
  PieChart as PieChartIcon,
  BarChart3,
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { getAll, create, update, remove, COLLECTIONS, subscribeCollection } from "@/lib/firestore";
import { fmt } from "@/lib/currency";
import { formatSafeDate, todayIsoDate, safeDateSort } from "@/lib/dateUtils";
import { printElement } from "@/lib/printUtils";
import { exportToExcel } from "@/lib/shareImage";
import type { Product, StockIn, Category, Supplier, PurchaseCostRecord } from "@/lib/types";

// Standard chronological purchase event item
export interface ChronoPurchaseItem {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  date: string; // YYYY-MM-DD
  voucherId: string;
  supplierId?: string;
  supplierName?: string;
  storeId?: string;
  storeName?: string;
  cartonsReceived: number;
  quantityPerCarton: number;
  totalPieces: number;
  unitCost: number; // Unit purchase price per piece
  cartonPrice: number; // Purchase price per carton
  totalCost: number;
  notes?: string;
  source: "stock_in" | "manual" | "initial";
  createdByName?: string;
  // Computed fields in sequence
  priceDiffFromPrev?: number;
  priceDiffPercentFromPrev?: number;
}

export default function CostUnit() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();

  // Data states
  const [products, setProducts] = useState<Product[]>([]);
  const [stockIns, setStockIns] = useState<StockIn[]>([]);
  const [manualCostRecords, setManualCostRecords] = useState<PurchaseCostRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [activeTab, setActiveTab] = useState("products");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortField, setSortField] = useState<"name" | "code" | "unitCost" | "stockValue" | "purchasesCount" | "date">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Timeline tab filters
  const [timelineProductFilter, setTimelineProductFilter] = useState("all");
  const [timelineSupplierFilter, setTimelineSupplierFilter] = useState("all");
  const [timelineStartDate, setTimelineStartDate] = useState("");
  const [timelineEndDate, setTimelineEndDate] = useState("");
  const [timelineSortOrder, setTimelineSortOrder] = useState<"desc" | "asc">("desc"); // Newest or Oldest

  // Detail Modal State (Single Product Purchase History)
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [historyOrder, setHistoryOrder] = useState<"asc" | "desc">("desc"); // Newest or Oldest in modal

  // Quick Cost Update / Add Manual Purchase Modal
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [costFormProduct, setCostFormProduct] = useState<Product | null>(null);
  const [costForm, setCostForm] = useState({
    date: todayIsoDate(),
    unitCost: 0,
    cartonPrice: 0,
    cartonsReceived: 1,
    supplierId: "",
    notes: "",
  });
  const [isSavingCost, setIsSavingCost] = useState(false);

  // Print refs
  const historyPrintRef = useRef<HTMLDivElement>(null);
  const catalogPrintRef = useRef<HTMLDivElement>(null);

  // ── Load & Subscribe Data ──
  useEffect(() => {
    async function loadInitialData() {
      setLoading(true);
      try {
        const [prods, stkIns, manualRecs, cats, supps] = await Promise.all([
          getAll<Product>(COLLECTIONS.PRODUCTS),
          getAll<StockIn>(COLLECTIONS.STOCK_IN),
          getAll<PurchaseCostRecord>(COLLECTIONS.PURCHASE_COST_HISTORY).catch(() => []),
          getAll<Category>(COLLECTIONS.CATEGORIES).catch(() => []),
          getAll<Supplier>(COLLECTIONS.SUPPLIERS).catch(() => []),
        ]);

        setProducts(prods.filter((p) => !p.isVoided && p.status !== "discontinued"));
        setStockIns(stkIns.filter((s) => !s.isVoided && s.status !== "voided"));
        setManualCostRecords(manualRecs.filter((m) => !m.isVoided));
        setCategories(cats.filter((c) => !c.isVoided));
        setSuppliers(supps.filter((s) => !s.isVoided));
      } catch (err) {
        console.error("Error loading Cost Unit data:", err);
      } finally {
        setLoading(false);
      }
    }

    loadInitialData();

    // Live subscriptions
    const unsubProds = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, (data) => {
      setProducts(data.filter((p) => !p.isVoided && p.status !== "discontinued"));
    });
    const unsubStk = subscribeCollection<StockIn>(COLLECTIONS.STOCK_IN, (data) => {
      setStockIns(data.filter((s) => !s.isVoided && s.status !== "voided"));
    });
    const unsubManual = subscribeCollection<PurchaseCostRecord>(COLLECTIONS.PURCHASE_COST_HISTORY, (data) => {
      setManualCostRecords(data.filter((m) => !m.isVoided));
    });

    return () => {
      unsubProds();
      unsubStk();
      unsubManual();
    };
  }, []);

  // ── Aggregation Engine: Build Chronological Purchase History per Product ──
  // Extracts all purchases from StockIn vouchers and manual records, sorted in chronological order
  const allChronologicalPurchases = useMemo<ChronoPurchaseItem[]>(() => {
    const list: ChronoPurchaseItem[] = [];

    // 1. From StockIn documents
    for (const voucher of stockIns) {
      const vDate = voucher.voucherDate || (voucher.createdAt ? String(voucher.createdAt).slice(0, 10) : todayIsoDate());
      if (!voucher.items || !Array.isArray(voucher.items)) continue;

      for (const item of voucher.items) {
        if (!item || !item.productId) continue;
        const qpc = Number(item.quantityPerCarton) || 1;
        const ctns = Number(item.cartonsReceived) || 0;
        const uCost = Number(item.unitPrice) || 0;
        const cPrice = Number(item.cartonPrice) || Math.round(uCost * qpc);
        const totalPcs = Math.round(ctns * qpc);
        const total = Number(item.totalPrice) || Math.round(uCost * totalPcs);

        list.push({
          id: `${voucher.id}_${item.productId}`,
          productId: item.productId,
          productName: item.productName || "Product",
          productCode: item.productCode || "",
          date: vDate,
          voucherId: voucher.voucherId || "VOUCHER",
          supplierId: voucher.supplierId,
          supplierName: voucher.supplierName || "Supplier",
          storeId: voucher.storeId,
          storeName: voucher.storeName || "",
          cartonsReceived: ctns,
          quantityPerCarton: qpc,
          totalPieces: totalPcs,
          unitCost: uCost,
          cartonPrice: cPrice,
          totalCost: total,
          notes: voucher.remark || "",
          source: "stock_in",
          createdByName: voucher.createdByName || "",
        });
      }
    }

    // 2. From Manual / Historical Purchase Cost Records
    for (const rec of manualCostRecords) {
      const qpc = Number(rec.quantityPerCarton) || 1;
      const ctns = Number(rec.cartonsReceived) || 0;
      const uCost = Number(rec.unitCost) || 0;
      const cPrice = Number(rec.cartonPrice) || Math.round(uCost * qpc);
      const totalPcs = Math.round(ctns * qpc);
      const total = Number(rec.totalCost) || Math.round(uCost * totalPcs);

      list.push({
        id: rec.id,
        productId: rec.productId,
        productName: rec.productName,
        productCode: rec.productCode,
        date: rec.date || todayIsoDate(),
        voucherId: rec.voucherId || "MANUAL-COST",
        supplierId: rec.supplierId,
        supplierName: rec.supplierName || "—",
        storeId: rec.storeId,
        storeName: rec.storeName || "",
        cartonsReceived: ctns,
        quantityPerCarton: qpc,
        totalPieces: totalPcs,
        unitCost: uCost,
        cartonPrice: cPrice,
        totalCost: total,
        notes: rec.notes || "",
        source: rec.source || "manual",
        createdByName: rec.createdByName || "",
      });
    }

    // 3. For products that have no stock-in or manual records, include baseline creation purchasePrice / unitCost
    const productIdsWithPurchases = new Set(list.map((item) => item.productId));
    for (const prod of products) {
      if (!productIdsWithPurchases.has(prod.id)) {
        const uCost = prod.purchasePrice ?? prod.unitCost ?? prod.piecePrice ?? 0;
        if (uCost > 0) {
          const qpc = prod.quantityPerCarton || 1;
          const pDate = prod.createdAt ? String(prod.createdAt).slice(0, 10) : todayIsoDate();
          list.push({
            id: `initial_${prod.id}`,
            productId: prod.id,
            productName: prod.name,
            productCode: prod.code,
            date: pDate,
            voucherId: prod.voucherId || "OPENING-COST",
            supplierId: prod.supplierId,
            supplierName: prod.supplierName || "Initial Setup",
            cartonsReceived: 0,
            quantityPerCarton: qpc,
            totalPieces: 0,
            unitCost: uCost,
            cartonPrice: prod.cartonPrice || Math.round(uCost * qpc),
            totalCost: 0,
            notes: "Initial registered product unit cost",
            source: "initial",
            createdByName: "System",
          });
        }
      }
    }

    // Sort strictly chronologically (Oldest first) so consecutive price difference can be calculated accurately
    list.sort((a, b) => safeDateSort(a.date, b.date, "asc"));

    // Group by product to compute price differences from previous purchase
    const productGroups = new Map<string, ChronoPurchaseItem[]>();
    for (const item of list) {
      if (!productGroups.has(item.productId)) {
        productGroups.set(item.productId, []);
      }
      productGroups.get(item.productId)!.push(item);
    }

    for (const [, items] of productGroups.entries()) {
      for (let i = 0; i < items.length; i++) {
        if (i === 0) {
          items[i].priceDiffFromPrev = 0;
          items[i].priceDiffPercentFromPrev = 0;
        } else {
          const prevPrice = items[i - 1].unitCost;
          const currPrice = items[i].unitCost;
          const diff = currPrice - prevPrice;
          items[i].priceDiffFromPrev = diff;
          items[i].priceDiffPercentFromPrev = prevPrice > 0 ? (diff / prevPrice) * 100 : 0;
        }
      }
    }

    return list;
  }, [stockIns, manualCostRecords, products]);

  // Map of Product ID -> array of chronological purchases (oldest to newest)
  const productPurchaseMap = useMemo(() => {
    const map = new Map<string, ChronoPurchaseItem[]>();
    for (const item of allChronologicalPurchases) {
      if (!map.has(item.productId)) {
        map.set(item.productId, []);
      }
      map.get(item.productId)!.push(item);
    }
    return map;
  }, [allChronologicalPurchases]);

  // ── Products Summary with Real-Time Unit Costs ──
  const productsWithCostInfo = useMemo(() => {
    return products.map((prod) => {
      const history = productPurchaseMap.get(prod.id) || [];
      const purchasesCount = history.length;

      // Latest purchase in history
      const latestPurchase = history.length > 0 ? history[history.length - 1] : null;
      const firstPurchase = history.length > 0 ? history[0] : null;

      // Effective Unit Cost: latest purchase unit cost or product's purchasePrice/unitCost
      const effectiveUnitCost = latestPurchase
        ? latestPurchase.unitCost
        : prod.purchasePrice ?? prod.unitCost ?? prod.piecePrice ?? 0;

      const qpc = prod.quantityPerCarton > 0 ? prod.quantityPerCarton : 1;
      const effectiveCartonCost = latestPurchase
        ? latestPurchase.cartonPrice
        : prod.cartonPrice ?? Math.round(effectiveUnitCost * qpc);

      const currentPieces = prod.currentStock ?? 0;
      const currentCartons = Math.floor(currentPieces / qpc);
      const loosePieces = currentPieces % qpc;
      const totalCostValue = Math.round(currentPieces * effectiveUnitCost);

      // Price trend (comparing latest with the one right before it)
      let priceTrend: "up" | "down" | "stable" | "new" = "stable";
      let trendDiff = 0;
      let trendPercent = 0;

      if (history.length >= 2) {
        const prev = history[history.length - 2];
        const latest = history[history.length - 1];
        trendDiff = latest.unitCost - prev.unitCost;
        trendPercent = prev.unitCost > 0 ? (trendDiff / prev.unitCost) * 100 : 0;
        if (trendDiff > 0.01) priceTrend = "up";
        else if (trendDiff < -0.01) priceTrend = "down";
        else priceTrend = "stable";
      } else {
        priceTrend = "new";
      }

      // Min and Max purchase cost
      const allPrices = history.map((h) => h.unitCost).filter((p) => p > 0);
      const minCost = allPrices.length > 0 ? Math.min(...allPrices) : effectiveUnitCost;
      const maxCost = allPrices.length > 0 ? Math.max(...allPrices) : effectiveUnitCost;
      const avgCost =
        allPrices.length > 0
          ? allPrices.reduce((acc, curr) => acc + curr, 0) / allPrices.length
          : effectiveUnitCost;

      return {
        ...prod,
        effectiveUnitCost,
        effectiveCartonCost,
        currentCartons,
        loosePieces,
        totalCostValue,
        purchasesCount,
        latestPurchaseDate: latestPurchase ? latestPurchase.date : "",
        firstPurchaseDate: firstPurchase ? firstPurchase.date : "",
        priceTrend,
        trendDiff,
        trendPercent,
        minCost,
        maxCost,
        avgCost,
        history,
      };
    });
  }, [products, productPurchaseMap]);

  // ── Filtered & Sorted Products ──
  const filteredProducts = useMemo(() => {
    return productsWithCostInfo
      .filter((p) => {
        if (selectedCategory !== "all" && p.categoryId !== selectedCategory) return false;
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.categoryName || "").toLowerCase().includes(q) ||
          (p.brand || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortField === "name") cmp = a.name.localeCompare(b.name);
        else if (sortField === "code") cmp = a.code.localeCompare(b.code);
        else if (sortField === "unitCost") cmp = a.effectiveUnitCost - b.effectiveUnitCost;
        else if (sortField === "stockValue") cmp = a.totalCostValue - b.totalCostValue;
        else if (sortField === "purchasesCount") cmp = a.purchasesCount - b.purchasesCount;
        else if (sortField === "date") cmp = safeDateSort(a.latestPurchaseDate, b.latestPurchaseDate, "asc");

        return sortOrder === "asc" ? cmp : -cmp;
      });
  }, [productsWithCostInfo, selectedCategory, searchTerm, sortField, sortOrder]);

  // ── Summary KPI Calculations ──
  const metrics = useMemo(() => {
    const totalProducts = productsWithCostInfo.length;
    const trackedWithCost = productsWithCostInfo.filter((p) => p.effectiveUnitCost > 0).length;
    const totalStockValue = productsWithCostInfo.reduce((sum, p) => sum + p.totalCostValue, 0);
    const avgUnitCost =
      trackedWithCost > 0
        ? productsWithCostInfo.reduce((sum, p) => sum + p.effectiveUnitCost, 0) / trackedWithCost
        : 0;
    const totalPurchaseEvents = allChronologicalPurchases.length;
    const costIncreasedCount = productsWithCostInfo.filter((p) => p.priceTrend === "up").length;
    const costDecreasedCount = productsWithCostInfo.filter((p) => p.priceTrend === "down").length;

    return {
      totalProducts,
      trackedWithCost,
      totalStockValue,
      avgUnitCost,
      totalPurchaseEvents,
      costIncreasedCount,
      costDecreasedCount,
    };
  }, [productsWithCostInfo, allChronologicalPurchases]);

  // ── Filtered Master Chronological Purchases Feed ──
  const filteredTimeline = useMemo(() => {
    return allChronologicalPurchases
      .filter((item) => {
        if (timelineProductFilter !== "all" && item.productId !== timelineProductFilter) return false;
        if (timelineSupplierFilter !== "all" && item.supplierId !== timelineSupplierFilter) return false;
        if (timelineStartDate && item.date < timelineStartDate) return false;
        if (timelineEndDate && item.date > timelineEndDate) return false;
        return true;
      })
      .sort((a, b) => safeDateSort(a.date, b.date, timelineSortOrder));
  }, [allChronologicalPurchases, timelineProductFilter, timelineSupplierFilter, timelineStartDate, timelineEndDate, timelineSortOrder]);

  // ── Active Product History for Modal ──
  const activeProductHistory = useMemo(() => {
    if (!selectedProduct) return [];
    const list = productPurchaseMap.get(selectedProduct.id) || [];
    return [...list].sort((a, b) => safeDateSort(a.date, b.date, historyOrder));
  }, [selectedProduct, productPurchaseMap, historyOrder]);

  // Chart data for selected product modal (always chronological oldest to newest)
  const productChartData = useMemo(() => {
    if (!selectedProduct) return [];
    const list = productPurchaseMap.get(selectedProduct.id) || [];
    return list.map((item, idx) => ({
      index: idx + 1,
      date: item.date,
      unitCost: item.unitCost,
      cartonPrice: item.cartonPrice,
      supplier: item.supplierName || "—",
      voucher: item.voucherId,
    }));
  }, [selectedProduct, productPurchaseMap]);

  // ── Open History Modal ──
  function handleOpenHistory(prod: Product) {
    setSelectedProduct(prod);
    setDetailModalOpen(true);
  }

  // ── Open Cost Update / Manual Entry Modal ──
  function handleOpenCostModal(prod: Product) {
    const existing = productsWithCostInfo.find((p) => p.id === prod.id);
    const currCost = existing?.effectiveUnitCost || prod.purchasePrice || prod.unitCost || 0;
    const qpc = prod.quantityPerCarton > 0 ? prod.quantityPerCarton : 1;

    setCostFormProduct(prod);
    setCostForm({
      date: todayIsoDate(),
      unitCost: currCost,
      cartonPrice: Math.round(currCost * qpc),
      cartonsReceived: 1,
      supplierId: prod.supplierId || "",
      notes: "Direct cost unit adjustment",
    });
    setCostModalOpen(true);
  }

  // ── Save Manual / Updated Cost Record ──
  async function handleSaveCostEntry() {
    if (!costFormProduct) return;
    if (costForm.unitCost <= 0) {
      toast({ title: "Please enter a valid unit cost greater than 0", variant: "destructive" });
      return;
    }

    setIsSavingCost(true);
    try {
      const qpc = costFormProduct.quantityPerCarton > 0 ? costFormProduct.quantityPerCarton : 1;
      const supp = suppliers.find((s) => s.id === costForm.supplierId);
      const totalPieces = costForm.cartonsReceived * qpc;
      const totalCost = costForm.unitCost * totalPieces;

      // 1. Record in PURCHASE_COST_HISTORY
      await create(COLLECTIONS.PURCHASE_COST_HISTORY, {
        productId: costFormProduct.id,
        productName: costFormProduct.name,
        productCode: costFormProduct.code,
        date: costForm.date,
        voucherId: `COST-${Date.now().toString().slice(-6)}`,
        supplierId: costForm.supplierId,
        supplierName: supp?.name || "Direct Supplier / Vendor",
        cartonsReceived: costForm.cartonsReceived,
        quantityPerCarton: qpc,
        unitCost: costForm.unitCost,
        cartonPrice: costForm.cartonPrice || Math.round(costForm.unitCost * qpc),
        totalCost,
        notes: costForm.notes,
        source: "manual",
        createdByName: user?.name || "Admin",
      });

      // 2. Update Product's current standard unitCost and purchasePrice
      await update(COLLECTIONS.PRODUCTS, costFormProduct.id, {
        unitCost: costForm.unitCost,
        purchasePrice: costForm.unitCost,
        cartonPrice: costForm.cartonPrice || Math.round(costForm.unitCost * qpc),
      });

      toast({
        title: "Unit Cost Recorded Successfully",
        description: `${costFormProduct.name} unit cost set to ${fmt(costForm.unitCost)} on ${costForm.date}`,
      });

      setCostModalOpen(false);
    } catch (err) {
      console.error("Failed to save cost entry:", err);
      toast({ title: "Failed to save unit cost", variant: "destructive" });
    } finally {
      setIsSavingCost(false);
    }
  }

  // ── Export Catalog to Excel ──
  function exportCatalogToExcel() {
    const data = filteredProducts.map((p, idx) => ({
      "No.": idx + 1,
      "Product Code / SKU": p.code,
      "Product Name": p.name,
      Category: p.categoryName || "—",
      Brand: p.brand || "—",
      "Pcs / Carton": p.quantityPerCarton || 1,
      "Stock (Cartons)": p.currentCartons,
      "Stock (Pieces)": p.currentStock || 0,
      "Current Unit Cost (ETB)": p.effectiveUnitCost,
      "Current Carton Cost (ETB)": p.effectiveCartonCost,
      "Total Inventory Value (ETB)": p.totalCostValue,
      "Purchases Count": p.purchasesCount,
      "Last Purchase Date": p.latestPurchaseDate || "—",
      "Cost Trend": p.priceTrend.toUpperCase(),
      "Trend %": p.trendPercent !== 0 ? `${p.trendPercent > 0 ? "+" : ""}${p.trendPercent.toFixed(1)}%` : "0%",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Product_Cost_Units");
    exportToExcel({
      workbook: wb,
      filename: `Product_Unit_Costs_${todayIsoDate()}.xlsx`,
      title: "YESERAHUT ERP — PRODUCT UNIT COSTS & INVENTORY VALUATION",
      subtitle: `Total Products: ${filteredProducts.length} | Valuation: ${fmt(metrics.totalStockValue)} | Date: ${formatSafeDate(new Date())}`,
    });
    toast({ title: "Product Cost Units exported to Excel" });
  }

  // ── Export Single Product History to Excel ──
  function exportProductHistoryExcel() {
    if (!selectedProduct) return;
    const history = productPurchaseMap.get(selectedProduct.id) || [];
    const sorted = [...history].sort((a, b) => safeDateSort(a.date, b.date, "asc"));

    const data = sorted.map((h, idx) => ({
      "Seq #": idx + 1,
      "Purchase Date": h.date,
      "Stock In Voucher": h.voucherId,
      Supplier: h.supplierName || "—",
      Store: h.storeName || "—",
      "Cartons Received": h.cartonsReceived,
      "Total Pieces": h.totalPieces,
      "Unit Cost (ETB)": h.unitCost,
      "Carton Cost (ETB)": h.cartonPrice,
      "Total Cost (ETB)": h.totalCost,
      "Price Shift (ETB)": h.priceDiffFromPrev ? `${h.priceDiffFromPrev > 0 ? "+" : ""}${h.priceDiffFromPrev.toFixed(2)}` : "0.00",
      "Shift %": h.priceDiffPercentFromPrev ? `${h.priceDiffPercentFromPrev > 0 ? "+" : ""}${h.priceDiffPercentFromPrev.toFixed(1)}%` : "0%",
      Source: h.source.toUpperCase(),
      Notes: h.notes || "—",
      "Recorded By": h.createdByName || "—",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase_Price_History");
    exportToExcel({
      workbook: wb,
      filename: `${selectedProduct.code}_Price_History_${todayIsoDate()}.xlsx`,
      title: `PURCHASE PRICE HISTORY — ${selectedProduct.name} (${selectedProduct.code})`,
      subtitle: `Recorded Purchases: ${sorted.length} | Generated: ${formatSafeDate(new Date())}`,
    });
    toast({ title: "Purchase Price History exported to Excel" });
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              <Calculator className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2">
                Cost Unit (የዕቃ ወጪ ዋጋ)
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                የሁሉም ምርቶች የአንድ ፍሬና የካርቶን የወጪ ዋጋ ክትትል እና በተለያየ ቀን የተገዙበት ዋጋ ታሪክ በቅደም ተከተል
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (catalogPrintRef.current) printElement(catalogPrintRef.current, "Product_Cost_Units");
            }}
            className="text-xs h-9"
          >
            <Printer className="w-3.5 h-3.5 mr-1" /> Print
          </Button>
          <Button variant="outline" size="sm" onClick={exportCatalogToExcel} className="text-xs h-9">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Export Excel
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border shadow-xs bg-slate-50/50 dark:bg-slate-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total Products (ጠቅላላ ምርቶች)
              </p>
              <h3 className="text-2xl font-bold font-mono mt-1 text-slate-900 dark:text-slate-100">
                {metrics.totalProducts}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {metrics.trackedWithCost} with unit cost tracked
              </p>
            </div>
            <div className="p-2.5 rounded-full bg-blue-100 dark:bg-blue-950 text-blue-600">
              <Package className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs bg-slate-50/50 dark:bg-slate-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Avg. Unit Cost (አማካይ ወጪ)
              </p>
              <h3 className="text-2xl font-bold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
                {fmt(metrics.avgUnitCost)}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Average piece purchase cost</p>
            </div>
            <div className="p-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600">
              <DollarSign className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs bg-slate-50/50 dark:bg-slate-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Inventory Valuation (ጠቅላላ ክምችት ወጪ)
              </p>
              <h3 className="text-2xl font-bold font-mono mt-1 text-purple-600 dark:text-purple-400">
                {fmt(metrics.totalStockValue)}
              </h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">Based on latest purchase costs</p>
            </div>
            <div className="p-2.5 rounded-full bg-purple-100 dark:bg-purple-950 text-purple-600">
              <Boxes className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-xs bg-slate-50/50 dark:bg-slate-900/50">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Purchase Price History (የግዢዎች ብዛት)
              </p>
              <h3 className="text-2xl font-bold font-mono mt-1 text-amber-600 dark:text-amber-400">
                {metrics.totalPurchaseEvents}
              </h3>
              <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> {metrics.costIncreasedCount} Up
                </span>
                <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                  <TrendingDown className="w-3 h-3" /> {metrics.costDecreasedCount} Down
                </span>
              </div>
            </div>
            <div className="p-2.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-600">
              <History className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main Navigation Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 dark:bg-slate-800 p-1">
          <TabsTrigger value="products" className="text-xs font-medium">
            <Package className="w-3.5 h-3.5 mr-1.5" />
            Products & Unit Costs (የምርቶች የወጪ ዋጋ)
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs font-medium">
            <Clock className="w-3.5 h-3.5 mr-1.5" />
            Chronological Purchase Timeline (ሙሉ የግዢ ዋጋ ታሪክ)
          </TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs font-medium">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            Cost Distribution (የወጪ ትንተና)
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════
            TAB 1: PRODUCTS & CURRENT UNIT COSTS
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="products" className="space-y-4">
          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search product name, code/SKU, category..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[160px] h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Select value={sortField} onValueChange={(v: any) => setSortField(v)}>
                <SelectTrigger className="w-[140px] h-9 text-xs">
                  <SelectValue placeholder="Sort By" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Product Name</SelectItem>
                  <SelectItem value="code">SKU Code</SelectItem>
                  <SelectItem value="unitCost">Unit Cost</SelectItem>
                  <SelectItem value="stockValue">Stock Value</SelectItem>
                  <SelectItem value="purchasesCount">Purchases Count</SelectItem>
                  <SelectItem value="date">Last Purchase Date</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setSortOrder((o) => (o === "asc" ? "desc" : "asc"))}
                className="h-9 px-2.5 text-xs"
                title={`Sort ${sortOrder === "asc" ? "Ascending" : "Descending"}`}
              >
                <ArrowUpDown className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* Products Table */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div ref={catalogPrintRef} className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Product / SKU</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-center">Pcs/Ctn</th>
                    <th className="py-2.5 px-3 text-center">Current Stock</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost (ETB)</th>
                    <th className="py-2.5 px-3 text-right hidden sm:table-cell">Carton Cost (ETB)</th>
                    <th className="py-2.5 px-3 text-right hidden md:table-cell">Total Stock Value</th>
                    <th className="py-2.5 px-3 text-center">Purchases / Trend</th>
                    <th className="py-2.5 px-3 hidden lg:table-cell">Last Purchase Date</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-muted-foreground">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600" />
                        Loading products and purchase unit costs...
                      </td>
                    </tr>
                  ) : filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-muted-foreground">
                        No products match the search filter.
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p) => {
                      return (
                        <tr
                          key={p.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-900/60 transition-colors"
                        >
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              {p.photoUrl ? (
                                <img
                                  src={p.photoUrl}
                                  alt={p.name}
                                  className="w-8 h-8 rounded-md object-cover border shrink-0 bg-slate-100 dark:bg-slate-800"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-md bg-slate-100 dark:bg-slate-800 border flex items-center justify-center text-muted-foreground shrink-0">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-slate-800 dark:text-slate-100 truncate max-w-[220px]">
                                  {p.name}
                                </div>
                                <div className="font-mono text-[10px] text-muted-foreground font-bold">
                                  {p.code}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                            {p.categoryName || "—"}
                          </td>

                          <td className="py-2.5 px-3 text-center font-mono text-slate-700 dark:text-slate-300">
                            {p.quantityPerCarton || 1}
                          </td>

                          <td className="py-2.5 px-3 text-center font-mono">
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {p.currentCartons} ctns
                            </span>
                            {p.loosePieces > 0 && (
                              <span className="text-[10px] text-muted-foreground ml-1">
                                +{p.loosePieces} pcs
                              </span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <span className="inline-block px-2 py-0.5 rounded font-mono font-bold text-xs bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              {fmt(p.effectiveUnitCost)}
                            </span>
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300 hidden sm:table-cell">
                            {fmt(p.effectiveCartonCost)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100 hidden md:table-cell">
                            {fmt(p.totalCostValue)}
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <div className="flex flex-col items-center gap-0.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] px-1.5 py-0 bg-blue-50/60 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200"
                              >
                                {p.purchasesCount} {p.purchasesCount === 1 ? "Purchase" : "Purchases"}
                              </Badge>

                              {p.priceTrend === "up" && (
                                <span className="text-[10px] font-semibold text-rose-600 flex items-center gap-0.5">
                                  <ArrowUpRight className="w-3 h-3" /> +{p.trendPercent.toFixed(1)}%
                                </span>
                              )}
                              {p.priceTrend === "down" && (
                                <span className="text-[10px] font-semibold text-emerald-600 flex items-center gap-0.5">
                                  <ArrowDownRight className="w-3 h-3" /> {p.trendPercent.toFixed(1)}%
                                </span>
                              )}
                              {p.priceTrend === "stable" && p.purchasesCount > 1 && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Minus className="w-2.5 h-2.5" /> Stable
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground hidden lg:table-cell">
                            {p.latestPurchaseDate ? formatSafeDate(p.latestPurchaseDate) : "—"}
                          </td>

                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenHistory(p)}
                                className="h-7 text-xs px-2 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                                title="View Chronological Purchase Price History"
                              >
                                <History className="w-3.5 h-3.5 mr-1" />
                                <span>History</span>
                              </Button>

                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleOpenCostModal(p)}
                                  className="h-7 text-xs px-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                                  title="Add or Update Unit Cost Record"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TAB 2: FULL CHRONOLOGICAL PURCHASE TIMELINE
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="timeline" className="space-y-4">
          <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
            <CardHeader className="p-4 pb-2 border-b bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-emerald-600" />
                    All Purchase History (በገዛሁበት ቀን ቅደም ተከተል የተመዘገቡ ግዢዎች)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Every Stock-In purchase transaction and historical price change recorded across all dates.
                  </CardDescription>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setTimelineSortOrder((o) => (o === "desc" ? "asc" : "desc"))}
                    className="text-xs h-8"
                  >
                    <ArrowUpDown className="w-3 h-3 mr-1" />
                    {timelineSortOrder === "desc" ? "Newest First (ከቅርብ ወደ ሩቅ)" : "Oldest First (ከመጀመሪያው ጀምሮ)"}
                  </Button>
                </div>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-3">
                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Filter by Product</Label>
                  <Select value={timelineProductFilter} onValueChange={setTimelineProductFilter}>
                    <SelectTrigger className="h-8 text-xs mt-0.5">
                      <SelectValue placeholder="All Products" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[220px]">
                      <SelectItem value="all">All Products (ሁሉም ምርቶች)</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.code} - {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">Filter by Supplier</Label>
                  <Select value={timelineSupplierFilter} onValueChange={setTimelineSupplierFilter}>
                    <SelectTrigger className="h-8 text-xs mt-0.5">
                      <SelectValue placeholder="All Suppliers" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Suppliers (ሁሉም አቅራቢዎች)</SelectItem>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">From Date (ከቀን)</Label>
                  <Input
                    type="date"
                    value={timelineStartDate}
                    onChange={(e) => setTimelineStartDate(e.target.value)}
                    className="h-8 text-xs mt-0.5"
                  />
                </div>

                <div>
                  <Label className="text-[10px] text-muted-foreground uppercase">To Date (እስከ ቀን)</Label>
                  <Input
                    type="date"
                    value={timelineEndDate}
                    onChange={(e) => setTimelineEndDate(e.target.value)}
                    className="h-8 text-xs mt-0.5"
                  />
                </div>
              </div>
            </CardHeader>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Purchase Date</th>
                    <th className="py-2.5 px-3">Voucher #</th>
                    <th className="py-2.5 px-3">Product Name & SKU</th>
                    <th className="py-2.5 px-3">Supplier</th>
                    <th className="py-2.5 px-3 text-center">Cartons</th>
                    <th className="py-2.5 px-3 text-center">Total Pcs</th>
                    <th className="py-2.5 px-3 text-right">Unit Cost</th>
                    <th className="py-2.5 px-3 text-right">Carton Cost</th>
                    <th className="py-2.5 px-3 text-right">Total Amount</th>
                    <th className="py-2.5 px-3 text-center">Price Shift</th>
                    <th className="py-2.5 px-3 text-center">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTimeline.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-muted-foreground">
                        No purchase records found matching your filters.
                      </td>
                    </tr>
                  ) : (
                    filteredTimeline.map((item) => {
                      const isUp = (item.priceDiffFromPrev || 0) > 0.01;
                      const isDown = (item.priceDiffFromPrev || 0) < -0.01;

                      return (
                        <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-900/60">
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                            {formatSafeDate(item.date)}
                          </td>

                          <td className="py-2.5 px-3 font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                            {item.voucherId}
                          </td>

                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-slate-800 dark:text-slate-100">
                              {item.productName}
                            </div>
                            <div className="font-mono text-[10px] text-muted-foreground">
                              {item.productCode}
                            </div>
                          </td>

                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                            {item.supplierName || "—"}
                          </td>

                          <td className="py-2.5 px-3 text-center font-mono">
                            {item.cartonsReceived}
                          </td>

                          <td className="py-2.5 px-3 text-center font-mono">
                            {item.totalPieces}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {fmt(item.unitCost)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                            {fmt(item.cartonPrice)}
                          </td>

                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {fmt(item.totalCost)}
                          </td>

                          <td className="py-2.5 px-3 text-center font-mono text-[11px]">
                            {isUp && (
                              <span className="text-rose-600 font-bold inline-flex items-center gap-0.5">
                                +{fmt(item.priceDiffFromPrev || 0)} (+{item.priceDiffPercentFromPrev?.toFixed(1)}%)
                              </span>
                            )}
                            {isDown && (
                              <span className="text-emerald-600 font-bold inline-flex items-center gap-0.5">
                                {fmt(item.priceDiffFromPrev || 0)} ({item.priceDiffPercentFromPrev?.toFixed(1)}%)
                              </span>
                            )}
                            {!isUp && !isDown && (
                              <span className="text-muted-foreground text-[10px]">⎯ Stable</span>
                            )}
                          </td>

                          <td className="py-2.5 px-3 text-center">
                            <Badge
                              variant="outline"
                              className={`text-[9px] uppercase px-1.5 py-0 ${
                                item.source === "stock_in"
                                  ? "border-emerald-300 text-emerald-700 bg-emerald-50/50"
                                  : item.source === "manual"
                                  ? "border-blue-300 text-blue-700 bg-blue-50/50"
                                  : "border-slate-300 text-slate-600"
                              }`}
                            >
                              {item.source}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TAB 3: COST DISTRIBUTION & ANALYTICS
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="analytics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Highest Unit Cost Products */}
            <Card className="border shadow-xs">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                  Top 8 Highest Unit Cost Products (ከፍተኛ የወጪ ዋጋ ያላቸው)
                </CardTitle>
                <CardDescription className="text-xs">
                  Products with the highest current unit purchase cost per piece.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={[...productsWithCostInfo]
                        .sort((a, b) => b.effectiveUnitCost - a.effectiveUnitCost)
                        .slice(0, 8)
                        .map((p) => ({
                          name: p.name.length > 14 ? p.name.slice(0, 12) + "..." : p.name,
                          unitCost: p.effectiveUnitCost,
                        }))}
                      margin={{ top: 10, right: 10, left: 10, bottom: 25 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="name" angle={-25} textAnchor="end" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RechartsTooltip formatter={(val: any) => fmt(val)} />
                      <Bar dataKey="unitCost" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Inventory Valuation by Category */}
            <Card className="border shadow-xs">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                  <PieChartIcon className="w-4 h-4 text-purple-600" />
                  Inventory Valuation by Category (በምድብ የክምችት ወጪ ድርሻ)
                </CardTitle>
                <CardDescription className="text-xs">
                  Total capital locked in inventory based on unit purchase cost.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 pt-2">
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categories
                          .map((cat) => {
                            const val = productsWithCostInfo
                              .filter((p) => p.categoryId === cat.id)
                              .reduce((s, p) => s + p.totalCostValue, 0);
                            return { name: cat.name, value: val };
                          })
                          .filter((c) => c.value > 0)}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      >
                        {["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4"].map(
                          (color, index) => (
                            <Cell key={`cell-${index}`} fill={color} />
                          )
                        )}
                      </Pie>
                      <RechartsTooltip formatter={(val: any) => fmt(val)} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ══════════════════════════════════════════════════════════════
          SINGLE PRODUCT CHRONOLOGICAL PURCHASE HISTORY MODAL
      ══════════════════════════════════════════════════════════════ */}
      <Dialog open={detailModalOpen} onOpenChange={setDetailModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedProduct && (
            <div className="space-y-4">
              <DialogHeader className="border-b pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    {selectedProduct.photoUrl ? (
                      <img
                        src={selectedProduct.photoUrl}
                        alt={selectedProduct.name}
                        className="w-12 h-12 rounded-lg object-cover border shrink-0 bg-slate-100"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                        <Calculator className="w-6 h-6" />
                      </div>
                    )}
                    <div>
                      <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                        {selectedProduct.name}
                      </DialogTitle>
                      <DialogDescription className="text-xs flex items-center gap-2 mt-0.5">
                        <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                          SKU: {selectedProduct.code}
                        </span>
                        <span>•</span>
                        <span>Category: {selectedProduct.categoryName || "Standard"}</span>
                        <span>•</span>
                        <span>Pcs/Carton: {selectedProduct.quantityPerCarton || 1}</span>
                      </DialogDescription>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (historyPrintRef.current) {
                          printElement(historyPrintRef.current, `${selectedProduct.code}_Price_History`);
                        }
                      }}
                      className="text-xs h-8"
                    >
                      <Printer className="w-3.5 h-3.5 mr-1" /> Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={exportProductHistoryExcel} className="text-xs h-8">
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Excel
                    </Button>
                    {isAdmin && (
                      <Button
                        size="sm"
                        onClick={() => handleOpenCostModal(selectedProduct)}
                        className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Past Cost
                      </Button>
                    )}
                  </div>
                </div>
              </DialogHeader>

              {/* Printable container */}
              <div ref={historyPrintRef} className="space-y-4">
                {/* Product Stats Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Current Unit Cost
                    </span>
                    <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {fmt(
                        productPurchaseMap.get(selectedProduct.id)?.slice(-1)[0]?.unitCost ||
                          selectedProduct.purchasePrice ||
                          selectedProduct.unitCost ||
                          0
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Initial Purchase Cost
                    </span>
                    <div className="text-lg font-bold font-mono text-slate-700 dark:text-slate-300 mt-0.5">
                      {fmt(
                        productPurchaseMap.get(selectedProduct.id)?.[0]?.unitCost ||
                          selectedProduct.purchasePrice ||
                          selectedProduct.unitCost ||
                          0
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Total Purchases Tracked
                    </span>
                    <div className="text-lg font-bold font-mono text-blue-600 mt-0.5">
                      {activeProductHistory.length} Recorded
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">
                      Current Stock Valuation
                    </span>
                    <div className="text-lg font-bold font-mono text-purple-600 mt-0.5">
                      {fmt(
                        (selectedProduct.currentStock || 0) *
                          (productPurchaseMap.get(selectedProduct.id)?.slice(-1)[0]?.unitCost ||
                            selectedProduct.purchasePrice ||
                            selectedProduct.unitCost ||
                            0)
                      )}
                    </div>
                  </div>
                </div>

                {/* Purchase Price Progression Chart */}
                {productChartData.length > 1 && (
                  <Card className="border shadow-2xs">
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                        Purchase Unit Cost Trend over Dates (የዋጋ ለውጥ በየቀኑ ቅደም ተከተል)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-3 pt-0">
                      <div className="h-[180px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={productChartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis
                              dataKey="date"
                              tick={{ fontSize: 10 }}
                              tickFormatter={(d) => formatSafeDate(d).slice(0, 10)}
                            />
                            <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                            <RechartsTooltip
                              formatter={(val: any) => [fmt(val), "Unit Cost"]}
                              labelFormatter={(label) => `Date: ${formatSafeDate(label)}`}
                            />
                            <Line
                              type="monotone"
                              dataKey="unitCost"
                              stroke="#10b981"
                              strokeWidth={2.5}
                              dot={{ r: 4, fill: "#10b981" }}
                              activeDot={{ r: 6 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Chronological Table of Purchases */}
                <div className="border rounded-md overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-900 px-3 py-2 border-b flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                      Chronological Purchase Log (በገዛሁበት ቀን ቅደም ተከተል የተገዛበት ዋጋ)
                    </span>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setHistoryOrder((o) => (o === "desc" ? "asc" : "desc"))}
                      className="h-7 text-xs px-2 text-slate-600"
                    >
                      <ArrowUpDown className="w-3 h-3 mr-1" />
                      {historyOrder === "desc" ? "Newest First" : "Oldest First"}
                    </Button>
                  </div>

                  <div className="overflow-x-auto max-h-[300px]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50 dark:bg-slate-900 border-b text-muted-foreground font-semibold uppercase text-[10px] tracking-wider sticky top-0 z-10">
                        <tr>
                          <th className="py-2 px-3">#</th>
                          <th className="py-2 px-3">Purchase Date</th>
                          <th className="py-2 px-3">Voucher #</th>
                          <th className="py-2 px-3">Supplier</th>
                          <th className="py-2 px-3 text-center">Cartons</th>
                          <th className="py-2 px-3 text-center">Total Pcs</th>
                          <th className="py-2 px-3 text-right">Unit Cost (ETB)</th>
                          <th className="py-2 px-3 text-right">Carton Cost (ETB)</th>
                          <th className="py-2 px-3 text-right">Total Cost</th>
                          <th className="py-2 px-3 text-center">Price Shift</th>
                          <th className="py-2 px-3">Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {activeProductHistory.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-8 text-center text-muted-foreground">
                              No purchase history recorded for this product yet.
                            </td>
                          </tr>
                        ) : (
                          activeProductHistory.map((h, idx) => {
                            const isUp = (h.priceDiffFromPrev || 0) > 0.01;
                            const isDown = (h.priceDiffFromPrev || 0) < -0.01;

                            return (
                              <tr key={h.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                                <td className="py-2 px-3 font-mono text-[10px] text-muted-foreground">
                                  {historyOrder === "desc"
                                    ? activeProductHistory.length - idx
                                    : idx + 1}
                                </td>

                                <td className="py-2 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {formatSafeDate(h.date)}
                                </td>

                                <td className="py-2 px-3 font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                                  {h.voucherId}
                                </td>

                                <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                                  {h.supplierName || "—"}
                                </td>

                                <td className="py-2 px-3 text-center font-mono">
                                  {h.cartonsReceived}
                                </td>

                                <td className="py-2 px-3 text-center font-mono">
                                  {h.totalPieces}
                                </td>

                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {fmt(h.unitCost)}
                                </td>

                                <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                                  {fmt(h.cartonPrice)}
                                </td>

                                <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                                  {fmt(h.totalCost)}
                                </td>

                                <td className="py-2 px-3 text-center font-mono text-[11px]">
                                  {isUp && (
                                    <span className="text-rose-600 font-bold inline-flex items-center gap-0.5">
                                      +{fmt(h.priceDiffFromPrev || 0)} ({h.priceDiffPercentFromPrev?.toFixed(1)}%)
                                    </span>
                                  )}
                                  {isDown && (
                                    <span className="text-emerald-600 font-bold inline-flex items-center gap-0.5">
                                      {fmt(h.priceDiffFromPrev || 0)} ({h.priceDiffPercentFromPrev?.toFixed(1)}%)
                                    </span>
                                  )}
                                  {!isUp && !isDown && (
                                    <span className="text-muted-foreground text-[10px]">⎯ Stable</span>
                                  )}
                                </td>

                                <td className="py-2 px-3 text-muted-foreground text-[11px] max-w-[150px] truncate" title={h.notes}>
                                  {h.notes || "—"}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button size="sm" onClick={() => setDetailModalOpen(false)} className="text-xs">
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════
          MANUAL / PAST PURCHASE COST ENTRY MODAL
      ══════════════════════════════════════════════════════════════ */}
      <Dialog open={costModalOpen} onOpenChange={setCostModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-600" />
              Add / Update Purchase Cost (የግዢ ወጪ መዝግብ)
            </DialogTitle>
            <DialogDescription className="text-xs">
              {costFormProduct ? `${costFormProduct.name} (${costFormProduct.code})` : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div>
              <Label className="text-xs">Purchase Date (የተገዛበት ቀን) *</Label>
              <Input
                type="date"
                value={costForm.date}
                onChange={(e) => setCostForm({ ...costForm, date: e.target.value })}
                className="h-9 text-xs mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Unit Cost (የአንድ ፍሬ ወጪ) *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={costForm.unitCost || ""}
                  onChange={(e) => {
                    const u = parseFloat(e.target.value) || 0;
                    const qpc = costFormProduct?.quantityPerCarton || 1;
                    setCostForm({
                      ...costForm,
                      unitCost: u,
                      cartonPrice: Math.round(u * qpc),
                    });
                  }}
                  className="h-9 text-xs mt-1 font-mono font-bold"
                  placeholder="0.00"
                />
              </div>

              <div>
                <Label className="text-xs">Carton Cost (የካርቶን ወጪ)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={costForm.cartonPrice || ""}
                  onChange={(e) => {
                    const c = parseFloat(e.target.value) || 0;
                    const qpc = costFormProduct?.quantityPerCarton || 1;
                    setCostForm({
                      ...costForm,
                      cartonPrice: c,
                      unitCost: qpc > 0 ? parseFloat((c / qpc).toFixed(2)) : 0,
                    });
                  }}
                  className="h-9 text-xs mt-1 font-mono"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cartons Purchased (ካርቶን)</Label>
                <Input
                  type="number"
                  min={1}
                  value={costForm.cartonsReceived || ""}
                  onChange={(e) =>
                    setCostForm({ ...costForm, cartonsReceived: parseInt(e.target.value, 10) || 1 })
                  }
                  className="h-9 text-xs mt-1 font-mono"
                />
              </div>

              <div>
                <Label className="text-xs">Supplier (አቅራቢ)</Label>
                <Select
                  value={costForm.supplierId}
                  onValueChange={(val) => setCostForm({ ...costForm, supplierId: val })}
                >
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue placeholder="Select Supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Notes / Memo (ማስታወሻ)</Label>
              <Input
                value={costForm.notes}
                onChange={(e) => setCostForm({ ...costForm, notes: e.target.value })}
                placeholder="Reason or invoice reference"
                className="h-9 text-xs mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCostModalOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveCostEntry}
              disabled={isSavingCost}
              className="text-xs bg-emerald-600 hover:bg-emerald-700"
            >
              {isSavingCost ? "Saving..." : "Save Cost Entry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
