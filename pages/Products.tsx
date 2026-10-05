import { useState, useEffect, useRef } from "react";
import {
  Plus, Minus, Search, Edit, Trash2, Eye, Ban, Download, Upload,
  AlertTriangle, Loader2, Image as ImageIcon, ChevronLeft, ChevronRight, X,
  CheckCircle, FileUp, FileDown, Package, ShieldCheck, RefreshCw,
  Printer, Share2, FileText, Copy, Check, ExternalLink, Layers, QrCode,
  ChevronDown, MoreHorizontal, Barcode as BarcodeIcon, Pencil, Sparkles, History
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import {
  getAll, create, update, remove, COLLECTIONS, generateVoucherId, generateSerialVoucherId,
  syncProductAcrossCollections, subscribeCollection
} from "@/lib/firestore";
import { computeStockBalances, StockBalance } from "@/lib/stockUtils";
import { fmt } from "@/lib/currency";
import { uploadImage } from "@/lib/cloudinary";
import { useAuth } from "@/lib/auth";
import type { Product, Category, Supplier, PricingRecord, Store, BinningVoucher, BinningItem, PosSale, DirectSale, StockIn, ProductEditHistoryItem } from "@/lib/types";
import { HabeshaDatePicker } from "@/components/HabeshaDatePicker";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { printElement } from "@/lib/printUtils";
import Barcode from "@/Barcode";
import { shareAsImage, shareAsPdf, exportToExcel, exportToPdf } from "@/lib/shareImage";
import { SupplierSelect } from "@/components/SupplierSelect";
import { ProductSizeRangeSelector } from "@/components/ProductSizeRangeSelector";
import { CartonBreakdownViewer } from "@/components/CartonBreakdownViewer";
import { matchCategoriesForSizes, formatCartonBreakdownSummary } from "@/categorySizeUtils";
import { ProductImportDialog } from "@/components/ProductImportDialog";
import type { CartonSizeItem, CartonCategorySummary } from "@/types";
import * as XLSX from "xlsx";

const MAX_IMAGES = 5;

export default function Products() {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [draftBinningVouchers, setDraftBinningVouchers] = useState<BinningVoucher[]>([]);
  const [stockMap, setStockMap] = useState<Record<string, StockBalance>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "in_stock" | "low_stock" | "out_of_stock">("all");
  const [showImportDialog, setShowImportDialog] = useState(false);

  // Beginning Stock (Binning) state
  const [enableBeginningStock, setEnableBeginningStock] = useState(false);
  const [beginningStoreId, setBeginningStoreId] = useState("");
  const [beginningMode, setBeginningMode] = useState<"piece" | "carton">("piece");
  const [beginningQty, setBeginningQty] = useState<number | "">("");
  const [beginningVoucherType, setBeginningVoucherType] = useState<"new" | "existing">("new");
  const [selectedDraftVoucherId, setSelectedDraftVoucherId] = useState<string>("");
  const [beginningVoucherDate, setBeginningVoucherDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [beginningRemark, setBeginningRemark] = useState<string>("");

  const [showDialog, setShowDialog] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [cartonBreakdown, setCartonBreakdown] = useState<CartonSizeItem[]>([]);
  const [cartonCategorySummaries, setCartonCategorySummaries] = useState<CartonCategorySummary[]>([]);
  const [detectedCategory, setDetectedCategory] = useState<{ category: Category; matchScore: number; matchedSizes: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; idx: number } | null>(null);
  const [showVoucher, setShowVoucher] = useState<Product | null>(null);
  const [voucherImgIdx, setVoucherImgIdx] = useState(0);
  const [viewTab, setViewTab] = useState<"card" | "label">("label");
  const [labelCopies, setLabelCopies] = useState(1);
  const [sharing, setSharing] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [copied, setCopied] = useState(false);
  const [deleteTargetProduct, setDeleteTargetProduct] = useState<Product | null>(null);
  const [deletingProduct, setDeletingProduct] = useState(false);
  const [productTxStats, setProductTxStats] = useState<{
    binning: number;
    stockIn: number;
    posSales: number;
    directSales: number;
    loading: boolean;
  } | null>(null);

  const importFileRef = useRef<HTMLInputElement>(null);
  const voucherRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();

  function handlePrintFullVoucher() {
    if (!voucherRef.current) return;
    printElement(voucherRef.current, `${showVoucher?.name || "Product"}_Specification`);
  }

  function handlePrintBarcodeLabel() {
    if (!labelRef.current) return;
    printElement(labelRef.current, `${showVoucher?.name || "Product"}_Barcode_Label`);
  }

  function openViewProduct(p: Product) {
    setShowVoucher(p);
    setVoucherImgIdx(0);
    setViewTab("label");
    setLabelCopies(1);
  }

  async function handleShareImage() {
    const targetRef = viewTab === "label" ? labelRef : voucherRef;
    if (!targetRef.current || !showVoucher) return;
    setSharing(true);
    try {
      const filename = `${showVoucher.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${showVoucher.code}_${viewTab}.png`;
      const res = await shareAsImage(targetRef.current, filename);
      if (res === "shared") toast({ title: "Product card shared successfully" });
      else if (res === "downloaded") toast({ title: "Product image downloaded" });
      else toast({ title: "Sharing completed" });
    } catch (err) {
      toast({ title: "Failed to share image", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  async function handleSharePdf() {
    const targetRef = viewTab === "label" ? labelRef : voucherRef;
    if (!targetRef.current || !showVoucher) return;
    setSharingPdf(true);
    try {
      const filename = `${showVoucher.name.replace(/[^a-zA-Z0-9_-]/g, "_")}_${showVoucher.code}_${viewTab}.pdf`;
      const res = await shareAsPdf(targetRef.current, filename);
      if (res === "shared") toast({ title: "Product PDF shared successfully" });
      else if (res === "downloaded") toast({ title: "Product PDF downloaded" });
      else toast({ title: "PDF export completed" });
    } catch (err) {
      toast({ title: "Failed to generate PDF", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setSharingPdf(false);
    }
  }

  function handleCopyDetails() {
    if (!showVoucher) return;
    const price = pricing.find(pr => pr.productId === showVoucher.id);
    const qty = stockMap[showVoucher.id]?.quantity || 0;
    const text = `Product: ${showVoucher.name}\nSKU/Code: ${showVoucher.code}\nBarcode: ${showVoucher.barcodeValue || showVoucher.code}\nCategory: ${showVoucher.categoryName || "General"}\nSelling Price: ${fmt(price?.sellingPrice || showVoucher.sellingPrice || 0)}\nLive Stock: ${qty} ${showVoucher.unit || "pcs"}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Product details copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  }

  // Form State with all required fields
  const [form, setForm] = useState({
    name: "",
    code: "",
    brand: "",
    barcodeValue: "",
    categoryId: "",
    supplierId: "",
    unit: "pcs",
    quantityPerCarton: 1,
    minCartonAlert: 1,
    maxStock: 1000,
    unitCost: 0,
    sellingPrice: 0,
    size: "",
    sizes: [] as string[],
    sizeRange: "",
    description: "",
    photoUrls: [] as string[],
    status: "active" as "active" | "inactive",
  });

  async function loadStock() {
    try {
      const balances = await computeStockBalances();
      setStockMap(balances);
    } catch (err) {
      console.error("Error computing stock for products:", err);
    }
  }

  // Real-time subscriptions for multi-device sync
  useEffect(() => {
    setLoading(true);
    const unsubProducts = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, (prods) => {
      setProducts(prods);
      loadStock();
    });

    const unsubCategories = subscribeCollection<Category>(COLLECTIONS.CATEGORIES, (cats) => {
      setCategories(cats);
    });

    const unsubSuppliers = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, (sups) => {
      setSuppliers(sups);
    });

    const unsubPricing = subscribeCollection<PricingRecord>(COLLECTIONS.PRICING, (prs) => {
      setPricing(prs);
    });

    const unsubStores = subscribeCollection<Store>(COLLECTIONS.STORES, (sts) => {
      setStores(sts);
      if (sts.length > 0) {
        setBeginningStoreId(prev => prev || sts[0].id);
      }
    });

    const unsubBinning = subscribeCollection<BinningVoucher>(COLLECTIONS.BINNING, (vs) => {
      const drafts = vs.filter(v => !v.isVoided && v.status === "draft")
        .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
      setDraftBinningVouchers(drafts);
      if (drafts.length > 0) {
        setSelectedDraftVoucherId(prev => prev || drafts[0].id);
      }
    });

    const unsubDamages = subscribeCollection(COLLECTIONS.DAMAGE_RETURNS, () => {
      loadStock();
    });

    loadStock().finally(() => setLoading(false));

    return () => {
      unsubProducts();
      unsubCategories();
      unsubSuppliers();
      unsubPricing();
      unsubStores();
      unsubBinning();
      unsubDamages();
    };
  }, []);

  function getProductImages(p: Product): string[] {
    if (p.photoUrls && p.photoUrls.length > 0) return p.photoUrls;
    if (p.photoUrl) return [p.photoUrl];
    return [];
  }

  function openAdd() {
    setEditProduct(null);
    setCartonBreakdown([]);
    setCartonCategorySummaries([]);
    setDetectedCategory(null);
    setForm({
      name: "",
      code: "",
      brand: "",
      barcodeValue: "",
      categoryId: categories[0]?.id || "",
      supplierId: "",
      unit: "pcs",
      quantityPerCarton: 1,
      minCartonAlert: 1,
      maxStock: 1000,
      unitCost: 0,
      sellingPrice: 0,
      size: "",
      sizes: [],
      sizeRange: "",
      description: "",
      photoUrls: [],
      status: "active",
    });
    setEnableBeginningStock(false);
    setBeginningStoreId(stores[0]?.id || "");
    setBeginningMode("piece");
    setBeginningQty("");
    setBeginningVoucherType(draftBinningVouchers.length > 0 ? "existing" : "new");
    setSelectedDraftVoucherId(draftBinningVouchers[0]?.id || "");
    setBeginningVoucherDate(new Date().toISOString().slice(0, 10));
    setBeginningRemark("");
    setShowDialog(true);
  }

  function openEdit(p: Product) {
    setEditProduct(p);
    const priceRec = pricing.find(pr => pr.productId === p.id);
    const imgs = getProductImages(p);
    const existingSize = p.size || (p.sizes && p.sizes.length > 0 ? p.sizes.join(", ") : "");
    const existingSizes = p.sizes || (existingSize ? existingSize.split(",").map(s => s.trim()).filter(Boolean) : []);
    
    setCartonBreakdown(p.cartonBreakdown || []);
    setCartonCategorySummaries(p.cartonCategoryBreakdown || []);

    if (existingSizes.length > 0) {
      const match = matchCategoriesForSizes(existingSizes, categories);
      if (match.bestMatchCategory) {
        setDetectedCategory({
          category: match.bestMatchCategory,
          matchScore: match.matchScore,
          matchedSizes: match.categoryMatches[0]?.matchedSizes || existingSizes,
        });
      } else {
        setDetectedCategory(null);
      }
    } else {
      setDetectedCategory(null);
    }

    setForm({
      name: p.name,
      code: p.code,
      brand: p.brand || "",
      barcodeValue: p.barcodeValue || p.code,
      categoryId: p.categoryId || "",
      supplierId: p.supplierId || "",
      unit: p.unit || "pcs",
      quantityPerCarton: p.quantityPerCarton || 1,
      minCartonAlert: p.minCartonAlert || 1,
      maxStock: p.maxStock || 1000,
      unitCost: priceRec?.unitCost || p.purchasePrice || 0,
      sellingPrice: priceRec?.sellingPrice || p.sellingPrice || 0,
      size: existingSize,
      sizes: existingSizes,
      sizeRange: p.sizeRange || "",
      description: p.description || "",
      photoUrls: imgs,
      status: p.isVoided ? "inactive" : "active",
    });
    setEnableBeginningStock(false);
    setBeginningStoreId(stores[0]?.id || "");
    setBeginningMode("piece");
    setBeginningQty("");
    setBeginningVoucherType(draftBinningVouchers.length > 0 ? "existing" : "new");
    setSelectedDraftVoucherId(draftBinningVouchers[0]?.id || "");
    setBeginningVoucherDate(new Date().toISOString().slice(0, 10));
    setBeginningRemark("");
    setShowDialog(true);
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const remaining = MAX_IMAGES - form.photoUrls.length;
    if (remaining <= 0) {
      toast({ title: `Maximum ${MAX_IMAGES} photos allowed`, variant: "destructive" });
      return;
    }
    const toUpload = Array.from(files).slice(0, remaining);
    setUploadingIdx(form.photoUrls.length);

    try {
      const urls: string[] = [];
      for (const file of toUpload) {
        const url = await uploadImage(file, "products");
        urls.push(url);
      }
      setForm(f => ({ ...f, photoUrls: [...f.photoUrls, ...urls] }));
      toast({ title: `Uploaded ${urls.length} photo${urls.length === 1 ? "" : "s"}` });
    } catch (err) {
      toast({ title: "Upload failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setUploadingIdx(null);
      e.target.value = "";
    }
  }

  function removeImage(idx: number) {
    setForm(f => ({ ...f, photoUrls: f.photoUrls.filter((_, i) => i !== idx) }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.code.trim()) {
      toast({ title: "Product Name and SKU/Code are required", variant: "destructive" });
      return;
    }

    // Check duplicate code / barcode
    const cleanCode = form.code.trim().toLowerCase();
    const cleanBarcode = (form.barcodeValue || form.code).trim().toLowerCase();

    const dupCode = products.find(p => (!editProduct || p.id !== editProduct.id) && p.code.toLowerCase() === cleanCode);
    if (dupCode) {
      toast({ title: `SKU / Code "${form.code}" already exists`, description: `Existing product: ${dupCode.name}`, variant: "destructive" });
      return;
    }

    const dupBarcode = products.find(p => (!editProduct || p.id !== editProduct.id) && p.barcodeValue && p.barcodeValue.toLowerCase() === cleanBarcode);
    if (dupBarcode) {
      toast({ title: `Barcode "${form.barcodeValue}" already exists`, description: `Existing product: ${dupBarcode.name}`, variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      const cat = categories.find(c => c.id === form.categoryId);
      const supplier = suppliers.find(s => s.id === form.supplierId);

      const productPayload: Record<string, unknown> = {
        name: form.name.trim(),
        code: form.code.trim(),
        brand: form.brand.trim(),
        barcodeValue: form.barcodeValue.trim() || form.code.trim(),
        categoryId: form.categoryId,
        categoryName: cat?.name || "",
        supplierId: form.supplierId || "",
        supplierName: supplier?.name || "",
        unit: form.unit || "pcs",
        quantityPerCarton: Number(form.quantityPerCarton) || 1,
        minCartonAlert: Number(form.minCartonAlert) || 1,
        maxStock: Number(form.maxStock) || 1000,
        purchasePrice: Number(form.unitCost) || 0,
        sellingPrice: Number(form.sellingPrice) || 0,
        size: form.size ? form.size.trim() : "",
        sizes: form.sizes || [],
        sizeRange: form.sizeRange ? form.sizeRange.trim() : "",
        cartonBreakdown: cartonBreakdown || [],
        cartonCategoryBreakdown: cartonCategorySummaries || [],
        description: form.description.trim(),
        photoUrls: form.photoUrls,
        photoUrl: form.photoUrls[0] || "",
        isVoided: form.status === "inactive",
      };

      let prodId = editProduct?.id;

      if (editProduct) {
        const cleanName = form.name.trim();
        const cleanCode = form.code.trim();
        const prevName = (editProduct.name || "").trim();
        const prevCode = (editProduct.code || "").trim();
        const isNameOrCodeChanged = (prevName && prevName !== cleanName) || (prevCode && prevCode !== cleanCode);

        if (isNameOrCodeChanged) {
          productPayload.previousName = prevName;
          productPayload.previousCode = prevCode;
          productPayload.beforeEditMemo = `Before Edit: ${prevName} (${prevCode})`;

          const historyItem: ProductEditHistoryItem = {
            previousName: prevName,
            previousCode: prevCode,
            newName: cleanName,
            newCode: cleanCode,
            editedAt: new Date().toISOString(),
            editedBy: user?.name || user?.email || "Admin",
            note: `Before Edit: ${prevName} (${prevCode}) → ${cleanName} (${cleanCode})`,
          };
          const existingHistory = Array.isArray(editProduct.editHistory) ? editProduct.editHistory : [];
          productPayload.editHistory = [historyItem, ...existingHistory].slice(0, 20);
          productPayload.lastEditedAt = new Date().toISOString();
          productPayload.lastEditedBy = user?.name || user?.email || "Admin";
        } else if (editProduct.previousName || editProduct.previousCode || editProduct.beforeEditMemo) {
          productPayload.previousName = editProduct.previousName;
          productPayload.previousCode = editProduct.previousCode;
          productPayload.beforeEditMemo = editProduct.beforeEditMemo;
          productPayload.editHistory = editProduct.editHistory || [];
          productPayload.lastEditedAt = new Date().toISOString();
          productPayload.lastEditedBy = user?.name || user?.email || "Admin";
        }

        await update(COLLECTIONS.PRODUCTS, editProduct.id, productPayload);

        // Only run cross-collection voucher synchronization if name, code, or photo actually changed
        if (isNameOrCodeChanged || (form.photoUrls[0] || "") !== (editProduct.photoUrl || "")) {
          syncProductAcrossCollections(editProduct.id, {
            name: form.name.trim(),
            code: form.code.trim(),
            photoUrl: form.photoUrls[0] || "",
            categoryName: cat?.name || "",
            quantityPerCarton: Number(form.quantityPerCarton) || 1,
            size: form.size ? form.size.trim() : "",
          }).catch(err => console.warn("Background voucher sync:", err));
        }

        toast({ title: "Product updated successfully" });
      } else {
        productPayload.voucherId = generateVoucherId("PROD");
        prodId = await create(COLLECTIONS.PRODUCTS, productPayload);
        toast({ title: "Product created successfully" });
      }

      // Sync Pricing Record
      if (prodId && (form.unitCost > 0 || form.sellingPrice > 0)) {
        const existingPrice = pricing.find(pr => pr.productId === prodId);
        const margin = form.unitCost > 0 ? ((form.sellingPrice - form.unitCost) / form.unitCost) * 100 : 0;
        const priceData = {
          productId: prodId,
          productName: form.name.trim(),
          productCode: form.code.trim(),
          unitCost: Number(form.unitCost) || 0,
          profitMargin: Math.round(margin * 10) / 10,
          sellingPrice: Number(form.sellingPrice) || 0,
          ecommercePiecePrice: Number(form.sellingPrice) || 0,
        };

        if (existingPrice) {
          await update(COLLECTIONS.PRICING, existingPrice.id, priceData);
        } else {
          await create(COLLECTIONS.PRICING, priceData);
        }
      }

      // Handle Beginning Stock (Binning Voucher)
      if (enableBeginningStock && prodId && Number(beginningQty) > 0) {
        const qpc = Number(form.quantityPerCarton) || 1;
        const qtyNum = Number(beginningQty);
        const cartons = beginningMode === "carton" ? qtyNum : (qpc > 0 ? qtyNum / qpc : qtyNum);
        const units = beginningMode === "piece" ? qtyNum : qtyNum * qpc;
        const unitPrice = Number(form.unitCost) || 0;
        const cartonPrice = unitPrice * qpc;

        const binningItem: BinningItem = {
          productId: prodId,
          productName: form.name.trim(),
          productCode: form.code.trim(),
          photoUrl: form.photoUrls[0] || "",
          quantityPerCarton: qpc,
          cartons: Math.round(cartons * 100) / 100,
          units: Math.round(units),
          unitPrice,
          cartonPrice,
        };

        if (beginningVoucherType === "existing" && selectedDraftVoucherId) {
          const targetVoucher = draftBinningVouchers.find(v => v.id === selectedDraftVoucherId);
          if (targetVoucher) {
            const updatedItems = [...(targetVoucher.items || [])];
            const existingIdx = updatedItems.findIndex(i => i.productId === prodId);
            if (existingIdx >= 0) {
              updatedItems[existingIdx] = binningItem;
            } else {
              updatedItems.push(binningItem);
            }
            const totalCartons = updatedItems.reduce((s, i) => s + i.cartons, 0);
            const totalUnits = updatedItems.reduce((s, i) => s + i.units, 0);

            await update(COLLECTIONS.BINNING, targetVoucher.id, {
              items: updatedItems,
              totalCartons: Math.round(totalCartons * 100) / 100,
              totalUnits: Math.round(totalUnits),
            });

            toast({
              title: `Added to Binning Voucher ${targetVoucher.voucherId}`,
              description: `${units} pcs (${Math.round(cartons * 100) / 100} ctns) attached. Stock will update upon Approval in Binning.`,
            });
          }
        } else {
          // Create new draft Binning voucher
          const st = stores.find(s => s.id === beginningStoreId) || stores[0];
          const newVoucherId = await generateSerialVoucherId("BIN");
          const newVoucher: Omit<BinningVoucher, "id"> = {
            voucherId: newVoucherId,
            storeId: st?.id || "",
            storeName: st?.name || "Main Store",
            items: [binningItem],
            totalCartons: Math.round(cartons * 100) / 100,
            totalUnits: Math.round(units),
            status: "draft",
            voucherDate: beginningVoucherDate,
            remark: beginningRemark || `Beginning stock for ${form.name.trim()}`,
            createdByName: user?.name || "",
          };

          await create(COLLECTIONS.BINNING, newVoucher as Record<string, unknown>);

          toast({
            title: `New Binning Voucher ${newVoucherId} created (Draft)`,
            description: `${units} pcs (${Math.round(cartons * 100) / 100} ctns) recorded. Stock balance will update once Approved in Binning.`,
          });
        }
      }

      setShowDialog(false);
      setSaving(false);
      loadStock().catch(() => {});
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to save product", description: msg, variant: "destructive" });
      setSaving(false);
    }
  }

  async function startDeleteProduct(p: Product) {
    setDeleteTargetProduct(p);
    setProductTxStats({ binning: 0, stockIn: 0, posSales: 0, directSales: 0, loading: true });
    try {
      const [binList, stockInList, posList, directList] = await Promise.all([
        getAll<BinningVoucher>(COLLECTIONS.BINNING).catch(() => []),
        getAll<StockIn>(COLLECTIONS.STOCK_IN).catch(() => []),
        getAll<PosSale>(COLLECTIONS.POS_SALES).catch(() => []),
        getAll<DirectSale>(COLLECTIONS.DIRECT_SALES).catch(() => []),
      ]);

      const pCode = (p.code || "").trim().toLowerCase();
      const prevCode = (p.previousCode || "").trim().toLowerCase();
      const pId = p.id;

      const matchesItem = (i: any) => {
        if (!i) return false;
        if (i.productId && i.productId === pId) return true;
        const itemCode = (i.productCode || "").trim().toLowerCase();
        if (itemCode && (itemCode === pCode || (prevCode && itemCode === prevCode))) return true;
        return false;
      };

      const binCount = (binList || []).filter(b => b.items?.some(matchesItem)).length;
      const stockInCount = (stockInList || []).filter(s => s.items?.some(matchesItem)).length;
      const posCount = (posList || []).filter(s => s.items?.some(matchesItem)).length;
      const directCount = (directList || []).filter(d => d.items?.some(matchesItem)).length;

      setProductTxStats({
        binning: binCount,
        stockIn: stockInCount,
        posSales: posCount,
        directSales: directCount,
        loading: false,
      });
    } catch {
      setProductTxStats({ binning: 0, stockIn: 0, posSales: 0, directSales: 0, loading: false });
    }
  }

  function handleConfirmDelete() {
    if (!deleteTargetProduct) return;
    const target = deleteTargetProduct;
    // Close the product delete review dialog first so the auth dialog can open cleanly
    setDeleteTargetProduct(null);

    confirmDelete(async () => {
      await executeDeleteProduct(target);
    });
  }

  async function executeDeleteProduct(p: Product) {
    setDeletingProduct(true);
    try {
      // 1. Remove product from products collection
      await remove(COLLECTIONS.PRODUCTS, p.id);

      // 2. Remove pricing record if present
      const priceRec = pricing.find(pr => pr.productId === p.id);
      if (priceRec) {
        await remove(COLLECTIONS.PRICING, priceRec.id);
      }

      // 3. Close modals if deleting the active one
      if (showVoucher?.id === p.id) {
        setShowVoucher(null);
      }
      if (editProduct?.id === p.id) {
        setShowDialog(false);
      }

      // 4. Reload stock
      await loadStock();

      toast({
        title: "Product Deleted Successfully (ምርቱ ተሰርዟል)",
        description: `Product "${p.name}" (${p.code}) has been permanently deleted.`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to delete product", description: msg, variant: "destructive" });
    } finally {
      setDeletingProduct(false);
    }
  }

  function handleDelete(p: Product) {
    startDeleteProduct(p);
  }

  async function handleVoid(p: Product) {
    await update(COLLECTIONS.PRODUCTS, p.id, { isVoided: true });
    toast({ title: "Product deactivated/voided" });
  }

  async function handleActivate(p: Product) {
    await update(COLLECTIONS.PRODUCTS, p.id, { isVoided: false });
    toast({ title: "Product activated" });
  }

  async function exportExcel() {
    const rows = products.map(p => {
      const qty = stockMap[p.id]?.quantity || 0;
      const price = pricing.find(pr => pr.productId === p.id);
      return {
        Name: p.name,
        "SKU / Code": p.code,
        "Before Edit Name": p.previousName || "",
        "Before Edit Code": p.previousCode || "",
        "Before Edit Memo": p.beforeEditMemo || "",
        Brand: p.brand || "",
        Barcode: p.barcodeValue || p.code,
        Category: p.categoryName || "",
        "Unit Cost": price?.unitCost || p.purchasePrice || 0,
        "Selling Price": price?.sellingPrice || p.sellingPrice || 0,
        "Current Stock": qty,
        "Sizes / Range": p.size || p.sizeRange || "",
        Unit: p.unit || "pcs",
        "Qty Per Carton": p.quantityPerCarton || 1,
        "Min Alert": p.minCartonAlert || 1,
        Description: p.description || "",
        Status: p.isVoided ? "Inactive" : "Active",
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products Catalog");
    await exportToExcel({
      workbook: wb,
      filename: `products_catalog_${new Date().toISOString().slice(0, 10)}.xlsx`,
      title: "YESERAHUT PRODUCTS CATALOG",
      subtitle: `Total Products: ${products.length} | Export Date: ${new Date().toLocaleDateString()}`,
    });
  }

  async function exportPdf() {
    setExportingPdf(true);
    try {
      const pdfColumns = [
        { header: "Code / SKU", key: "code", width: 14, align: "center" as const },
        { header: "Product Name", key: "name", width: 26, align: "left" as const },
        { header: "Category", key: "category", width: 16, align: "center" as const },
        { header: "Size Range", key: "sizeRange", width: 14, align: "center" as const },
        { header: "QPC (ፍሬ/ካ)", key: "qpc", width: 12, align: "right" as const, isInteger: true },
        { header: "Stock (Ctns)", key: "stockCartons", width: 14, align: "right" as const, isInteger: true },
        { header: "Stock (Pcs)", key: "stockPieces", width: 14, align: "right" as const, isInteger: true },
        { header: "Selling Price", key: "price", width: 14, align: "right" as const, isCurrency: true },
        { header: "Supplier", key: "supplier", width: 16, align: "left" as const },
      ];

      let totalPcs = 0;
      let totalCtns = 0;

      const pdfRows = filtered.map(p => {
        const qty = stockMap[p.id]?.quantity || 0;
        const qpc = p.quantityPerCarton || 1;
        const ctns = Math.floor(qty / qpc);
        totalPcs += qty;
        totalCtns += ctns;
        return {
          code: p.code || "",
          name: p.name || "",
          category: p.categoryName || "",
          sizeRange: p.sizeRange || p.size || "",
          qpc: qpc,
          stockCartons: ctns,
          stockPieces: qty,
          price: p.sellingPrice || 0,
          supplier: p.supplierName || "",
        };
      });

      pdfRows.push({
        code: "TOTAL",
        name: `Total for ${filtered.length} Filtered Products`,
        category: "",
        sizeRange: "",
        qpc: "",
        stockCartons: totalCtns,
        stockPieces: totalPcs,
        price: "",
        supplier: "",
        _isGrandTotal: true,
      } as any);

      const dateStr = new Date().toISOString().slice(0, 10);
      await exportToPdf({
        title: "YESERAHUT PRODUCT CATALOG REPORT",
        subtitle: `Total Products: ${products.length} (Filtered: ${filtered.length}) | Category: ${selectedCategory === "all" ? "All Categories" : selectedCategory}`,
        filename: `Products_Catalog_${dateStr}.pdf`,
        orientation: "landscape",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Total Catalog Items", value: products.length },
          { label: "Filtered Products", value: filtered.length },
          { label: "Total Stock Cartons", value: totalCtns },
          { label: "Total Stock Pieces", value: totalPcs },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          return null;
        },
      });
      toast({ title: "Product catalog exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    } finally {
      setExportingPdf(false);
    }
  }

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch = !search ||
      p.name.toLowerCase().includes(q) ||
      p.code.toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q) ||
      (p.barcodeValue || "").toLowerCase().includes(q) ||
      (p.previousName || "").toLowerCase().includes(q) ||
      (p.previousCode || "").toLowerCase().includes(q) ||
      (p.beforeEditMemo || "").toLowerCase().includes(q) ||
      (p.size || "").toLowerCase().includes(q) ||
      (p.sizeRange || "").toLowerCase().includes(q);

    const matchesCat = selectedCategory === "all" || p.categoryId === selectedCategory;

    const qty = stockMap[p.id]?.quantity || 0;
    const alert = (p.minCartonAlert || 1) * (p.quantityPerCarton || 1);

    if (stockFilter === "in_stock" && qty <= 0) return false;
    if (stockFilter === "out_of_stock" && qty > 0) return false;
    if (stockFilter === "low_stock" && (qty <= 0 || qty > alert)) return false;

    return matchesSearch && matchesCat;
  });

  return (
    <div className="space-y-6">
      {DeleteAuthDialog}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Product Catalog</h1>
          <p className="text-muted-foreground text-sm">Manage items, pricing, SKU barcodes, and live inventory levels</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportDialog(true)}
            className="text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <FileUp className="w-4 h-4 mr-1.5" /> Import Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportExcel} disabled={products.length === 0}>
            <FileDown className="w-4 h-4 mr-1.5" /> Export Excel
          </Button>
          <Button variant="outline" size="sm" onClick={exportPdf} disabled={products.length === 0 || exportingPdf} className="text-rose-600 dark:text-rose-400 hover:text-rose-700">
            <FileText className="w-4 h-4 mr-1.5" /> {exportingPdf ? "Exporting PDF..." : "Export PDF"}
          </Button>
          <Button size="sm" onClick={openAdd}>
            <Plus className="w-4 h-4 mr-1.5" /> Add Product
          </Button>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-3 bg-muted/40 p-3 rounded-lg border">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, SKU, brand, or barcode..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-background"
          />
        </div>

        <div className="w-[180px]">
          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-[160px]">
          <Select value={stockFilter} onValueChange={v => setStockFilter(v as typeof stockFilter)}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Stock Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stock Status</SelectItem>
              <SelectItem value="in_stock">In Stock</SelectItem>
              <SelectItem value="low_stock">Low Stock</SelectItem>
              <SelectItem value="out_of_stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Products Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const imgs = getProductImages(p);
            const qty = stockMap[p.id]?.quantity || 0;
            const price = pricing.find(pr => pr.productId === p.id);
            const qpc = p.quantityPerCarton || 1;
            const alertThreshold = (p.minCartonAlert || 1) * qpc;
            const isOut = qty <= 0;
            const isLow = !isOut && qty <= alertThreshold;

            return (
              <Card key={p.id} className={`overflow-hidden transition-shadow hover:shadow-md ${p.isVoided ? "opacity-60 bg-muted/30" : ""}`}>
                <CardHeader className="flex flex-row items-start gap-3 pb-3">
                  <div
                    className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 cursor-pointer border bg-muted group"
                    onClick={() => openViewProduct(p)}
                    title="Click to view product details & barcode"
                  >
                    {imgs.length > 0 ? (
                      <img src={imgs[0]} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Package className="w-7 h-7 opacity-40" />
                      </div>
                    )}
                    {imgs.length > 1 && (
                      <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1 rounded-tl font-semibold">
                        +{imgs.length - 1}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <CardTitle
                        className="text-base font-bold truncate cursor-pointer hover:text-primary transition-colors"
                        onClick={() => openViewProduct(p)}
                        title={p.name}
                      >
                        {p.name}
                      </CardTitle>
                      {p.isVoided ? (
                        <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                      ) : isOut ? (
                        <Badge variant="destructive" className="text-[10px]">Out of Stock</Badge>
                      ) : isLow ? (
                        <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-600 bg-amber-50">Low Stock</Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] border-emerald-500 text-emerald-600 bg-emerald-50">Active</Badge>
                      )}
                    </div>
                    <p className="text-xs font-mono text-muted-foreground mt-0.5">SKU: {p.code}</p>
                    <p className="text-xs text-muted-foreground">{p.categoryName || "General"}</p>
                    {(p.beforeEditMemo || p.previousName || p.previousCode) && (
                      <div
                        className="mt-1.5 flex items-center gap-1.5 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/70 rounded-md px-2 py-0.5 shadow-2xs"
                        title={`Previous details before editing: Name: "${p.previousName || p.name}", Code: "${p.previousCode || p.code}"`}
                      >
                        <History className="w-3 h-3 shrink-0 text-amber-600 dark:text-amber-400" />
                        <span className="font-bold shrink-0">Before Edit:</span>
                        <span className="truncate font-medium">{p.previousName || p.name} ({p.previousCode || p.code})</span>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 pt-0">
                  {/* Prices & Stock Details */}
                  <div className="grid grid-cols-2 gap-2 bg-muted/40 p-2.5 rounded-lg text-xs">
                    <div>
                      <span className="text-muted-foreground block">Selling Price</span>
                      <span className="font-bold text-foreground text-sm">{fmt(price?.sellingPrice || p.sellingPrice || 0)}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground block">Live Stock</span>
                      <span className={`font-bold text-sm ${isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-600"}`}>
                        {qty.toLocaleString()} {p.unit || "pcs"}
                      </span>
                    </div>
                  </div>

                  {/* Available Sizes Badge if present */}
                  {p.size && (
                    <div className="flex items-center gap-1.5 flex-wrap text-xs bg-blue-50/60 dark:bg-blue-950/30 p-1.5 rounded-md border border-blue-100 dark:border-blue-900/40">
                      <span className="text-[10px] font-bold text-blue-900 dark:text-blue-300 uppercase tracking-wider">
                        Sizes:
                      </span>
                      <span className="text-[11px] font-mono font-bold text-blue-700 dark:text-blue-300 truncate max-w-full">
                        {p.sizeRange ? `${p.sizeRange} (${p.sizes?.length || p.size.split(',').length} sizes)` : p.size}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-mono font-semibold text-foreground">
                      {qpc} pcs/ctn
                    </span>
                    <span>Min alert: {p.minCartonAlert || 1} ctn</span>
                  </div>

                  {/* Carton Size Breakdown mini badge if present */}
                  {((p.cartonCategoryBreakdown && p.cartonCategoryBreakdown.length > 0) || (p.cartonBreakdown && p.cartonBreakdown.length > 0)) && (
                    <div className="text-[11px] bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-md border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 space-y-0.5">
                      <div className="flex items-center justify-between font-bold text-[10px] text-slate-500 uppercase tracking-wider">
                        <span>Carton Breakdown:</span>
                        <span className="text-blue-600 dark:text-blue-400 font-mono">
                          {p.cartonCategoryBreakdown ? `${p.cartonCategoryBreakdown.length} Categories` : `${p.cartonBreakdown?.length} Sizes`}
                        </span>
                      </div>
                      <div className="truncate font-mono text-[10px] text-foreground">
                        {p.cartonCategoryBreakdown && p.cartonCategoryBreakdown.length > 0
                          ? p.cartonCategoryBreakdown.map(c => `${c.categoryName}: ${c.count}pcs (${c.percentage}%)`).join(" · ")
                          : p.cartonBreakdown?.map(b => `${b.size}:${b.count}`).join(", ")}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" variant="secondary" className="flex-1 text-xs font-semibold gap-1" onClick={() => openViewProduct(p)} data-testid={`button-view-product-${p.id}`}>
                      <Eye className="w-3.5 h-3.5" /> View
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="flex-1 text-xs gap-1" data-testid={`button-actions-product-${p.id}`}>
                          Actions
                          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
                          {p.name}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => openViewProduct(p)}>
                          <Eye className="w-4 h-4 mr-2" /> Product Details
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openEdit(p)} data-testid={`button-edit-product-${p.id}`}>
                          <Pencil className="w-4 h-4 mr-2" /> Edit Product
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openViewProduct(p)}>
                          <BarcodeIcon className="w-4 h-4 mr-2" /> Barcode & Label
                        </DropdownMenuItem>
                        {!p.isVoided ? (
                          <DropdownMenuItem onClick={() => handleVoid(p)} className="text-amber-600 focus:text-amber-600">
                            <Ban className="w-4 h-4 mr-2" /> Deactivate
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => handleActivate(p)} className="text-emerald-600 focus:text-emerald-600">
                            <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> Activate
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDelete(p)} className="text-destructive focus:text-destructive" data-testid={`button-delete-product-${p.id}`}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete Product
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full text-center py-16 bg-background rounded-lg border">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
              <h3 className="font-semibold text-base">No products found</h3>
              <p className="text-sm text-muted-foreground mt-1">Try adjusting your search criteria or add a new product.</p>
              <Button size="sm" className="mt-4" onClick={openAdd}>
                <Plus className="w-4 h-4 mr-1.5" /> Add Product
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Add / Edit Product Modal */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-xl">
          <DialogHeader>
            <DialogTitle>{editProduct ? "Edit Product" : "Add New Product"}</DialogTitle>
            <DialogDescription>
              All product attributes and images will be permanently stored in Firebase Cloud Database.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Before Edit History & Notice when editing an existing product */}
            {editProduct && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs space-y-1.5 text-amber-900 dark:text-amber-200">
                <div className="flex items-center gap-1.5 font-bold">
                  <History className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Product Edit History Notice (የማሻሻያ ማስታወሻ)</span>
                </div>
                <div className="text-[11px] text-amber-800 dark:text-amber-300">
                  Current Name: <strong>{editProduct.name}</strong> | Current SKU: <strong className="font-mono">{editProduct.code}</strong>
                </div>
                {(editProduct.beforeEditMemo || editProduct.previousName || editProduct.previousCode) && (
                  <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-white/70 dark:bg-black/30 p-1.5 rounded border border-amber-200 dark:border-amber-800/60 font-medium">
                    <span className="font-bold">Before Edit Record:</span> {editProduct.previousName || editProduct.name} ({editProduct.previousCode || editProduct.code})
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">
                  If you edit the Name or SKU Code, the previous values are automatically preserved as a "Before Edit" memo on this product.
                </p>
              </div>
            )}

            {/* Name & SKU */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Product Name *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g., Ultra Clean Detergent 500ml"
                />
                {editProduct && form.name.trim() !== editProduct.name.trim() && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-300 block mt-0.5">
                    Before Edit Name: <strong>{editProduct.name}</strong>
                  </span>
                )}
              </div>
              <div>
                <Label>SKU / Product Code *</Label>
                <Input
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="e.g., UCD-500"
                />
                {editProduct && form.code.trim() !== editProduct.code.trim() && (
                  <span className="text-[10px] text-amber-700 dark:text-amber-300 block mt-0.5 font-mono">
                    Before Edit Code: <strong>{editProduct.code}</strong>
                  </span>
                )}
              </div>
            </div>

            {/* Brand & Barcode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Brand</Label>
                <Input
                  value={form.brand}
                  onChange={e => setForm(f => ({ ...f, brand: e.target.value }))}
                  placeholder="e.g., CleanPro"
                />
              </div>
              <div>
                <Label>Barcode Value</Label>
                <Input
                  value={form.barcodeValue}
                  onChange={e => setForm(f => ({ ...f, barcodeValue: e.target.value }))}
                  placeholder="Scan or enter barcode"
                />
              </div>
            </div>

            {/* Category & Supplier */}
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <SupplierSelect
                    value={form.supplierId}
                    onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}
                    suppliers={suppliers}
                    label="Primary Supplier (አቅራቢ)"
                    placeholder="Search supplier or quick add..."
                  />
                </div>
              </div>

              {/* Smart Auto-Detected Category Banner */}
              {detectedCategory && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    <span className="text-emerald-900 dark:text-emerald-200 font-medium truncate">
                      Matched Category: <strong className="font-bold">{detectedCategory.category.name}</strong> ({detectedCategory.matchedSizes.join(", ")})
                    </span>
                  </div>
                  {form.categoryId !== detectedCategory.category.id ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setForm(f => ({ ...f, categoryId: detectedCategory.category.id }))}
                      className="h-6 px-2.5 text-[11px] font-bold bg-emerald-600 text-white hover:bg-emerald-700 border-none shrink-0 ml-2 shadow-2xs"
                    >
                      Apply Category (ምረጥ)
                    </Button>
                  ) : (
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/60 px-2 py-0.5 rounded-full">
                      Applied ✓
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Product Size Range Auto-Generator & Selection */}
            <ProductSizeRangeSelector
              value={form.size}
              onChange={(val, sizesArr, rangeSummary) => {
                setForm(f => {
                  const nextForm = {
                    ...f,
                    size: val,
                    sizes: sizesArr,
                    sizeRange: rangeSummary,
                  };

                  // Check category matching
                  if (sizesArr.length > 0) {
                    const match = matchCategoriesForSizes(sizesArr, categories);
                    if (match.bestMatchCategory) {
                      setDetectedCategory({
                        category: match.bestMatchCategory,
                        matchScore: match.matchScore,
                        matchedSizes: match.categoryMatches[0]?.matchedSizes || sizesArr,
                      });
                      // If category not yet chosen or default, auto set to best matched
                      if (!f.categoryId || (categories.length > 0 && f.categoryId === categories[0]?.id && !editProduct)) {
                        nextForm.categoryId = match.bestMatchCategory.id;
                      }
                    } else {
                      setDetectedCategory(null);
                    }
                  } else {
                    setDetectedCategory(null);
                  }

                  return nextForm;
                });
              }}
            />

            {/* Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/40 p-3 rounded-lg">
              <div>
                <Label>Purchase Cost (Unit Cost)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.unitCost}
                  onChange={e => setForm(f => ({ ...f, unitCost: Number(e.target.value) }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Selling Price (Piece Price) *</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form.sellingPrice}
                  onChange={e => setForm(f => ({ ...f, sellingPrice: Number(e.target.value) }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            {/* Carton & Unit Configuration */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Unit of Measure</Label>
                <Input
                  value={form.unit}
                  onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                  placeholder="pcs, kg, bottle"
                />
              </div>
              <div>
                <Label>Pieces / Carton</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantityPerCarton}
                  onChange={e => setForm(f => ({ ...f, quantityPerCarton: Number(e.target.value) }))}
                />
              </div>
              <div>
                <Label>Min Alert (Cartons)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.minCartonAlert}
                  onChange={e => setForm(f => ({ ...f, minCartonAlert: Number(e.target.value) }))}
                />
              </div>
            </div>

            {/* Carton Size & Category Allocation (Pieces / Carton Breakdown) */}
            {form.sizes && form.sizes.length > 0 && (
              <CartonBreakdownViewer
                sizes={form.sizes}
                quantityPerCarton={form.quantityPerCarton}
                categories={categories}
                selectedCategoryId={form.categoryId}
                value={cartonBreakdown}
                onChange={(items, catSummaries) => {
                  setCartonBreakdown(items);
                  setCartonCategorySummaries(catSummaries);
                }}
              />
            )}

            {/* Beginning Balance / Initial Stock Card */}
            <div className="rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span className="font-semibold text-sm text-blue-950 dark:text-blue-200">
                    Beginning Stock (መነሻ Balance / Binning)
                  </span>
                </div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-blue-700 dark:text-blue-300">
                  <input
                    type="checkbox"
                    checked={enableBeginningStock}
                    onChange={e => setEnableBeginningStock(e.target.checked)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>Record Initial Stock</span>
                </label>
              </div>

              {enableBeginningStock && (
                <div className="space-y-4 pt-2 border-t border-blue-200/60 dark:border-blue-900/40">
                  {/* Store & Mode */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">Target Store / መጋዘን</Label>
                      <Select
                        value={
                          beginningVoucherType === "existing" && selectedDraftVoucherId
                            ? draftBinningVouchers.find(v => v.id === selectedDraftVoucherId)?.storeId || beginningStoreId
                            : beginningStoreId
                        }
                        onValueChange={setBeginningStoreId}
                        disabled={beginningVoucherType === "existing" && Boolean(selectedDraftVoucherId)}
                      >
                        <SelectTrigger className="mt-1 h-9 bg-background">
                          <SelectValue placeholder="Select store" />
                        </SelectTrigger>
                        <SelectContent>
                          {stores.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {beginningVoucherType === "existing" && selectedDraftVoucherId && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Determined by selected draft voucher</p>
                      )}
                    </div>

                    <div>
                      <Label className="text-xs font-semibold">Entry Unit / የመመዝገቢያ አይነት</Label>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          type="button"
                          onClick={() => setBeginningMode("piece")}
                          className={`h-9 rounded-md text-xs font-semibold transition-all border ${
                            beginningMode === "piece"
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-background text-foreground hover:bg-muted"
                          }`}
                        >
                          By Piece (በፍሬ)
                        </button>
                        <button
                          type="button"
                          onClick={() => setBeginningMode("carton")}
                          className={`h-9 rounded-md text-xs font-semibold transition-all border ${
                            beginningMode === "carton"
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-background text-foreground hover:bg-muted"
                          }`}
                        >
                          By Carton (በካርቶን)
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Quantity & Calculation breakdown */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs font-semibold">
                        {beginningMode === "carton" ? "Beginning Cartons (ካርቶን ብዛት)" : "Beginning Pieces (የፍሬ ብዛት)"}
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step={beginningMode === "carton" ? "0.01" : "1"}
                        className="mt-1 h-9 bg-background"
                        placeholder="0"
                        value={beginningQty}
                        onChange={e => setBeginningQty(e.target.value === "" ? "" : Number(e.target.value))}
                      />
                    </div>

                    <div className="flex flex-col justify-end">
                      <div className="h-9 px-3 rounded-md bg-blue-100/70 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Equivalent Stock:</span>
                        <span className="font-bold text-blue-900 dark:text-blue-100">
                          {(() => {
                            const qpc = Number(form.quantityPerCarton) || 1;
                            const qty = Number(beginningQty) || 0;
                            if (beginningMode === "carton") {
                              return `${qty * qpc} pcs (${qty} ctns)`;
                            } else {
                              return `${qty} pcs (${qpc > 0 ? (qty / qpc).toFixed(2) : 0} ctns)`;
                            }
                          })()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Voucher Choice (New vs Existing) */}
                  <div className="space-y-2 pt-2 border-t border-blue-200/60 dark:border-blue-900/40">
                    <Label className="text-xs font-semibold">Voucher / Receipt Assignment</Label>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          beginningVoucherType === "existing"
                            ? "bg-blue-100/60 dark:bg-blue-900/40 border-blue-500 shadow-xs"
                            : "bg-background border-border hover:bg-muted/40"
                        } ${draftBinningVouchers.length === 0 ? "opacity-50 cursor-not-allowed" : ""}`}
                      >
                        <input
                          type="radio"
                          name="beginningVoucherType"
                          value="existing"
                          disabled={draftBinningVouchers.length === 0}
                          checked={beginningVoucherType === "existing"}
                          onChange={() => setBeginningVoucherType("existing")}
                          className="mt-0.5 text-blue-600"
                        />
                        <div className="text-xs">
                          <div className="font-semibold">Add to Existing Draft Voucher</div>
                          <div className="text-[11px] text-muted-foreground">
                            {draftBinningVouchers.length > 0
                              ? `${draftBinningVouchers.length} draft voucher(s) available`
                              : "No open draft vouchers"}
                          </div>
                        </div>
                      </label>

                      <label
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-all ${
                          beginningVoucherType === "new"
                            ? "bg-blue-100/60 dark:bg-blue-900/40 border-blue-500 shadow-xs"
                            : "bg-background border-border hover:bg-muted/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="beginningVoucherType"
                          value="new"
                          checked={beginningVoucherType === "new"}
                          onChange={() => setBeginningVoucherType("new")}
                          className="mt-0.5 text-blue-600"
                        />
                        <div className="text-xs">
                          <div className="font-semibold">Create New Voucher</div>
                          <div className="text-[11px] text-muted-foreground">Generate a fresh Binning voucher</div>
                        </div>
                      </label>
                    </div>

                    {/* If Existing Voucher Selected */}
                    {beginningVoucherType === "existing" && draftBinningVouchers.length > 0 && (
                      <div className="mt-2">
                        <Label className="text-xs">Select Draft Voucher *</Label>
                        <Select
                          value={selectedDraftVoucherId || draftBinningVouchers[0]?.id}
                          onValueChange={setSelectedDraftVoucherId}
                        >
                          <SelectTrigger className="mt-1 h-9 bg-background">
                            <SelectValue placeholder="Select draft voucher" />
                          </SelectTrigger>
                          <SelectContent>
                            {draftBinningVouchers.map(v => (
                              <SelectItem key={v.id} value={v.id}>
                                <span className="font-mono font-bold text-blue-600 mr-2">{v.voucherId}</span>
                                <span>({v.storeName} · {v.items?.length || 0} items · {v.voucherDate ? formatEthDate(v.voucherDate, { short: true }) : "—"})</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {/* If New Voucher Selected */}
                    {beginningVoucherType === "new" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                        <div>
                          <HabeshaDatePicker
                            label="Voucher Date (የቫውቸር ቀን)"
                            value={beginningVoucherDate}
                            onChange={setBeginningVoucherDate}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Remark / ማስታወሻ</Label>
                          <Input
                            className="mt-1 h-9 bg-background"
                            placeholder="Optional voucher note…"
                            value={beginningRemark}
                            onChange={e => setBeginningRemark(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Approval Warning Notice */}
                  <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                    <span>
                      <strong>Important:</strong> This stock will be saved in a <strong>Draft Binning Voucher</strong>. It will <strong>NOT</strong> increase live store inventory until it is reviewed and <strong>Approved</strong> in the Binning page.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <Label>Description</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief product notes or specifications"
              />
            </div>

            {/* Product Photos Upload */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Product Photos (Cloudinary)</Label>
                <span className="text-xs text-muted-foreground">{form.photoUrls.length}/{MAX_IMAGES}</span>
              </div>

              <div className="grid grid-cols-5 gap-2">
                {form.photoUrls.map((url, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border">
                    <img src={url} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute top-0 left-0 bg-primary text-primary-foreground text-[9px] px-1 py-0.5 rounded-br font-semibold">
                        Main
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}

                {form.photoUrls.length < MAX_IMAGES && (
                  <label className="border-2 border-dashed rounded-lg aspect-square flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors">
                    {uploadingIdx !== null ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    ) : (
                      <>
                        <ImageIcon className="w-5 h-5 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground mt-1">Upload</span>
                      </>
                    )}
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                  </label>
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between sm:items-center">
            {editProduct ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10 text-xs gap-1.5 self-start"
                onClick={() => {
                  startDeleteProduct(editProduct);
                }}
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Product
              </Button>
            ) : <div />}
            <div className="flex items-center gap-2 self-end">
              <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                {editProduct ? "Save Changes" : "Create Product"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lightbox */}
      {lightbox && (
        <Dialog open={!!lightbox} onOpenChange={() => setLightbox(null)}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden bg-black/90 border-0">
            <div className="relative aspect-video flex items-center justify-center">
              <img src={lightbox.urls[lightbox.idx]} alt="Product preview" className="max-h-[80vh] max-w-full object-contain" />
              {lightbox.urls.length > 1 && (
                <>
                  <button
                    onClick={() => setLightbox(l => l ? { ...l, idx: (l.idx - 1 + l.urls.length) % l.urls.length } : null)}
                    className="absolute left-3 bg-black/60 text-white p-2 rounded-full hover:bg-black/80"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => setLightbox(l => l ? { ...l, idx: (l.idx + 1) % l.urls.length } : null)}
                    className="absolute right-3 bg-black/60 text-white p-2 rounded-full hover:bg-black/80"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Product Detail, Barcode & Specification Modal (Print & Share) */}
      {showVoucher && (() => {
        const p = showVoucher;
        const imgs = getProductImages(p);
        const qty = stockMap[p.id]?.quantity || 0;
        const priceRec = pricing.find(pr => pr.productId === p.id);
        const sellPrice = priceRec?.sellingPrice || p.sellingPrice || 0;
        const costPrice = priceRec?.unitCost || p.purchasePrice || 0;
        const margin = costPrice > 0 ? ((sellPrice - costPrice) / costPrice) * 100 : 0;
        const qpc = p.quantityPerCarton || 1;
        const alertThreshold = (p.minCartonAlert || 1) * qpc;
        const isOut = qty <= 0;
        const isLow = !isOut && qty <= alertThreshold;
        const activeImg = imgs[voucherImgIdx] || imgs[0] || "";

        return (
          <Dialog open={!!showVoucher} onOpenChange={() => setShowVoucher(null)}>
            <DialogContent className="max-h-[92vh] overflow-y-auto max-w-2xl p-0 gap-0">
              {/* Modal Top Actions Toolbar */}
              <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b px-5 py-3 flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                      <Package className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-bold text-sm leading-none">Product View & Barcode Card</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">SKU: {p.code}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Primary Print Button */}
                    <Button
                      size="sm"
                      className="h-8 px-3 text-xs font-bold gap-1.5 shadow-sm"
                      onClick={viewTab === "label" ? handlePrintBarcodeLabel : handlePrintFullVoucher}
                    >
                      <Printer className="w-3.5 h-3.5" />
                      {viewTab === "label" ? `Print Barcode Label (${Math.max(1, labelCopies || 1)})` : "Print Full Sheet"}
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-xs font-semibold gap-1.5"
                      disabled={sharing}
                      onClick={handleShareImage}
                      title="Share as Image (PNG)"
                    >
                      {sharing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Share2 className="w-3.5 h-3.5 text-blue-600" />}
                      Image
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2.5 text-xs font-semibold gap-1.5"
                      disabled={sharingPdf}
                      onClick={handleSharePdf}
                      title="Export as PDF"
                    >
                      {sharingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-emerald-600" />}
                      PDF
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 text-xs"
                      onClick={handleCopyDetails}
                      title="Copy Details"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </Button>

                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 px-2.5 text-xs gap-1"
                      onClick={() => {
                        setShowVoucher(null);
                        openEdit(p);
                      }}
                    >
                      <Edit className="w-3.5 h-3.5" /> Edit
                    </Button>

                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-8 px-2.5 text-xs font-semibold gap-1"
                      onClick={() => {
                        startDeleteProduct(p);
                      }}
                      title="Delete Product from Catalog"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </div>

                {/* Tab Switcher & Print Copies Config */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t">
                  <div className="flex items-center gap-1 bg-muted/60 p-1 rounded-lg border">
                    <button
                      type="button"
                      onClick={() => setViewTab("label")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                        viewTab === "label"
                          ? "bg-background text-foreground shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <QrCode className="w-3.5 h-3.5 text-primary" />
                      Barcode Sticker / Label
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewTab("card")}
                      className={`px-3 py-1 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                        viewTab === "card"
                          ? "bg-background text-foreground shadow-xs font-bold"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5 text-blue-600" />
                      Full Specification Sheet
                    </button>
                  </div>

                  {viewTab === "label" && (
                    <div className="flex items-center gap-2 text-xs flex-wrap">
                      <span className="text-muted-foreground font-semibold flex items-center gap-1">
                        <Copy className="w-3.5 h-3.5 text-primary" /> Copies:
                      </span>

                      {/* Direct typing and stepper box */}
                      <div className="flex items-center border border-input rounded-md bg-background overflow-hidden shadow-2xs">
                        <button
                          type="button"
                          onClick={() => setLabelCopies(prev => Math.max(1, (prev || 1) - 1))}
                          className="h-7 px-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border-r flex items-center justify-center"
                          title="Decrease copy (-1)"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={labelCopies || ""}
                          onChange={e => {
                            const val = parseInt(e.target.value, 10);
                            if (isNaN(val)) {
                              setLabelCopies(0);
                            } else {
                              setLabelCopies(Math.max(1, Math.min(500, val)));
                            }
                          }}
                          onBlur={() => {
                            if (!labelCopies || labelCopies < 1) setLabelCopies(1);
                          }}
                          className="w-14 h-7 text-center text-xs font-black bg-transparent outline-none focus:ring-1 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                          placeholder="1"
                          title="Type any number of copies (e.g. 5, 20, 50)"
                        />

                        <button
                          type="button"
                          onClick={() => setLabelCopies(prev => Math.min(500, (prev || 0) + 1))}
                          className="h-7 px-2 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border-l flex items-center justify-center"
                          title="Increase copy (+1)"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Quick preset chips */}
                      <div className="flex items-center gap-1">
                        {[1, 2, 5, 10, 20, 50].map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setLabelCopies(c)}
                            className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all border ${
                              labelCopies === c
                                ? "bg-primary text-primary-foreground border-primary shadow-2xs"
                                : "bg-background text-muted-foreground hover:bg-accent border-input"
                            }`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* View Tab 1: Barcode Sticker / Label Preview (Thermal & Sticker POS Format) */}
              {viewTab === "label" && (
                <div className="p-6 bg-slate-100 flex flex-col items-center justify-center min-h-[380px]">
                  <div className="w-full max-w-md bg-white p-4 rounded-xl border border-slate-200 shadow-sm" ref={labelRef}>
                    <div className="space-y-4">
                      {Array.from({ length: Math.max(1, labelCopies || 1) }).map((_, copyIdx) => (
                        <div
                          key={copyIdx}
                          className="border-2 border-slate-900 rounded-xl p-4 bg-white text-slate-900 space-y-3 break-inside-avoid shadow-xs"
                        >
                          {/* Top Tag Header */}
                          <div className="flex items-center justify-between border-b-2 border-slate-900 pb-2">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-100 border border-slate-300">
                                Official Label
                              </span>
                            </div>
                            <span className="text-xs font-black font-mono bg-slate-100 text-slate-900 px-2 py-0.5 rounded border border-slate-300">
                              SKU: {p.code}
                            </span>
                          </div>

                          {/* Product Title */}
                          <div className="text-center py-0.5">
                            <h4 className="font-black text-base text-slate-900 leading-tight">
                              {p.name}
                            </h4>
                            <p className="text-[11px] font-semibold text-slate-600 mt-1">
                              {p.brand ? `${p.brand} · ` : ""}{p.categoryName || "General"}
                            </p>
                          </div>

                          {/* Scannable Barcode SVG */}
                          <div className="flex flex-col items-center justify-center bg-white py-1">
                            <div className="w-full flex justify-center">
                              <Barcode
                                value={p.barcodeValue || p.code}
                                format="CODE128"
                                width={2}
                                height={60}
                                fontSize={14}
                                background="#ffffff"
                                lineColor="#000000"
                                margin={2}
                              />
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[11px] font-mono font-bold bg-slate-100 text-slate-800 px-2 py-0.5 rounded border">
                                BARCODE: {p.barcodeValue || p.code}
                              </span>
                            </div>
                          </div>

                          {/* Bottom Spec Row */}
                          <div className="border-t-2 border-slate-900 pt-2 flex items-center justify-between">
                            <div className="text-left">
                              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block leading-none">
                                Packaging & Size
                              </span>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                <span className="text-xs font-bold text-slate-800">
                                  {qpc} {p.unit || "pcs"}/ctn
                                </span>
                                {p.size && (
                                  <span className="text-[11px] font-bold font-mono px-1.5 py-0.2 bg-slate-100 rounded border border-slate-300">
                                    Size: {p.sizeRange || p.size}
                                  </span>
                                )}
                              </div>
                              {p.cartonBreakdown && p.cartonBreakdown.length > 0 && (
                                <div className="text-[9px] font-mono text-slate-600 bg-slate-50 px-1 py-0.5 rounded border border-slate-200 mt-1 max-w-[240px] truncate">
                                  Carton: {p.cartonBreakdown.map(b => `${b.size}:${b.count}`).join(", ")}
                                </div>
                              )}
                            </div>

                            <div className="text-right">
                              <span className="text-[9px] text-slate-400 font-mono">
                                {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* View Tab 2: Full Product Voucher Card Content (A4 Spec Sheet) */}
              {viewTab === "card" && (
                <div className="p-6 space-y-6 bg-white text-slate-900" ref={voucherRef}>
                  {/* Brand & Document Header */}
                  <div className="flex items-start justify-between border-b pb-4">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-lg tracking-tight text-slate-900">NEXUS STOCK</span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700 border">
                          Inventory & POS
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 font-medium">PRODUCT SPECIFICATION & BARCODE LABEL</p>
                    </div>

                    <div className="text-right">
                      {p.isVoided ? (
                        <span className="inline-block px-2.5 py-1 text-xs font-bold rounded bg-red-100 text-red-700 border border-red-200">
                          Inactive / Voided
                        </span>
                      ) : isOut ? (
                        <span className="inline-block px-2.5 py-1 text-xs font-bold rounded bg-red-100 text-red-700 border border-red-200">
                          Out of Stock
                        </span>
                      ) : isLow ? (
                        <span className="inline-block px-2.5 py-1 text-xs font-bold rounded bg-amber-100 text-amber-800 border border-amber-200">
                          Low Stock Alert
                        </span>
                      ) : (
                        <span className="inline-block px-2.5 py-1 text-xs font-bold rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
                          In Stock & Active
                        </span>
                      )}
                      <p className="text-[10px] text-slate-400 mt-1 font-mono">
                        Ref: {p.voucherId || p.code}
                      </p>
                    </div>
                  </div>

                  {/* Main Product Display: Photo & Barcode Section */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                    {/* Photo Column */}
                    <div className="flex flex-col items-center">
                      <div className="relative w-full max-w-[240px] aspect-square rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm flex items-center justify-center">
                        {activeImg ? (
                          <img
                            src={activeImg}
                            alt={p.name}
                            className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform"
                            onClick={() => setLightbox({ urls: imgs, idx: voucherImgIdx })}
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center text-slate-300 p-4 text-center">
                            <Package className="w-16 h-16 stroke-1 mb-2 text-slate-300" />
                            <span className="text-xs text-slate-400">No Photo Uploaded</span>
                          </div>
                        )}
                      </div>

                      {/* Image Thumbnails if multiple exist */}
                      {imgs.length > 1 && (
                        <div className="flex items-center gap-2 mt-3 overflow-x-auto max-w-full pb-1">
                          {imgs.map((url, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => setVoucherImgIdx(idx)}
                              className={`relative w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                                voucherImgIdx === idx
                                  ? "border-blue-600 ring-2 ring-blue-500/20 scale-105"
                                  : "border-slate-200 opacity-70 hover:opacity-100"
                              }`}
                            >
                              <img src={url} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Barcode & Identity Column */}
                    <div className="flex flex-col items-center justify-center text-center space-y-3">
                      <div className="w-full bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex flex-col items-center">
                        <p className="text-[11px] font-bold tracking-widest text-slate-400 uppercase mb-1">
                          OFFICIAL PRODUCT BARCODE
                        </p>
                        <div className="w-full flex justify-center overflow-x-auto py-1">
                          <Barcode
                            value={p.barcodeValue || p.code}
                            format="CODE128"
                            width={2}
                            height={70}
                            fontSize={15}
                            background="#ffffff"
                            lineColor="#0f172a"
                            margin={4}
                          />
                        </div>
                        <div className="flex items-center justify-center gap-2 mt-1">
                          <span className="text-xs font-mono font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded border">
                            Barcode: {p.barcodeValue || p.code}
                          </span>
                          <span className="text-xs font-mono font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded border border-blue-200">
                            SKU: {p.code}
                          </span>
                        </div>
                      </div>

                      <div className="w-full text-left bg-white p-3 rounded-lg border border-slate-200 text-xs space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Product Name:</span>
                          <span className="font-bold text-slate-900 text-right">{p.name}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Category:</span>
                          <span className="font-semibold text-slate-800">{p.categoryName || "General"}</span>
                        </div>
                        {p.brand && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Brand:</span>
                            <span className="font-semibold text-slate-800">{p.brand}</span>
                          </div>
                        )}
                        {p.supplierName && (
                          <div className="flex justify-between">
                            <span className="text-slate-500 font-medium">Supplier:</span>
                            <span className="font-semibold text-slate-800">{p.supplierName}</span>
                          </div>
                        )}
                      </div>

                      {/* Before Edit Memo in Product Details Sheet */}
                      {(p.beforeEditMemo || p.previousName || p.previousCode) && (
                        <div className="w-full text-left bg-amber-50/90 dark:bg-amber-950/40 p-3 rounded-lg border border-amber-300 dark:border-amber-800 text-xs space-y-1.5 shadow-2xs">
                          <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                            <History className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Before Edit Memo (ከማሻሻያ በፊት የነበረ መረጃ)</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-slate-700 dark:text-slate-300 text-[11px] pt-0.5">
                            <div>
                              <span className="text-slate-500 font-medium">Previous Name: </span>
                              <strong className="font-bold">{p.previousName || "-"}</strong>
                            </div>
                            <div>
                              <span className="text-slate-500 font-medium">Previous Code / SKU: </span>
                              <strong className="font-mono font-bold">{p.previousCode || "-"}</strong>
                            </div>
                            {p.lastEditedAt && (
                              <div className="col-span-full text-[10px] text-muted-foreground pt-0.5 border-t border-amber-200/50 dark:border-amber-800/50">
                                Last modified: {new Date(p.lastEditedAt).toLocaleString()} {p.lastEditedBy ? `by ${p.lastEditedBy}` : ""}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Key Metrics Grid: Pricing & Live Inventory */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                        Selling Price
                      </span>
                      <span className="text-base font-bold text-blue-700 block mt-1">
                        {fmt(sellPrice)}
                      </span>
                      <span className="text-[10px] text-slate-400">per {p.unit || "piece"}</span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                        Purchase Cost
                      </span>
                      <span className="text-base font-bold text-slate-800 block mt-1">
                        {fmt(costPrice)}
                      </span>
                      <span className="text-[10px] text-emerald-600 font-semibold">
                        +{margin.toFixed(1)}% margin
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                        Live Stock
                      </span>
                      <span className={`text-base font-bold block mt-1 ${isOut ? "text-red-600" : isLow ? "text-amber-600" : "text-emerald-700"}`}>
                        {qty.toLocaleString()} {p.unit || "pcs"}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        ≈ {(qty / qpc).toFixed(1)} cartons
                      </span>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-semibold text-slate-500 block uppercase tracking-wider">
                        Carton Spec
                      </span>
                      <span className="text-base font-bold text-slate-800 block mt-1">
                        {qpc} {p.unit || "pcs"}/ctn
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Min alert: {p.minCartonAlert || 1} ctn
                      </span>
                    </div>
                  </div>

                  {/* Available Sizes Section if configured */}
                  {p.size && (
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                          Available Product Sizes (የዕቃው ሳይዞች)
                        </span>
                        {p.sizeRange && (
                          <span className="text-xs font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded border border-blue-200">
                            Range: {p.sizeRange}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {(p.sizes && p.sizes.length > 0 ? p.sizes : (p.size ? p.size.split(",").map(s => s.trim()).filter(Boolean) : [])).map((sz, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-black font-mono bg-white text-slate-900 border border-slate-300 shadow-2xs"
                          >
                            {sz}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Carton Size & Category Allocation (Carton Breakdown in 1 Carton) */}
                  {((p.sizes && p.sizes.length > 0) || (p.cartonBreakdown && p.cartonBreakdown.length > 0) || (p.size && p.size.length > 0)) && (
                    <CartonBreakdownViewer
                      sizes={p.sizes && p.sizes.length > 0 ? p.sizes : (p.size ? p.size.split(",").map(s => s.trim()).filter(Boolean) : [])}
                      quantityPerCarton={p.quantityPerCarton || 1}
                      categories={categories}
                      selectedCategoryId={p.categoryId}
                      value={p.cartonBreakdown}
                      editable={false}
                    />
                  )}

                  {/* Description & Specifications */}
                  {p.description && (
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                        Description & Notes
                      </span>
                      <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {p.description}
                      </p>
                    </div>
                  )}

                  {/* Footer Stamp */}
                  <div className="pt-3 border-t border-dashed flex items-center justify-between text-[10px] text-slate-400">
                    <span>Firebase Cloud Database · Multi-device Realtime Sync</span>
                    <span>Generated: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              )}

              {/* Modal Footer Controls */}
              <div className="p-4 bg-muted/40 border-t flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowVoucher(null)}>
                    Close
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:bg-destructive/10 text-xs gap-1"
                    onClick={() => {
                      startDeleteProduct(p);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Product
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={viewTab === "label" ? handlePrintBarcodeLabel : handlePrintFullVoucher}
                  >
                    <Printer className="w-4 h-4 mr-1.5 text-primary" />
                    {viewTab === "label" ? "Print Barcode Label" : "Print Full Sheet"}
                  </Button>
                  <Button size="sm" onClick={handleShareImage} disabled={sharing}>
                    {sharing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Share2 className="w-4 h-4 mr-1.5" />}
                    Share {viewTab === "label" ? "Label" : "Card"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Dedicated Safe Delete Product Dialog (Supports deleting products used in Binning, Stock In, POS Sales) */}
      <Dialog
        open={!!deleteTargetProduct}
        onOpenChange={(open) => {
          if (!open && !deletingProduct) setDeleteTargetProduct(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <div className="p-2 rounded-full bg-destructive/10">
                <Trash2 className="w-5 h-5 text-destructive" />
              </div>
              <DialogTitle>Delete Product (ምርት ሰርዝ)</DialogTitle>
            </div>
            <DialogDescription>
              Permanently remove this product from the active catalog and pricing list.
            </DialogDescription>
          </DialogHeader>

          {deleteTargetProduct && (() => {
            const p = deleteTargetProduct;
            const qty = stockMap[p.id]?.quantity || 0;
            const hasTransactions = Boolean(productTxStats && (
              productTxStats.binning > 0 ||
              productTxStats.stockIn > 0 ||
              productTxStats.posSales > 0 ||
              productTxStats.directSales > 0
            ));

            return (
              <div className="space-y-4 py-2">
                {/* Target Product Summary Box */}
                <div className="p-3 bg-muted/50 rounded-lg border text-sm space-y-1.5">
                  <div className="font-bold text-foreground text-base">{p.name}</div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>SKU / Code: <strong className="font-mono text-foreground">{p.code}</strong></span>
                    <span>•</span>
                    <span>Category: <strong>{p.categoryName || "General"}</strong></span>
                    <span>•</span>
                    <span>Current Stock: <strong>{qty} {p.unit || "pcs"}</strong></span>
                  </div>
                  {(p.beforeEditMemo || p.previousName) && (
                    <div className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">
                      Before Edit: {p.previousName || p.name} ({p.previousCode || p.code})
                    </div>
                  )}
                </div>

                {/* Transaction Scan Status */}
                {productTxStats?.loading ? (
                  <div className="p-3 rounded-lg border bg-muted/20 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span>Scanning transaction records (Binning, Stock In, POS Sales, Direct Sales)...</span>
                  </div>
                ) : hasTransactions ? (
                  <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-xs space-y-2.5">
                    <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Existing Transaction History Found (የተመዘገቡ ደረሰኞች አሉ)</span>
                    </div>
                    <p className="text-amber-800 dark:text-amber-300 leading-relaxed text-[11px]">
                      This product code has been recorded in previous transactions:
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className={`p-2 rounded border flex justify-between items-center ${productTxStats.binning > 0 ? "bg-red-50/80 dark:bg-red-950/40 border-red-200 dark:border-red-900 font-medium" : "bg-white/90 dark:bg-black/40 border-amber-200 dark:border-amber-900"}`}>
                        <span>Binning Vouchers:</span>
                        <strong className={`font-mono text-xs ${productTxStats.binning > 0 ? "text-red-700 dark:text-red-300 font-bold" : "text-slate-600 dark:text-slate-400"}`}>{productTxStats.binning}</strong>
                      </div>
                      <div className={`p-2 rounded border flex justify-between items-center ${productTxStats.stockIn > 0 ? "bg-red-50/80 dark:bg-red-950/40 border-red-200 dark:border-red-900 font-medium" : "bg-white/90 dark:bg-black/40 border-amber-200 dark:border-amber-900"}`}>
                        <span>Stock In (Receiving):</span>
                        <strong className={`font-mono text-xs ${productTxStats.stockIn > 0 ? "text-red-700 dark:text-red-300 font-bold" : "text-slate-600 dark:text-slate-400"}`}>{productTxStats.stockIn}</strong>
                      </div>
                      <div className={`p-2 rounded border flex justify-between items-center ${productTxStats.posSales > 0 ? "bg-red-50/80 dark:bg-red-950/40 border-red-200 dark:border-red-900 font-medium" : "bg-white/90 dark:bg-black/40 border-amber-200 dark:border-amber-900"}`}>
                        <span>POS Sales:</span>
                        <strong className={`font-mono text-xs ${productTxStats.posSales > 0 ? "text-red-700 dark:text-red-300 font-bold" : "text-slate-600 dark:text-slate-400"}`}>{productTxStats.posSales}</strong>
                      </div>
                      <div className={`p-2 rounded border flex justify-between items-center ${productTxStats.directSales > 0 ? "bg-red-50/80 dark:bg-red-950/40 border-red-200 dark:border-red-900 font-medium" : "bg-white/90 dark:bg-black/40 border-amber-200 dark:border-amber-900"}`}>
                        <span>Direct Sales:</span>
                        <strong className={`font-mono text-xs ${productTxStats.directSales > 0 ? "text-red-700 dark:text-red-300 font-bold" : "text-slate-600 dark:text-slate-400"}`}>{productTxStats.directSales}</strong>
                      </div>
                    </div>

                    <div className="p-2.5 rounded-md bg-red-100/90 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-red-900 dark:text-red-200 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-xs">
                        <Ban className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        <span>Cannot Delete Product (ምርቱን መሰረዝ አይቻልም)</span>
                      </div>
                      <p className="text-[11px] leading-relaxed text-red-800 dark:text-red-300">
                        በደረሰኝ ታሪክ (Binning, Stock In, POS Sales, Direct Sales) ውስጥ 1 ወይም ከዚያ በላይ ግብይት ስለተመዘገበበት ይህንን ምርት መሰረዝ አይቻልም። የካታሎግ እና የሂሳብ መዛባትን ለመከላከል ምርቱን ማቦዘን (Deactivate) ማድረግ ይችላሉ።
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>No historical transactions found (Binning: 0, Stock In: 0, POS: 0, Direct: 0). Safe to delete.</span>
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter className="gap-2 sm:gap-0 flex items-center justify-end">
            {deleteTargetProduct && (() => {
              const p = deleteTargetProduct;
              const hasTransactions = Boolean(productTxStats && (
                productTxStats.binning > 0 ||
                productTxStats.stockIn > 0 ||
                productTxStats.posSales > 0 ||
                productTxStats.directSales > 0
              ));

              if (productTxStats?.loading) {
                return (
                  <Button
                    variant="outline"
                    onClick={() => setDeleteTargetProduct(null)}
                  >
                    Cancel
                  </Button>
                );
              }

              if (hasTransactions) {
                // 1 ena keza belay Teransaction kale Conferm Delete milewn Button Atfaw
                return (
                  <div className="flex items-center gap-2 w-full justify-between">
                    <Button
                      variant="outline"
                      onClick={() => setDeleteTargetProduct(null)}
                    >
                      Close (ዝጋ)
                    </Button>
                    {!p.isVoided && (
                      <Button
                        variant="secondary"
                        className="border border-amber-500/50 text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-950/50 gap-1.5"
                        onClick={async () => {
                          setDeleteTargetProduct(null);
                          await handleVoid(p);
                        }}
                      >
                        <Ban className="w-4 h-4 text-amber-600" />
                        Deactivate Product (ምርቱን አቦዝን)
                      </Button>
                    )}
                  </div>
                );
              }

              // Zero transactions: Confirm & Delete button is shown and asks for Username & Password
              return (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setDeleteTargetProduct(null)}
                    disabled={deletingProduct}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleConfirmDelete}
                    disabled={deletingProduct}
                    className="gap-1.5"
                  >
                    {deletingProduct ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-4 h-4" /> Confirm & Delete Product
                      </>
                    )}
                  </Button>
                </div>
              );
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ProductImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        existingProducts={products}
        categories={categories}
        pricing={pricing}
        onSuccess={async () => {
          await loadStock();
        }}
      />
    </div>
  );
}
