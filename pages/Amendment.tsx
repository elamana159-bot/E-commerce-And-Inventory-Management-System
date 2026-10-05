import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  SlidersHorizontal,
  Search,
  FileDown,
  RefreshCw,
  Edit3,
  Package,
  Tags,
  Split,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Eye,
  Filter,
  Plus,
  Minus,
  Sparkles,
  Info,
  Check,
  Building,
  Layers,
  ArrowRight,
  Boxes,
  Hash,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Sigma,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getAll, update, COLLECTIONS } from "@/firestore";
import { fmt } from "@/lib/currency";
import type { Product, Category, Store, CartonSizeItem, CartonCategorySummary, BinningVoucher } from "@/types";
import { CartonBreakdownViewer } from "@/components/CartonBreakdownViewer";
import { ProductSizeRangeSelector } from "@/components/ProductSizeRangeSelector";
import { exportToExcel, exportToPdf } from "@/lib/shareImage";
import {
  matchCategoriesForSizes,
  calculateCartonBreakdown,
  formatCartonBreakdownSummary,
} from "@/categorySizeUtils";
import { buildStyledWorksheet, XLSX } from "@/excelExportUtils";
import { replaceBrandInTitle } from "@/lib/brandConfig";

export interface EnrichedCategoryAllocation extends CartonCategorySummary {
  cartons: number;
  stockCartons: number;
  unapprovedBinningCartons: number;
  totalCategoryPieces: number;
  stockPieces: number;
  binningPieces: number;
}

export interface SegregatedCategoryItem {
  id: string;
  productId: string;
  product: Product;
  productName: string;
  productCode: string;
  barcodeValue: string;
  supplierName?: string;
  photoUrl?: string;
  cartonNumberRange: string;
  startCartonNumber: number;
  endCartonNumber: number;
  categoryName: string;
  categoryId?: string;
  isMultiCategory: boolean;
  totalCategoriesInProduct: number;
  categoryIndex: number;
  allCategoryNames: string[];
  categorySizes: string[];
  categorySizeRange: string;
  categoryBreakdownItems: CartonSizeItem[];
  piecesPerCarton: number;
  categoryPercentage: number;
  stockCartons: number;
  unapprovedBinningCartons: number;
  totalCartons: number;
  totalCategoryPieces: number;
  stockCategoryPieces: number;
  binningCategoryPieces: number;
  sellingPrice: number;
  cartonPrice: number;
  parentAnalysis: EnrichedProductAnalysis;
}

interface EnrichedProductAnalysis {
  product: Product;
  cartonNumberRange: string;
  startCartonNumber: number;
  endCartonNumber: number;
  cartonSequenceIndex: number;
  sizes: string[];
  sizeRange: string;
  quantityPerCarton: number;
  breakdownItems: CartonSizeItem[];
  categorySummaries: EnrichedCategoryAllocation[];
  isMultiCategory: boolean;
  categoryNames: string[];
  stockCartons: number;
  unapprovedBinningCartons: number;
  totalCartons: number;
  stockPieces: number;
  unapprovedBinningPieces: number;
  totalPieces: number;
  primaryCategoryName: string;
  hasCustomBreakdown: boolean;
  unapprovedVoucherCount: number;
}

export type AmendmentSortField = "category" | "cartonNumber" | "name" | "code" | "cartons" | "pieces";
export type AmendmentSortDirection = "asc" | "desc";

export interface CategoryGroupSection<T> {
  categoryKey: string;
  categoryName: string;
  categoryId?: string;
  sizeRange?: string;
  items: T[];
  subtotal: {
    productCount: number;
    stockCartons: number;
    unapprovedBinningCartons: number;
    totalCartons: number;
    totalPieces: number;
    stockPieces?: number;
    binningPieces?: number;
  };
}

export default function Amendment() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeBalances, setStoreBalances] = useState<any[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("all");
  const [categoryTypeFilter, setCategoryTypeFilter] = useState<"all" | "multi" | "single" | "binning">("all");
  const [selectedStoreFilter, setSelectedStoreFilter] = useState("all");
  const [showCategoryLedger, setShowCategoryLedger] = useState(false);
  const [viewMode, setViewMode] = useState<"segregated" | "product">("segregated");

  // Sorting & Category Grouping
  const [sortField, setSortField] = useState<AmendmentSortField>("category");
  const [sortDirection, setSortDirection] = useState<AmendmentSortDirection>("asc");
  const [groupByCategory, setGroupByCategory] = useState<boolean>(true);

  // Amendment modal state
  const [amendProduct, setAmendProduct] = useState<Product | null>(null);
  const [amendSizeString, setAmendSizeString] = useState("");
  const [amendSizesArray, setAmendSizesArray] = useState<string[]>([]);
  const [amendSizeRange, setAmendSizeRange] = useState("");
  const [amendQpc, setAmendQpc] = useState<number>(1);
  const [amendCategoryId, setAmendCategoryId] = useState("");
  const [amendBreakdown, setAmendBreakdown] = useState<CartonSizeItem[]>([]);
  const [amendCategorySummaries, setAmendCategorySummaries] = useState<CartonCategorySummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // View modal
  const [viewProductAnalysis, setViewProductAnalysis] = useState<EnrichedProductAnalysis | null>(null);

  // Binning Vouchers (Pending / Draft / Unapproved)
  const [binningVouchers, setBinningVouchers] = useState<BinningVoucher[]>([]);

  async function loadData() {
    setLoading(true);
    try {
      const [prods, cats, strs, balances, binnings] = await Promise.all([
        getAll<Product>(COLLECTIONS.PRODUCTS),
        getAll<Category>(COLLECTIONS.CATEGORIES),
        getAll<Store>(COLLECTIONS.STORES),
        getAll<any>(COLLECTIONS.STORE_BALANCE).catch(() => []),
        getAll<BinningVoucher>(COLLECTIONS.BINNING).catch(() => []),
      ]);
      setProducts(prods || []);
      setCategories(cats || []);
      setStores(strs || []);
      setStoreBalances(balances || []);
      setBinningVouchers(binnings || []);
    } catch (err: any) {
      toast({
        title: "Error loading data",
        description: err.message || "Failed to load products and categories",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  // Compute enriched analysis for all products, incorporating unapproved binning and all category allocations
  const enrichedProducts: EnrichedProductAnalysis[] = useMemo(() => {
    // 1. Isolate unapproved binning vouchers (draft / pending / not approved and not voided)
    const unapprovedBinnings = (binningVouchers || []).filter(
      v => Boolean(v) && !v.isVoided && v.status !== "approved" && v.status !== "voided"
    );

    let runningCarton = 0;

    return products.map((p, index) => {
      const primaryCat = categories.find(c => c.id === p.categoryId);
      const rawSizes = p.sizes && p.sizes.length > 0 
        ? p.sizes 
        : (p.size ? p.size.split(",").map(s => s.trim()).filter(Boolean) : []);
      
      const qpc = Math.max(1, Number(p.quantityPerCarton) || 1);

      // Compute or use existing breakdown
      let breakdownItems: CartonSizeItem[] = [];
      let baseCategorySummaries: CartonCategorySummary[] = [];

      if (p.cartonBreakdown && p.cartonBreakdown.length > 0) {
        breakdownItems = p.cartonBreakdown;
        baseCategorySummaries = p.cartonCategoryBreakdown || [];
      } else {
        const computed = calculateCartonBreakdown(rawSizes, qpc, categories, p.categoryId);
        breakdownItems = computed.items;
        baseCategorySummaries = computed.categorySummaries;
      }

      // If no category summaries returned, ensure primary category fallback
      if (baseCategorySummaries.length === 0) {
        baseCategorySummaries = [{
          categoryId: primaryCat?.id || p.categoryId,
          categoryName: primaryCat?.name || p.categoryName || "General",
          count: qpc,
          percentage: 100,
          sizes: rawSizes,
        }];
      }

      // Collect all distinct matched categories
      const distinctCategoryNames = Array.from(
        new Set(
          baseCategorySummaries.map(c => c.categoryName).filter(Boolean)
        )
      );

      if (distinctCategoryNames.length === 0 && primaryCat?.name) {
        distinctCategoryNames.push(primaryCat.name);
      }

      const isMultiCategory = distinctCategoryNames.length >= 2;

      // 1. Calculate store stock cartons (approved inventory in stores)
      let stockCartons = p.currentStock || 0;
      if (storeBalances.length > 0) {
        const productStoreBalances = storeBalances.filter(b => {
          const matchProd = b.productId === p.id;
          if (selectedStoreFilter !== "all") {
            return matchProd && b.storeId === selectedStoreFilter;
          }
          return matchProd;
        });
        if (productStoreBalances.length > 0) {
          stockCartons = productStoreBalances.reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);
        }
      }
      const stockPieces = stockCartons * qpc;

      // 2. Calculate Unapproved Binning Cartons (Pending in Binning vouchers)
      const relevantUnapprovedBinnings = unapprovedBinnings.filter(v => {
        if (selectedStoreFilter !== "all") {
          return v.storeId === selectedStoreFilter;
        }
        return true;
      });

      const unapprovedItems = relevantUnapprovedBinnings
        .flatMap(v => (Array.isArray(v.items) ? v.items : []))
        .filter(item => {
          if (!item) return false;
          return (
            item.productId === p.id ||
            (p.code && item.productCode && item.productCode.trim().toLowerCase() === p.code.trim().toLowerCase()) ||
            (!p.code && item.productName && item.productName.trim().toLowerCase() === p.name.trim().toLowerCase())
          );
        });

      const unapprovedBinningCartons = unapprovedItems.reduce((sum, item) => sum + (Number(item.cartons) || 0), 0);
      const unapprovedBinningPieces = unapprovedBinningCartons * qpc;

      // 3. Combined Total Cartons & Pieces
      const totalCartons = stockCartons + unapprovedBinningCartons;
      const totalPieces = totalCartons * qpc;

      // Sequential Carton Number calculation based on product order and cartons held
      let startCartonNumber = 0;
      let endCartonNumber = 0;
      let cartonNumberRange = "-";

      if (totalCartons > 0) {
        startCartonNumber = runningCarton + 1;
        endCartonNumber = runningCarton + totalCartons;
        cartonNumberRange = startCartonNumber === endCartonNumber
          ? `${startCartonNumber}`
          : `${startCartonNumber} - ${endCartonNumber}`;
        runningCarton = endCartonNumber;
      }

      // 4. In EVERY category the product belongs to (multi-category or single),
      // enter the product's carton quantity and calculate category piece totals
      const enrichedCategorySummaries: EnrichedCategoryAllocation[] = baseCategorySummaries.map(cat => ({
        ...cat,
        cartons: totalCartons,
        stockCartons,
        unapprovedBinningCartons,
        totalCategoryPieces: totalCartons * cat.count,
        stockPieces: stockCartons * cat.count,
        binningPieces: unapprovedBinningCartons * cat.count,
      }));

      const unapprovedVoucherCount = relevantUnapprovedBinnings.filter(v =>
        (v.items || []).some(item =>
          item.productId === p.id ||
          (p.code && item.productCode && item.productCode.trim().toLowerCase() === p.code.trim().toLowerCase())
        )
      ).length;

      return {
        product: p,
        cartonNumberRange,
        startCartonNumber,
        endCartonNumber,
        cartonSequenceIndex: index + 1,
        sizes: rawSizes,
        sizeRange: p.sizeRange || (rawSizes.length > 0 ? `${rawSizes[0]}-${rawSizes[rawSizes.length - 1]}` : ""),
        quantityPerCarton: qpc,
        breakdownItems,
        categorySummaries: enrichedCategorySummaries,
        isMultiCategory,
        categoryNames: distinctCategoryNames,
        stockCartons,
        unapprovedBinningCartons,
        totalCartons,
        stockPieces,
        unapprovedBinningPieces,
        totalPieces,
        primaryCategoryName: primaryCat?.name || p.categoryName || "General",
        hasCustomBreakdown: Boolean(p.cartonBreakdown && p.cartonBreakdown.length > 0),
        unapprovedVoucherCount,
      };
    });
  }, [products, categories, storeBalances, binningVouchers, selectedStoreFilter]);

  // Filtered list
  const filteredProducts = useMemo(() => {
    return enrichedProducts.filter(item => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.product.name.toLowerCase().includes(q);
        const matchesCode = (item.product.code || "").toLowerCase().includes(q);
        const matchesBarcode = (item.product.barcodeValue || "").toLowerCase().includes(q);
        const matchesCategory = item.categoryNames.some(c => c.toLowerCase().includes(q));
        const matchesSize = item.sizes.some(s => s.toLowerCase().includes(q));
        if (!matchesName && !matchesCode && !matchesBarcode && !matchesCategory && !matchesSize) {
          return false;
        }
      }

      // 2. Category Filter (Matches primary or any category in multi-category)
      if (selectedCategoryFilter !== "all") {
        const selectedCat = categories.find(c => c.id === selectedCategoryFilter);
        const catName = selectedCat?.name.toLowerCase() || "";
        const hasCategory = item.product.categoryId === selectedCategoryFilter ||
          item.categoryNames.some(c => c.toLowerCase() === catName) ||
          item.categorySummaries.some(c => c.categoryId === selectedCategoryFilter);
        if (!hasCategory) return false;
      }

      // 3. Multi-Category vs Single-Category vs Unapproved Binning Filter
      if (categoryTypeFilter === "multi" && !item.isMultiCategory) {
        return false;
      }
      if (categoryTypeFilter === "single" && item.isMultiCategory) {
        return false;
      }
      if (categoryTypeFilter === "binning" && item.unapprovedBinningCartons <= 0) {
        return false;
      }

      return true;
    });
  }, [enrichedProducts, searchQuery, selectedCategoryFilter, categoryTypeFilter, categories]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const totalCount = enrichedProducts.length;
    const multiCategoryCount = enrichedProducts.filter(p => p.isMultiCategory).length;
    const singleCategoryCount = totalCount - multiCategoryCount;
    const totalStoreCartons = enrichedProducts.reduce((sum, p) => sum + p.stockCartons, 0);
    const totalUnapprovedBinningCartons = enrichedProducts.reduce((sum, p) => sum + p.unapprovedBinningCartons, 0);
    const totalCartonsAll = enrichedProducts.reduce((sum, p) => sum + p.totalCartons, 0);
    const totalPiecesAll = enrichedProducts.reduce((sum, p) => sum + p.totalPieces, 0);
    const productsWithUnapprovedBinning = enrichedProducts.filter(p => p.unapprovedBinningCartons > 0).length;

    // Distribution across all categories:
    // In EVERY category a product belongs to (multi-category or single), the product's carton quantity is recorded
    const categoryDistributionMap = new Map<string, {
      productCount: number;
      cartonCount: number;
      stockCartons: number;
      unapprovedBinningCartons: number;
      pieceCount: number;
    }>();

    categories.forEach(cat => {
      categoryDistributionMap.set(cat.name, {
        productCount: 0,
        cartonCount: 0,
        stockCartons: 0,
        unapprovedBinningCartons: 0,
        pieceCount: 0,
      });
    });

    enrichedProducts.forEach(item => {
      item.categorySummaries.forEach(catSummary => {
        const name = catSummary.categoryName;
        const current = categoryDistributionMap.get(name) || {
          productCount: 0,
          cartonCount: 0,
          stockCartons: 0,
          unapprovedBinningCartons: 0,
          pieceCount: 0,
        };
        current.productCount += 1;
        // Carton quantity entered into every category the product belongs to
        current.cartonCount += item.totalCartons;
        current.stockCartons += item.stockCartons;
        current.unapprovedBinningCartons += item.unapprovedBinningCartons;
        current.pieceCount += catSummary.totalCategoryPieces;
        categoryDistributionMap.set(name, current);
      });
    });

    return {
      totalCount,
      multiCategoryCount,
      singleCategoryCount,
      totalStoreCartons,
      totalUnapprovedBinningCartons,
      productsWithUnapprovedBinning,
      totalCartonsAll,
      totalPiecesAll,
      categoryDistribution: Array.from(categoryDistributionMap.entries()).map(([name, data]) => ({
        categoryName: name,
        productCount: data.productCount,
        cartonCount: data.cartonCount,
        stockCartons: data.stockCartons,
        unapprovedBinningCartons: data.unapprovedBinningCartons,
        pieceCount: data.pieceCount,
      })),
    };
  }, [enrichedProducts, categories]);

  // Selected category object (if a single category is chosen in filter)
  const selectedCategoryObj = useMemo(() => {
    if (selectedCategoryFilter === "all") return null;
    return categories.find(c => c.id === selectedCategoryFilter) || null;
  }, [selectedCategoryFilter, categories]);

  // All products decomposed / segregated per category
  const allSegregatedItems = useMemo<SegregatedCategoryItem[]>(() => {
    return enrichedProducts.flatMap(item => {
      const p = item.product;
      const summaries = item.categorySummaries && item.categorySummaries.length > 0
        ? item.categorySummaries
        : [{
            categoryId: p.categoryId,
            categoryName: item.primaryCategoryName || "General",
            count: item.quantityPerCarton,
            percentage: 100,
            sizes: item.sizes,
            cartons: item.totalCartons,
            stockCartons: item.stockCartons,
            unapprovedBinningCartons: item.unapprovedBinningCartons,
            totalCategoryPieces: item.totalPieces,
            stockPieces: item.stockPieces,
            binningPieces: item.unapprovedBinningPieces,
          }];

      return summaries.map((catSummary, idx) => {
        const catSizes = catSummary.sizes && catSummary.sizes.length > 0
          ? catSummary.sizes
          : item.sizes;

        const catSizeRange = catSizes.length > 0
          ? `${catSizes[0]}-${catSizes[catSizes.length - 1]}`
          : item.sizeRange;

        // Breakdown items specifically matching this category
        const catBreakdown = item.breakdownItems.filter(b =>
          catSizes.includes(b.size) ||
          (b.categoryName && b.categoryName.toLowerCase().trim() === catSummary.categoryName.toLowerCase().trim()) ||
          (b.categoryId && catSummary.categoryId && b.categoryId === catSummary.categoryId)
        );

        const safeBreakdown = catBreakdown.length > 0
          ? catBreakdown
          : catSizes.map(sz => ({
              size: sz,
              count: Math.max(1, Math.round(catSummary.count / Math.max(1, catSizes.length))),
              categoryName: catSummary.categoryName,
              categoryId: catSummary.categoryId,
              percentage: Math.round(100 / Math.max(1, catSizes.length)),
            }));

        const totalCategoryPieces = item.totalCartons * catSummary.count;
        const stockCategoryPieces = item.stockCartons * catSummary.count;
        const binningCategoryPieces = item.unapprovedBinningCartons * catSummary.count;

        return {
          id: `${p.id}_${catSummary.categoryId || catSummary.categoryName}_${idx}`,
          productId: p.id,
          product: p,
          productName: p.name,
          productCode: p.code || "NO-SKU",
          barcodeValue: p.barcodeValue || "",
          supplierName: p.supplierName,
          photoUrl: p.photoUrl,
          cartonNumberRange: item.cartonNumberRange,
          startCartonNumber: item.startCartonNumber,
          endCartonNumber: item.endCartonNumber,
          categoryName: catSummary.categoryName,
          categoryId: catSummary.categoryId,
          isMultiCategory: item.isMultiCategory,
          totalCategoriesInProduct: summaries.length,
          categoryIndex: idx,
          allCategoryNames: item.categoryNames,
          categorySizes: catSizes,
          categorySizeRange: catSizeRange,
          categoryBreakdownItems: safeBreakdown,
          piecesPerCarton: catSummary.count,
          categoryPercentage: catSummary.percentage,
          stockCartons: item.stockCartons,
          unapprovedBinningCartons: item.unapprovedBinningCartons,
          totalCartons: item.totalCartons,
          totalCategoryPieces,
          stockCategoryPieces,
          binningCategoryPieces,
          sellingPrice: p.sellingPrice || 0,
          cartonPrice: p.cartonPrice || (p.sellingPrice ? p.sellingPrice * item.quantityPerCarton : 0),
          parentAnalysis: item,
        };
      });
    });
  }, [enrichedProducts]);

  // Filtered segregated category items
  // When a category is selected: ONLY this category's rows are shown (without merging or including others!)
  const filteredSegregatedItems = useMemo(() => {
    return allSegregatedItems.filter(item => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = item.productName.toLowerCase().includes(q);
        const matchesCode = item.productCode.toLowerCase().includes(q);
        const matchesBarcode = item.barcodeValue.toLowerCase().includes(q);
        const matchesCategory = item.categoryName.toLowerCase().includes(q);
        const matchesSize = item.categorySizes.some(s => s.toLowerCase().includes(q));
        if (!matchesName && !matchesCode && !matchesBarcode && !matchesCategory && !matchesSize) {
          return false;
        }
      }

      // 2. Category Filter (Matches STRICTLY this category!)
      if (selectedCategoryFilter !== "all" && selectedCategoryObj) {
        const selectedCatName = selectedCategoryObj.name.toLowerCase().trim();
        const matches = (item.categoryId && item.categoryId === selectedCategoryFilter) ||
          item.categoryName.toLowerCase().trim() === selectedCatName;
        if (!matches) return false;
      }

      // 3. Category Type Filter (All / Multi / Single / Binning)
      if (categoryTypeFilter === "multi" && !item.isMultiCategory) return false;
      if (categoryTypeFilter === "single" && item.isMultiCategory) return false;
      if (categoryTypeFilter === "binning" && item.unapprovedBinningCartons <= 0) return false;

      return true;
    });
  }, [allSegregatedItems, searchQuery, selectedCategoryFilter, selectedCategoryObj, categoryTypeFilter]);

  // Category Focus Metrics (strictly for the selected category without merging others)
  const selectedCategoryMetrics = useMemo(() => {
    if (selectedCategoryFilter === "all" || !selectedCategoryObj) return null;
    const itemsInCat = allSegregatedItems.filter(item =>
      (item.categoryId && item.categoryId === selectedCategoryFilter) ||
      item.categoryName.toLowerCase().trim() === selectedCategoryObj.name.toLowerCase().trim()
    );

    const totalProducts = itemsInCat.length;
    const multiCatProducts = itemsInCat.filter(i => i.isMultiCategory).length;
    const singleCatProducts = totalProducts - multiCatProducts;
    const storeCartons = itemsInCat.reduce((sum, i) => sum + i.stockCartons, 0);
    const binningCartons = itemsInCat.reduce((sum, i) => sum + i.unapprovedBinningCartons, 0);
    const totalCartons = itemsInCat.reduce((sum, i) => sum + i.totalCartons, 0);
    const totalPieces = itemsInCat.reduce((sum, i) => sum + i.totalCategoryPieces, 0);
    const storePieces = itemsInCat.reduce((sum, i) => sum + i.stockCategoryPieces, 0);
    const binningPieces = itemsInCat.reduce((sum, i) => sum + i.binningCategoryPieces, 0);

    return {
      category: selectedCategoryObj,
      totalProducts,
      multiCatProducts,
      singleCatProducts,
      storeCartons,
      binningCartons,
      totalCartons,
      totalPieces,
      storePieces,
      binningPieces,
    };
  }, [selectedCategoryFilter, selectedCategoryObj, allSegregatedItems]);

  // Toggle or change sort field
  function handleSort(field: AmendmentSortField) {
    if (sortField === field) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection(field === "cartons" || field === "pieces" ? "desc" : "asc");
    }
  }

  // Sorted Segregated Items (በምድብ፣ በካርቶን ቁጥር፣ በእቃ ስም፣ በኮድ ወይም በካርቶን ብዛት መደርደር)
  const sortedSegregatedItems = useMemo(() => {
    const items = [...filteredSegregatedItems];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortField === "category") {
        const catIdxA = categories.findIndex(c => (a.categoryId && c.id === a.categoryId) || c.name.toLowerCase().trim() === a.categoryName.toLowerCase().trim());
        const catIdxB = categories.findIndex(c => (b.categoryId && c.id === b.categoryId) || c.name.toLowerCase().trim() === b.categoryName.toLowerCase().trim());
        if (catIdxA !== -1 && catIdxB !== -1 && catIdxA !== catIdxB) {
          cmp = catIdxA - catIdxB;
        } else {
          cmp = a.categoryName.localeCompare(b.categoryName);
        }
        if (cmp === 0) {
          cmp = (a.startCartonNumber || 0) - (b.startCartonNumber || 0);
        }
      } else if (sortField === "cartonNumber") {
        cmp = (a.startCartonNumber || 0) - (b.startCartonNumber || 0);
      } else if (sortField === "name") {
        cmp = a.productName.localeCompare(b.productName);
      } else if (sortField === "code") {
        cmp = a.productCode.localeCompare(b.productCode);
      } else if (sortField === "cartons") {
        cmp = a.totalCartons - b.totalCartons;
      } else if (sortField === "pieces") {
        cmp = a.totalCategoryPieces - b.totalCategoryPieces;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return items;
  }, [filteredSegregatedItems, sortField, sortDirection, categories]);

  // Grouped Segregated Items by Category with each category's subtotal
  const segregatedCategoryGroups = useMemo<CategoryGroupSection<SegregatedCategoryItem>[]>(() => {
    const groupsMap = new Map<string, CategoryGroupSection<SegregatedCategoryItem>>();

    sortedSegregatedItems.forEach(item => {
      const key = item.categoryName.toLowerCase().trim();
      if (!groupsMap.has(key)) {
        const catObj = categories.find(c => c.name.toLowerCase().trim() === key || (item.categoryId && c.id === item.categoryId));
        groupsMap.set(key, {
          categoryKey: key,
          categoryName: item.categoryName,
          categoryId: item.categoryId,
          sizeRange: catObj?.sizeRange || item.categorySizeRange,
          items: [],
          subtotal: {
            productCount: 0,
            stockCartons: 0,
            unapprovedBinningCartons: 0,
            totalCartons: 0,
            totalPieces: 0,
            stockPieces: 0,
            binningPieces: 0,
          },
        });
      }

      const grp = groupsMap.get(key)!;
      grp.items.push(item);
      grp.subtotal.productCount += 1;
      grp.subtotal.stockCartons += item.stockCartons;
      grp.subtotal.unapprovedBinningCartons += item.unapprovedBinningCartons;
      grp.subtotal.totalCartons += item.totalCartons;
      grp.subtotal.totalPieces += item.totalCategoryPieces;
      if (grp.subtotal.stockPieces !== undefined) {
        grp.subtotal.stockPieces += item.stockCategoryPieces;
      }
      if (grp.subtotal.binningPieces !== undefined) {
        grp.subtotal.binningPieces += item.binningCategoryPieces;
      }
    });

    return Array.from(groupsMap.values());
  }, [sortedSegregatedItems, categories]);

  // Grand Total of all displayed Segregated Items
  const segregatedGrandTotal = useMemo(() => {
    return sortedSegregatedItems.reduce((acc, item) => ({
      productCount: acc.productCount + 1,
      stockCartons: acc.stockCartons + item.stockCartons,
      unapprovedBinningCartons: acc.unapprovedBinningCartons + item.unapprovedBinningCartons,
      totalCartons: acc.totalCartons + item.totalCartons,
      totalPieces: acc.totalPieces + item.totalCategoryPieces,
      stockPieces: acc.stockPieces + item.stockCategoryPieces,
      binningPieces: acc.binningPieces + item.binningCategoryPieces,
    }), {
      productCount: 0,
      stockCartons: 0,
      unapprovedBinningCartons: 0,
      totalCartons: 0,
      totalPieces: 0,
      stockPieces: 0,
      binningPieces: 0,
    });
  }, [sortedSegregatedItems]);

  // Sorted Combined Products
  const sortedProducts = useMemo(() => {
    const items = [...filteredProducts];
    items.sort((a, b) => {
      let cmp = 0;
      if (sortField === "category") {
        const catIdxA = categories.findIndex(c => (a.product.categoryId && c.id === a.product.categoryId) || c.name.toLowerCase().trim() === a.primaryCategoryName.toLowerCase().trim());
        const catIdxB = categories.findIndex(c => (b.product.categoryId && c.id === b.product.categoryId) || c.name.toLowerCase().trim() === b.primaryCategoryName.toLowerCase().trim());
        if (catIdxA !== -1 && catIdxB !== -1 && catIdxA !== catIdxB) {
          cmp = catIdxA - catIdxB;
        } else {
          cmp = a.primaryCategoryName.localeCompare(b.primaryCategoryName);
        }
        if (cmp === 0) {
          cmp = (a.startCartonNumber || 0) - (b.startCartonNumber || 0);
        }
      } else if (sortField === "cartonNumber") {
        cmp = (a.startCartonNumber || 0) - (b.startCartonNumber || 0);
      } else if (sortField === "name") {
        cmp = a.product.name.localeCompare(b.product.name);
      } else if (sortField === "code") {
        cmp = (a.product.code || "").localeCompare(b.product.code || "");
      } else if (sortField === "cartons") {
        cmp = a.totalCartons - b.totalCartons;
      } else if (sortField === "pieces") {
        cmp = a.totalPieces - b.totalPieces;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return items;
  }, [filteredProducts, sortField, sortDirection, categories]);

  // Combined Product Category Groups
  const productsCategoryGroups = useMemo<CategoryGroupSection<EnrichedProductAnalysis>[]>(() => {
    const groupsMap = new Map<string, CategoryGroupSection<EnrichedProductAnalysis>>();

    sortedProducts.forEach(item => {
      const key = (item.primaryCategoryName || "General").toLowerCase().trim();
      if (!groupsMap.has(key)) {
        const catObj = categories.find(c => c.name.toLowerCase().trim() === key || (item.product.categoryId && c.id === item.product.categoryId));
        groupsMap.set(key, {
          categoryKey: key,
          categoryName: item.primaryCategoryName || "General",
          categoryId: item.product.categoryId,
          sizeRange: catObj?.sizeRange || item.sizeRange,
          items: [],
          subtotal: {
            productCount: 0,
            stockCartons: 0,
            unapprovedBinningCartons: 0,
            totalCartons: 0,
            totalPieces: 0,
            stockPieces: 0,
            binningPieces: 0,
          },
        });
      }

      const grp = groupsMap.get(key)!;
      grp.items.push(item);
      grp.subtotal.productCount += 1;
      grp.subtotal.stockCartons += item.stockCartons;
      grp.subtotal.unapprovedBinningCartons += item.unapprovedBinningCartons;
      grp.subtotal.totalCartons += item.totalCartons;
      grp.subtotal.totalPieces += item.totalPieces;
      if (grp.subtotal.stockPieces !== undefined) {
        grp.subtotal.stockPieces += item.stockPieces;
      }
      if (grp.subtotal.binningPieces !== undefined) {
        grp.subtotal.binningPieces += item.unapprovedBinningPieces;
      }
    });

    return Array.from(groupsMap.values());
  }, [sortedProducts, categories]);

  // Combined Products Grand Total
  const productsGrandTotal = useMemo(() => {
    return sortedProducts.reduce((acc, item) => ({
      productCount: acc.productCount + 1,
      stockCartons: acc.stockCartons + item.stockCartons,
      unapprovedBinningCartons: acc.unapprovedBinningCartons + item.unapprovedBinningCartons,
      totalCartons: acc.totalCartons + item.totalCartons,
      totalPieces: acc.totalPieces + item.totalPieces,
      stockPieces: acc.stockPieces + item.stockPieces,
      binningPieces: acc.binningPieces + item.unapprovedBinningPieces,
    }), {
      productCount: 0,
      stockCartons: 0,
      unapprovedBinningCartons: 0,
      totalCartons: 0,
      totalPieces: 0,
      stockPieces: 0,
      binningPieces: 0,
    });
  }, [sortedProducts]);

  // Open Amendment Dialog
  function handleOpenAmend(item: EnrichedProductAnalysis) {
    const p = item.product;
    setAmendProduct(p);
    setAmendSizeString(p.size || item.sizes.join(", "));
    setAmendSizesArray(item.sizes);
    setAmendSizeRange(item.sizeRange);
    setAmendQpc(item.quantityPerCarton);
    setAmendCategoryId(p.categoryId || "");
    setAmendBreakdown(item.breakdownItems);
    setAmendCategorySummaries(item.categorySummaries);
  }

  // Save Amended Sizes and Carton Breakdown
  async function handleSaveAmendment() {
    if (!amendProduct) return;

    setSaving(true);
    try {
      const updatedFields: Partial<Product> = {
        size: amendSizeString.trim(),
        sizes: amendSizesArray,
        sizeRange: amendSizeRange.trim(),
        quantityPerCarton: amendQpc,
        categoryId: amendCategoryId,
        cartonBreakdown: amendBreakdown,
        cartonCategoryBreakdown: amendCategorySummaries,
        updatedAt: new Date(),
      };

      await update(COLLECTIONS.PRODUCTS, amendProduct.id, updatedFields as any);

      toast({
        title: "Amendment Saved Successfully! (ማሻሻያው ተቀምጧል)",
        description: `Updated size and category breakdown for "${amendProduct.name}".`,
      });

      setAmendProduct(null);
      await loadData();
    } catch (err: any) {
      toast({
        title: "Failed to save amendment",
        description: err.message || "An error occurred while saving.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // Export to Excel with multiple rich sheets
  async function handleExportToExcel() {
    try {
      // 1. Columns Definition for Segregated View
      const segregatedColumns = [
        { header: "Carton Number (የካርቶን ቁጥር)", key: "cartonNumberRange", width: 18, align: "center" as const },
        { header: "Product Code (SKU)", key: "productCode", width: 16, align: "center" as const },
        { header: "Product Name (የእቃው ስም)", key: "productName", width: 28, align: "left" as const },
        { header: "Category (የተለየ ምድብ)", key: "categoryName", width: 22, align: "center" as const },
        { header: "Size Breakdown in Category (የፍሬ ድልድል)", key: "breakdown", width: 34, align: "left" as const },
        { header: "Total Cartons (ጠቅላላ ካርቶን - Stock + Binning)", key: "totalCartons", width: 20, align: "right" as const, isInteger: true },
        { header: "Total Pieces in Category (በዚህ ምድብ ያለ ጠቅላላ ፍሬ)", key: "totalPieces", width: 24, align: "right" as const, isInteger: true },
      ];

      const segregatedRows: any[] = [];

      segregatedCategoryGroups.forEach(group => {
        group.items.forEach(item => {
          const catBreakdownStr = item.categoryBreakdownItems.map(b => `${b.size}: ${b.count}pcs`).join(" | ");
          segregatedRows.push({
            cartonNumberRange: item.cartonNumberRange,
            productCode: item.productCode || "",
            productName: item.productName || "",
            barcode: item.barcodeValue || "",
            categoryName: item.categoryName,
            multiCategoryStatus: item.isMultiCategory ? "YES (ሁለት እና ከዚያ በላይ ምድቦች)" : "NO (ነጠላ ምድብ)",
            categorySegment: item.isMultiCategory ? `Segment ${item.categoryIndex + 1} of ${item.totalCategoriesInProduct}` : "Single Category",
            categorySizes: item.categorySizes.join(", "),
            piecesPerCarton: item.piecesPerCarton,
            breakdown: catBreakdownStr,
            stockCartons: item.stockCartons,
            unapprovedBinningCartons: item.unapprovedBinningCartons,
            totalCartons: item.totalCartons,
            totalPieces: item.totalCategoryPieces,
            _isMultiCategory: item.isMultiCategory, // RED text formatting!
          });
        });

        // Insert Category Subtotal row
        segregatedRows.push({
          cartonNumberRange: `SUBTOTAL: ${group.subtotal.totalCartons} ctns`,
          productCode: `SUBTOTAL: ${group.categoryName}`,
          productName: `የ${group.categoryName} ጠቅላላ ድምር (${group.subtotal.productCount} Products)`,
          barcode: "",
          categoryName: group.categoryName,
          multiCategoryStatus: "",
          categorySegment: "",
          categorySizes: group.sizeRange ? `Sizes: ${group.sizeRange}` : "All Sizes",
          piecesPerCarton: "",
          breakdown: "Category Subtotal",
          stockCartons: group.subtotal.stockCartons,
          unapprovedBinningCartons: group.subtotal.unapprovedBinningCartons,
          totalCartons: group.subtotal.totalCartons,
          totalPieces: group.subtotal.totalPieces,
          _isSubtotal: true,
        });
      });

      // Insert Grand Total Row
      segregatedRows.push({
        cartonNumberRange: `GRAND TOTAL: ${segregatedGrandTotal.totalCartons} ctns`,
        productCode: "GRAND TOTAL",
        productName: `ጠቅላላ የሁሉም እቃዎች ድምር (${segregatedGrandTotal.productCount} Items)`,
        barcode: "",
        categoryName: `Across ${segregatedCategoryGroups.length} Categories`,
        multiCategoryStatus: "",
        categorySegment: "",
        categorySizes: "",
        piecesPerCarton: "",
        breakdown: "Grand Total Across All Categories",
        stockCartons: segregatedGrandTotal.stockCartons,
        unapprovedBinningCartons: segregatedGrandTotal.unapprovedBinningCartons,
        totalCartons: segregatedGrandTotal.totalCartons,
        totalPieces: segregatedGrandTotal.totalPieces,
        _isGrandTotal: true,
      });

      // 2. Matrix Sheet Data (Combined Products)
      const matrixColumns = [
        { header: "Carton Number (የካርቶን ቁጥር)", key: "cartonNumberRange", width: 18, align: "center" as const },
        { header: "Product Code (SKU)", key: "productCode", width: 16, align: "center" as const },
        { header: "Product Name (የእቃው ስም)", key: "productName", width: 28, align: "left" as const },
        { header: "Primary Category (ዋና ምድብ)", key: "primaryCategory", width: 20, align: "center" as const },
        { header: "All Categories (ያካተታቸው ምድቦች)", key: "allCategories", width: 26, align: "left" as const },
        { header: "Size Range (የሳይዝ ክልል)", key: "sizeRange", width: 16, align: "center" as const },
        { header: "All Sizes (ሳይዞች)", key: "allSizes", width: 20, align: "center" as const },
        { header: "Pcs Per Carton (በአንድ ካርቶን)", key: "quantityPerCarton", width: 18, align: "right" as const, isInteger: true },
        { header: "Size Breakdown in 1 Carton (የፍሬ ድልድል)", key: "sizeBreakdown", width: 34, align: "left" as const },
        { header: "Category 1 Breakdown", key: "cat1Breakdown", width: 36, align: "left" as const },
        { header: "Category 2 Breakdown", key: "cat2Breakdown", width: 36, align: "left" as const },
        { header: "Category 3 Breakdown", key: "cat3Breakdown", width: 36, align: "left" as const },
        { header: "Total Cartons (ጠቅላላ ካርቶን - Stock + Binning)", key: "totalCartons", width: 20, align: "right" as const, isInteger: true },
        { header: "Total Pieces in Stock (ጠቅላላ ፍሬ)", key: "totalPieces", width: 22, align: "right" as const, isInteger: true },
      ];

      const matrixRows: any[] = [];
      
      productsCategoryGroups.forEach(group => {
        group.items.forEach(item => {
          const p = item.product;
          const breakdownStr = item.breakdownItems.map(b => `${b.size}: ${b.count}pcs`).join(" | ");
          const primaryCat = item.primaryCategoryName;
          const allCategoriesStr = item.categoryNames.join(", ");

          const cat1 = item.categorySummaries[0]
            ? `${item.categorySummaries[0].categoryName} (${item.categorySummaries[0].sizes?.join(",") || ""}): ${item.categorySummaries[0].cartons} ctns (${item.categorySummaries[0].stockCartons} store + ${item.categorySummaries[0].unapprovedBinningCartons} binning) | ${item.categorySummaries[0].count}pcs/ctn | Total: ${item.categorySummaries[0].totalCategoryPieces}pcs (${item.categorySummaries[0].percentage}%)`
            : "";
          const cat2 = item.categorySummaries[1]
            ? `${item.categorySummaries[1].categoryName} (${item.categorySummaries[1].sizes?.join(",") || ""}): ${item.categorySummaries[1].cartons} ctns (${item.categorySummaries[1].stockCartons} store + ${item.categorySummaries[1].unapprovedBinningCartons} binning) | ${item.categorySummaries[1].count}pcs/ctn | Total: ${item.categorySummaries[1].totalCategoryPieces}pcs (${item.categorySummaries[1].percentage}%)`
            : "";
          const cat3 = item.categorySummaries[2]
            ? `${item.categorySummaries[2].categoryName} (${item.categorySummaries[2].sizes?.join(",") || ""}): ${item.categorySummaries[2].cartons} ctns (${item.categorySummaries[2].stockCartons} store + ${item.categorySummaries[2].unapprovedBinningCartons} binning) | ${item.categorySummaries[2].count}pcs/ctn | Total: ${item.categorySummaries[2].totalCategoryPieces}pcs (${item.categorySummaries[2].percentage}%)`
            : "";

          matrixRows.push({
            cartonNumberRange: item.cartonNumberRange,
            productCode: p.code || "",
            productName: p.name || "",
            barcode: p.barcodeValue || "",
            primaryCategory: primaryCat,
            allCategories: allCategoriesStr,
            multiCategoryStatus: item.isMultiCategory ? "YES (ሁለት እና ከዚያ በላይ ምድቦች)" : "NO (ነጠላ ምድብ)",
            sizeRange: item.sizeRange || "",
            allSizes: item.sizes.join(", "),
            quantityPerCarton: item.quantityPerCarton,
            sizeBreakdown: breakdownStr,
            cat1Breakdown: cat1,
            cat2Breakdown: cat2,
            cat3Breakdown: cat3,
            stockCartons: item.stockCartons,
            unapprovedBinningCartons: item.unapprovedBinningCartons,
            totalCartons: item.totalCartons,
            totalPieces: item.totalPieces,
            _isMultiCategory: item.isMultiCategory, // RED text formatting!
          });
        });

        // Category Subtotal row in Matrix sheet
        matrixRows.push({
          cartonNumberRange: `SUBTOTAL: ${group.subtotal.totalCartons} ctns`,
          productCode: `SUBTOTAL: ${group.categoryName}`,
          productName: `የ${group.categoryName} ድምር (${group.subtotal.productCount} Products)`,
          barcode: "",
          primaryCategory: group.categoryName,
          allCategories: "",
          multiCategoryStatus: "",
          sizeRange: group.sizeRange || "",
          allSizes: "",
          quantityPerCarton: "",
          sizeBreakdown: "Category Subtotal",
          cat1Breakdown: "",
          cat2Breakdown: "",
          cat3Breakdown: "",
          stockCartons: group.subtotal.stockCartons,
          unapprovedBinningCartons: group.subtotal.unapprovedBinningCartons,
          totalCartons: group.subtotal.totalCartons,
          totalPieces: group.subtotal.totalPieces,
          _isSubtotal: true,
        });
      });

      // Grand Total row in Matrix sheet
      matrixRows.push({
        cartonNumberRange: `GRAND TOTAL: ${productsGrandTotal.totalCartons} ctns`,
        productCode: "GRAND TOTAL",
        productName: `ጠቅላላ የሁሉም እቃዎች ድምር (${productsGrandTotal.productCount} Products)`,
        barcode: "",
        primaryCategory: `Across ${productsCategoryGroups.length} Categories`,
        allCategories: "",
        multiCategoryStatus: "",
        sizeRange: "",
        allSizes: "",
        quantityPerCarton: "",
        sizeBreakdown: "Grand Total Across All Products",
        cat1Breakdown: "",
        cat2Breakdown: "",
        cat3Breakdown: "",
        stockCartons: productsGrandTotal.stockCartons,
        unapprovedBinningCartons: productsGrandTotal.unapprovedBinningCartons,
        totalCartons: productsGrandTotal.totalCartons,
        totalPieces: productsGrandTotal.totalPieces,
        _isGrandTotal: true,
      });

      // 3. Category Summary Sheet
      const catSummaryColumns = [
        { header: "Category Name (የምድብ ስም)", key: "categoryName", width: 24, align: "left" as const },
        { header: "Defined Size Range (የሳይዝ ወሰን)", key: "sizeRange", width: 20, align: "center" as const },
        { header: "Total Matching Products (ጠቅላላ እቃዎች)", key: "matchingProducts", width: 22, align: "right" as const, isInteger: true },
        { header: "Multi-Category Overlap Products (ተደራራቢ ምድብ ያላቸው)", key: "multiOverlapProducts", width: 24, align: "right" as const, isInteger: true },
        { header: "Total Product Cartons in Category (ጠቅላላ ካርቶን በምድቡ)", key: "totalCartons", width: 24, align: "right" as const, isInteger: true },
        { header: "Store Stock Cartons in Category (የመጋዘን ካርቶን)", key: "stockCartons", width: 22, align: "right" as const, isInteger: true },
        { header: "Unapproved Binning Cartons in Category (ያልተረጋገጠ ቢኒንግ)", key: "binningCartons", width: 24, align: "right" as const, isInteger: true },
        { header: "Total Stock Pieces in Category (ጠቅላላ ፍሬዎች በምድቡ)", key: "totalPieces", width: 24, align: "right" as const, isInteger: true },
        { header: "Category Description (መግለጫ)", key: "description", width: 30, align: "left" as const },
      ];

      const catSummaryRows = categories.map(cat => {
        const catProducts = enrichedProducts.filter(p => 
          p.categoryNames.some(c => c.toLowerCase() === cat.name.toLowerCase())
        );
        const multiCatProducts = catProducts.filter(p => p.isMultiCategory);
        
        let totalPiecesInStock = 0;
        let totalCartonsInCat = 0;
        let storeCartonsInCat = 0;
        let binningCartonsInCat = 0;

        catProducts.forEach(item => {
          const summary = item.categorySummaries.find(
            s => s.categoryName.toLowerCase() === cat.name.toLowerCase()
          );
          if (summary) {
            totalPiecesInStock += summary.totalCategoryPieces;
            totalCartonsInCat += summary.cartons;
            storeCartonsInCat += summary.stockCartons;
            binningCartonsInCat += summary.unapprovedBinningCartons;
          }
        });

        return {
          categoryName: cat.name,
          sizeRange: cat.sizeRange || (cat.minSize && cat.maxSize ? `${cat.minSize}-${cat.maxSize}` : "Not set"),
          matchingProducts: catProducts.length,
          multiOverlapProducts: multiCatProducts.length,
          totalCartons: totalCartonsInCat,
          stockCartons: storeCartonsInCat,
          binningCartons: binningCartonsInCat,
          totalPieces: totalPiecesInStock,
          description: cat.description || "",
        };
      });

      // Row styler for multi-category red font, subtotals and grand totals
      const genericRowStyler = (row: any) => {
        if (row._isGrandTotal) {
          return { isGrandTotal: true };
        }
        if (row._isSubtotal) {
          return { isSubtotal: true };
        }
        if (row._isMultiCategory) {
          return { isMultiCategory: true }; // RED text!
        }
        return null;
      };

      // Build professionally styled worksheets
      const wsSegregated = buildStyledWorksheet({
        title: replaceBrandInTitle("YESERAHUT INVENTORY - AMENDMENT & CATEGORY SIZE MATRIX (SEGREGATED VIEW)"),
        subtitle: `Total Segments: ${filteredSegregatedItems.length} | Total Cartons: ${segregatedGrandTotal.totalCartons.toLocaleString()} | Total Pieces: ${segregatedGrandTotal.totalPieces.toLocaleString()}`,
        sheetName: "Segregated by Category",
        columns: segregatedColumns,
        rows: segregatedRows,
        rowStyler: genericRowStyler,
      });
      wsSegregated["!styled"] = true;

      const wsMatrix = buildStyledWorksheet({
        title: replaceBrandInTitle("YESERAHUT INVENTORY - PRODUCT COMBINED SIZE & CATEGORY MATRIX"),
        subtitle: `Total Products: ${productsGrandTotal.productCount} | Total Cartons: ${productsGrandTotal.totalCartons.toLocaleString()} | Total Pieces: ${productsGrandTotal.totalPieces.toLocaleString()}`,
        sheetName: "Product Combined Matrix",
        columns: matrixColumns,
        rows: matrixRows,
        rowStyler: genericRowStyler,
      });
      wsMatrix["!styled"] = true;

      const wsCatSummary = buildStyledWorksheet({
        title: replaceBrandInTitle("YESERAHUT INVENTORY - CATEGORY BREAKDOWN & COVERAGE SUMMARY"),
        subtitle: `Configured Categories: ${categories.length} | Generated for Inventory & Stock Allocation Auditing`,
        sheetName: "Category Breakdown Summary",
        columns: catSummaryColumns,
        rows: catSummaryRows,
      });
      wsCatSummary["!styled"] = true;

      // Create Workbook
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, wsSegregated, "Segregated by Category");
      XLSX.utils.book_append_sheet(wb, wsMatrix, "Product Combined Matrix");
      XLSX.utils.book_append_sheet(wb, wsCatSummary, "Category Breakdown Summary");

      const dateStr = new Date().toISOString().slice(0, 10);
      const res = await exportToExcel({
        workbook: wb,
        filename: `Product_Amendment_Size_Category_Matrix_${dateStr}.xlsx`,
      });

      if (res === "failed") {
        toast({
          title: "Export Failed",
          description: "Failed to generate or share Excel file.",
          variant: "destructive",
        });
      } else {
        toast({
          title: res === "shared" ? "Excel Shared (ኤክሴል ተጋርቷል)" : "Excel Export Completed (ኤክሴል ወርዷል)",
          description: `Exported ${filteredSegregatedItems.length} category segments (${filteredProducts.length} unique products) to Excel.`,
        });
      }
    } catch (err: any) {
      toast({
        title: "Export Failed",
        description: err.message || "Failed to generate Excel file.",
        variant: "destructive",
      });
    }
  }

  // Export to high-precision professional business PDF report
  async function handleExportToPdf() {
    setExportingPdf(true);
    try {
      const pdfColumns = [
        { header: "Carton No.", key: "cartonNumberRange", width: 14, align: "center" as const },
        { header: "SKU / Code", key: "productCode", width: 14, align: "center" as const },
        { header: "Product Name (የእቃው ስም)", key: "productName", width: 28, align: "left" as const },
        { header: "Category (ምድብ)", key: "categoryName", width: 18, align: "center" as const },
        { header: "Breakdown in Category (የፍሬ ድልድል)", key: "breakdown", width: 28, align: "left" as const },
        { header: "Total Cartons", key: "totalCartons", width: 14, align: "right" as const, isInteger: true },
        { header: "Total Pieces", key: "totalPieces", width: 14, align: "right" as const, isInteger: true },
      ];

      const pdfRows: any[] = [];

      segregatedCategoryGroups.forEach(group => {
        group.items.forEach(item => {
          const catBreakdownStr = item.categoryBreakdownItems.map(b => `${b.size}: ${b.count}pcs`).join(" | ");
          pdfRows.push({
            cartonNumberRange: item.cartonNumberRange,
            productCode: item.productCode || "",
            productName: item.productName || "",
            categoryName: item.categoryName,
            breakdown: catBreakdownStr,
            totalCartons: item.totalCartons,
            totalPieces: item.totalCategoryPieces,
            _isMultiCategory: item.isMultiCategory,
          });
        });

        // Category Subtotal
        pdfRows.push({
          cartonNumberRange: `SUBTOTAL: ${group.categoryName}`,
          productCode: "",
          productName: `${group.items.length} items in ${group.categoryName}`,
          categoryName: group.categoryName,
          breakdown: "",
          totalCartons: group.subtotal.totalCartons,
          totalPieces: group.subtotal.totalPieces,
          _isSubtotal: true,
        });
      });

      // Grand Total Row
      pdfRows.push({
        cartonNumberRange: "GRAND TOTAL",
        productCode: "",
        productName: `Across ${segregatedCategoryGroups.length} Categories (${filteredProducts.length} Unique Products)`,
        categoryName: "",
        breakdown: "",
        totalCartons: segregatedGrandTotal.totalCartons,
        totalPieces: segregatedGrandTotal.totalPieces,
        _isGrandTotal: true,
      });

      const dateStr = new Date().toISOString().slice(0, 10);
      const res = await exportToPdf({
        title: replaceBrandInTitle("YESERAHUT PRODUCT AMENDMENT & CATEGORY SEGREGATION REPORT"),
        subtitle: `Store: ${selectedStoreFilter === "all" ? "All Stores" : selectedStoreFilter} | Filtered Products: ${filteredProducts.length} | Segments: ${filteredSegregatedItems.length}`,
        filename: `Product_Amendment_Category_Report_${dateStr}.pdf`,
        orientation: "landscape",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Total Products", value: metrics.totalCount },
          { label: "Multi-Category Items", value: metrics.multiCategoryCount },
          { label: "Total Cartons (Stock+Bin)", value: metrics.totalCartonsAll },
          { label: "Total Units / Pieces", value: metrics.totalPiecesAll },
          { label: "Store Stock Cartons", value: metrics.totalStoreCartons },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          if (row._isSubtotal) return { isSubtotal: true, bold: true };
          if (row._isMultiCategory) return { isMultiCategory: true, bold: true };
          return null;
        },
      });

      if (res === "failed") {
        toast({
          title: "PDF Export Failed",
          description: "Failed to generate PDF document.",
          variant: "destructive",
        });
      } else {
        toast({
          title: res === "shared" ? "PDF Shared (ፒዲኤፍ ተጋርቷል)" : "PDF Export Completed (ፒዲኤፍ ወርዷል)",
          description: `Exported ${filteredSegregatedItems.length} category segments to business PDF report.`,
        });
      }
    } catch (err: any) {
      toast({
        title: "PDF Export Failed",
        description: err.message || "Failed to generate PDF document.",
        variant: "destructive",
      });
    } finally {
      setExportingPdf(false);
    }
  }

  const renderSegregatedRow = (item: SegregatedCategoryItem) => {
    const p = item.product;
    return (
      <tr
        key={item.id}
        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group"
      >
        {/* Carton Number (የካርቶን ቁጥር) */}
        <td className="py-3.5 px-3 whitespace-nowrap min-w-[130px]">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono font-black text-xs shadow-2xs">
              <Boxes className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>{item.cartonNumberRange}</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono pl-0.5">
              {item.totalCartons > 0 ? `${item.totalCartons.toLocaleString()} ctns` : "0 ctns"}
            </div>
          </div>
        </td>

        {/* Product Info */}
        <td className="py-3.5 px-4 min-w-[220px]">
          <div className="flex items-center gap-3">
            {p.photoUrl ? (
              <img
                src={p.photoUrl}
                alt={p.name}
                className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 font-bold text-xs">
                {(p.name || "PR").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="space-y-0.5 min-w-0">
              <div className="font-bold text-foreground text-sm truncate max-w-[180px]">
                {p.name}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {p.code || "NO-SKU"}
                </span>
                {item.isMultiCategory && (
                  <Badge className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[9px] font-bold px-1.5 py-0 flex items-center gap-0.5">
                    <Split className="w-2.5 h-2.5" />
                    Segment {item.categoryIndex + 1}/{item.totalCategoriesInProduct}
                  </Badge>
                )}
                {p.supplierName && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                    • {p.supplierName}
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* Category */}
        <td className="py-3.5 px-3 min-w-[160px]">
          <div className="space-y-1">
            <Badge className="bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold">
              {item.categoryName}
            </Badge>
            {item.categorySizeRange && (
              <div className="text-[10px] text-muted-foreground font-mono">
                Range: {item.categorySizeRange}
              </div>
            )}
            {item.isMultiCategory && (
              <div className="text-[9px] text-amber-700 dark:text-amber-400 font-medium">
                {item.categoryPercentage}% of product carton
              </div>
            )}
          </div>
        </td>

        {/* Carton Breakdown in Category */}
        <td className="py-3.5 px-3 min-w-[170px]">
          <div className="space-y-1">
            <div className="flex items-center gap-1 font-mono text-xs font-bold text-foreground">
              <span>{item.piecesPerCarton} pcs</span>
              <span className="text-[10px] text-slate-500 font-normal">/ctn</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
              {item.categoryBreakdownItems.map((b, idx) => (
                <span
                  key={idx}
                  className="text-[10px] font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200/60 dark:border-blue-800/60"
                  title={`${b.size}: ${b.count} pieces per carton`}
                >
                  <strong className="font-bold">{b.size}</strong>: {b.count}
                </span>
              ))}
            </div>
          </div>
        </td>

        {/* Cartons (Store + Binning) */}
        <td className="py-3.5 px-3 whitespace-nowrap min-w-[130px]">
          <div className="space-y-1">
            <div className="font-mono font-black text-xs text-foreground">
              {item.totalCartons.toLocaleString()} ctns
            </div>
            <div className="space-y-0.5 text-[10px]">
              <div className="text-slate-500 font-mono">
                Store: {item.stockCartons.toLocaleString()} ctns
              </div>
              {item.unapprovedBinningCartons > 0 && (
                <div className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded inline-block">
                  +{item.unapprovedBinningCartons.toLocaleString()} ctn Binning
                </div>
              )}
            </div>
          </div>
        </td>

        {/* Category Pieces Only */}
        <td className="py-3.5 px-3 text-right whitespace-nowrap min-w-[140px]">
          <div className="space-y-1">
            <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
              {item.totalCategoryPieces.toLocaleString()} pcs
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              Store: {item.stockCategoryPieces.toLocaleString()} pcs
            </div>
            {item.binningCategoryPieces > 0 && (
              <div className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-semibold">
                +{item.binningCategoryPieces.toLocaleString()} pcs Bin
              </div>
            )}
          </div>
        </td>

        {/* Price */}
        <td className="py-3.5 px-3 text-right whitespace-nowrap">
          <div className="space-y-0.5">
            <div className="font-mono font-bold text-xs text-foreground">
              {fmt(item.sellingPrice || 0)}
            </div>
            {item.cartonPrice > 0 && (
              <div className="font-mono text-[10px] text-muted-foreground">
                {fmt(item.cartonPrice)}/ctn
              </div>
            )}
          </div>
        </td>

        {/* Actions */}
        <td className="py-3.5 px-4 text-center whitespace-nowrap">
          <div className="flex items-center justify-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setViewProductAnalysis(item.parentAnalysis)}
              className="h-7 px-2 text-[11px] font-semibold gap-1"
              title="View Full Product Analysis"
            >
              <Eye className="w-3.5 h-3.5" />
              View
            </Button>

            <Button
              size="sm"
              onClick={() => handleOpenAmend(item.parentAnalysis)}
              className="h-7 px-2.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1 shadow-2xs"
              title="Amend sizes and carton breakdown"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Amend (አሻሽል)
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  const renderProductRow = (item: EnrichedProductAnalysis) => {
    const p = item.product;
    return (
      <tr
        key={p.id}
        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors group"
      >
        {/* Carton Number (የካርቶን ቁጥር) */}
        <td className="py-3.5 px-3 whitespace-nowrap min-w-[130px]">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono font-black text-xs shadow-2xs">
              <Boxes className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>{item.cartonNumberRange}</span>
            </div>
            <div className="text-[10px] text-muted-foreground font-mono pl-0.5">
              {item.totalCartons > 0 ? `${item.totalCartons.toLocaleString()} ctns` : "0 ctns"}
            </div>
          </div>
        </td>

        {/* Product Info */}
        <td className="py-3.5 px-4 min-w-[220px]">
          <div className="flex items-center gap-3">
            {p.photoUrl ? (
              <img
                src={p.photoUrl}
                alt={p.name}
                className="w-10 h-10 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0 font-bold text-xs">
                {(p.name || "PR").slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="space-y-0.5 min-w-0">
              <div className="font-bold text-foreground text-sm truncate max-w-[180px]">
                {p.name}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono text-[10px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                  {p.code || "NO-SKU"}
                </span>
                {item.isMultiCategory && (
                  <Badge className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[9px] font-bold px-1.5 py-0 flex items-center gap-0.5">
                    <Layers className="w-2.5 h-2.5" />
                    Multi-Category ({item.categorySummaries.length})
                  </Badge>
                )}
                {p.supplierName && (
                  <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                    • {p.supplierName}
                  </span>
                )}
              </div>
            </div>
          </div>
        </td>

        {/* Covered Categories */}
        <td className="py-3.5 px-3 min-w-[160px]">
          <div className="space-y-1">
            <div className="flex items-center gap-1 flex-wrap">
              {item.categorySummaries.map((cat, idx) => (
                <Badge
                  key={idx}
                  className="bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-bold"
                >
                  {cat.categoryName}
                </Badge>
              ))}
            </div>
            {item.isMultiCategory ? (
              <div className="text-[10px] text-amber-700 dark:text-amber-400 font-medium">
                Distributed across {item.categorySummaries.length} categories
              </div>
            ) : (
              <div className="text-[10px] text-slate-500 font-mono">
                Single Category
              </div>
            )}
          </div>
        </td>

        {/* Size Range & List */}
        <td className="py-3.5 px-3 min-w-[140px]">
          <div className="space-y-1">
            <div className="font-mono font-bold text-xs text-foreground">
              Range: {item.sizeRange}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              {item.sizes.map((sz, idx) => (
                <span
                  key={idx}
                  className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-1 py-0.5 rounded"
                >
                  {sz}
                </span>
              ))}
            </div>
            <div className="text-[10px] text-slate-500">
              {item.sizes.length} sizes configured
            </div>
          </div>
        </td>

        {/* Carton Breakdown */}
        <td className="py-3.5 px-3 min-w-[170px]">
          <div className="space-y-1">
            <div className="flex items-center gap-1 font-mono text-xs font-bold text-foreground">
              <span>{item.quantityPerCarton} pcs</span>
              <span className="text-[10px] text-slate-500 font-normal">/carton</span>
            </div>
            <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
              {item.breakdownItems.map((b, idx) => (
                <span
                  key={idx}
                  className="text-[10px] font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded border border-blue-200/60 dark:border-blue-800/60"
                  title={`${b.size}: ${b.count} pieces per carton`}
                >
                  <strong className="font-bold">{b.size}</strong>: {b.count}
                </span>
              ))}
            </div>
          </div>
        </td>

        {/* Category Allocation Summary */}
        <td className="py-3.5 px-3 min-w-[220px]">
          <div className="space-y-1.5">
            {item.categorySummaries.map((catSummary, idx) => {
              const isSelectedMatch =
                selectedCategoryFilter !== "all" &&
                catSummary.categoryName.toLowerCase() === selectedCategoryFilter.toLowerCase();
              return (
                <div
                  key={idx}
                  className={`p-1.5 rounded-lg border text-xs space-y-0.5 transition-all ${
                    isSelectedMatch
                      ? "bg-blue-50/80 dark:bg-blue-950/80 border-blue-300 dark:border-blue-700 ring-1 ring-blue-400"
                      : "bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground truncate max-w-[120px] flex items-center gap-1">
                      {isSelectedMatch && <span className="text-blue-600 font-black">★</span>}
                      {catSummary.categoryName}
                    </span>
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      {catSummary.cartons} ctns
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Sizes: {catSummary.sizes?.join(", ") || "all"}</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      {catSummary.totalCategoryPieces.toLocaleString()} pcs
                    </span>
                  </div>

                  {(catSummary.unapprovedBinningCartons > 0 || catSummary.stockCartons > 0) && (
                    <div className="flex items-center gap-1.5 text-[9px] pt-0.5 border-t border-slate-200/60 dark:border-slate-800/60 flex-wrap">
                      <span className="text-slate-500 font-mono">Store: {catSummary.stockCartons}c</span>
                      {catSummary.unapprovedBinningCartons > 0 && (
                        <span className="font-mono font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/60 px-1 rounded">
                          +{catSummary.unapprovedBinningCartons}c Binning
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </td>

        {/* Stock in Cartons (Store + Binning) & Total Pieces */}
        <td className="py-3.5 px-3 text-right whitespace-nowrap min-w-[140px]">
          <div className="space-y-1">
            <div className="font-mono font-black text-xs text-foreground">
              {item.totalCartons.toLocaleString()} ctns
            </div>
            <div className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
              {item.totalPieces.toLocaleString()} pcs
            </div>
            <div className="space-y-0.5 text-[10px]">
              <div className="text-slate-500 font-mono">
                Store: {item.stockCartons} ctns
              </div>
              {item.unapprovedBinningCartons > 0 && (
                <Badge className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[9px] font-bold px-1.5 py-0">
                  +{item.unapprovedBinningCartons} ctn Binning
                </Badge>
              )}
            </div>
          </div>
        </td>

        {/* Price */}
        <td className="py-3.5 px-3 text-right whitespace-nowrap">
          <div className="space-y-0.5">
            <div className="font-mono font-bold text-xs text-foreground">
              {fmt(p.sellingPrice || 0)}
            </div>
            {p.cartonPrice && (
              <div className="font-mono text-[10px] text-muted-foreground">
                {fmt(p.cartonPrice)}/ctn
              </div>
            )}
          </div>
        </td>

        {/* Actions */}
        <td className="py-3.5 px-4 text-center whitespace-nowrap">
          <div className="flex items-center justify-center gap-1.5">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setViewProductAnalysis(item)}
              className="h-7 px-2 text-[11px] font-semibold gap-1"
              title="View Full Breakdown Details"
            >
              <Eye className="w-3.5 h-3.5" />
              View
            </Button>

            <Button
              size="sm"
              onClick={() => handleOpenAmend(item)}
              className="h-7 px-2.5 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1 shadow-2xs"
              title="Amend sizes and carton breakdown"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Amend (አሻሽል)
            </Button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto pb-20">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-lg border border-indigo-900/50">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                Amendment & Category Size Matrix (የሳይዝ እና የምድብ ማሻሻያ)
              </h1>
              <p className="text-xs sm:text-sm text-indigo-200/80">
                የተመዘገቡ እቃዎችን ሳይዝ፣ የካርቶን ፍሬ ድልድል፣ ያልተረጋገጠ ቢኒንግ (Unapproved Binning) እና በሁሉም ምድቦች የካርቶን ምደባ
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            onClick={() => setShowCategoryLedger(!showCategoryLedger)}
            variant="outline"
            size="sm"
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs gap-1.5 font-bold"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-300" />
            {showCategoryLedger ? "Hide Category Ledger (ምድብ ሰንጠረዥ ደብቅ)" : "View Category Ledger (የምድቦች ካርቶን ሰንጠረዥ)"}
          </Button>

          <Button
            onClick={loadData}
            variant="outline"
            size="sm"
            disabled={loading}
            className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            onClick={handleExportToExcel}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-2 shadow-md hover:shadow-emerald-600/20"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export To Excel (ኤክሴል አውርድ)
          </Button>

          <Button
            onClick={handleExportToPdf}
            disabled={exportingPdf}
            className="bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold gap-2 shadow-md hover:shadow-rose-600/20"
          >
            <FileText className="w-4 h-4" />
            {exportingPdf ? "Generating PDF..." : "Export To PDF (ፒዲኤፍ አውርድ)"}
          </Button>
        </div>
      </div>

      {/* Analytics Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold">
            <span>Total Products (ጠቅላላ እቃዎች)</span>
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black font-mono text-slate-900 dark:text-slate-100">
            {metrics.totalCount}
          </div>
          <div className="text-[11px] text-slate-500">
            {filteredProducts.length} filtered
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-900/60 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-700 dark:text-amber-400 text-xs font-bold">
            <span>Multi-Category (2+ ምድቦች)</span>
            <Split className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-600 dark:text-amber-400">
            {metrics.multiCategoryCount}
          </div>
          <div className="text-[11px] text-amber-700/80 dark:text-amber-300/80">
            Spanning multiple categories
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-900/60 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-blue-700 dark:text-blue-400 text-xs font-semibold">
            <span>Store Stock (መጋዘን ያለ)</span>
            <Building className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black font-mono text-blue-600 dark:text-blue-400">
            {metrics.totalStoreCartons.toLocaleString()} <span className="text-xs font-normal text-slate-500">ctns</span>
          </div>
          <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80">
            Approved in store balance
          </div>
        </div>

        <div className="p-4 rounded-xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-amber-800 dark:text-amber-300 text-xs font-bold">
            <span>Unapproved Binning (ቢኒንግ ላይ)</span>
            <AlertCircle className="w-4 h-4 text-amber-600 animate-pulse" />
          </div>
          <div className="text-2xl font-black font-mono text-amber-700 dark:text-amber-300">
            {metrics.totalUnapprovedBinningCartons.toLocaleString()} <span className="text-xs font-normal text-amber-800/70">ctns</span>
          </div>
          <div className="text-[11px] text-amber-800/80 dark:text-amber-400/80">
            {metrics.productsWithUnapprovedBinning} products with pending binning
          </div>
        </div>

        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50/70 to-teal-50/40 dark:from-emerald-950/40 dark:to-teal-950/20 border-2 border-emerald-300 dark:border-emerald-800 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-xs font-bold">
            <span>Total Product Cartons (ጠቅላላ የካርቶን ብዛት)</span>
            <Boxes className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black font-mono text-emerald-600 dark:text-emerald-400">
            {metrics.totalCartonsAll.toLocaleString()} <span className="text-xs font-semibold text-emerald-800/80 dark:text-emerald-300">ctns</span>
          </div>
          <div className="text-[11px] font-mono text-emerald-700/90 dark:text-emerald-300/90 flex items-center justify-between flex-wrap gap-1">
            <span>Store: {metrics.totalStoreCartons.toLocaleString()}c</span>
            {metrics.totalUnapprovedBinningCartons > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-bold">+{metrics.totalUnapprovedBinningCartons.toLocaleString()}c Bin</span>
            )}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 pt-0.5 border-t border-emerald-200/60 dark:border-emerald-800/60 flex items-center justify-between">
            <span>{metrics.totalPiecesAll.toLocaleString()} Total Pieces</span>
            {(selectedCategoryFilter !== "all" || searchQuery.trim() || categoryTypeFilter !== "all") && (
              <span className="font-bold text-blue-600 dark:text-blue-400 font-mono">
                Filtered: {(viewMode === "segregated" ? segregatedGrandTotal.totalCartons : productsGrandTotal.totalCartons).toLocaleString()}c
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Across-Categories Carton & Piece Allocation Ledger (Collapsible) */}
      {showCategoryLedger && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900/60 shadow-md space-y-4 animate-in fade-in duration-200">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                Across-Categories Carton & Piece Allocation (በየምድቡ የተደለደለ የካርቶን እና ፍሬ ብዛት)
              </h3>
              <p className="text-xs text-muted-foreground">
                እያንዳንዱ እቃ ባለበት ምድብ ሁሉ (Multi-Category ጨምሮ) የካርቶን ብዛት እና የፍሬ ድምር ተካቷል
              </p>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              {metrics.categoryDistribution.length} Categories
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {metrics.categoryDistribution.map((cat, idx) => {
              const categoryDef = categories.find(c => c.name.toLowerCase() === cat.categoryName.toLowerCase());
              return (
                <div
                  key={idx}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 space-y-2 hover:border-indigo-300 dark:hover:border-indigo-800 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-foreground truncate max-w-[140px]" title={cat.categoryName}>
                      {cat.categoryName}
                    </span>
                    <Badge variant="secondary" className="text-[10px] font-mono">
                      {cat.productCount} Items
                    </Badge>
                  </div>

                  {categoryDef?.sizeRange && (
                    <div className="text-[10px] text-muted-foreground font-mono">
                      Sizes: {categoryDef.sizeRange}
                    </div>
                  )}

                  <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800/80 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Total Cartons:</span>
                      <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">
                        {cat.cartonCount.toLocaleString()} ctns
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>• Store Stock:</span>
                      <span className="font-mono">{cat.stockCartons.toLocaleString()} ctns</span>
                    </div>

                    {cat.unapprovedBinningCartons > 0 && (
                      <div className="flex items-center justify-between text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                        <span>• Pending Binning:</span>
                        <span className="font-mono">+{cat.unapprovedBinningCartons.toLocaleString()} ctns</span>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-dashed border-slate-200 dark:border-slate-800">
                      <span className="text-slate-600 dark:text-slate-400 font-medium">Total Pieces:</span>
                      <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                        {cat.pieceCount.toLocaleString()} pcs
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          {/* Search bar */}
          <div className="relative lg:col-span-3">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search product name, SKU, or size..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Category Dropdown Filter */}
          <div className="lg:col-span-3">
            <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Categories (ሁሉም ምድቦች)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories (ሁሉም ምድቦች)</SelectItem>
                {categories.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.sizeRange ? `(${c.sizeRange})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Store Filter */}
          <div className="lg:col-span-2">
            <Select value={selectedStoreFilter} onValueChange={setSelectedStoreFilter}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="All Stores (ሁሉም መጋዘን)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stores (ሁሉም መጋዘን)</SelectItem>
                {stores.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category Type Filter (All / Multi / Single / Binning) */}
          <div className="lg:col-span-3 flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setCategoryTypeFilter("all")}
              className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition-all ${
                categoryTypeFilter === "all"
                  ? "bg-white dark:bg-slate-900 text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              All ({enrichedProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setCategoryTypeFilter("multi")}
              className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition-all flex items-center justify-center gap-1 ${
                categoryTypeFilter === "multi"
                  ? "bg-amber-500 text-white shadow-2xs"
                  : "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40"
              }`}
            >
              <Split className="w-3 h-3" /> Multi ({metrics.multiCategoryCount})
            </button>
            <button
              type="button"
              onClick={() => setCategoryTypeFilter("single")}
              className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-semibold transition-all ${
                categoryTypeFilter === "single"
                  ? "bg-white dark:bg-slate-900 text-foreground shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Single ({metrics.singleCategoryCount})
            </button>
            <button
              type="button"
              onClick={() => setCategoryTypeFilter("binning")}
              className={`flex-1 py-1 px-1.5 rounded-md text-[11px] font-bold transition-all flex items-center justify-center gap-0.5 ${
                categoryTypeFilter === "binning"
                  ? "bg-amber-600 text-white shadow-2xs"
                  : "text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-950/60"
              }`}
              title="Products with unapproved Binning cartons"
            >
              <AlertCircle className="w-3 h-3" /> Binning ({metrics.productsWithUnapprovedBinning})
            </button>
          </div>

          {/* Reset button */}
          <div className="lg:col-span-1 flex justify-end">
            {(searchQuery || selectedCategoryFilter !== "all" || categoryTypeFilter !== "all" || selectedStoreFilter !== "all") && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedCategoryFilter("all");
                  setCategoryTypeFilter("all");
                  setSelectedStoreFilter("all");
                }}
                className="text-xs text-rose-600 hover:text-rose-700 h-8 px-2"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Row 2: Sort by & Category Grouping Controls */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-slate-500 font-semibold flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-blue-600" />
              <span>Sort By (ደርድር):</span>
            </span>
            <Select value={sortField} onValueChange={(v: AmendmentSortField) => setSortField(v)}>
              <SelectTrigger className="h-8 text-xs min-w-[210px] bg-slate-50 dark:bg-slate-950 font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="category">Category (በምድብ ቅደም ተከተል)</SelectItem>
                <SelectItem value="cartonNumber">Carton Number (በካርቶን ቁጥር 1,2,3...)</SelectItem>
                <SelectItem value="name">Product Name (በእቃ ስም A-Z)</SelectItem>
                <SelectItem value="code">SKU Code (በኮድ)</SelectItem>
                <SelectItem value="cartons">Carton Count (በካርቶን ብዛት)</SelectItem>
                <SelectItem value="pieces">Total Pieces (በፍሬ ብዛት)</SelectItem>
              </SelectContent>
            </Select>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSortDirection(prev => prev === "asc" ? "desc" : "asc")}
              className="h-8 px-2.5 text-xs font-semibold gap-1 bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700"
              title={sortDirection === "asc" ? "Ascending (ከትንሽ ወደ ትልቅ)" : "Descending (ከትልቅ ወደ ትንሽ)"}
            >
              {sortDirection === "asc" ? (
                <>
                  <ArrowUp className="w-3.5 h-3.5 text-blue-600" />
                  <span>Asc (ከትንሽ ወደ ትልቅ)</span>
                </>
              ) : (
                <>
                  <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                  <span>Desc (ከትልቅ ወደ ትንሽ)</span>
                </>
              )}
            </Button>

            {/* Group by Category & Subtotals Toggle */}
            <button
              type="button"
              onClick={() => setGroupByCategory(!groupByCategory)}
              className={`h-8 px-3 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border shadow-2xs ${
                groupByCategory
                  ? "bg-indigo-600 text-white border-indigo-700"
                  : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              }`}
              title="Show products grouped by category with category subtotals directly beneath"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Group by Category + Subtotals (የምድብ ድምር አሳይ)</span>
              {groupByCategory && <Check className="w-3 h-3 text-white" />}
            </button>
          </div>

          {/* Active Total summary badge */}
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">
              <Sigma className="w-3.5 h-3.5 text-indigo-600" />
              <span>
                Total: {(viewMode === "segregated" ? segregatedGrandTotal.totalCartons : productsGrandTotal.totalCartons).toLocaleString()} Cartons | {(viewMode === "segregated" ? segregatedGrandTotal.totalPieces : productsGrandTotal.totalPieces).toLocaleString()} Pcs
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Isolated Category Focus Banner (When a specific category is filtered) */}
      {selectedCategoryMetrics && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 via-indigo-50/60 to-blue-50 dark:from-blue-950/40 dark:via-indigo-950/40 dark:to-blue-950/40 border-2 border-blue-300 dark:border-blue-800 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-blue-200 dark:border-blue-800/80 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                <Filter className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-blue-900 dark:text-blue-200 flex items-center gap-2 flex-wrap">
                  <span>የተመረጠው ምድብ ብቻ (Category Focus):</span>
                  <span className="text-sm font-black text-blue-700 dark:text-blue-300 underline underline-offset-2">
                    {selectedCategoryMetrics.category.name}
                  </span>
                  {selectedCategoryMetrics.category.sizeRange && (
                    <Badge variant="outline" className="text-[10px] font-mono border-blue-300 text-blue-800 dark:text-blue-300">
                      Sizes: {selectedCategoryMetrics.category.sizeRange}
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-blue-700/80 dark:text-blue-300/80">
                  እቃው ባለብዙ ምድብ (Multi-Category) ቢሆንም በዚህ ምድብ ውስጥ ያለውን የካርቶን ብዛት እና ፍሬ ብቻ ያሳያል፤ ከሌላ ምድብ ጋር አይደባለቅም (Isolated & not merged).
                </p>
              </div>
            </div>
            <Badge className="bg-blue-600 text-white font-mono text-xs px-2.5 py-1">
              {selectedCategoryMetrics.totalProducts} Products in this Category
            </Badge>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
            <div className="bg-white/90 dark:bg-slate-900/90 p-2.5 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">ጠቅላላ እቃዎች</div>
              <div className="text-base font-black font-mono text-foreground">{selectedCategoryMetrics.totalProducts}</div>
              <div className="text-[9px] text-muted-foreground">{selectedCategoryMetrics.multiCatProducts} multi-cat</div>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/90 p-2.5 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">የመጋዘን ካርቶን</div>
              <div className="text-base font-black font-mono text-blue-600 dark:text-blue-400">{selectedCategoryMetrics.storeCartons.toLocaleString()} ctns</div>
              <div className="text-[9px] text-muted-foreground">{selectedCategoryMetrics.storePieces.toLocaleString()} pcs</div>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/90 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/80">
              <div className="text-[10px] text-amber-800 dark:text-amber-300 font-medium">ያልተረጋገጠ ቢኒንግ</div>
              <div className="text-base font-black font-mono text-amber-600 dark:text-amber-400">+{selectedCategoryMetrics.binningCartons.toLocaleString()} ctns</div>
              <div className="text-[9px] text-amber-700/80 dark:text-amber-400/80">+{selectedCategoryMetrics.binningPieces.toLocaleString()} pcs</div>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/90 p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-800/80">
              <div className="text-[10px] text-indigo-800 dark:text-indigo-300 font-medium">ጠቅላላ ካርቶን (Stock+Bin)</div>
              <div className="text-base font-black font-mono text-indigo-600 dark:text-indigo-400">{selectedCategoryMetrics.totalCartons.toLocaleString()} ctns</div>
              <div className="text-[9px] text-muted-foreground">in this category</div>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/90 p-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800/80 col-span-2 sm:col-span-1 md:col-span-2">
              <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-medium">በዚህ ምድብ ብቻ ያለ ጠቅላላ ፍሬ</div>
              <div className="text-base font-black font-mono text-emerald-600 dark:text-emerald-400">{selectedCategoryMetrics.totalPieces.toLocaleString()} pcs</div>
              <div className="text-[9px] text-emerald-700/80 dark:text-emerald-400/80">Strictly isolated from other categories</div>
            </div>
          </div>
        </div>
      )}

      {/* Main Table Matrix */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-wrap gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                <Package className="w-4 h-4 text-blue-600" />
                {viewMode === "segregated" 
                  ? "Category Segregated List (በየምድቡ የተለየ የእቃዎች ዝርዝር)"
                  : "Combined Product Matrix (የተጠቃለለ የእቃዎች ዝርዝር)"}
              </h3>
              <Badge variant="secondary" className="font-mono text-xs">
                {viewMode === "segregated" ? `${filteredSegregatedItems.length} Segments` : `${filteredProducts.length} Products`}
              </Badge>
              {selectedCategoryFilter !== "all" && (
                <Badge className="bg-blue-600 text-white text-[10px] font-bold">
                  Filtered: {selectedCategoryObj?.name}
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {viewMode === "segregated" 
                ? "እያንዳንዱ እቃ በያካተተው ምድብ ተለይቶ ተቀምጧል፤ ባለብዙ ምድብ እቃ ከሆነ ለየምድቡ ያለው የካርቶንና የፍሬ ብዛት ለብቻው ይወጣል"
                : "እያንዳንዱ እቃ በአንድ ረድፍ ተጠቃሎ ሁሉንም ያካተታቸውን ምድቦች ያሳያል"}
            </p>
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode("segregated")}
              className={`py-1 px-2.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "segregated"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="View each category allocation separately (በየምድቡ የተለየ)"
            >
              <Split className="w-3.5 h-3.5" />
              <span>Segregated by Category (በየምድቡ የተለየ)</span>
              <span className="font-mono text-[10px] opacity-90">({filteredSegregatedItems.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("product")}
              className={`py-1 px-2.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                viewMode === "product"
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="View aggregated product rows"
            >
              <Package className="w-3.5 h-3.5" />
              <span>Combined View (የተጠቃለለ)</span>
              <span className="font-mono text-[10px] opacity-90">({filteredProducts.length})</span>
            </button>
          </div>
        </div>

        {((viewMode === "segregated" && filteredSegregatedItems.length === 0) ||
          (viewMode === "product" && filteredProducts.length === 0)) ? (
          <div className="p-12 text-center text-muted-foreground space-y-2">
            <Package className="w-10 h-10 mx-auto text-slate-300" />
            <p className="font-medium text-sm">No products matched the selected filters.</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategoryFilter("all");
                setCategoryTypeFilter("all");
                setSelectedStoreFilter("all");
              }}
            >
              Reset Filters
            </Button>
          </div>
        ) : viewMode === "segregated" ? (
          /* ============================================================ */
          /* VIEW 1: SEGREGATED BY CATEGORY (በየምድቡ የተለየ)             */
          /* ============================================================ */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 min-w-[140px]">
                    <button
                      type="button"
                      onClick={() => handleSort("cartonNumber")}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors uppercase font-bold text-[11px]"
                      title="Sort by Carton Number"
                    >
                      <span>Carton Number (የካርቶን ቁጥር)</span>
                      {sortField === "cartonNumber" ? (
                        sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-4 min-w-[200px]">
                    <button
                      type="button"
                      onClick={() => handleSort("name")}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors uppercase font-bold text-[11px]"
                      title="Sort by Product Name"
                    >
                      <span>Product Info (የእቃ መረጃ & SKU)</span>
                      {sortField === "name" ? (
                        sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 min-w-[150px]">
                    <button
                      type="button"
                      onClick={() => handleSort("category")}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors uppercase font-bold text-[11px]"
                      title="Sort by Category"
                    >
                      <span>Category (የተለየ ምድብ)</span>
                      {sortField === "category" ? (
                        sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3">Carton Breakdown (በካርቶን ያለው ፍሬ)</th>
                  <th className="py-3 px-3 min-w-[130px]">
                    <button
                      type="button"
                      onClick={() => handleSort("cartons")}
                      className="flex items-center gap-1 hover:text-blue-600 transition-colors uppercase font-bold text-[11px]"
                      title="Sort by Carton Quantity"
                    >
                      <span>Cartons (የካርቶን ብዛት)</span>
                      {sortField === "cartons" ? (
                        sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right min-w-[140px]">
                    <button
                      type="button"
                      onClick={() => handleSort("pieces")}
                      className="flex items-center gap-1 ml-auto hover:text-blue-600 transition-colors uppercase font-bold text-[11px]"
                      title="Sort by Category Pieces"
                    >
                      <span>Category Pieces Only (የዚህ ምድብ ፍሬ ብቻ)</span>
                      {sortField === "pieces" ? (
                        sortDirection === "asc" ? <ArrowUp className="w-3.5 h-3.5 text-blue-600" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </th>
                  <th className="py-3 px-3 text-right">Price</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {groupByCategory ? (
                  segregatedCategoryGroups.map((group) => (
                    <React.Fragment key={group.categoryId}>
                      {/* Category Header Row */}
                      <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-t-2 border-indigo-400 dark:border-indigo-600 text-indigo-950 dark:text-indigo-200">
                        <td colSpan={8} className="py-2.5 px-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-indigo-700 text-white font-black text-xs px-2.5 py-0.5">
                                {group.categoryName}
                              </Badge>
                              {group.sizeRange && (
                                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                  Sizes: {group.sizeRange}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground font-semibold">
                                ({group.items.length} {group.items.length === 1 ? "product segment" : "product segments"})
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono font-bold">
                              <span className="text-blue-700 dark:text-blue-300">
                                Category Cartons: {group.subtotal.totalCartons.toLocaleString()} ctns
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Total Pieces: {group.subtotal.totalPieces.toLocaleString()} pcs
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Products in this category */}
                      {group.items.map(renderSegregatedRow)}

                      {/* Category Subtotal Row - Placed directly beneath the category's products */}
                      <tr className="bg-gradient-to-r from-blue-50/90 via-indigo-50/90 to-blue-50/90 dark:from-blue-950/70 dark:via-indigo-950/70 dark:to-blue-950/70 border-b-2 border-indigo-400 dark:border-indigo-700 font-bold text-xs">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600 text-white font-mono font-black text-xs shadow-2xs">
                            <Sigma className="w-3.5 h-3.5" />
                            <span>{group.subtotal.totalCartons.toLocaleString()} Cartons</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-foreground">
                              የ{group.categoryName} ጠቅላላ ድምር (Subtotal):
                            </span>
                            <Badge className="bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700 font-mono text-[10px]">
                              {group.subtotal.productCount} {group.subtotal.productCount === 1 ? "Product" : "Products"}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <Badge className="bg-indigo-700 text-white font-bold text-xs">
                            {group.categoryName}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-500 font-mono font-semibold">
                          Category Subtotal
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="space-y-0.5">
                            <div className="font-mono font-black text-xs text-blue-700 dark:text-blue-300">
                              {group.subtotal.totalCartons.toLocaleString()} Cartons
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                              Store: {group.subtotal.stockCartons.toLocaleString()}c
                              {group.subtotal.unapprovedBinningCartons > 0 && (
                                <span className="text-amber-600 dark:text-amber-400 font-bold ml-1">
                                  +{group.subtotal.unapprovedBinningCartons.toLocaleString()}c Bin
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="space-y-0.5">
                            <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                              {group.subtotal.totalPieces.toLocaleString()} pcs
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                              Store: {(group.subtotal.stockPieces || 0).toLocaleString()} pcs
                              {(group.subtotal.binningPieces || 0) > 0 && (
                                <span className="text-amber-600 dark:text-amber-400 font-semibold ml-1">
                                  +{(group.subtotal.binningPieces || 0).toLocaleString()} pcs Bin
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3"></td>
                        <td className="py-3 px-4"></td>
                      </tr>
                    </React.Fragment>
                  ))
                ) : (
                  sortedSegregatedItems.map(renderSegregatedRow)
                )}
              </tbody>
              {/* Grand Total Footer */}
              <tfoot className="border-t-2 border-slate-300 dark:border-slate-700">
                <tr className="bg-slate-900 text-white font-bold text-xs">
                  <td className="py-4 px-3 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-mono font-black text-xs shadow-md">
                      <Boxes className="w-4 h-4" />
                      <span>{segregatedGrandTotal.totalCartons.toLocaleString()} CTNS</span>
                    </div>
                  </td>
                  <td className="py-4 px-4" colSpan={2}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-white tracking-wide">
                        ጠቅላላ የሁሉም እቃዎች ድምር (GRAND TOTAL):
                      </span>
                      <Badge className="bg-white/20 text-white font-mono text-xs border-none">
                        {segregatedGrandTotal.productCount} Total Items / Segments
                      </Badge>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-slate-300 font-mono text-[11px]">
                    Across {segregatedCategoryGroups.length} Categories
                  </td>
                  <td className="py-4 px-3 whitespace-nowrap">
                    <div className="space-y-0.5">
                      <div className="font-mono font-black text-sm text-amber-300">
                        {segregatedGrandTotal.totalCartons.toLocaleString()} Cartons
                      </div>
                      <div className="text-[10px] text-slate-300 font-mono">
                        Store: {segregatedGrandTotal.stockCartons.toLocaleString()}c | Bin: +{segregatedGrandTotal.unapprovedBinningCartons.toLocaleString()}c
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-right whitespace-nowrap">
                    <div className="space-y-0.5">
                      <div className="font-mono font-black text-sm text-emerald-400">
                        {segregatedGrandTotal.totalPieces.toLocaleString()} pcs
                      </div>
                      <div className="text-[10px] text-slate-300 font-mono">
                        Store: {segregatedGrandTotal.stockPieces.toLocaleString()} pcs
                        {segregatedGrandTotal.binningPieces > 0 && (
                          <span className="text-amber-300 ml-1">
                            +{segregatedGrandTotal.binningPieces.toLocaleString()} pcs Bin
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-3" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          /* ============================================================ */
          /* VIEW 2: COMBINED PRODUCT VIEW (የተጠቃለለ እይታ)              */
          /* ============================================================ */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-3 min-w-[130px]">Carton Number (የካርቶን ቁጥር)</th>
                  <th className="py-3 px-4">Product Info</th>
                  <th className="py-3 px-3">Covered Categories (ምድቦች & ካርቶኖች)</th>
                  <th className="py-3 px-3">Size Range & List</th>
                  <th className="py-3 px-3">Carton Breakdown (Pieces/Size)</th>
                  <th className="py-3 px-3">Category Allocation Summary (በየምድቡ የካርቶን ብዛት)</th>
                  <th className="py-3 px-3 text-right">Stock & Binning (Cartons / Pcs)</th>
                  <th className="py-3 px-3 text-right">Price</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {groupByCategory ? (
                  productsCategoryGroups.map((group) => (
                    <React.Fragment key={group.categoryId}>
                      {/* Category Header Row */}
                      <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-t-2 border-indigo-400 dark:border-indigo-600 text-indigo-950 dark:text-indigo-200">
                        <td colSpan={9} className="py-2.5 px-3">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-indigo-700 text-white font-black text-xs px-2.5 py-0.5">
                                {group.categoryName}
                              </Badge>
                              {group.sizeRange && (
                                <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                  Sizes: {group.sizeRange}
                                </span>
                              )}
                              <span className="text-[11px] text-muted-foreground font-semibold">
                                ({group.items.length} {group.items.length === 1 ? "product" : "products"})
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs font-mono font-bold">
                              <span className="text-blue-700 dark:text-blue-300">
                                Category Cartons: {group.subtotal.totalCartons.toLocaleString()} ctns
                              </span>
                              <span className="text-emerald-600 dark:text-emerald-400">
                                Category Pieces: {group.subtotal.totalPieces.toLocaleString()} pcs
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Products in this category */}
                      {group.items.map(renderProductRow)}

                      {/* Category Subtotal Row */}
                      <tr className="bg-gradient-to-r from-blue-50/90 via-indigo-50/90 to-blue-50/90 dark:from-blue-950/70 dark:via-indigo-950/70 dark:to-blue-950/70 border-b-2 border-indigo-400 dark:border-indigo-700 font-bold text-xs">
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-blue-600 text-white font-mono font-black text-xs shadow-2xs">
                            <Sigma className="w-3.5 h-3.5" />
                            <span>{group.subtotal.totalCartons.toLocaleString()} Cartons</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm text-foreground">
                              የ{group.categoryName} ጠቅላላ ድምር (Subtotal):
                            </span>
                            <Badge className="bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-200 border-blue-300 dark:border-blue-700 font-mono text-[10px]">
                              {group.subtotal.productCount} {group.subtotal.productCount === 1 ? "Product" : "Products"}
                            </Badge>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <Badge className="bg-indigo-700 text-white font-bold text-xs">
                            {group.categoryName}
                          </Badge>
                        </td>
                        <td className="py-3 px-3 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                          {group.sizeRange ? `Sizes: ${group.sizeRange}` : "All Sizes"}
                        </td>
                        <td className="py-3 px-3 text-[11px] text-slate-500 font-mono font-semibold">
                          Category Subtotal
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 font-bold">
                            {group.subtotal.totalCartons.toLocaleString()} ctns allocated
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="space-y-0.5">
                            <div className="font-mono font-black text-xs text-blue-700 dark:text-blue-300">
                              {group.subtotal.totalCartons.toLocaleString()} ctns
                            </div>
                            <div className="font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                              {group.subtotal.totalPieces.toLocaleString()} pcs
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3"></td>
                        <td className="py-3 px-4"></td>
                      </tr>
                    </React.Fragment>
                  ))
                ) : (
                  sortedProducts.map(renderProductRow)
                )}
              </tbody>
              {/* Grand Total Footer */}
              <tfoot className="border-t-2 border-slate-300 dark:border-slate-700">
                <tr className="bg-slate-900 text-white font-bold text-xs">
                  <td className="py-4 px-3 whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-mono font-black text-xs shadow-md">
                      <Boxes className="w-4 h-4" />
                      <span>{productsGrandTotal.totalCartons.toLocaleString()} CTNS</span>
                    </div>
                  </td>
                  <td className="py-4 px-4" colSpan={2}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-black text-white tracking-wide">
                        ጠቅላላ የሁሉም እቃዎች ድምር (GRAND TOTAL):
                      </span>
                      <Badge className="bg-white/20 text-white font-mono text-xs border-none">
                        {productsGrandTotal.productCount} Total Products
                      </Badge>
                    </div>
                  </td>
                  <td className="py-4 px-3 text-slate-300 font-mono text-[11px]" colSpan={3}>
                    Across {productsCategoryGroups.length} Categories
                  </td>
                  <td className="py-4 px-3 text-right whitespace-nowrap">
                    <div className="space-y-0.5">
                      <div className="font-mono font-black text-sm text-amber-300">
                        {productsGrandTotal.totalCartons.toLocaleString()} ctns
                      </div>
                      <div className="font-mono font-black text-sm text-emerald-400">
                        {productsGrandTotal.totalPieces.toLocaleString()} pcs
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-3" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* AMENDMENT MODAL */}
      <Dialog open={Boolean(amendProduct)} onOpenChange={(open) => !open && setAmendProduct(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2 text-foreground">
              <SlidersHorizontal className="w-5 h-5 text-blue-600" />
              Amend Product Sizes & Carton Breakdown (የሳይዝ እና የካርቶን ድልድል ማሻሻያ)
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              እቃው፡ <strong className="text-foreground">{amendProduct?.name}</strong> ({amendProduct?.code})
            </DialogDescription>
          </DialogHeader>

          {amendProduct && (
            <div className="space-y-4 pt-2">
              {/* Primary Category and Pieces Per Carton */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-900/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Primary Category (ዋና ምድብ)</Label>
                  <Select
                    value={amendCategoryId}
                    onValueChange={(val) => setAmendCategoryId(val)}
                  >
                    <SelectTrigger className="h-9 text-xs bg-white dark:bg-slate-900">
                      <SelectValue placeholder="Select Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(c => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.sizeRange ? `(${c.sizeRange})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Pieces Per Carton (በ 1 ካርቶን የሚገኝ ፍሬ)</Label>
                  <Input
                    type="number"
                    min="1"
                    value={amendQpc}
                    onChange={(e) => setAmendQpc(Math.max(1, parseInt(e.target.value) || 1))}
                    className="h-9 text-xs font-bold font-mono bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              {/* Product Size Range Selector & Generator */}
              <ProductSizeRangeSelector
                value={amendSizeString}
                onChange={(val, sizesArr, rangeSummary) => {
                  setAmendSizeString(val);
                  setAmendSizesArray(sizesArr);
                  setAmendSizeRange(rangeSummary);

                  // Recalculate category matching
                  if (sizesArr.length > 0) {
                    const match = matchCategoriesForSizes(sizesArr, categories);
                    if (match.bestMatchCategory && (!amendCategoryId || amendCategoryId === categories[0]?.id)) {
                      setAmendCategoryId(match.bestMatchCategory.id);
                    }
                  }
                }}
              />

              {/* Carton Breakdown Interactive Stepper (+ / -) */}
              {amendSizesArray.length > 0 && (
                <CartonBreakdownViewer
                  sizes={amendSizesArray}
                  quantityPerCarton={amendQpc}
                  categories={categories}
                  selectedCategoryId={amendCategoryId}
                  value={amendBreakdown}
                  onChange={(items, catSummaries) => {
                    setAmendBreakdown(items);
                    setAmendCategorySummaries(catSummaries);
                  }}
                />
              )}
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-slate-200 dark:border-slate-800 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAmendProduct(null)}
              disabled={saving}
            >
              Cancel (ተመለስ)
            </Button>
            <Button
              type="button"
              onClick={handleSaveAmendment}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save Amendment (አስቀምጥ)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VIEW PRODUCT FULL DETAILS MODAL */}
      <Dialog open={Boolean(viewProductAnalysis)} onOpenChange={(open) => !open && setViewProductAnalysis(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-lg font-black flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-600" />
              Product Size & Category Detailed Matrix
            </DialogTitle>
            <DialogDescription className="text-xs">
              {viewProductAnalysis?.product.name} ({viewProductAnalysis?.product.code})
            </DialogDescription>
          </DialogHeader>

          {viewProductAnalysis && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                {viewProductAnalysis.product.photoUrl && (
                  <img
                    src={viewProductAnalysis.product.photoUrl}
                    alt={viewProductAnalysis.product.name}
                    className="w-14 h-14 rounded-lg object-cover border"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-base text-foreground truncate">
                    {viewProductAnalysis.product.name}
                  </h4>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span>SKU: {viewProductAnalysis.product.code}</span>
                    <span>•</span>
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 inline-flex items-center gap-1">
                      <Boxes className="w-3 h-3 text-blue-500" />
                      Carton No: {viewProductAnalysis.cartonNumberRange}
                    </span>
                    <span>•</span>
                    <span>Primary: {viewProductAnalysis.primaryCategoryName}</span>
                    <span>•</span>
                    <span>{viewProductAnalysis.quantityPerCarton} pcs/carton</span>
                  </div>
                </div>
              </div>

              {/* Stock and Binning Carton Overview */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 font-semibold block">Store Stock</span>
                  <span className="font-mono font-bold text-sm text-blue-600 dark:text-blue-400">
                    {viewProductAnalysis.stockCartons} ctns
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold block">Unapproved Binning</span>
                  <span className="font-mono font-bold text-sm text-amber-600 dark:text-amber-400">
                    +{viewProductAnalysis.unapprovedBinningCartons} ctns
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-500 font-semibold block">Total Cartons</span>
                  <span className="font-mono font-bold text-sm text-foreground">
                    {viewProductAnalysis.totalCartons} ctns
                  </span>
                </div>
                <div className="space-y-0.5">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold block">Total Pieces</span>
                  <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400">
                    {viewProductAnalysis.totalPieces.toLocaleString()} pcs
                  </span>
                </div>
              </div>

              {/* Multi-Category Details with Carton Allocation */}
              {viewProductAnalysis.isMultiCategory && (
                <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 space-y-2">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <Split className="w-4 h-4 text-amber-600" />
                    <span>Multi-Category Product (ሁለት እና ከዚያ በላይ ምድቦችን ያካተተ)</span>
                  </div>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    ይህ እቃ በተለያዩ ምድቦች ውስጥ ይገኛል። በሁሉም ምድቦች የካርቶን ብዛት እና የፍሬ ድምር ተካቷል፡
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                    {viewProductAnalysis.categorySummaries.map((cat, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800 text-xs space-y-1.5 shadow-2xs">
                        <div className="font-bold text-foreground flex items-center justify-between">
                          <span className="truncate">{cat.categoryName}</span>
                          <Badge variant="secondary" className="font-mono text-[10px]">
                            {cat.cartons} Cartons
                          </Badge>
                        </div>
                        <div className="text-slate-500 text-[11px]">
                          Sizes: {cat.sizes?.join(", ")}
                        </div>
                        <div className="flex items-center justify-between text-[11px] font-mono font-semibold pt-1 border-t border-slate-100 dark:border-slate-800">
                          <span className="text-slate-600 dark:text-slate-400">
                            {cat.count} pcs/ctn ({cat.percentage}%)
                          </span>
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {cat.totalCategoryPieces.toLocaleString()} pcs total
                          </span>
                        </div>
                        {(cat.unapprovedBinningCartons > 0 || cat.stockCartons > 0) && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-2">
                            <span>Store: {cat.stockCartons}c</span>
                            {cat.unapprovedBinningCartons > 0 && (
                              <span className="font-bold text-amber-700 dark:text-amber-400">
                                Binning: +{cat.unapprovedBinningCartons}c
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Carton Breakdown Component Viewer */}
              <CartonBreakdownViewer
                sizes={viewProductAnalysis.sizes}
                quantityPerCarton={viewProductAnalysis.quantityPerCarton}
                categories={categories}
                selectedCategoryId={viewProductAnalysis.product.categoryId}
                value={viewProductAnalysis.breakdownItems}
                editable={false}
              />
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setViewProductAnalysis(null)}
            >
              Close
            </Button>
            {viewProductAnalysis && (
              <Button
                onClick={() => {
                  const target = viewProductAnalysis;
                  setViewProductAnalysis(null);
                  handleOpenAmend(target);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold"
              >
                Amend Sizes (አሻሽል)
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
