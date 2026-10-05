import { useState, useEffect, useRef } from "react";
import { fmt } from "@/lib/currency";
import { Plus, Search, Trash2, Eye, EyeOff, Printer, FileDown, Share2, Pencil, CheckCircle, Ban, RotateCcw, FileText, MoreHorizontal, ChevronDown, Package, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { getAll, getById, create, update, remove, COLLECTIONS, generateVoucherId, generateSerialVoucherId, logInventoryMovement, subscribeCollection } from "@/lib/firestore";
import { useAuth } from "@/lib/auth";
import { shareAsImage, shareAsPdf, exportToExcel, exportToPdf } from "@/lib/shareImage";
import { uploadImage } from "@/lib/cloudinary";
import type { Product, Category, Store, Supplier, StockIn as StockInType, StockInItem } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { BarcodeScannerButton } from "@/components/BarcodeScannerButton";
import { ReceiptActionBar } from "@/components/ReceiptActionBar";
import { HabeshaDatePicker } from "@/components/HabeshaDatePicker";
import { SupplierSelect } from "@/components/SupplierSelect";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { ReferencePhotoViewer } from "@/components/ReferencePhotoViewer";
import { postStockInJournalEntry, voidJournalEntryByReference, reactivateJournalEntryByReference } from "@/lib/accountingEngine";
import { ReceiptWithReferenceView } from "@/components/ReceiptWithReferenceView";
import { VoucherAuditSection, ReceiptCheckedByLine, AuditStatusBadge, performQuickAudit } from "@/components/VoucherAuditSection";
import { matchesVoucherSearch } from "@/lib/voucherSearchUtils";
import { VoidVoucherOverlay } from "@/components/VoidVoucherOverlay";
import { FormalVoucherHeader } from "@/components/FormalVoucherHeader";
import { FormalVoucherSignatures } from "@/components/FormalVoucherSignatures";
import * as XLSX from "xlsx";

export default function StockIn() {
  const [stockIns, setStockIns] = useState<StockInType[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showVoucher, setShowVoucher] = useState<StockInType | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [hideRefPhoto, setHideRefPhoto] = useState(false);
  const [form, setForm] = useState({ voucherId: "", supplierId: "", storeId: "", categoryId: "", fsNumber: "", remark: "", amountPaid: 0, photoProofUrl: "", voucherDate: new Date().toISOString().slice(0, 10) });
  const [items, setItems] = useState<StockInItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [byPieceSet, setByPieceSet] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();
  const { isAdmin, user, isAuditor, canAudit, registeredAuditors, activeAuditorName } = useAuth();
  const receiptRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    setLoading(true);
    const [sis, prods, cats, sts, sups] = await Promise.all([
      getAll<StockInType>(COLLECTIONS.STOCK_IN),
      getAll<Product>(COLLECTIONS.PRODUCTS),
      getAll<Category>(COLLECTIONS.CATEGORIES),
      getAll<Store>(COLLECTIONS.STORES),
      getAll<Supplier>(COLLECTIONS.SUPPLIERS),
    ]);
    const safeStockIns = (sis || []).map(s => ({
      ...s,
      items: Array.isArray(s.items) ? s.items : [],
    }));
    setStockIns(safeStockIns.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    setProducts(prods);
    setCategories(cats);
    setStores(sts);
    setSuppliers(sups);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const unsubStockIn = subscribeCollection<StockInType>(COLLECTIONS.STOCK_IN, (data) => {
      const safeData = (data || []).map(s => ({
        ...s,
        items: Array.isArray(s.items) ? s.items : [],
      }));
      setStockIns(safeData.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    });
    const unsubProds = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, setProducts);
    const unsubCats = subscribeCollection<Category>(COLLECTIONS.CATEGORIES, setCategories);
    const unsubStores = subscribeCollection<Store>(COLLECTIONS.STORES, setStores);
    const unsubSuppliers = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, setSuppliers);

    return () => {
      unsubStockIn();
      unsubProds();
      unsubCats();
      unsubStores();
      unsubSuppliers();
    };
  }, []);

  const filtered = stockIns.filter(s => matchesVoucherSearch(s, search));

  function resetForm() {
    setEditingId(null);
    setForm({ voucherId: "", supplierId: "", storeId: "", categoryId: "", fsNumber: "", remark: "", amountPaid: 0, photoProofUrl: "", voucherDate: new Date().toISOString().slice(0, 10) });
    setItems([]);
    setProductSearch("");
    setByPieceSet(new Set());
    setHideRefPhoto(false);
  }

  function toggleByPiece(productId: string) {
    setByPieceSet(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  async function openNew() {
    resetForm();
    setShowForm(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const nextId = await generateSerialVoucherId("STK", today);
      setForm(f => ({ ...f, voucherDate: today, voucherId: nextId }));
    } catch {}
  }

  function duplicateStockIn(si: StockInType) {
    resetForm();
    setForm({
      voucherId: si.voucherId || "", // Retains voucher ID (Double allowed!)
      supplierId: si.supplierId,
      storeId: si.storeId,
      categoryId: si.categoryId || "",
      fsNumber: "",
      remark: si.remark ? `${si.remark} (Copy)` : "Duplicate Voucher",
      amountPaid: 0,
      photoProofUrl: si.referencePhotoUrl || si.photoProofUrl || "",
      voucherDate: new Date().toISOString().slice(0, 10),
    });
    setItems(si.items ? si.items.map(i => ({ ...i })) : []);
    const pieceIds = new Set<string>();
    (si.items || []).forEach(i => {
      const qpc = i.quantityPerCarton > 0 ? i.quantityPerCarton : 1;
      const pcs = (i.cartonsReceived || 0) * qpc;
      if (i.cartonsReceived % 1 !== 0 || pcs % qpc !== 0) {
        pieceIds.add(i.productId);
      }
    });
    setByPieceSet(pieceIds);
    setShowForm(true);
    toast({ title: `Voucher duplicated (ደብል/ቅጂ). Voucher ID: ${si.voucherId || ""}` });
  }

  function openEdit(si: StockInType) {
    setEditingId(si.id);
    setHideRefPhoto(false);
    setForm({
      voucherId: si.voucherId || "",
      supplierId: si.supplierId,
      storeId: si.storeId,
      categoryId: si.categoryId || "",
      fsNumber: si.fsNumber || "",
      remark: si.remark || "",
      amountPaid: si.amountPaid || 0,
      photoProofUrl: si.referencePhotoUrl || si.photoProofUrl || "",
      voucherDate: si.voucherDate || new Date().toISOString().slice(0, 10),
    });
    setItems(Array.isArray(si.items) ? si.items.map(i => ({ ...i })) : []);
    const pieceIds = new Set<string>();
    (si.items || []).forEach(i => {
      const qpc = i.quantityPerCarton > 0 ? i.quantityPerCarton : 1;
      const pcs = (i.cartonsReceived || 0) * qpc;
      if (i.cartonsReceived % 1 !== 0 || pcs % qpc !== 0) {
        pieceIds.add(i.productId);
      }
    });
    setByPieceSet(pieceIds);
    setShowForm(true);
  }

  // Listen for navigation with editId/voucherId in query param (e.g. from Bincard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("editId") || params.get("voucherId");
    if (editId && stockIns.length > 0) {
      const recordToEdit = stockIns.find(s => s.id === editId || s.voucherId === editId);
      if (recordToEdit) {
        openEdit(recordToEdit);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [stockIns]);

  function addProduct(prod: Product) {
    const existing = items.find(i => i.productId === prod.id);
    if (existing) { toast({ title: "Product already added" }); return; }
    const qpc = prod.quantityPerCarton > 0 ? prod.quantityPerCarton : 1;
    const unitP = prod.purchasePrice ?? prod.piecePrice ?? prod.unitCost ?? 0;
    setItems(prev => [...prev, {
      productId: prod.id, productName: prod.name, productCode: prod.code,
      quantityPerCarton: qpc, cartonsReceived: 1,
      unitPrice: unitP, cartonPrice: Math.round(unitP * qpc), totalPrice: Math.round(unitP * qpc), photoUrl: prod.photoUrl || ""
    }]);
    setProductSearch("");
  }

  function updateItem(idx: number, field: string, value: number) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx] };
      const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;

      if (field === "piecesReceived") {
        const pcs = Math.max(1, Math.round(Number(value) || 1));
        item.cartonsReceived = pcs / qpc;
      } else if (field === "cartonsReceived") {
        const ctns = Math.max(1, Math.round(Number(value) || 1));
        item.cartonsReceived = ctns;
      } else if (field === "unitPrice") {
        item.unitPrice = Number(value) || 0;
        item.cartonPrice = Math.round(item.unitPrice * qpc);
      } else if (field === "cartonPrice") {
        item.cartonPrice = Number(value) || 0;
        item.unitPrice = qpc > 0 ? item.cartonPrice / qpc : 0;
      }

      const totalPcs = Math.round((item.cartonsReceived || 0) * qpc);
      item.totalPrice = Math.round(item.unitPrice * totalPcs);
      item.cartonPrice = Math.round(item.unitPrice * qpc);
      updated[idx] = item;
      return updated;
    });
  }

  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  const totalCartons = Math.round(items.reduce((s, i) => s + (i.cartonsReceived || 0), 0));
  const totalPieces = items.reduce((s, i) => s + Math.round((i.cartonsReceived || 0) * (i.quantityPerCarton || 1)), 0);
  const totalPrice = items.reduce((s, i) => s + (i.totalPrice || 0), 0);
  const remaining = Math.max(0, totalPrice - form.amountPaid);

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "stock-in");
      setForm(f => ({ ...f, photoProofUrl: url }));
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setUploading(false); }
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (!form.supplierId || !form.storeId || items.length === 0) {
        toast({ title: "Select supplier, store and add at least one product", variant: "destructive" }); return;
      }
      if (items.some(i => i.cartonsReceived <= 0)) {
        toast({ title: "All carton quantities must be greater than zero", variant: "destructive" }); return;
      }
      if (items.some(i => i.unitPrice < 0)) {
        toast({ title: "Unit prices cannot be negative", variant: "destructive" }); return;
      }
      if (form.amountPaid < 0) {
        toast({ title: "Amount paid cannot be negative", variant: "destructive" }); return;
      }
      if (form.fsNumber) {
        const duplicate = stockIns.find(s => s.fsNumber && s.fsNumber.trim() === form.fsNumber.trim() && s.id !== editingId);
        if (duplicate) {
          toast({ title: `FS Number "${form.fsNumber}" is already registered (Voucher: ${duplicate.voucherId})`, variant: "destructive" }); return;
        }
      }
      const supplier = suppliers.find(s => s.id === form.supplierId);
      const store = stores.find(s => s.id === form.storeId);

      const normalizedItems: StockInItem[] = items.map(item => {
        const prodObj = products.find(p => p.id === item.productId);
        return {
          ...item,
          photoUrl: item.photoUrl || prodObj?.photoUrl || "",
        };
      });

      if (editingId) {
        const oldRecord = stockIns.find(s => s.id === editingId);
        const newRemaining = Math.max(0, totalPrice - form.amountPaid);

        await update(COLLECTIONS.STOCK_IN, editingId, {
          voucherId: form.voucherId?.trim() || oldRecord?.voucherId || "STK-00001",
          supplierId: form.supplierId,
          supplierName: supplier?.name || "",
          storeId: form.storeId,
          storeName: store?.name || "",
          categoryId: form.categoryId,
          categoryName: categories.find(c => c.id === form.categoryId)?.name || "",
          items: normalizedItems,
          totalCartons,
          totalPrice,
          amountPaid: form.amountPaid,
          remainingBalance: newRemaining,
          fsNumber: form.fsNumber,
          remark: form.remark,
          photoProofUrl: form.photoProofUrl,
          referencePhotoUrl: form.photoProofUrl,
          voucherDate: form.voucherDate,
        } as Record<string, unknown>);

        // Adjust supplier debt balance on voucher/receipt edit
        if (oldRecord) {
          const oldSupplierId = oldRecord.supplierId;
          const oldRemaining = oldRecord.remainingBalance || 0;
          const newSupplierId = form.supplierId;

          if (oldSupplierId === newSupplierId) {
            // Same supplier - apply difference between new remaining and old remaining
            if (newSupplierId) {
              const balanceDiff = newRemaining - oldRemaining;
              if (balanceDiff !== 0) {
                const freshSupp = await getById<Supplier>(COLLECTIONS.SUPPLIERS, newSupplierId) || suppliers.find(s => s.id === newSupplierId);
                if (freshSupp) {
                  const currentBal = freshSupp.totalBalance || 0;
                  await update(COLLECTIONS.SUPPLIERS, newSupplierId, {
                    totalBalance: Math.max(0, currentBal + balanceDiff),
                  });
                }
              }
            }
          } else {
            // Supplier changed!
            // 1. Deduct/reverse old debt from previous supplier
            if (oldSupplierId && oldRemaining > 0) {
              const freshOldSupp = await getById<Supplier>(COLLECTIONS.SUPPLIERS, oldSupplierId) || suppliers.find(s => s.id === oldSupplierId);
              if (freshOldSupp) {
                const oldBal = freshOldSupp.totalBalance || 0;
                await update(COLLECTIONS.SUPPLIERS, oldSupplierId, {
                  totalBalance: Math.max(0, oldBal - oldRemaining),
                });
              }
            }
            // 2. Apply new debt to the newly selected supplier
            if (newSupplierId && newRemaining > 0) {
              const freshNewSupp = await getById<Supplier>(COLLECTIONS.SUPPLIERS, newSupplierId) || suppliers.find(s => s.id === newSupplierId);
              if (freshNewSupp) {
                const newBal = freshNewSupp.totalBalance || 0;
                await update(COLLECTIONS.SUPPLIERS, newSupplierId, {
                  totalBalance: newBal + newRemaining,
                });
              }
            }
          }
        }
        toast({ title: "Stock In updated (ደረሰኝ ተስተካክሏል)" });
      } else {
        const data: Omit<StockInType, "id"> = {
          voucherId: form.voucherId?.trim() || await generateSerialVoucherId("STK", form.voucherDate),
          supplierId: form.supplierId,
          supplierName: supplier?.name || "",
          storeId: form.storeId,
          storeName: store?.name || "",
          categoryId: form.categoryId,
          categoryName: categories.find(c => c.id === form.categoryId)?.name || "",
          items: normalizedItems,
          totalCartons,
          totalPrice,
          amountPaid: form.amountPaid,
          remainingBalance: remaining,
          fsNumber: form.fsNumber,
          remark: form.remark,
          photoProofUrl: form.photoProofUrl,
          referencePhotoUrl: form.photoProofUrl,
          voucherDate: form.voucherDate,
          status: isAdmin ? "active" : "pending",
          createdByName: user?.name || "",
        };
        const newId = await create(COLLECTIONS.STOCK_IN, data as Record<string, unknown>);

        // Post automatic double-entry journal entry for accounting
        postStockInJournalEntry(data as StockInType).catch(err => console.warn("Automatic journal entry error:", err));

        // Record inventory movements for stock addition & sync unit purchase cost
        for (const item of items) {
          const qtyAdded = (item.cartonsReceived || 0) * (item.quantityPerCarton || 1);
          await logInventoryMovement({
            type: "stock_in",
            productId: item.productId,
            productName: item.productName,
            productCode: item.productCode,
            storeId: form.storeId,
            storeName: store?.name || "",
            prevQuantity: 0,
            newQuantity: qtyAdded,
            difference: qtyAdded,
            reason: `Stock In ${data.voucherId}`,
            referenceVoucherId: data.voucherId,
            userId: user?.name || "Staff",
            userName: user?.name || "Staff",
            voucherDate: form.voucherDate,
          });

          // Update Product with latest unit cost and purchase price
          if (item.unitPrice > 0) {
            await update(COLLECTIONS.PRODUCTS, item.productId, {
              unitCost: item.unitPrice,
              purchasePrice: item.unitPrice,
              cartonPrice: item.cartonPrice || (item.unitPrice * (item.quantityPerCarton || 1)),
            }).catch(e => console.warn("Failed updating product unitCost:", e));

            // Record in purchase_cost_history for chronological tracking
            await create(COLLECTIONS.PURCHASE_COST_HISTORY, {
              productId: item.productId,
              productName: item.productName,
              productCode: item.productCode,
              date: form.voucherDate,
              voucherId: data.voucherId,
              supplierId: form.supplierId,
              supplierName: supplier?.name || "",
              storeId: form.storeId,
              storeName: store?.name || "",
              cartonsReceived: item.cartonsReceived || 0,
              quantityPerCarton: item.quantityPerCarton || 1,
              unitCost: item.unitPrice,
              cartonPrice: item.cartonPrice || (item.unitPrice * (item.quantityPerCarton || 1)),
              totalCost: item.totalPrice || (item.unitPrice * qtyAdded),
              notes: form.remark || "",
              source: "stock_in",
              createdByName: user?.name || "Staff",
            }).catch(e => console.warn("Failed logging purchase cost history:", e));
          }
        }

        if (isAdmin && supplier && remaining > 0) {
          await update(COLLECTIONS.SUPPLIERS, supplier.id, {
            totalBalance: (supplier.totalBalance || 0) + remaining,
          });
        }
        toast({ title: isAdmin ? `Stock In saved — ${data.voucherId}` : "Submitted for admin approval" });
        setShowForm(false);
        resetForm();
        loadData();
        setShowVoucher({ ...data, id: newId } as StockInType);
        return;
      }

      setShowForm(false);
      resetForm();
      loadData();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(si: StockInType) {
    confirmDelete(async () => {
      await remove(COLLECTIONS.STOCK_IN, si.id);
      // Reverse supplier balance
      if (si.supplierId && (si.remainingBalance || 0) > 0) {
        const supplier = suppliers.find(s => s.id === si.supplierId);
        if (supplier) {
          await update(COLLECTIONS.SUPPLIERS, supplier.id, {
            totalBalance: Math.max(0, (supplier.totalBalance || 0) - (si.remainingBalance || 0)),
          });
        }
      }
      toast({ title: "Stock In deleted" });
      loadData();
    });
  }

  async function handleApprove(si: StockInType) {
    await update(COLLECTIONS.STOCK_IN, si.id, { status: "active" });
    const supplier = suppliers.find(s => s.id === si.supplierId);
    if (supplier && (si.remainingBalance || 0) > 0) {
      await update(COLLECTIONS.SUPPLIERS, supplier.id, {
        totalBalance: (supplier.totalBalance || 0) + (si.remainingBalance || 0),
      });
    }
    toast({ title: "Stock In approved" });
    loadData();
  }

  async function handleVoid(si: StockInType) {
    if (!confirm("Void this Stock In voucher? This will mark it as voided.")) return;
    const nowIso = new Date().toISOString();
    const operatorName = user?.name || user?.displayName || user?.email || "Admin";
    await update(COLLECTIONS.STOCK_IN, si.id, {
      status: "voided",
      voidedAt: nowIso,
      voidedBy: operatorName,
    });
    voidJournalEntryByReference(si.voucherId || si.id).catch(err => console.warn(err));
    if (si.supplierId && (si.remainingBalance || 0) > 0) {
      const freshSupp = await getById<Supplier>(COLLECTIONS.SUPPLIERS, si.supplierId) || suppliers.find(s => s.id === si.supplierId);
      if (freshSupp) {
        await update(COLLECTIONS.SUPPLIERS, freshSupp.id, {
          totalBalance: Math.max(0, (freshSupp.totalBalance || 0) - (si.remainingBalance || 0)),
        });
      }
    }
    toast({ title: "Stock In voided (ተሰርዟል)" });
    if (showVoucher && showVoucher.id === si.id) {
      setShowVoucher(v => (v ? { ...v, status: "voided", voidedAt: nowIso, voidedBy: operatorName } : null));
    }
    loadData();
  }

  async function handleActivate(si: StockInType) {
    await update(COLLECTIONS.STOCK_IN, si.id, { status: "active", voidedAt: null, voidedBy: null });
    reactivateJournalEntryByReference(si.voucherId || si.id).catch(err => console.warn(err));
    toast({ title: "Stock In activated" });
    if (showVoucher && showVoucher.id === si.id) {
      setShowVoucher(v => (v ? { ...v, status: "active", voidedAt: undefined, voidedBy: undefined } : null));
    }
    loadData();
  }

  const handlePrint = () => printElement(receiptRef.current, `Stock In ${showVoucher?.voucherId || ""}`);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingHistoryPdf, setExportingHistoryPdf] = useState(false);

  async function handleShare() {
    if (!receiptRef.current) return;
    setSharing(true);
    try {
      const r = await shareAsImage(receiptRef.current, `stockin_${showVoucher?.voucherId || "receipt"}.png`);
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
        await exportStockInPdf(showVoucher);
      } finally {
        setSharingPdf(false);
      }
      return;
    }
    if (!receiptRef.current) return;
    setSharingPdf(true);
    try {
      const r = await shareAsPdf(receiptRef.current, `stockin_${showVoucher?.voucherId || "receipt"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch (err) {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingPdf(false);
    }
  }

  async function exportExcel(si: StockInType) {
    setExportingExcel(true);
    try {
      const data = [
        ["STOCK IN RECEIPT"],
        ["Voucher ID", si.voucherId || "—"],
        ["Date", si.voucherDate || "—"],
        ["Store", si.storeName || "—"],
        ["Supplier", si.supplierName || "—"],
        ["Created By", si.createdByName || "—"],
        ["Checked By", si.checkedBy ? `${si.checkedBy} (Verified / ትክክል ነው)` : "Pending Review (ያልተጣራ)"],
        [],
        ["No.", "Product", "Code", "Qty/Ctn", "Cartons", "Pieces", "Unit Price (ETB)", "Carton Price (ETB)", "Total (ETB)"],
        ...(si.items || []).map((i, idx) => {
          const qpc = Math.round(i.quantityPerCarton > 0 ? i.quantityPerCarton : 1);
          const pcs = Math.round((i.cartonsReceived || 0) * qpc);
          const ctns = Math.floor(pcs / qpc);
          const unitP = Math.round(i.unitPrice || 0);
          const ctnP = Math.round(i.cartonPrice || (unitP * qpc));
          const totalP = Math.round(i.totalPrice || (unitP * pcs));
          return [
            idx + 1,
            i.productName,
            i.productCode || "",
            qpc,
            ctns,
            pcs,
            unitP,
            ctnP,
            totalP
          ];
        }),
        [],
        ["", "", "", "", "", "Total Items:", (si.items || []).length, "Grand Total (ETB):", (si.items || []).reduce((s, i) => s + (i.totalPrice || ((i.unitPrice || 0) * (i.cartonsReceived || 0) * (i.quantityPerCarton || 1))), 0)]
      ];
      const res = await exportToExcel({
        data,
        sheetName: "Stock In",
        filename: `${si.voucherId || "stock_in"}.xlsx`,
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

  async function exportStockInPdf(si: StockInType) {
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
        { header: "Total (ETB)", key: "total", width: 16, align: "right" as const, isCurrency: true },
      ];

      const pdfRows = (si.items || []).map((i, idx) => {
        const qpc = Math.round(i.quantityPerCarton > 0 ? i.quantityPerCarton : 1);
        const pcs = Math.round((i.cartonsReceived || 0) * qpc);
        const ctns = Math.floor(pcs / qpc);
        const unitP = Math.round(i.unitPrice || 0);
        const ctnP = Math.round(i.cartonPrice || (unitP * qpc));
        const totalP = Math.round(i.totalPrice || (unitP * pcs));
        return {
          index: idx + 1,
          productName: i.productName,
          productCode: i.productCode || "",
          qpc,
          cartons: ctns,
          pieces: pcs,
          unitPrice: unitP,
          cartonPrice: ctnP,
          total: totalP,
        };
      });

      const totalAmount = (si.items || []).reduce((s, i) => s + (i.totalPrice || ((i.unitPrice || 0) * (i.cartonsReceived || 0) * (i.quantityPerCarton || 1))), 0);

      pdfRows.push({
        index: "",
        productName: "GRAND TOTAL",
        productCode: "",
        qpc: "",
        cartons: (si.items || []).reduce((s, i) => s + (i.cartonsReceived || 0), 0),
        pieces: (si.items || []).reduce((s, i) => s + ((i.cartonsReceived || 0) * (i.quantityPerCarton || 1)), 0),
        unitPrice: "",
        cartonPrice: "",
        total: totalAmount,
        _isGrandTotal: true,
      } as any);

      await exportToPdf({
        title: "YESERAHUT PURCHASE / STOCK IN VOUCHER",
        subtitle: `Voucher: ${si.voucherId} | Date: ${si.voucherDate || ""} | Store: ${si.storeName || ""} | Supplier: ${si.supplierName || "Direct / Internal"}`,
        filename: `${si.voucherId || "stock_in"}.pdf`,
        orientation: "portrait",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Grand Total", value: `${fmt(totalAmount)} ETB` },
          { label: "Total Items", value: (si.items || []).length },
          { label: "Total Cartons", value: (si.items || []).reduce((s, i) => s + (i.cartonsReceived || 0), 0) },
          { label: "Status", value: (si.status || "ACTIVE").toUpperCase() },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          return null;
        },
      });
      toast({ title: "Stock In voucher exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    }
  }

  async function exportStockInHistoryPdf() {
    setExportingHistoryPdf(true);
    try {
      const pdfColumns = [
        { header: "Voucher ID", key: "voucherId", width: 14, align: "center" as const },
        { header: "Date", key: "voucherDate", width: 14, align: "center" as const },
        { header: "Supplier", key: "supplierName", width: 22, align: "left" as const },
        { header: "Store", key: "storeName", width: 16, align: "center" as const },
        { header: "Total Cartons", key: "cartons", width: 14, align: "right" as const, isInteger: true },
        { header: "Total Cost (ETB)", key: "totalAmount", width: 16, align: "right" as const, isCurrency: true },
        { header: "Paid (ETB)", key: "amountPaid", width: 15, align: "right" as const, isCurrency: true },
        { header: "Status", key: "status", width: 12, align: "center" as const },
      ];

      let sumTotal = 0;
      let sumCartons = 0;
      let sumPaid = 0;

      const pdfRows = filtered.map(si => {
        const ctns = (si.items || []).reduce((s, i) => s + (i.cartonsReceived || 0), 0);
        const cost = (si.items || []).reduce((s, i) => s + (i.totalPrice || ((i.unitPrice || 0) * (i.cartonsReceived || 0) * (i.quantityPerCarton || 1))), 0);
        sumTotal += cost;
        sumCartons += ctns;
        sumPaid += (si.amountPaid || 0);
        return {
          voucherId: si.voucherId,
          voucherDate: si.voucherDate || "",
          supplierName: si.supplierName || "—",
          storeName: si.storeName || "",
          cartons: ctns,
          totalAmount: cost,
          amountPaid: si.amountPaid || 0,
          status: si.status?.toUpperCase() || "ACTIVE",
        };
      });

      pdfRows.push({
        voucherId: "TOTAL",
        voucherDate: "",
        supplierName: `${filtered.length} Stock-In Transactions`,
        storeName: "",
        cartons: sumCartons,
        totalAmount: sumTotal,
        amountPaid: sumPaid,
        status: "",
        _isGrandTotal: true,
      } as any);

      const dateStr = new Date().toISOString().slice(0, 10);
      await exportToPdf({
        title: "YESERAHUT PURCHASES & STOCK-IN TRANSACTIONS REPORT",
        subtitle: `Total Records: ${filtered.length} | Export Date: ${dateStr}`,
        filename: `Purchases_StockIn_Report_${dateStr}.pdf`,
        orientation: "landscape",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Total Purchases", value: filtered.length },
          { label: "Total Received Cartons", value: sumCartons },
          { label: "Total Purchase Value (ETB)", value: fmt(sumTotal) },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          return null;
        },
      });
      toast({ title: "Purchases report exported to PDF" });
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
          <h1 className="text-2xl font-bold tracking-tight">Stock In (Goods Receiving)</h1>
          <p className="text-muted-foreground text-sm mt-1">Record incoming stock from suppliers</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportStockInHistoryPdf} disabled={filtered.length === 0 || exportingHistoryPdf} className="text-rose-600 dark:text-rose-400 hover:text-rose-700">
            <FileText className="w-4 h-4 mr-2" /> {exportingHistoryPdf ? "Exporting PDF..." : "Export Purchases PDF"}
          </Button>
          <Button onClick={openNew} data-testid="button-new-stockin" className="flex-shrink-0"><Plus className="w-4 h-4 mr-2" /> New Stock In</Button>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input className="pl-9" placeholder="Search by voucher ID, date, total cartons, store, supplier, product, remark..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-stockin" />
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Voucher ID", "Date", "Supplier", "Store", "Total Cartons", "Total Price", "Paid", "Balance", "Status", "Audit", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(si => (
                <tr key={si.id} className="hover:bg-muted/30" data-testid={`row-stockin-${si.id}`}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <button
                      onClick={() => setShowVoucher(si)}
                      className="font-bold text-primary hover:underline cursor-pointer"
                      title="Click to view voucher"
                    >
                      {si.voucherId}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {si.voucherDate ? formatEthDate(si.voucherDate, { short: true }) : "—"}
                    </div>
                    {si.voucherDate && (
                      <div className="text-[10px] text-muted-foreground">{si.voucherDate}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">{si.supplierName}</td>
                  <td className="px-4 py-2">{si.storeName}</td>
                  <td className="px-4 py-2">{si.totalCartons}</td>
                  <td className="px-4 py-2">{fmt(si.totalPrice)}</td>
                  <td className="px-4 py-2 text-green-600">{fmt(si.amountPaid)}</td>
                  <td className="px-4 py-2 text-red-500">{fmt(si.remainingBalance)}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={si.status === "active" ? "default" : si.status === "pending" ? "outline" : "destructive"}
                      className={si.status === "pending" ? "border-amber-500 text-amber-600 bg-amber-50" : ""}
                    >{si.status}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <AuditStatusBadge
                      isChecked={si.isChecked}
                      checkedBy={si.checkedBy}
                      canAudit={canAudit}
                      onQuickCheck={() =>
                        performQuickAudit({
                          collectionName: COLLECTIONS.STOCK_IN,
                          docId: si.id,
                          currentChecked: si.isChecked,
                          isAuditor,
                          isAdmin,
                          user,
                          registeredAuditors,
                          activeAuditorName,
                          toast,
                          onSuccess: (newChecked, auditorName) => {
                            setStockIns(prev => prev.map(item => item.id === si.id ? { ...item, isChecked: newChecked, checkedBy: auditorName } : item));
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-xs" data-testid={`button-actions-${si.id}`}>
                          Actions
                          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">
                          {si.voucherId}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setShowVoucher({ ...si, items: Array.isArray(si.items) ? si.items : [] })} data-testid={`button-view-${si.id}`}>
                          <Eye className="w-4 h-4 mr-2" /> View Voucher
                        </DropdownMenuItem>
                        {isAdmin && si.status === "pending" && (
                          <DropdownMenuItem onClick={() => handleApprove(si)} className="text-emerald-600 focus:text-emerald-600" data-testid={`button-approve-${si.id}`}>
                            <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> Approve
                          </DropdownMenuItem>
                        )}
                        {si.status !== "voided" && (
                          <DropdownMenuItem onClick={() => openEdit(si)} data-testid={`button-edit-${si.id}`}>
                            <Pencil className="w-4 h-4 mr-2 text-amber-600" /> Edit Record (አስተካክል)
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => duplicateStockIn(si)} data-testid={`button-duplicate-${si.id}`}>
                          <Copy className="w-4 h-4 mr-2 text-blue-600" /> Duplicate (ቅጂ/ደብል)
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportExcel(si)} data-testid={`button-export-${si.id}`}>
                          <FileDown className="w-4 h-4 mr-2" /> Export Excel
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => exportStockInPdf(si)} className="text-rose-600 focus:text-rose-600">
                          <FileText className="w-4 h-4 mr-2" /> Export PDF
                        </DropdownMenuItem>
                        {isAdmin && si.status === "active" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleVoid(si)} className="text-orange-600 focus:text-orange-600" data-testid={`button-void-${si.id}`}>
                              <Ban className="w-4 h-4 mr-2 text-orange-500" /> Void Voucher
                            </DropdownMenuItem>
                          </>
                        )}
                        {isAdmin && si.status === "voided" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleActivate(si)} className="text-emerald-600 focus:text-emerald-600" data-testid={`button-activate-${si.id}`}>
                              <RotateCcw className="w-4 h-4 mr-2 text-emerald-600" /> Activate Voucher
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">No stock-in records found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* New / Edit Stock In Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); resetForm(); } }}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto transition-all ${form.photoProofUrl && !hideRefPhoto ? "max-w-6xl xl:max-w-7xl" : "max-w-4xl"}`}>
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <DialogTitle>{editingId ? "Edit Stock In" : "New Stock In"}</DialogTitle>
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
                <FileText className="w-4 h-4 text-primary" /> Reference photo is attached to this voucher.
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    onClick={async () => {
                      const nextId = await generateSerialVoucherId("STK", form.voucherDate);
                      setForm(f => ({ ...f, voucherId: nextId }));
                    }}
                  >
                    Auto ID
                  </Button>
                </div>
                <Input
                  value={form.voucherId}
                  onChange={e => setForm(f => ({ ...f, voucherId: e.target.value }))}
                  placeholder="e.g. STK-20260911-0001"
                  className="font-mono min-h-[38px]"
                  data-testid="input-voucher-id"
                />
              </div>
              <div>
                <SupplierSelect
                  label="Supplier (አቅራቢ)"
                  required
                  value={form.supplierId}
                  onValueChange={v => setForm(f => ({ ...f, supplierId: v }))}
                  suppliers={suppliers}
                  placeholder="Search supplier by name, address, phone..."
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Store * (መጋዘን)</Label>
                <Select value={form.storeId} onValueChange={v => setForm(f => ({ ...f, storeId: v }))}>
                  <SelectTrigger data-testid="select-store" className="min-h-[38px]"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {/* Category removed — product photos shown in search results instead */}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>FS Number</Label>
                <Input value={form.fsNumber} onChange={e => setForm(f => ({ ...f, fsNumber: e.target.value }))} data-testid="input-fs-number" />
              </div>
              <div>
                <HabeshaDatePicker
                  label="Date (የደረሰኝ ቀን)"
                  value={form.voucherDate}
                  onChange={async (v) => {
                    setForm(f => ({ ...f, voucherDate: v }));
                    if (!editingId) {
                      const nextId = await generateSerialVoucherId("STK", v);
                      setForm(f => ({ ...f, voucherDate: v, voucherId: nextId }));
                    }
                  }}
                />
              </div>
            </div>
            <div>
              <Label>Remark</Label><Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} data-testid="input-remark" />
            </div>

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
                      {productResults.map(p => (
                        <div key={p.id} className="px-3 py-2 hover:bg-muted cursor-pointer flex items-center gap-3" onClick={() => addProduct(p)}>
                          {p.photoUrl
                            ? <img src={p.photoUrl} alt={p.name} className="w-16 h-16 rounded-md object-cover flex-shrink-0 border" />
                            : <div className="w-16 h-16 rounded-md bg-muted flex items-center justify-center flex-shrink-0 border text-muted-foreground text-xs">No photo</div>
                          }
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">{p.code}</div>
                            <div className="text-xs text-muted-foreground">{p.quantityPerCarton} pcs/ctn</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

            {items.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>{["No.", "Product", "Qty/Ctn", "Quantity (Ctns / Pcs)", "Unit Price (ETB)", "Carton Price", "Total", ""].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground text-xs">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const prodObj = products.find(p => p.id === item.productId);
                      const photo = item.photoUrl || prodObj?.photoUrl || "";
                      const qpc = item.quantityPerCarton > 0 ? item.quantityPerCarton : 1;
                      const isPiece = byPieceSet.has(item.productId);
                      const currentPcs = Math.round((item.cartonsReceived || 0) * qpc);
                      const currentCtns = Math.max(1, Math.round(item.cartonsReceived || 1));

                      return (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="px-3 py-2 text-xs font-bold text-muted-foreground text-center w-8">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {photo
                                ? <img src={photo} alt={item.productName} className="w-12 h-12 rounded-md object-cover flex-shrink-0 border" />
                                : <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center flex-shrink-0 border text-[10px] text-muted-foreground">No pic</div>
                              }
                              <div>
                                <div className="font-medium text-xs truncate max-w-[180px]">{item.productName}</div>
                                <div className="text-xs text-muted-foreground font-mono">{item.productCode}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center text-xs font-medium">{qpc}</td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col items-start gap-1">
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => toggleByPiece(item.productId)}
                                  className={`text-[10px] px-2.5 py-0.5 rounded-full border font-semibold transition-all cursor-pointer ${
                                    isPiece
                                      ? "bg-blue-600 border-blue-600 text-white shadow-xs"
                                      : "bg-muted border-muted-foreground/30 text-foreground hover:bg-muted/80"
                                  }`}
                                  title="Click to toggle between entering Pieces or Cartons"
                                >
                                  {isPiece ? "By Piece (Pcs)" : "By Carton (Ctns)"}
                                </button>
                              </div>
                              {isPiece ? (
                                <div className="space-y-0.5">
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="w-24 h-7 text-xs font-semibold"
                                    placeholder="Pieces"
                                    value={currentPcs || ""}
                                    onChange={e => updateItem(idx, "piecesReceived", Math.round(Number(e.target.value)))}
                                  />
                                  <p className="text-[10px] text-muted-foreground">
                                    = {Math.floor(currentPcs / qpc)} ctn{currentPcs % qpc > 0 ? ` + ${currentPcs % qpc} pcs` : ""}
                                  </p>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <Input
                                    type="number"
                                    min={1}
                                    step={1}
                                    className="w-24 h-7 text-xs font-semibold"
                                    placeholder="Cartons"
                                    value={currentCtns || ""}
                                    onChange={e => updateItem(idx, "cartonsReceived", Math.round(Number(e.target.value)))}
                                  />
                                  <p className="text-[10px] text-muted-foreground">
                                    = {currentCtns * qpc} pcs
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              className="w-24 h-7 text-xs"
                              value={item.unitPrice}
                              onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))}
                            />
                          </td>
                          <td className="px-3 py-2 text-xs font-mono">{fmt(item.cartonPrice)}</td>
                          <td className="px-3 py-2 text-xs font-semibold text-foreground font-mono">{fmt(item.totalPrice)}</td>
                          <td className="px-3 py-2"><Button size="sm" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="w-3 h-3 text-destructive" /></Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30 font-semibold border-t">
                    <tr>
                      <td className="px-3 py-2 text-xs" colSpan={3}>Totals</td>
                      <td className="px-3 py-2 text-xs">{totalCartons} cartons ({totalPieces} pcs)</td>
                      <td colSpan={2} />
                      <td className="px-3 py-2 text-xs font-bold font-mono">{fmt(totalPrice)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount Paid (ETB)</Label>
                <Input type="number" min={0} step={0.01} value={form.amountPaid} onChange={e => setForm(f => ({ ...f, amountPaid: Number(e.target.value) }))} data-testid="input-amount-paid" />
              </div>
              <div>
                <Label>Remaining Balance (ETB)</Label>
                <Input value={fmt(remaining)} readOnly className="bg-muted font-medium font-mono" />
              </div>
            </div>

            {!form.photoProofUrl && (
              <div className="pt-2 border-t">
                <ReferencePhotoViewer
                  photoUrl=""
                  onPhotoChange={(url) => setForm(f => ({ ...f, photoProofUrl: url }))}
                  isEditable={true}
                  title="Reference Document / Invoice (ማጣቀሻ ሰነድ)"
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
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-stockin">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Save Stock In"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog open={!!showVoucher} onOpenChange={() => setShowVoucher(null)}>
        <DialogContent className={`max-h-[90vh] overflow-y-auto ${(showVoucher?.photoProofUrl || showVoucher?.referencePhotoUrl) ? "max-w-6xl xl:max-w-7xl" : "max-w-3xl"}`}>
          <DialogHeader className="flex flex-row items-center justify-between pb-1 border-b">
            <DialogTitle>Stock In Receipt</DialogTitle>
            {showVoucher && showVoucher.status !== "voided" && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-amber-700 hover:text-amber-800 dark:text-amber-400"
                onClick={() => {
                  const recordToEdit = showVoucher;
                  setShowVoucher(null);
                  openEdit(recordToEdit);
                }}
              >
                <Pencil className="w-4 h-4" /> Edit Record (አስተካክል)
              </Button>
            )}
          </DialogHeader>
          {showVoucher && (
            <div className="space-y-4">
              <VoucherAuditSection
                collectionName={COLLECTIONS.STOCK_IN}
                docId={showVoucher.id}
                isChecked={showVoucher.isChecked}
                checkedBy={showVoucher.checkedBy}
                checkedAt={showVoucher.checkedAt}
                checkedNote={showVoucher.checkedNote}
                voucherNumber={showVoucher.voucherId}
                onAuditChange={(newChecked, auditorName, note) => {
                  setShowVoucher(v => v ? { ...v, isChecked: newChecked, checkedBy: auditorName, checkedNote: note } : null);
                  setStockIns(prev => prev.map(item => item.id === showVoucher.id ? { ...item, isChecked: newChecked, checkedBy: auditorName, checkedNote: note } : item));
                }}
              />
              <ReceiptWithReferenceView
                referencePhotoUrl={showVoucher.referencePhotoUrl || showVoucher.photoProofUrl}
                voucherId={showVoucher.voucherId}
                receiptNode={
                  <div
                    ref={receiptRef}
                    className="formal-receipt receipt-a4 p-5 space-y-4 border rounded-xl bg-white text-slate-900 shadow-sm relative overflow-hidden"
                    style={{ position: "relative" }}
                  >
                    <VoidVoucherOverlay
                      isVoided={showVoucher.status === "voided"}
                      voidedAt={showVoucher.voidedAt || (showVoucher.updatedAt ? String(showVoucher.updatedAt) : undefined)}
                      voidedBy={showVoucher.voidedBy}
                      voidReason={showVoucher.remark}
                    />

                    <FormalVoucherHeader
                      voucherTitle="GOODS RECEIVING NOTE (GRN) / STOCK IN"
                      voucherTitleAmharic="የእቃ መረከቢያ ደረሰኝ (ስቶክ ኢን)"
                      voucherId={showVoucher.voucherId}
                      voucherDate={String(showVoucher.voucherDate || showVoucher.createdAt || "")}
                      storeName={showVoucher.storeName}
                      fsNumber={showVoucher.fsNumber}
                      counterPartyLabel="Supplier (አቅራቢ ድርጅት)"
                      counterPartyName={showVoucher.supplierName}
                      badgeContent={
                        <Badge
                          variant={showVoucher.status === "voided" ? "destructive" : "outline"}
                          className="text-xs"
                        >
                          {showVoucher.status === "voided" ? "VOIDED (ተሰርዟል)" : "OFFICIAL GRN"}
                        </Badge>
                      }
                      additionalMetadata={[
                        {
                          label: "Payment Status",
                          value: (
                            <span className={showVoucher.remainingBalance && showVoucher.remainingBalance > 0 ? "text-amber-700 font-bold" : "text-emerald-700 font-bold"}>
                              Paid: {fmt(showVoucher.amountPaid || 0)} ETB | Bal: {fmt(showVoucher.remainingBalance || 0)} ETB
                            </span>
                          ),
                        },
                      ]}
                    />

                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse border border-slate-300">
                        <thead>
                          <tr className="bg-slate-100 text-slate-800">
                            {["No.", "Photo", "Product Description", "Qty/Ctn", "Cartons", "Pieces", "Unit Price", "Total Price"].map(h => (
                              <th key={h} className="border border-slate-300 px-2 py-1.5 text-left font-bold">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const safeItems = Array.isArray(showVoucher.items) ? showVoucher.items : [];
                            if (safeItems.length === 0) {
                              return (
                                <tr>
                                  <td colSpan={8} className="border border-slate-300 px-4 py-6 text-center text-xs text-slate-400 italic">
                                    No item records found for this voucher.
                                  </td>
                                </tr>
                              );
                            }
                            return safeItems.map((item, i) => {
                              const qpc = Math.round(item.quantityPerCarton > 0 ? item.quantityPerCarton : 1);
                              const pcs = Math.round((item.cartonsReceived || 0) * qpc);
                              const ctns = Math.floor(pcs / qpc);
                              const extraPcs = pcs % qpc;
                              const unitP = item.unitPrice || 0;
                              const prodObj = products.find(p => p.id === item.productId);
                              const photo = item.photoUrl || prodObj?.photoUrl || "";
                              return (
                                <tr key={i} className="align-middle border-b border-slate-200">
                                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-center font-bold text-slate-500 w-8">
                                    {i + 1}
                                  </td>
                                  <td className="border border-slate-300 px-1.5 py-1 text-center w-12">
                                    {photo ? (
                                      <img
                                        src={photo}
                                        alt={item.productName}
                                        className="w-9 h-9 rounded object-cover mx-auto border border-slate-300"
                                        crossOrigin="anonymous"
                                      />
                                    ) : (
                                      <div className="w-9 h-9 rounded bg-slate-100 border border-slate-300 flex items-center justify-center text-[10px] text-slate-400 mx-auto">
                                        —
                                      </div>
                                    )}
                                  </td>
                                  <td className="border border-slate-300 px-2 py-1.5 text-xs">
                                    <div className="font-semibold text-slate-900">{item.productName}</div>
                                    {item.productCode && <div className="text-[10px] text-slate-500 font-mono">{item.productCode}</div>}
                                  </td>
                                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-center font-medium">{qpc}</td>
                                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-center font-medium">
                                    {ctns}{extraPcs > 0 ? ` (+${extraPcs}p)` : ''}
                                  </td>
                                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-center font-bold text-slate-900">{pcs}</td>
                                  <td className="border border-slate-300 px-2 py-1.5 text-xs text-right font-mono">{fmt(unitP)}</td>
                                  <td className="border border-slate-300 px-2 py-1.5 text-xs font-bold text-right text-slate-950 font-mono">{fmt(item.totalPrice || (unitP * pcs))}</td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                        <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-400">
                          <tr>
                            <td className="border border-slate-300 px-2 py-2 text-xs" colSpan={4}>Totals</td>
                            <td className="border border-slate-300 px-2 py-2 text-xs text-center">
                              {Math.round(showVoucher.totalCartons ?? (showVoucher.items || []).reduce((s, i) => s + (i.cartonsReceived || 0), 0))} Ctns
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-xs text-center font-bold text-slate-900">
                              {(showVoucher.items || []).reduce((s, i) => s + Math.round((i.cartonsReceived || 0) * (i.quantityPerCarton || 1)), 0)} Pcs
                            </td>
                            <td className="border border-slate-300 px-2 py-2 text-xs text-right">Grand Total:</td>
                            <td className="border border-slate-300 px-2 py-2 text-xs font-black text-right text-slate-950 font-mono">{fmt(showVoucher.totalPrice)} ETB</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    <div className="flex justify-end gap-6 text-xs bg-slate-50 p-2.5 rounded border border-slate-200">
                      <div><span className="text-slate-500">Paid Amount (የተከፈለ): </span><span className="text-emerald-700 font-bold font-mono">{fmt(showVoucher.amountPaid || 0)} ETB</span></div>
                      <div><span className="text-slate-500">Remaining Balance (ቀሪ እዳ): </span><span className="text-rose-600 font-bold font-mono">{fmt(showVoucher.remainingBalance || 0)} ETB</span></div>
                    </div>

                    <FormalVoucherSignatures
                      preparedBy={showVoucher.createdByName || "Warehouse Officer"}
                      checkedBy={showVoucher.checkedBy}
                      isChecked={showVoucher.isChecked}
                      checkedAt={showVoucher.checkedAt ? String(showVoucher.checkedAt) : undefined}
                      approvedBy="Store Manager"
                      receivedBy={showVoucher.supplierName || "Supplier Delivery Agent"}
                      date={String(showVoucher.voucherDate || showVoucher.createdAt || "")}
                      notes={showVoucher.remark}
                    />
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
              voucherTitle="STOCK IN RECEIPT"
              voucherSubtitle={`Store: ${showVoucher?.storeName || ""} | Supplier: ${showVoucher?.supplierName || ""}`}
              filenamePrefix="stockin"
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
      {DeleteAuthDialog}
    </div>
  );
}
