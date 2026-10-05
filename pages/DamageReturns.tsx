import { useState, useEffect, useRef } from "react";
import { fmt } from "@/lib/currency";
import {
  Plus,
  Search,
  Eye,
  EyeOff,
  Trash2,
  Pencil,
  CheckCircle,
  ChevronDown,
  Copy,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  RotateCcw,
  Maximize2,
  Minimize2,
  FileSpreadsheet,
  Package,
  ChevronRight,
  Clock,
  Cloud,
  RefreshCw,
} from "lucide-react";
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
import { getAll, getById, create, update, remove, COLLECTIONS, generateSerialVoucherId, subscribeCollection, logInventoryMovement } from "@/lib/firestore";
import { useAuth } from "@/lib/auth";
import { shareAsImage, shareAsPdf } from "@/lib/shareImage";
import { ReceiptActionBar } from "@/ReceiptActionBar";
import { ReceiptQRCode } from "@/components/ReceiptQRCode";
import { matchesVoucherSearch } from "@/lib/voucherSearchUtils";
import { VoucherAuditSection, ReceiptCheckedByLine, AuditStatusBadge, performQuickAudit } from "@/components/VoucherAuditSection";
import type { Product, Store, DamageReturn, DamageReturnItem, DamageReturnType, Customer, Supplier, PosSale, DirectSale } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { postDamageJournalEntry, voidJournalEntryByReference } from "@/lib/accountingEngine";
import { HabeshaDatePicker } from "@/components/HabeshaDatePicker";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { toSafeIsoDate, todayIsoDate, formatSafeDate, safeDateSort } from "@/lib/dateUtils";
import { ReferencePhotoViewer } from "@/components/ReferencePhotoViewer";
import { ReceiptWithReferenceView } from "@/components/ReceiptWithReferenceView";
import * as XLSX from "xlsx";

interface SalePickableItem {
  productId: string;
  productName: string;
  productCode?: string;
  quantity: number;
  unitPrice: number;
  selected: boolean;
  returnQty: number;
}

interface SalePickableRecord {
  id: string;
  voucherId: string;
  storeId: string;
  storeName: string;
  customerId?: string;
  customerName?: string;
  date?: string;
  totalAmount?: number;
  source: "pos" | "direct";
  items: SalePickableItem[];
}

export default function DamageReturns() {
  const [records, setRecords] = useState<DamageReturn[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "return_in" | "damage" | "return_out">("all");
  const [showForm, setShowForm] = useState(false);
  const [showVoucher, setShowVoucher] = useState<DamageReturn | null>(null);
  const [isFullScreenVoucher, setIsFullScreenVoucher] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Sales picker state for Returns In
  const [showSalesPicker, setShowSalesPicker] = useState(false);
  const [salesList, setSalesList] = useState<SalePickableRecord[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesSearch, setSalesSearch] = useState("");
  const [selectedSale, setSelectedSale] = useState<SalePickableRecord | null>(null);

  const [form, setForm] = useState({
    voucherId: "",
    storeId: "",
    type: "return_in" as DamageReturnType,
    voucherDate: todayIsoDate(),
    referencePhotoUrl: "",
    customerId: "",
    customerName: "",
    supplierId: "",
    supplierName: "",
    fsNumber: "",
    remark: "",
  });
  const [hideRefPhoto, setHideRefPhoto] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [items, setItems] = useState<DamageReturnItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();
  const { user, isAdmin, isAuditor, canAudit, registeredAuditors, activeAuditorName } = useAuth();
  const receiptRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    setLoading(true);
    const [recs, prods, sts, custs, supps] = await Promise.all([
      getAll<DamageReturn>(COLLECTIONS.DAMAGE_RETURNS),
      getAll<Product>(COLLECTIONS.PRODUCTS),
      getAll<Store>(COLLECTIONS.STORES),
      getAll<Customer>(COLLECTIONS.CUSTOMERS).catch(() => []),
      getAll<Supplier>(COLLECTIONS.SUPPLIERS).catch(() => []),
    ]);
    const safeRecs = (recs || []).map(r => ({
      ...r,
      items: Array.isArray(r.items) ? r.items : [],
    }));
    setRecords(safeRecs.sort((a, b) => safeDateSort(a.voucherDate || a.createdAt, b.voucherDate || b.createdAt, "desc")));
    setProducts(prods);
    setStores(sts);
    setCustomers(custs);
    setSuppliers(supps);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const unsubRecs = subscribeCollection<DamageReturn>(COLLECTIONS.DAMAGE_RETURNS, (data) => {
      const safeData = (data || []).map(r => ({
        ...r,
        items: Array.isArray(r.items) ? r.items : [],
      }));
      setRecords(safeData.sort((a, b) => safeDateSort(a.voucherDate || a.createdAt, b.voucherDate || b.createdAt, "desc")));
    });
    const unsubProds = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, setProducts);
    const unsubStores = subscribeCollection<Store>(COLLECTIONS.STORES, setStores);
    const unsubCusts = subscribeCollection<Customer>(COLLECTIONS.CUSTOMERS, setCustomers);
    const unsubSupps = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, setSuppliers);

    return () => {
      unsubRecs();
      unsubProds();
      unsubStores();
      unsubCusts();
      unsubSupps();
    };
  }, []);

  function isRecordReturnIn(r: DamageReturn): boolean {
    return r.type === "return_in" || (r.type === "return" && r.returnDirection !== "out");
  }

  function isRecordReturnOut(r: DamageReturn): boolean {
    return r.type === "return_out" || (r.type === "return" && r.returnDirection === "out");
  }

  const filtered = records.filter(r => {
    const matchSearch = matchesVoucherSearch(r, search);
    if (!matchSearch) return false;
    if (typeFilter === "all") return true;
    if (typeFilter === "return_in") return isRecordReturnIn(r);
    if (typeFilter === "damage") return r.type === "damage";
    if (typeFilter === "return_out") return isRecordReturnOut(r);
    return true;
  });

  const countReturnIn = records.filter(isRecordReturnIn).length;
  const countDamage = records.filter(r => r.type === "damage").length;
  const countReturnOut = records.filter(isRecordReturnOut).length;

  const totalReturnInAmount = records.filter(isRecordReturnIn).reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalDamageAmount = records.filter(r => r.type === "damage").reduce((s, r) => s + (r.totalAmount || 0), 0);
  const totalReturnOutAmount = records.filter(isRecordReturnOut).reduce((s, r) => s + (r.totalAmount || 0), 0);

  function resetForm() {
    setEditingId(null);
    setHideRefPhoto(false);
    setForm({
      voucherId: "",
      storeId: stores[0]?.id || "",
      type: "return_in",
      voucherDate: todayIsoDate(),
      referencePhotoUrl: "",
      customerId: "",
      customerName: "",
      supplierId: "",
      supplierName: "",
      fsNumber: "",
      remark: "",
    });
    setItems([]);
    setProductSearch("");
  }

  async function openNew() {
    resetForm();
    try {
      const today = todayIsoDate();
      const vid = await generateSerialVoucherId("RIN", today);
      setForm(f => ({ ...f, voucherDate: today, voucherId: vid, storeId: stores[0]?.id || "" }));
    } catch {
      // ignore
    }
    setShowForm(true);
  }

  function openEdit(rec: DamageReturn) {
    setEditingId(rec.id);
    setHideRefPhoto(false);
    const resolvedType: DamageReturnType =
      rec.type === "return"
        ? (rec.returnDirection === "out" ? "return_out" : "return_in")
        : rec.type;

    setForm({
      voucherId: rec.voucherId || "",
      storeId: rec.storeId,
      type: resolvedType,
      voucherDate: rec.voucherDate || toSafeIsoDate(rec.createdAt, todayIsoDate()),
      referencePhotoUrl: rec.referencePhotoUrl || rec.photoProofUrl || "",
      customerId: rec.customerId || "",
      customerName: rec.customerName || "",
      supplierId: rec.supplierId || "",
      supplierName: rec.supplierName || "",
      fsNumber: rec.fsNumber || "",
      remark: rec.remark || "",
    });
    setItems((rec.items || []).map(i => ({ ...i })));
    setProductSearch("");
    setShowForm(true);
  }

  // Listen for navigation with editId/voucherId in query param (e.g. from Bincard)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const editId = params.get("editId") || params.get("voucherId");
    if (editId && records.length > 0) {
      const recToEdit = records.find(r => r.id === editId || r.voucherId === editId);
      if (recToEdit) {
        openEdit(recToEdit);
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, [records]);

  async function duplicateRecord(rec: DamageReturn) {
    setEditingId(null);
    setHideRefPhoto(false);
    const resolvedType: DamageReturnType =
      rec.type === "return"
        ? (rec.returnDirection === "out" ? "return_out" : "return_in")
        : rec.type;
    const prefix = resolvedType === "return_in" ? "RIN" : resolvedType === "return_out" ? "ROUT" : "DMG";
    const nextVid = await generateSerialVoucherId(prefix, todayIsoDate());

    setForm({
      voucherId: nextVid,
      storeId: rec.storeId,
      type: resolvedType,
      voucherDate: todayIsoDate(),
      referencePhotoUrl: rec.referencePhotoUrl || rec.photoProofUrl || "",
      customerId: rec.customerId || "",
      customerName: rec.customerName || "",
      supplierId: rec.supplierId || "",
      supplierName: rec.supplierName || "",
      fsNumber: rec.fsNumber || "",
      remark: rec.remark || "",
    });
    setItems((rec.items || []).map(i => ({ ...i })));
    setProductSearch("");
    setShowForm(true);
    toast({
      title: "Record duplicated (ቅጂ ተዘጋጅቷል)",
      description: `New Voucher ID: ${nextVid} is ready to save or customize.`,
    });
  }

  async function handleTypeChange(newType: DamageReturnType) {
    setForm(f => {
      return { ...f, type: newType };
    });
    // If voucher ID is empty or follows standard prefixes, suggest the prefix for the new type
    if (
      !form.voucherId ||
      form.voucherId.startsWith("RIN-") ||
      form.voucherId.startsWith("DMG-") ||
      form.voucherId.startsWith("ROUT-") ||
      form.voucherId.startsWith("RTN-")
    ) {
      try {
        const prefix = newType === "return_in" ? "RIN" : newType === "return_out" ? "ROUT" : "DMG";
        const vid = await generateSerialVoucherId(prefix, form.voucherDate);
        setForm(f => ({ ...f, voucherId: vid }));
      } catch {
        // ignore
      }
    }
  }

  function addProduct(prod: Product) {
    if (items.find(i => i.productId === prod.id)) {
      toast({ title: "Already added (አስቀድሞ ተመርጧል)" });
      return;
    }
    const defaultPrice = prod.piecePrice || prod.sellingPrice || prod.unitCost || 0;
    const defaultReason =
      form.type === "return_in"
        ? "Customer returned (ደንበኛ የመለሰው)"
        : form.type === "damage"
        ? "Damaged item (የተበላሸ)"
        : "Returned to supplier (ለአቅራቢ ተመላሽ)";

    setItems(prev => [
      ...prev,
      {
        productId: prod.id,
        productName: prod.name,
        productCode: prod.code,
        sellBySingle: true,
        quantity: 1,
        unitPrice: defaultPrice,
        totalPrice: defaultPrice,
        reason: defaultReason,
      },
    ]);
    setProductSearch("");
  }

  function updateItem(idx: number, field: string, value: number | boolean | string) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], [field]: value };
      item.totalPrice = item.unitPrice * (typeof item.quantity === "number" ? item.quantity : 1);
      updated[idx] = item;
      return updated;
    });
  }

  async function openSalesPicker() {
    setShowSalesPicker(true);
    setSalesLoading(true);
    try {
      const [posList, directList] = await Promise.all([
        getAll<PosSale>(COLLECTIONS.POS_SALES).catch(() => []),
        getAll<DirectSale>(COLLECTIONS.DIRECT_SALES).catch(() => []),
      ]);

      const list: SalePickableRecord[] = [];

      posList
        .filter(s => s.status !== "voided")
        .forEach(s => {
          list.push({
            id: s.id,
            voucherId: s.voucherId,
            storeId: s.storeId,
            storeName: s.storeName,
            customerId: s.customerId,
            customerName: s.customerName || "Walk-in Customer",
            date: s.voucherDate || toSafeIsoDate(s.createdAt, todayIsoDate()),
            totalAmount: s.totalAmount,
            source: "pos",
            items: (s.items || []).map(i => ({
              productId: i.productId,
              productName: i.productName,
              productCode: i.productCode,
              quantity: i.quantity,
              unitPrice: i.unitPrice || 0,
              selected: true,
              returnQty: i.quantity,
            })),
          });
        });

      directList
        .filter(s => s.status !== "voided")
        .forEach(s => {
          list.push({
            id: s.id,
            voucherId: s.voucherId,
            storeId: s.storeId,
            storeName: s.storeName,
            customerName: "Direct Sale Customer",
            date: s.voucherDate || toSafeIsoDate(s.createdAt, todayIsoDate()),
            totalAmount: s.totalAmount,
            source: "direct",
            items: (s.items || []).map(i => ({
              productId: i.productId,
              productName: i.productName,
              productCode: i.productCode,
              quantity: i.quantity,
              unitPrice: i.unitPrice || 0,
              selected: true,
              returnQty: i.quantity,
            })),
          });
        });

      list.sort((a, b) => safeDateSort(a.date, b.date, "desc"));
      setSalesList(list);
    } catch (err) {
      toast({ title: "Failed to load sales records", variant: "destructive" });
    } finally {
      setSalesLoading(false);
    }
  }

  function handleSelectSaleForReturn(sale: SalePickableRecord) {
    setSelectedSale({
      ...sale,
      items: (sale.items || []).map(i => ({ ...i, selected: true, returnQty: i.quantity })),
    });
  }

  function applyReturnFromSelectedSale() {
    if (!selectedSale) return;
    const chosenItems = (selectedSale.items || []).filter(i => i.selected && i.returnQty > 0);
    if (chosenItems.length === 0) {
      toast({ title: "Select at least one item to return", variant: "destructive" });
      return;
    }

    // Auto-fill form fields
    setForm(f => ({
      ...f,
      type: "return_in",
      storeId: selectedSale.storeId || f.storeId || stores[0]?.id || "",
      customerId: selectedSale.customerId || f.customerId,
      customerName: selectedSale.customerName && selectedSale.customerName !== "Walk-in Customer" ? selectedSale.customerName : f.customerName,
      fsNumber: selectedSale.voucherId,
      remark: f.remark ? `${f.remark} | Return from ${selectedSale.voucherId}` : `Returned from Sale ${selectedSale.voucherId}`,
    }));

    // Add items or update if already present
    setItems(prev => {
      const updated = [...prev];
      for (const item of chosenItems) {
        const existingIdx = updated.findIndex(u => u.productId === item.productId);
        const newItem: DamageReturnItem = {
          productId: item.productId,
          productName: item.productName,
          productCode: item.productCode || "",
          sellBySingle: true,
          quantity: item.returnQty,
          unitPrice: item.unitPrice,
          totalPrice: item.unitPrice * item.returnQty,
          reason: `Returned from sale ${selectedSale.voucherId} (በደንበኛ የተመለሰ)`,
        };
        if (existingIdx >= 0) {
          updated[existingIdx] = newItem;
        } else {
          updated.push(newItem);
        }
      }
      return updated;
    });

    setShowSalesPicker(false);
    setSelectedSale(null);
    toast({
      title: "Products Loaded for Returns In! (እቃዎች ወደ ተመላሽ ገቢ ተጭነዋል)",
      description: `${chosenItems.length} product(s) from Sale ${selectedSale.voucherId} added.`,
    });
  }

  async function handleQuickAuditToggle(rec: DamageReturn) {
    await performQuickAudit({
      collectionName: COLLECTIONS.DAMAGE_RETURNS,
      docId: rec.id,
      currentChecked: rec.isChecked,
      isAuditor,
      isAdmin,
      user,
      registeredAuditors,
      activeAuditorName,
      toast,
      onSuccess: (newChecked, auditorName) => {
        setRecords(prev =>
          prev.map(r =>
            r.id === rec.id
              ? { ...r, isChecked: newChecked, checkedBy: auditorName, checkedAt: newChecked ? new Date().toISOString() : undefined }
              : r
          )
        );
        if (showVoucher?.id === rec.id) {
          setShowVoucher(v =>
            v ? { ...v, isChecked: newChecked, checkedBy: auditorName, checkedAt: newChecked ? new Date().toISOString() : undefined } : null
          );
        }
      },
    });
  }

  const totalAmount = items.reduce((s, i) => s + i.totalPrice, 0);

  async function handleSave() {
    setSaving(true);
    try {
      if (!form.storeId) {
        toast({ title: "Select a store (መደብር ይምረጡ)", variant: "destructive" });
        return;
      }
      if (items.length === 0) {
        toast({ title: "Add at least one product (ምርት ይምረጡ)", variant: "destructive" });
        return;
      }
      if (items.some(i => i.quantity <= 0)) {
        toast({ title: "All quantities must be greater than zero", variant: "destructive" });
        return;
      }
      if (items.some(i => i.unitPrice < 0)) {
        toast({ title: "Prices cannot be negative", variant: "destructive" });
        return;
      }

      const store = stores.find(s => s.id === form.storeId);
      const isReturnIn = form.type === "return_in";
      const isReturnOut = form.type === "return_out";
      const direction: "in" | "out" = isReturnIn ? "in" : "out";

      const defaultPrefix = isReturnIn ? "RIN" : isReturnOut ? "ROUT" : "DMG";
      const vId = form.voucherId?.trim() || (await generateSerialVoucherId(defaultPrefix, form.voucherDate));

      const payload: Partial<DamageReturn> = {
        voucherId: vId,
        storeId: form.storeId,
        storeName: store?.name || "",
        type: form.type,
        returnDirection: isReturnIn ? "in" : isReturnOut ? "out" : "in",
        customerId: isReturnIn ? (form.customerId || "") : "",
        customerName: isReturnIn ? (form.customerName || "") : "",
        supplierId: isReturnOut ? (form.supplierId || "") : "",
        supplierName: isReturnOut ? (form.supplierName || "") : "",
        fsNumber: form.fsNumber?.trim() || "",
        remark: form.remark?.trim() || "",
        items,
        totalAmount,
        voucherDate: form.voucherDate,
        referencePhotoUrl: form.referencePhotoUrl || "",
      };

      if (editingId) {
        await update(COLLECTIONS.DAMAGE_RETURNS, editingId, payload as Record<string, unknown>);
        toast({
          title: isReturnIn
            ? "Returns In updated (ተመላሽ ገቢ ተስተካክሏል)"
            : form.type === "damage"
            ? "Damage updated (የተበላሸ እቃ ተስተካክሏል)"
            : "Returns Out updated (ተመላሽ ወጪ ተስተካክሏል)",
        });
      } else {
        const createData = {
          ...payload,
          status: "active" as const,
          createdByName: user?.name || "Staff",
        };
        const newId = await create(COLLECTIONS.DAMAGE_RETURNS, createData);

        // Post automatic double-entry journal entry for accounting
        postDamageJournalEntry({ ...createData, id: newId } as DamageReturn).catch(err => console.warn("Automatic journal entry error:", err));

        // If customer return (return_in) with customer assigned, adjust customer debt balance
        if (isReturnIn && form.customerId) {
          try {
            const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, form.customerId);
            if (freshCust && Number(freshCust.totalBalance || 0) > 0) {
              const newBal = Math.max(0, Number(freshCust.totalBalance || 0) - totalAmount);
              await update(COLLECTIONS.CUSTOMERS, form.customerId, { totalBalance: newBal });
            }
          } catch (err) {
            console.warn("Failed to update customer balance on return:", err);
          }
        }

        // If supplier return (return_out) with supplier assigned, adjust supplier payable balance
        if (isReturnOut && form.supplierId) {
          try {
            const freshSupp = await getById<Supplier>(COLLECTIONS.SUPPLIERS, form.supplierId);
            if (freshSupp && Number(freshSupp.totalBalance || 0) > 0) {
              const newBal = Math.max(0, Number(freshSupp.totalBalance || 0) - totalAmount);
              await update(COLLECTIONS.SUPPLIERS, form.supplierId, { totalBalance: newBal });
            }
          } catch (err) {
            console.warn("Failed to update supplier balance on return:", err);
          }
        }

        // Record inventory movements for stock audit & multi-device sync
        for (const item of items) {
          const diff = isReturnIn ? item.quantity : -item.quantity;
          await logInventoryMovement({
            type: form.type === "damage" ? "damage" : "return",
            productId: item.productId,
            productName: item.productName,
            productCode: item.productCode,
            storeId: form.storeId,
            storeName: store?.name || "",
            prevQuantity: 0,
            newQuantity: diff,
            difference: diff,
            reason: `${form.type === "damage" ? "Damage Write-off" : isReturnIn ? "Returns In" : "Returns Out"}: ${vId}`,
            referenceVoucherId: vId,
            userName: user?.name || "Staff",
            voucherDate: form.voucherDate,
          }).catch((err) => console.warn("Movement log failed:", err));
        }

        toast({
          title: isReturnIn
            ? "✓ Returns In registered into stock (ተመላሽ እቃ ወደ ክምችት ገቢ ተደርጓል)"
            : form.type === "damage"
            ? "Damage registered (የተበላሸ እቃ ተመዝግቧል)"
            : "Returns Out registered (ተመላሽ እቃ ወደ አቅራቢ ተልኳል)",
        });
        setShowForm(false);
        resetForm();
        loadData();
        setShowVoucher({ ...createData, id: newId } as DamageReturn);
        return;
      }
      setShowForm(false);
      resetForm();
      loadData();
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(rec: DamageReturn) {
    await update(COLLECTIONS.DAMAGE_RETURNS, rec.id, { status: "active" });
    toast({
      title: isRecordReturnIn(rec)
        ? "Returns In approved & added to stock"
        : rec.type === "damage"
        ? "Damage approved"
        : "Returns Out approved",
    });
    loadData();
  }

  function handleDelete(rec: DamageReturn) {
    confirmDelete(async () => {
      await remove(COLLECTIONS.DAMAGE_RETURNS, rec.id);
      voidJournalEntryByReference(rec.voucherId || rec.id).catch(err => console.warn("Void journal error:", err));
      toast({ title: "Record deleted" });
      loadData();
    });
  }

  function handlePrint() {
    if (!receiptRef.current) return;
    printElement(receiptRef.current, "Damage_Return_Receipt");
  }

  async function handleShare() {
    if (!receiptRef.current) return;
    setSharing(true);
    const r = await shareAsImage(receiptRef.current, "damage_return_receipt.png");
    if (r === "shared") toast({ title: "Receipt shared successfully (ደረሰኝ ተጋርቷል)" });
    else if (r === "downloaded") toast({ title: "Receipt image downloaded (ደረሰኝ ወርዷል)" });
    else if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    setSharing(false);
  }

  async function handleSharePdf() {
    if (!receiptRef.current) return;
    setSharingPdf(true);
    const r = await shareAsPdf(receiptRef.current, "damage_return_receipt.pdf");
    if (r === "failed") toast({ title: "PDF share failed", variant: "destructive" });
    setSharingPdf(false);
  }

  function exportVoucherExcel(v: DamageReturn) {
    const isRetIn = isRecordReturnIn(v);
    const isRetOut = isRecordReturnOut(v);
    const typeLabel = isRetIn ? "Returns In (ተመላሽ ገቢ)" : v.type === "damage" ? "Damage (የተበላሸ)" : "Returns Out (ተመላሽ ወጪ)";

    const headerData = [
      ["VOUCHER RECORD", typeLabel],
      ["Voucher ID", v.voucherId],
      ["Store", v.storeName],
      ["Date", v.voucherDate || formatSafeDate(v.createdAt)],
      ["Customer", v.customerName || "—"],
      ["Supplier", v.supplierName || "—"],
      ["FS / Ref No", v.fsNumber || "—"],
      ["Total Amount", v.totalAmount],
      ["Status", v.status],
      ["Created By", v.createdByName || "—"],
      ["Checked By", v.checkedBy ? `${v.checkedBy} (Verified / ትክክል ነው)` : "Pending Review (ያልተጣራ)"],
      [],
      ["#", "Product Name", "Product Code", "Quantity", "Unit Price", "Total Price", "Reason"],
    ];

    const itemRows = (v.items || []).map((item, idx) => [
      idx + 1,
      item.productName,
      item.productCode,
      item.quantity,
      item.unitPrice,
      item.totalPrice,
      item.reason || "",
    ]);

    const ws = XLSX.utils.aoa_to_sheet([...headerData, ...itemRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Voucher");
    XLSX.writeFile(wb, `${v.voucherId}_receipt.xlsx`);
    toast({ title: "Excel exported successfully" });
  }

  const productResults = products
    .filter(
      p =>
        Boolean(p) &&
        Boolean(productSearch) &&
        ((p.name || "").toLowerCase().includes(productSearch.toLowerCase()) ||
          (p.code || "").toLowerCase().includes(productSearch.toLowerCase()))
    )
    .slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <RotateCcw className="w-6 h-6 text-primary shrink-0" />
            Damage / Returns
          </h1>
          <p className="text-muted-foreground text-xs sm:text-sm mt-0.5">
            Manage product returns into stock (Returns In), damage write-offs, and returns to suppliers (Returns Out).
          </p>
        </div>
        <Button onClick={openNew} data-testid="button-new-damage" className="gap-2 shadow-xs font-semibold">
          <Plus className="w-4 h-4" /> New Record (አዲስ መዝግብ)
        </Button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-card border rounded-xl p-3.5 shadow-2xs">
          <div className="text-xs text-muted-foreground font-medium">All Records</div>
          <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">{records.length}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">Total registered vouchers</div>
        </div>
        <div
          onClick={() => setTypeFilter("return_in")}
          className={`bg-card border rounded-xl p-3.5 shadow-2xs cursor-pointer transition-all hover:border-emerald-500/50 ${
            typeFilter === "return_in" ? "ring-2 ring-emerald-500 border-emerald-500 bg-emerald-50/20" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <ArrowDownLeft className="w-3.5 h-3.5" /> Returns In (ተመላሽ ገቢ)
            </div>
            <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">{countReturnIn}</Badge>
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
            {fmt(totalReturnInAmount)}
          </div>
          <div className="text-[10px] text-emerald-600/80 mt-0.5">+ Restocked to store inventory</div>
        </div>
        <div
          onClick={() => setTypeFilter("damage")}
          className={`bg-card border rounded-xl p-3.5 shadow-2xs cursor-pointer transition-all hover:border-rose-500/50 ${
            typeFilter === "damage" ? "ring-2 ring-rose-500 border-rose-500 bg-rose-50/20" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Damage (የተበላሸ)
            </div>
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{countDamage}</Badge>
          </div>
          <div className="text-lg sm:text-xl font-bold text-rose-700 dark:text-rose-400 mt-1">
            {fmt(totalDamageAmount)}
          </div>
          <div className="text-[10px] text-rose-600/80 mt-0.5">- Deducted write-offs</div>
        </div>
        <div
          onClick={() => setTypeFilter("return_out")}
          className={`bg-card border rounded-xl p-3.5 shadow-2xs cursor-pointer transition-all hover:border-amber-500/50 ${
            typeFilter === "return_out" ? "ring-2 ring-amber-500 border-amber-500 bg-amber-50/20" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <ArrowUpRight className="w-3.5 h-3.5" /> Returns Out (ተመላሽ ወጪ)
            </div>
            <Badge className="bg-amber-600 text-white text-[10px] px-1.5 py-0">{countReturnOut}</Badge>
          </div>
          <div className="text-lg sm:text-xl font-bold text-amber-700 dark:text-amber-400 mt-1">
            {fmt(totalReturnOutAmount)}
          </div>
          <div className="text-[10px] text-amber-600/80 mt-0.5">- Returned to suppliers</div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={typeFilter === "all" ? "default" : "outline"}
            onClick={() => setTypeFilter("all")}
            className="text-xs h-8 gap-1.5"
          >
            All Types (ሁሉም) <Badge variant="secondary" className="ml-1 text-[10px]">{records.length}</Badge>
          </Button>
          <Button
            size="sm"
            variant={typeFilter === "return_in" ? "default" : "outline"}
            onClick={() => setTypeFilter("return_in")}
            className={`text-xs h-8 gap-1.5 ${
              typeFilter === "return_in" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : ""
            }`}
          >
            <ArrowDownLeft className="w-3.5 h-3.5" />
            Returns In (ተመላሽ ገቢ - In)
            <Badge variant="secondary" className="ml-1 text-[10px]">{countReturnIn}</Badge>
          </Button>
          <Button
            size="sm"
            variant={typeFilter === "damage" ? "default" : "outline"}
            onClick={() => setTypeFilter("damage")}
            className={`text-xs h-8 gap-1.5 ${
              typeFilter === "damage" ? "bg-rose-600 hover:bg-rose-700 text-white" : ""
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            Damage (የተበላሸ - Out)
            <Badge variant="secondary" className="ml-1 text-[10px]">{countDamage}</Badge>
          </Button>
          <Button
            size="sm"
            variant={typeFilter === "return_out" ? "default" : "outline"}
            onClick={() => setTypeFilter("return_out")}
            className={`text-xs h-8 gap-1.5 ${
              typeFilter === "return_out" ? "bg-amber-600 hover:bg-amber-700 text-white" : ""
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            Returns Out (ተመላሽ ወጪ - Out)
            <Badge variant="secondary" className="ml-1 text-[10px]">{countReturnOut}</Badge>
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            className="pl-9 bg-card"
            placeholder="Search by voucher ID, customer, supplier, store, items, dates, reasons..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 border-b">
                <tr>
                  {["Voucher", "Date", "Store", "Type / Direction", "Party (Customer / Supplier)", "Items", "Total Amount", "Audit", "Status", "Actions"].map(h => (
                    <th key={h} className="text-left px-3.5 py-3 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(r => {
                  const isRetIn = isRecordReturnIn(r);
                  const isRetOut = isRecordReturnOut(r);

                  return (
                    <tr key={r.id} className="hover:bg-muted/40 transition-colors" data-testid={`row-damage-${r.id}`}>
                      {/* Voucher ID */}
                      <td className="px-3.5 py-2.5 font-mono text-xs">
                        <button
                          onClick={() => setShowVoucher(r)}
                          className="font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                          title="Click to view voucher receipt"
                        >
                          {r.voucherId}
                        </button>
                        {r.fsNumber && (
                          <div className="text-[10px] text-muted-foreground font-mono">Ref: {r.fsNumber}</div>
                        )}
                      </td>

                      {/* Date */}
                      <td className="px-3.5 py-2.5 text-xs">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">
                          {formatEthDate(r.voucherDate || r.createdAt, { short: true })}
                        </div>
                        {(r.voucherDate || r.createdAt) && (
                          <div className="text-[10px] text-muted-foreground">
                            {toSafeIsoDate(r.voucherDate || r.createdAt, "—")}
                          </div>
                        )}
                      </td>

                      {/* Store */}
                      <td className="px-3.5 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {r.storeName}
                      </td>

                      {/* Type Badge */}
                      <td className="px-3.5 py-2.5 text-xs">
                        {isRetIn ? (
                          <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] px-2 py-0.5 gap-1 shadow-2xs">
                            <ArrowDownLeft className="w-3 h-3" /> Returns In (+ገቢ)
                          </Badge>
                        ) : r.type === "damage" ? (
                          <Badge variant="destructive" className="font-semibold text-[11px] px-2 py-0.5 gap-1 shadow-2xs">
                            <AlertTriangle className="w-3 h-3" /> Damage (-ተቀናሽ)
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-600 hover:bg-amber-700 text-white font-semibold text-[11px] px-2 py-0.5 gap-1 shadow-2xs">
                            <ArrowUpRight className="w-3 h-3" /> Returns Out (-ወጪ)
                          </Badge>
                        )}
                      </td>

                      {/* Party (Customer / Supplier) */}
                      <td className="px-3.5 py-2.5 text-xs">
                        {isRetIn && r.customerName ? (
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">👤 {r.customerName}</span>
                            <div className="text-[10px] text-muted-foreground">Customer return</div>
                          </div>
                        ) : isRetOut && r.supplierName ? (
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">🏢 {r.supplierName}</span>
                            <div className="text-[10px] text-muted-foreground">To Supplier</div>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Items Count */}
                      <td className="px-3.5 py-2.5 text-xs font-medium">
                        <span className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded-md">
                          <Package className="w-3 h-3 text-muted-foreground" />
                          {r.items?.length || 0}
                        </span>
                      </td>

                      {/* Total Amount */}
                      <td className="px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-slate-100">
                        {fmt(r.totalAmount)}
                      </td>

                      {/* Audit Status */}
                      <td className="px-3.5 py-2.5 text-xs">
                        <AuditStatusBadge
                          isChecked={r.isChecked}
                          checkedBy={r.checkedBy}
                          checkedAt={r.checkedAt}
                          canAudit={canAudit}
                          onQuickCheck={() => handleQuickAuditToggle(r)}
                        />
                      </td>

                      {/* Status */}
                      <td className="px-3.5 py-2.5 text-xs">
                        <Badge
                          variant={r.status === "active" ? "default" : r.status === "pending" ? "outline" : "destructive"}
                          className={r.status === "pending" ? "border-amber-500 text-amber-600 bg-amber-50" : ""}
                        >
                          {r.status}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="px-3.5 py-2.5 text-xs">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-xs" data-testid={`button-actions-${r.id}`}>
                              Actions
                              <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">
                              {r.voucherId}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setShowVoucher({ ...r, items: Array.isArray(r.items) ? r.items : [] })} data-testid={`button-view-${r.id}`}>
                              <Eye className="w-4 h-4 mr-2 text-primary" /> View Voucher
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => exportVoucherExcel(r)}>
                              <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Export Excel
                            </DropdownMenuItem>
                            {isAdmin && r.status === "pending" && (
                              <DropdownMenuItem
                                onClick={() => handleApprove(r)}
                                className="text-emerald-600 focus:text-emerald-600"
                                data-testid={`button-approve-${r.id}`}
                              >
                                <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> Approve Record
                              </DropdownMenuItem>
                            )}
                            {r.status !== "voided" && (
                              <DropdownMenuItem onClick={() => openEdit(r)} data-testid={`button-edit-${r.id}`}>
                                <Pencil className="w-4 h-4 mr-2 text-amber-600" /> Edit Record (አስተካክል)
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => duplicateRecord(r)} data-testid={`button-duplicate-${r.id}`}>
                              <Copy className="w-4 h-4 mr-2 text-blue-600" /> Duplicate (ቅጂ/ደብል)
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleDelete(r)}
                              className="text-destructive focus:text-destructive"
                              data-testid={`button-delete-${r.id}`}
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Delete Record
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                      No records found in this category
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* New / Edit Dialog */}
      <Dialog
        open={showForm}
        onOpenChange={open => {
          if (!open) {
            setShowForm(false);
            resetForm();
          }
        }}
      >
        <DialogContent
          className={`max-h-[92vh] overflow-y-auto transition-all ${
            form.referencePhotoUrl && !hideRefPhoto ? "max-w-6xl xl:max-w-7xl" : "max-w-3xl"
          }`}
        >
          <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 border-b">
            <DialogTitle className="text-lg font-bold">
              {editingId ? "Edit Damage / Return Record" : "New Damage / Return Record (አዲስ መዝግብ)"}
            </DialogTitle>
            {form.referencePhotoUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs gap-1.5 h-8 ml-auto mr-4"
                onClick={() => setHideRefPhoto(!hideRefPhoto)}
              >
                {hideRefPhoto ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {hideRefPhoto ? "Show Reference Photo" : "Hide Reference Photo"}
              </Button>
            )}
          </DialogHeader>

          <div className={form.referencePhotoUrl && !hideRefPhoto ? "grid grid-cols-1 lg:grid-cols-12 gap-6 items-start pt-2" : "space-y-4 pt-2"}>
            <div className={`space-y-4 ${form.referencePhotoUrl && !hideRefPhoto ? "lg:col-span-7 xl:col-span-7" : ""}`}>
              {/* Type Selection */}
              <div className="space-y-1.5 bg-muted/40 p-3 rounded-xl border">
                <Label className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Transaction Type (የሰነድ ዓይነት) *
                </Label>
                <Select value={form.type} onValueChange={(v: DamageReturnType) => handleTypeChange(v)}>
                  <SelectTrigger className="font-semibold text-xs sm:text-sm h-10 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="return_in" className="cursor-pointer">
                      <div className="flex items-center gap-2 py-0.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <div>
                          <div className="font-bold text-emerald-800 dark:text-emerald-300 text-xs sm:text-sm">
                            Returns In (ወደ እኛ የተመለሰ ገቢ / Sales Return)
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            እራሴ ሸጬ ወደ እኔ የተመለሰ እቃ — ወደ መደብር ክምችት ገቢ ይሆናል (+ In Stock)
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="damage" className="cursor-pointer">
                      <div className="flex items-center gap-2 py-0.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                        <div>
                          <div className="font-bold text-rose-800 dark:text-rose-300 text-xs sm:text-sm">
                            Damage (የተበላሸ እቃ ማስወገጃ)
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            የተበላሸ ወይም የተሰበረ እቃ — ከመደብሩ ክምችት ተቀናሽ ይደረጋል (- Out Stock)
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                    <SelectItem value="return_out" className="cursor-pointer">
                      <div className="flex items-center gap-2 py-0.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
                        <div>
                          <div className="font-bold text-amber-800 dark:text-amber-300 text-xs sm:text-sm">
                            Returns Out (ወደ አቅራቢ የተመለሰ ወጪ / Supplier Return)
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            ወደ አቅራቢ የሚመለስ እቃ — ከመደብሩ ክምችት ተቀናሽ ይደረጋል (- Out Stock)
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>

                {/* Contextual stock behavior banner */}
                {form.type === "return_in" ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/40 p-2.5 text-xs text-emerald-900 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2">
                    <div className="flex items-start gap-2">
                      <ArrowDownLeft className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold">Returns In (+ ገቢ):</span> ሸጠውት በደንበኛ የተመለሱትን እቃዎች ወደ መደብር ክምችት መልሰው ገቢ ያደርጋል። የክምችት መጠን (Stock Balance) ይጨምራል!
                      </div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="default"
                      className="bg-emerald-700 hover:bg-emerald-800 text-white text-xs h-8 shrink-0 font-semibold gap-1.5 shadow-xs"
                      onClick={() => openSalesPicker()}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      ከሽያጭ ደረሰኝ መልስ (Load from Sale)
                    </Button>
                  </div>
                ) : form.type === "damage" ? (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/80 dark:bg-rose-950/40 p-2.5 text-xs text-rose-900 dark:text-rose-200 flex items-start gap-2 mt-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Damage (- ተቀናሽ):</span> የተበላሹ ወይም የተሰበሩ እቃዎችን ከክምችት ለመሰረዝ ያገለግላል። የክምችት መጠን ይቀንሳል!
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/80 dark:bg-amber-950/40 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2 mt-2">
                    <ArrowUpRight className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">Returns Out (- ወጪ):</span> ለአቅራቢ የተመለሱ እቃዎችን ከክምችት ያስወግዳል። የክምችት መጠን ይቀንሳል!
                    </div>
                  </div>
                )}
              </div>

              {/* Voucher ID & Store */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                        const prefix = form.type === "return_in" ? "RIN" : form.type === "return_out" ? "ROUT" : "DMG";
                        const vid = await generateSerialVoucherId(prefix, form.voucherDate);
                        setForm(f => ({ ...f, voucherId: vid }));
                      }}
                    >
                      Auto ID
                    </Button>
                  </div>
                  <Input
                    value={form.voucherId}
                    onChange={e => setForm(f => ({ ...f, voucherId: e.target.value }))}
                    placeholder="e.g. RIN-20260911-0001"
                    className="font-mono text-xs h-9"
                    data-testid="input-voucher-id"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Store (መደብር) *</Label>
                  <Select value={form.storeId} onValueChange={v => setForm(f => ({ ...f, storeId: v }))}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Select store" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Specific fields for Returns In (Customer & FS/Invoice Ref) */}
              {form.type === "return_in" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-muted/20 border border-emerald-200/60 rounded-xl">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">Customer (ደንበኛ / ማን መለሰው?)</Label>
                    <Select
                      value={form.customerId || (form.customerName ? "custom" : "")}
                      onValueChange={val => {
                        if (val === "custom") {
                          setForm(f => ({ ...f, customerId: "" }));
                        } else {
                          const cust = customers.find(c => c.id === val);
                          setForm(f => ({ ...f, customerId: val, customerName: cust?.name || "" }));
                        }
                      }}
                    >
                      <SelectTrigger className="text-xs h-9">
                        <SelectValue placeholder="Select or type customer..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-56">
                        <SelectItem value="custom">✏️ Type Customer Name (ስም ጻፍ)</SelectItem>
                        {customers.map(c => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name} {c.phone ? `(${c.phone})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {(!form.customerId || form.customerId === "custom") && (
                      <Input
                        placeholder="Customer name (የደንበኛ ስም)..."
                        value={form.customerName}
                        onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                        className="text-xs h-9 mt-1"
                      />
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Sales Invoice / FS Ref <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span>
                    </Label>
                    <Input
                      placeholder="e.g. FS-00124, POS-0089..."
                      value={form.fsNumber}
                      onChange={e => setForm(f => ({ ...f, fsNumber: e.target.value }))}
                      className="font-mono text-xs h-9"
                    />
                    <p className="text-[10px] text-muted-foreground">Original sale invoice or receipt reference</p>
                  </div>
                </div>
              )}

              {/* Specific fields for Returns Out (Supplier) */}
              {form.type === "return_out" && (
                <div className="space-y-1.5 p-3 bg-muted/20 border border-amber-200/60 rounded-xl">
                  <Label className="text-xs font-semibold">Supplier (ለየትኛው አቅራቢ ተመለሰ?)</Label>
                  <Select
                    value={form.supplierId || (form.supplierName ? "custom" : "")}
                    onValueChange={val => {
                      if (val === "custom") {
                        setForm(f => ({ ...f, supplierId: "" }));
                      } else {
                        const supp = suppliers.find(s => s.id === val);
                        setForm(f => ({ ...f, supplierId: val, supplierName: supp?.name || "" }));
                      }
                    }}
                  >
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Select supplier..." />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      <SelectItem value="custom">✏️ Type Supplier Name (ስም ጻፍ)</SelectItem>
                      {suppliers.map(s => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {(!form.supplierId || form.supplierId === "custom") && (
                    <Input
                      placeholder="Supplier name (የአቅራቢ ስም)..."
                      value={form.supplierName}
                      onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))}
                      className="text-xs h-9 mt-1"
                    />
                  )}
                </div>
              )}

              {/* Date */}
              <div>
                <HabeshaDatePicker
                  label="Date (ቀን)"
                  value={form.voucherDate}
                  onChange={async (v) => {
                    setForm(f => ({ ...f, voucherDate: v }));
                    if (!editingId) {
                      const prefix = form.type === "return_in" ? "RIN" : form.type === "return_out" ? "ROUT" : "DMG";
                      const vid = await generateSerialVoucherId(prefix, v);
                      setForm(f => ({ ...f, voucherDate: v, voucherId: vid }));
                    }
                  }}
                />
              </div>

              {/* Product Selection */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-semibold">Add Products (ምርት ምረጥ)</Label>
                  {form.type === "return_in" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs text-emerald-700 dark:text-emerald-300 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 gap-1 font-medium"
                      onClick={() => openSalesPicker()}
                    >
                      <RotateCcw className="w-3 h-3 text-emerald-600" />
                      ከሽያጭ ደረሰኝ ምረጥ (From Sale)
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    placeholder="Search product by name or code to add..."
                    value={productSearch}
                    onChange={e => setProductSearch(e.target.value)}
                    className="text-xs h-9"
                  />
                  {productResults.length > 0 && (
                    <div className="absolute z-20 top-full left-0 right-0 bg-popover border rounded-b-lg shadow-lg max-h-52 overflow-y-auto divide-y">
                      {productResults.map(p => (
                        <div
                          key={p.id}
                          className="px-3.5 py-2 hover:bg-muted/80 cursor-pointer text-xs flex items-center justify-between"
                          onClick={() => addProduct(p)}
                        >
                          <div>
                            <span className="font-semibold text-foreground">{p.name}</span>
                            <span className="text-muted-foreground ml-1.5 font-mono">({p.code})</span>
                          </div>
                          <div className="font-bold text-primary">{fmt(p.sellingPrice || p.piecePrice || p.unitCost || 0)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Items Table */}
              {items.length > 0 && (
                <div className="rounded-lg border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/60 text-muted-foreground border-b">
                        <tr>
                          {["Product", "Qty", "Unit Price", "Total", "Reason (ምክንያት)", ""].map(h => (
                            <th key={h} className="text-left px-2.5 py-2 font-semibold">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {items.map((item, idx) => (
                          <tr key={idx} className="hover:bg-muted/20">
                            <td className="px-2.5 py-2 font-medium">
                              <div>{item.productName}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>
                            </td>
                            <td className="px-2.5 py-2">
                              <Input
                                type="number"
                                min={1}
                                className="w-16 h-7 text-xs"
                                value={item.quantity}
                                onChange={e => updateItem(idx, "quantity", Number(e.target.value))}
                              />
                            </td>
                            <td className="px-2.5 py-2">
                              <Input
                                type="number"
                                min={0}
                                step={0.01}
                                className="w-20 h-7 text-xs"
                                value={item.unitPrice}
                                onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))}
                              />
                            </td>
                            <td className="px-2.5 py-2 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              {fmt(item.totalPrice)}
                            </td>
                            <td className="px-2.5 py-2">
                              <Input
                                className="w-32 h-7 text-xs"
                                value={item.reason || ""}
                                onChange={e => updateItem(idx, "reason", e.target.value)}
                                placeholder="Reason"
                              />
                            </td>
                            <td className="px-2.5 py-2 text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/40 font-semibold border-t">
                        <tr>
                          <td colSpan={3} className="px-2.5 py-2 text-xs">
                            Total
                          </td>
                          <td className="px-2.5 py-2 text-xs font-bold text-primary whitespace-nowrap">
                            {fmt(totalAmount)}
                          </td>
                          <td colSpan={2} />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Remark */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">General Note / Remark (አጠቃላይ ማስታወሻ)</Label>
                <Input
                  value={form.remark}
                  onChange={e => setForm(f => ({ ...f, remark: e.target.value }))}
                  placeholder="Any additional notes or remarks..."
                  className="text-xs h-9"
                />
              </div>

              {!form.referencePhotoUrl && (
                <div className="pt-2 border-t">
                  <ReferencePhotoViewer
                    photoUrl=""
                    onPhotoChange={url => setForm(f => ({ ...f, referencePhotoUrl: url }))}
                    isEditable={true}
                    title="Damage / Return Proof / Slip (ማጣቀሻ ፎቶ / ሰነድ)"
                    isUploading={uploading}
                    setIsUploading={setUploading}
                  />
                </div>
              )}
            </div>

            {/* Right column: Reference Photo viewer */}
            {form.referencePhotoUrl && !hideRefPhoto && (
              <div className="lg:col-span-5 xl:col-span-5 lg:sticky lg:top-0 space-y-2">
                <ReferencePhotoViewer
                  photoUrl={form.referencePhotoUrl}
                  onPhotoChange={url => setForm(f => ({ ...f, referencePhotoUrl: url }))}
                  onPhotoRemove={() => setForm(f => ({ ...f, referencePhotoUrl: "" }))}
                  onToggleHidden={hidden => setHideRefPhoto(hidden)}
                  isEditable={true}
                  title="Damage / Return Reference (ማጣቀሻ ሰነድ)"
                  isUploading={uploading}
                  setIsUploading={setUploading}
                />
              </div>
            )}
          </div>

          <DialogFooter className="pt-3 border-t gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-damage" className="font-semibold gap-1.5">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Save Record (መዝግብ)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receipt Dialog */}
      <Dialog
        open={!!showVoucher}
        onOpenChange={open => {
          if (!open) {
            setShowVoucher(null);
            setIsFullScreenVoucher(false);
          }
        }}
      >
        <DialogContent
          className={`overflow-y-auto transition-all duration-200 ${
            isFullScreenVoucher
              ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none top-0 left-0 translate-x-0 translate-y-0 z-50 border-0 m-0 p-2 sm:p-4 md:p-6 bg-slate-100/95 dark:bg-slate-950/95 flex flex-col"
              : (showVoucher?.referencePhotoUrl || showVoucher?.photoProofUrl)
              ? "max-w-6xl xl:max-w-7xl max-h-[92vh]"
              : "max-w-2xl max-h-[92vh]"
          }`}
        >
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <RotateCcw className="w-5 h-5 text-primary shrink-0" />
              <DialogTitle className="text-base sm:text-lg font-bold truncate">
                {showVoucher
                  ? isRecordReturnIn(showVoucher)
                    ? "Returns In Voucher (የተመለሰ እቃ ገቢ ደረሰኝ)"
                    : showVoucher.type === "damage"
                    ? "Damage Voucher (የተበላሸ እቃ ማስወገጃ ደረሰኝ)"
                    : "Returns Out Voucher (የተመለሰ እቃ ወጪ ደረሰኝ)"
                  : "Voucher Receipt"}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-1.5 mr-6 shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsFullScreenVoucher(prev => !prev)}
                className="h-8 px-2.5 text-xs gap-1.5 font-medium border-slate-300 dark:border-slate-700 hover:bg-muted"
                title={isFullScreenVoucher ? "Exit Full Screen" : "Full Screen (ሙሉ ስክሪን)"}
              >
                {isFullScreenVoucher ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isFullScreenVoucher ? "Exit Full Screen" : "Full Screen (ሙሉ ስክሪን)"}</span>
              </Button>
              {showVoucher && showVoucher.status !== "voided" && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs gap-1.5 font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400"
                  onClick={() => {
                    const recToEdit = showVoucher;
                    setShowVoucher(null);
                    openEdit(recToEdit);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit Record (አስተካክል)</span>
                </Button>
              )}
            </div>
          </DialogHeader>

          {showVoucher && (
            <div className={isFullScreenVoucher ? "flex-1 overflow-y-auto my-auto space-y-4" : "space-y-4"}>
              <VoucherAuditSection
                collectionName={COLLECTIONS.DAMAGE_RETURNS}
                docId={showVoucher.id}
                isChecked={showVoucher.isChecked}
                checkedBy={showVoucher.checkedBy}
                checkedAt={showVoucher.checkedAt}
                checkedNote={showVoucher.checkedNote}
                voucherNumber={showVoucher.voucherId}
                onAuditChange={(newChecked, auditorName, note) => {
                  setShowVoucher(v =>
                    v ? { ...v, isChecked: newChecked, checkedBy: auditorName, checkedNote: note } : null
                  );
                  setRecords(prev =>
                    prev.map(item =>
                      item.id === showVoucher.id
                        ? { ...item, isChecked: newChecked, checkedBy: auditorName, checkedNote: note }
                        : item
                    )
                  );
                }}
              />
              <ReceiptWithReferenceView
                referencePhotoUrl={showVoucher.referencePhotoUrl || showVoucher.photoProofUrl}
                voucherId={showVoucher.voucherId}
                receiptNode={
                  <div
                    ref={receiptRef}
                    className={`receipt-a4 p-5 space-y-4 border rounded-xl bg-card shadow-xs text-card-foreground ${
                      isFullScreenVoucher ? "max-w-3xl mx-auto my-2" : ""
                    }`}
                  >
                    {/* Voucher Header */}
                    <div className="text-center border-b pb-3">
                      <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
                        {isRecordReturnIn(showVoucher)
                          ? "RETURNS IN VOUCHER (የተመለሰ እቃ ገቢ ደረሰኝ)"
                          : showVoucher.type === "damage"
                          ? "DAMAGE VOUCHER (የተበላሸ እቃ ማስወገጃ ደረሰኝ)"
                          : "RETURNS OUT VOUCHER (የተመለሰ እቃ ወጪ ደረሰኝ)"}
                      </h2>
                      <div className="flex items-center justify-center gap-2 mt-1">
                        <p className="text-sm font-mono font-bold text-primary">{showVoucher.voucherId}</p>
                      </div>
                      <div className="mt-1">
                        {isRecordReturnIn(showVoucher) ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                            ✓ Stock Restocked Into Store (+ In)
                          </span>
                        ) : showVoucher.type === "damage" ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                            ⚠ Written Off From Stock (- Out)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                            ↑ Returned to Supplier (- Out)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-3 text-xs border-b pb-3">
                      <div>
                        <span className="text-muted-foreground">Store (መደብር): </span>
                        <strong className="text-foreground">{showVoucher.storeName}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Date (ቀን): </span>
                        <span className="font-semibold text-foreground">
                          {formatEthDate(showVoucher.voucherDate || showVoucher.createdAt, { includeGregorian: true })}
                        </span>
                      </div>
                      {isRecordReturnIn(showVoucher) && showVoucher.customerName && (
                        <div>
                          <span className="text-muted-foreground">Customer (ደንበኛ): </span>
                          <strong className="text-foreground">👤 {showVoucher.customerName}</strong>
                        </div>
                      )}
                      {isRecordReturnOut(showVoucher) && showVoucher.supplierName && (
                        <div>
                          <span className="text-muted-foreground">Supplier (አቅራቢ): </span>
                          <strong className="text-foreground">🏢 {showVoucher.supplierName}</strong>
                        </div>
                      )}
                      {showVoucher.fsNumber && (
                        <div>
                          <span className="text-muted-foreground">Ref / FS No: </span>
                          <span className="font-mono font-semibold">{showVoucher.fsNumber}</span>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">Created By: </span>
                        <span>{showVoucher.createdByName || "—"}</span>
                      </div>
                      <ReceiptCheckedByLine
                        checkedBy={showVoucher.checkedBy}
                        isChecked={showVoucher.isChecked}
                        checkedAt={showVoucher.checkedAt}
                      />
                      {showVoucher.remark && (
                        <div className="col-span-2 bg-muted/30 p-2 rounded-md">
                          <span className="text-muted-foreground font-semibold">Note / Remark: </span>
                          <span>{showVoucher.remark}</span>
                        </div>
                      )}
                    </div>

                    {/* Items Table */}
                    <table className="w-full text-xs border-collapse border">
                      <thead>
                        <tr className="bg-muted/80 text-muted-foreground">
                          {["#", "Product", "Qty", "Unit Price", "Total Price", "Reason (ምክንያት)"].map(h => (
                            <th key={h} className="border px-2.5 py-1.5 text-left font-semibold">
                              {h}
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
                                <td colSpan={6} className="border px-4 py-6 text-center text-xs text-muted-foreground italic">
                                  No item records found for this voucher.
                                </td>
                              </tr>
                            );
                          }
                          return safeItems.map((item, i) => (
                            <tr key={i} className={i % 2 === 0 ? "bg-card" : "bg-muted/20"}>
                              <td className="border px-2.5 py-1.5 text-center text-muted-foreground w-8">{i + 1}</td>
                              <td className="border px-2.5 py-1.5 font-medium">
                                <div>{item.productName}</div>
                                {item.productCode && <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>}
                              </td>
                              <td className="border px-2.5 py-1.5 text-center font-bold text-slate-900 dark:text-slate-100 w-16">
                                {item.quantity}
                              </td>
                              <td className="border px-2.5 py-1.5 text-right font-medium w-24">
                                {fmt(item.unitPrice)}
                              </td>
                              <td className="border px-2.5 py-1.5 text-right font-bold text-slate-900 dark:text-slate-100 w-28">
                                {fmt(item.totalPrice)}
                              </td>
                              <td className="border px-2.5 py-1.5 text-xs text-muted-foreground">
                                {item.reason || "—"}
                              </td>
                            </tr>
                          ));
                        })()}
                      </tbody>
                      <tfoot className="bg-muted/40 font-bold border-t">
                        <tr>
                          <td colSpan={4} className="border px-2.5 py-2 text-right">
                            Grand Total (ጠቅላላ ዋጋ):
                          </td>
                          <td className="border px-2.5 py-2 text-right text-sm font-black text-primary">
                            {fmt(showVoucher.totalAmount || 0)}
                          </td>
                          <td className="border px-2.5 py-2" />
                        </tr>
                      </tfoot>
                    </table>

                    {/* Footer */}
                    <div className="border-t pt-3 mt-3 space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between">
                        <span>Reported Store: {showVoucher.storeName}</span>
                        <span>Authorized signature: _________________</span>
                      </div>
                      <div className="flex justify-between pt-1">
                        <span>Page 1 of 1</span>
                        <span>{formatSafeDate(showVoucher.voucherDate || showVoucher.createdAt)}</span>
                      </div>
                    </div>

                    {/* Customer Digital Receipt QR Code */}
                    <div className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg">
                      <ReceiptQRCode
                        voucherId={showVoucher.voucherId}
                        voucherData={{
                          totalAmount: showVoucher.totalAmount,
                          voucherDate: toSafeIsoDate(showVoucher.voucherDate || showVoucher.createdAt),
                          storeName: showVoucher.storeName,
                          customerName: showVoucher.customerName,
                          itemsCount: showVoucher.items?.length,
                          type: "damage_return",
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

          <DialogFooter className="flex-wrap gap-2 sm:justify-between pt-2 border-t">
            {showVoucher && (
              <ReceiptActionBar
                receiptRef={receiptRef}
                referencePhotoUrl={showVoucher.referencePhotoUrl || showVoucher.photoProofUrl}
                voucherId={showVoucher.voucherId}
                voucherTitle={`${
                  isRecordReturnIn(showVoucher)
                    ? "RETURNS IN"
                    : showVoucher.type === "damage"
                    ? "DAMAGE"
                    : "RETURNS OUT"
                } RECEIPT`}
                voucherSubtitle={`Store: ${showVoucher.storeName || ""} | Total: ${fmt(showVoucher.totalAmount || 0)}`}
                filenamePrefix={isRecordReturnIn(showVoucher) ? "return_in" : showVoucher.type === "damage" ? "damage" : "return_out"}
                totalAmount={showVoucher.totalAmount}
                customerName={showVoucher.customerName}
                storeName={showVoucher.storeName}
                voucherDate={toSafeIsoDate(showVoucher.voucherDate || showVoucher.createdAt)}
                onSharePdf={handleSharePdf}
                onShare={handleShare}
                onPrint={() => handlePrint()}
                onExportExcel={() => exportVoucherExcel(showVoucher)}
                sharing={sharing}
                sharingPdf={sharingPdf}
              />
            )}
            <Button onClick={() => setShowVoucher(null)} className="w-full sm:w-auto">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sales Picker Dialog for Returns In */}
      <Dialog open={showSalesPicker} onOpenChange={setShowSalesPicker}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden">
          <DialogHeader className="pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold">
              <RotateCcw className="w-5 h-5 text-emerald-600" />
              Return From Sold Receipt (ከተሸጠ ደረሰኝ እቃ ምረጥ)
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              እራሴ ሸጬ ወደ እኔ የተመለሱትን እቃዎች ከነበሩበት የሽያጭ ደረሰኝ በቀጥታ በመምረጥ ወደ ተመላሽ ገቢ (Returns In) ይመልሱ።
            </p>
          </DialogHeader>

          {selectedSale ? (
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 text-xs gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">
                      {selectedSale.voucherId}
                    </span>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      {selectedSale.source}
                    </Badge>
                  </div>
                  <div className="text-muted-foreground mt-1">
                    👤 Customer: <span className="font-medium text-foreground">{selectedSale.customerName || "Walk-in"}</span> | 🏬 Store: <span className="font-medium text-foreground">{selectedSale.storeName}</span> | 📅 Date: <span className="font-medium text-foreground">{formatEthDate(selectedSale.date, { short: true })}</span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedSale(null)}
                  className="h-8 text-xs shrink-0 gap-1 border-slate-300 dark:border-slate-700"
                >
                  ← Choose Different Sale
                </Button>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>Select items & return quantity (የሚመለሱትን እቃዎች እና መጠን ይምረጡ):</span>
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                    {selectedSale.items.filter(i => i.selected).length} item(s) selected
                  </span>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/70 border-b">
                      <tr>
                        <th className="p-2.5 text-center w-10">
                          <input
                            type="checkbox"
                            checked={(selectedSale.items || []).length > 0 && (selectedSale.items || []).every(i => i.selected)}
                            onChange={e => {
                              const allChecked = e.target.checked;
                              setSelectedSale({
                                ...selectedSale,
                                items: (selectedSale.items || []).map(i => ({ ...i, selected: allChecked })),
                              });
                            }}
                            className="rounded cursor-pointer"
                          />
                        </th>
                        <th className="p-2.5 text-left">Product</th>
                        <th className="p-2.5 text-center">Sold Qty</th>
                        <th className="p-2.5 text-center w-28">Return Qty</th>
                        <th className="p-2.5 text-right">Unit Price</th>
                        <th className="p-2.5 text-right">Refund Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(selectedSale.items || []).map((item, idx) => (
                        <tr key={idx} className={item.selected ? "bg-emerald-50/40 dark:bg-emerald-950/20" : "hover:bg-muted/30"}>
                          <td className="p-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={item.selected}
                              onChange={e => {
                                const newItems = [...(selectedSale.items || [])];
                                newItems[idx].selected = e.target.checked;
                                setSelectedSale({ ...selectedSale, items: newItems });
                              }}
                              className="rounded cursor-pointer"
                            />
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-foreground">{item.productName}</div>
                            {item.productCode && (
                              <div className="text-[10px] text-muted-foreground font-mono">{item.productCode}</div>
                            )}
                          </td>
                          <td className="p-2.5 text-center font-medium text-muted-foreground">
                            {item.quantity}
                          </td>
                          <td className="p-2.5 text-center">
                            <Input
                              type="number"
                              min={1}
                              max={item.quantity}
                              value={item.returnQty}
                              disabled={!item.selected}
                              onChange={e => {
                                const val = Math.max(1, Math.min(item.quantity, Number(e.target.value) || 1));
                                const newItems = [...(selectedSale.items || [])];
                                newItems[idx].returnQty = val;
                                setSelectedSale({ ...selectedSale, items: newItems });
                              }}
                              className="w-20 h-7 text-xs mx-auto text-center font-bold"
                            />
                          </td>
                          <td className="p-2.5 text-right font-medium">
                            {fmt(item.unitPrice)}
                          </td>
                          <td className="p-2.5 text-right font-bold text-emerald-700 dark:text-emerald-300">
                            {fmt(item.unitPrice * (item.selected ? item.returnQty : 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <DialogFooter className="gap-2 sm:justify-between pt-3 border-t">
                <Button variant="outline" size="sm" onClick={() => setSelectedSale(null)}>
                  Back
                </Button>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold"
                  disabled={(selectedSale.items || []).filter(i => i.selected && i.returnQty > 0).length === 0}
                  onClick={applyReturnFromSelectedSale}
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  Apply Returns In ({(selectedSale.items || []).filter(i => i.selected && i.returnQty > 0).length} Items)
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4 py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search sales by Voucher ID, Customer name, Store, or Product..."
                  value={salesSearch}
                  onChange={e => setSalesSearch(e.target.value)}
                  className="pl-9 text-xs h-9"
                />
              </div>

              {salesLoading ? (
                <div className="space-y-2 py-4">
                  {[...Array(4)].map((_, i) => (
                    <Skeleton key={i} className="h-16 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {salesList
                    .filter(s => {
                      if (!salesSearch.trim()) return true;
                      const q = salesSearch.toLowerCase();
                      return (
                        s.voucherId.toLowerCase().includes(q) ||
                        (s.customerName && s.customerName.toLowerCase().includes(q)) ||
                        (s.storeName && s.storeName.toLowerCase().includes(q)) ||
                        (s.items || []).some(
                          i =>
                            i.productName.toLowerCase().includes(q) ||
                            (i.productCode && i.productCode.toLowerCase().includes(q))
                        )
                      );
                    })
                    .slice(0, 30)
                    .map(sale => (
                      <div
                        key={sale.id}
                        className="p-3 border rounded-xl hover:border-emerald-500 hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                        onClick={() => handleSelectSaleForReturn(sale)}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-primary">{sale.voucherId}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase">
                              {sale.source}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground">
                              {formatEthDate(sale.date, { short: true })}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-foreground flex items-center gap-2">
                            <span>👤 {sale.customerName || "Walk-in Customer"}</span>
                            <span className="text-muted-foreground font-normal">| 🏬 {sale.storeName}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground line-clamp-1">
                            Items: {(sale.items || []).map(i => `${i.productName} (${i.quantity})`).join(", ")}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                          <div className="text-right">
                            <div className="font-bold text-xs text-slate-900 dark:text-slate-100">
                              {fmt(sale.totalAmount || 0)}
                            </div>
                            <div className="text-[10px] text-muted-foreground">{(sale.items || []).length} item(s)</div>
                          </div>
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 gap-1"
                          >
                            Select <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}

                  {salesList.length === 0 && !salesLoading && (
                    <div className="text-center py-10 text-muted-foreground text-xs">
                      No sales records found.
                    </div>
                  )}
                </div>
              )}

              <DialogFooter className="pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => setShowSalesPicker(false)}>
                  Cancel
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {DeleteAuthDialog}
    </div>
  );
}
