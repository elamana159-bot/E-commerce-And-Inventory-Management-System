import { useState, useEffect, useRef } from "react";
import { fmt } from "@/lib/currency";
import {
  Plus, Search, Trash2, Eye, Printer, Share2, CheckCircle, PackageCheck, FileText,
  XCircle, Package, Pencil, ChevronDown, MoreHorizontal, Ban, AlertTriangle, ArrowRight,
  Boxes, RefreshCw, ShoppingCart, Layers, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAll, create, update, subscribeCollection, COLLECTIONS, generateVoucherId, generateSerialVoucherId } from "@/lib/firestore";
import { useAuth } from "@/lib/auth";
import { shareAsImage, shareAsPdf, exportToExcel } from "@/lib/shareImage";
import { computeStockBalances } from "@/lib/stockUtils";
import type { Product, Store, StoreRequest, StoreRequestItem, Transfer, Category } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { ReceiptActionBar } from "@/components/ReceiptActionBar";
import { HabeshaDatePicker } from "@/components/HabeshaDatePicker";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { toSafeDateOrToday, formatSafeDate, toSafeIsoDate, safeDateSort } from "@/lib/dateUtils";
import { VoucherAuditSection, AuditStatusBadge, ReceiptCheckedByLine, performQuickAudit } from "@/components/VoucherAuditSection";
import { ReceiptWithReferenceView } from "@/components/ReceiptWithReferenceView";

function toDate(val: unknown): Date {
  return toSafeDateOrToday(val);
}

function fmtDate(val: unknown): string {
  return formatSafeDate(val);
}

const statusColor: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-blue-100 text-blue-800",
  received: "bg-green-100 text-green-800",
  voided: "bg-red-100 text-red-800",
};

/** Format stock into cartons and pieces */
function formatStockDisplay(totalPcs: number, qpc: number = 1): string {
  if (!qpc || qpc <= 1) {
    return `${totalPcs} pcs`;
  }
  const ctns = Math.floor(totalPcs / qpc);
  const pcs = totalPcs % qpc;
  if (ctns > 0 && pcs > 0) {
    return `${ctns} ctn + ${pcs} pcs (${totalPcs} pcs)`;
  }
  if (ctns > 0) {
    return `${ctns} ctn (${totalPcs} pcs)`;
  }
  return `${pcs} pcs`;
}

/** Format requested item quantity into readable carton + pcs */
function formatRequestedDisplay(it: StoreRequestItem): string {
  const qpc = it.quantityPerCarton || 1;
  const ctns = it.cartons ?? (it.sellByCarton ? Math.floor(it.quantity / qpc) : 0);
  const loosePcs = it.loosePieces ?? (it.sellByCarton ? it.quantity % qpc : it.quantity);
  const total = it.quantity || (ctns * qpc + loosePcs);

  if (qpc > 1) {
    if (ctns > 0 && loosePcs > 0) {
      return `${ctns} ctn + ${loosePcs} pcs (${total} pcs)`;
    }
    if (ctns > 0) {
      return `${ctns} ctn (${total} pcs)`;
    }
    return `${loosePcs} pcs`;
  }
  return `${total} pcs`;
}

export default function StoreRequests() {
  const { user, isAdmin, isAuditor, canAudit, registeredAuditors, activeAuditorName } = useAuth();
  const [requests, setRequests] = useState<StoreRequest[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingRequest, setEditingRequest] = useState<StoreRequest | null>(null);
  const [showVoucher, setShowVoucher] = useState<StoreRequest | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, Record<string, number>>>({});
  const [allStoresStockMap, setAllStoresStockMap] = useState<Record<string, Record<string, number>>>({});
  const [allStoresLoading, setAllStoresLoading] = useState(false);

  const [fromStoreId, setFromStoreId] = useState("");
  const [toStoreId, setToStoreId] = useState("");
  const [remark, setRemark] = useState("");
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().slice(0, 10));
  const [formVoucherId, setFormVoucherId] = useState("");
  const [items, setItems] = useState<StoreRequestItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [catalogFilterTab, setCatalogFilterTab] = useState<"available" | "low_destination" | "all">("available");

  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => printElement(receiptRef.current, `StoreRequest_${showVoucher?.voucherId || ""}`);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  async function handleShare() {
    if (!receiptRef.current) return;
    setSharing(true);
    try {
      const r = await shareAsImage(receiptRef.current, `store_request_${showVoucher?.voucherId || "receipt"}.png`);
      if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    } catch {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  async function handleSharePdf() {
    if (!receiptRef.current) return;
    setSharingPdf(true);
    try {
      const r = await shareAsPdf(receiptRef.current, `store_request_${showVoucher?.voucherId || "receipt"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingPdf(false);
    }
  }

  async function exportExcel(req: StoreRequest) {
    setExportingExcel(true);
    try {
      const data = [
        ["STORE REQUEST VOUCHER"],
        ["Voucher ID", req.voucherId || "—"],
        ["From Store", req.fromStoreName || "—"],
        ["To Store", req.toStoreName || "—"],
        ["Date", req.voucherDate || "—"],
        ["Status", req.status?.toUpperCase() || "—"],
        ["Requested By", req.createdByName || "—"],
        ["Approved By", req.approvedBy || "—"],
        ["Received By", req.receivedBy || "—"],
        ["Remark", req.remark || ""],
        [],
        ["No.", "Product Name", "Product Code", "Category", "Requested Qty (pcs)"],
        ...(req.items || []).map((it, idx) => [
          idx + 1,
          it.productName,
          it.productCode || "",
          it.categoryName || "",
          it.quantity || 0,
        ]),
        [],
        ["", "", "", "TOTAL REQUESTED (pcs):", (req.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0)],
      ];

      const res = await exportToExcel({
        data,
        sheetName: "Store Request",
        filename: `${req.voucherId || "store_request"}.xlsx`,
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

  async function loadData() {
    setLoading(true);
    const [reqs, prods, sts, cats] = await Promise.all([
      getAll<StoreRequest>(COLLECTIONS.STORE_REQUESTS),
      getAll<Product>(COLLECTIONS.PRODUCTS),
      getAll<Store>(COLLECTIONS.STORES),
      getAll<Category>(COLLECTIONS.CATEGORIES),
    ]);
    const safeReqs = (reqs || []).map(r => ({
      ...r,
      items: Array.isArray(r.items) ? r.items : [],
    }));
    setRequests(safeReqs.sort((a, b) => safeDateSort(a.voucherDate || a.createdAt, b.voucherDate || b.createdAt, "desc")));
    setProducts(prods.filter(p => !p.isVoided));
    setStores(sts.filter(s => !s.isVoided));
    setCategories(cats.filter(c => !c.isVoided));
    setLoading(false);
  }

  async function loadStockForStore(storeId: string) {
    if (stockMap[storeId]) return;
    const balances = await computeStockBalances(storeId);
    setStockMap(prev => ({ ...prev, [storeId]: Object.fromEntries(Object.entries(balances).map(([pid, b]) => [pid, b.quantity])) }));
  }

  async function loadAllStoresStock() {
    if (stores.length === 0) return;
    setAllStoresLoading(true);
    try {
      const results = await Promise.all(stores.map(async s => {
        const bal = await computeStockBalances(s.id);
        return { storeId: s.id, qtys: Object.fromEntries(Object.entries(bal).map(([pid, b]) => [pid, b.quantity])) };
      }));
      const map: Record<string, Record<string, number>> = {};
      for (const r of results) map[r.storeId] = r.qtys;
      setAllStoresStockMap(map);
      // also prime stockMap for from/to stores
      setStockMap(prev => {
        const next = { ...prev };
        for (const r of results) if (!next[r.storeId]) next[r.storeId] = r.qtys;
        return next;
      });
    } finally {
      setAllStoresLoading(false);
    }
  }

  useEffect(() => {
    loadData();

    const unsub = subscribeCollection<StoreRequest>(COLLECTIONS.STORE_REQUESTS, (data) => {
      const safe = (data || []).map(r => ({
        ...r,
        items: Array.isArray(r.items) ? r.items : [],
      }));
      setRequests(safe.sort((a, b) => safeDateSort(a.voucherDate || a.createdAt, b.voucherDate || b.createdAt, "desc")));
    });

    return () => {
      unsub();
    };
  }, []);
  useEffect(() => { if (fromStoreId) loadStockForStore(fromStoreId); }, [fromStoreId]);
  useEffect(() => { if (toStoreId) loadStockForStore(toStoreId); }, [toStoreId]);
  useEffect(() => {
    if (toStoreId && fromStoreId && showForm) loadAllStoresStock();
  }, [toStoreId, fromStoreId, showForm]);

  const filtered = requests.filter(r =>
    r.voucherId?.toLowerCase().includes(search.toLowerCase()) ||
    r.fromStoreName?.toLowerCase().includes(search.toLowerCase()) ||
    r.toStoreName?.toLowerCase().includes(search.toLowerCase())
  );

  function resetForm() {
    setFromStoreId("");
    setToStoreId("");
    setRemark("");
    setItems([]);
    setProductSearch("");
    setSelectedCategory("all");
    setCatalogFilterTab("available");
    setEditingRequest(null);
    setFormVoucherId("");
    setVoucherDate(new Date().toISOString().slice(0, 10));
  }

  async function openNew() {
    resetForm();
    setShowForm(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const nextId = await generateSerialVoucherId("REQ", today);
      setVoucherDate(today);
      setFormVoucherId(nextId);
    } catch {}
  }

  function openEdit(req: StoreRequest) {
    setEditingRequest(req);
    setFormVoucherId(req.voucherId || "");
    setFromStoreId(req.fromStoreId);
    setToStoreId(req.toStoreId);
    setRemark(req.remark || "");
    setVoucherDate(req.voucherDate || new Date().toISOString().slice(0, 10));

    // Normalize items with cartons & loosePieces
    const normalizedItems: StoreRequestItem[] = (req.items || []).map(it => {
      const qpc = it.quantityPerCarton || 1;
      let ctns = it.cartons;
      let pcs = it.loosePieces;
      if (ctns === undefined || pcs === undefined) {
        if (it.sellByCarton && qpc > 1) {
          ctns = Math.floor(it.quantity / qpc);
          pcs = it.quantity % qpc;
        } else {
          ctns = 0;
          pcs = it.quantity;
        }
      }
      return {
        ...it,
        cartons: ctns,
        loosePieces: pcs,
        quantity: (ctns * qpc) + pcs,
        sellByCarton: ctns > 0,
      };
    });

    setItems(normalizedItems);
    setShowForm(true);
  }

  function addOrUpdateProduct(prod: Product, addCartons: number = 0, addPieces: number = 0) {
    const fromQty = stockMap[fromStoreId]?.[prod.id] ?? allStoresStockMap[fromStoreId]?.[prod.id] ?? 0;
    const toQty = stockMap[toStoreId]?.[prod.id] ?? allStoresStockMap[toStoreId]?.[prod.id] ?? 0;
    const qpc = prod.quantityPerCarton || 1;

    setItems(prev => {
      const existingIdx = prev.findIndex(i => i.productId === prod.id);
      if (existingIdx >= 0) {
        return prev.map((it, idx) => {
          if (idx !== existingIdx) return it;
          const currentCtns = it.cartons ?? 0;
          const currentPcs = it.loosePieces ?? 0;
          const newCtns = Math.max(0, currentCtns + addCartons);
          const newPcs = Math.max(0, currentPcs + addPieces);
          const totalQty = (newCtns * qpc) + newPcs;
          return {
            ...it,
            availableQtyFrom: fromQty,
            availableQtyTo: toQty,
            cartons: newCtns,
            loosePieces: newPcs,
            quantity: totalQty,
            sellByCarton: newCtns > 0,
          };
        });
      }

      // Initial defaults if 0 cartons & 0 pcs passed
      let initCtns = addCartons;
      let initPcs = addPieces;
      if (addCartons === 0 && addPieces === 0) {
        if (qpc > 1 && fromQty >= qpc) {
          initCtns = 1;
          initPcs = 0;
        } else {
          initCtns = 0;
          initPcs = 1;
        }
      }
      const total = (initCtns * qpc) + initPcs;

      return [...prev, {
        productId: prod.id,
        productName: prod.name,
        productCode: prod.code,
        photoUrl: prod.photoUrl || "",
        categoryName: prod.categoryName || "",
        quantityPerCarton: qpc,
        availableQtyFrom: fromQty,
        availableQtyTo: toQty,
        price: prod.sellingPrice || prod.piecePrice || 0,
        cartons: initCtns,
        loosePieces: initPcs,
        quantity: total,
        sellByCarton: initCtns > 0,
      }];
    });
  }

  function updateItemCartons(idx: number, val: number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const cleanCtns = Math.max(0, val);
      const qpc = it.quantityPerCarton || 1;
      const pcs = it.loosePieces ?? 0;
      const total = (cleanCtns * qpc) + pcs;
      return {
        ...it,
        cartons: cleanCtns,
        quantity: total,
        sellByCarton: cleanCtns > 0,
      };
    }));
  }

  function updateItemPieces(idx: number, val: number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const cleanPcs = Math.max(0, val);
      const qpc = it.quantityPerCarton || 1;
      const ctns = it.cartons ?? 0;
      const total = (ctns * qpc) + cleanPcs;
      return {
        ...it,
        loosePieces: cleanPcs,
        quantity: total,
        sellByCarton: ctns > 0,
      };
    }));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (!fromStoreId || !toStoreId) {
        toast({ title: "Select both From Store and To Store", variant: "destructive" });
        return;
      }
      if (fromStoreId === toStoreId) {
        toast({ title: "From Store and To Store must be different", variant: "destructive" });
        return;
      }
      if (items.length === 0) {
        toast({ title: "Please add at least one product to the request", variant: "destructive" });
        return;
      }

      for (const it of items) {
        const actualQty = it.quantity;
        if (actualQty <= 0) {
          toast({ title: `Please enter a valid quantity for ${it.productName}`, variant: "destructive" });
          return;
        }
      }

      const fromStore = stores.find(s => s.id === fromStoreId)!;
      const toStore = stores.find(s => s.id === toStoreId)!;

      const normalizedItems: StoreRequestItem[] = items.map(it => {
        const qpc = it.quantityPerCarton || 1;
        const ctns = it.cartons ?? (it.sellByCarton ? Math.floor(it.quantity / qpc) : 0);
        const pcs = it.loosePieces ?? (it.sellByCarton ? it.quantity % qpc : it.quantity);
        return {
          ...it,
          cartons: ctns,
          loosePieces: pcs,
          quantity: (ctns * qpc) + pcs,
          sellByCarton: ctns > 0,
        };
      });

      if (editingRequest) {
        await update(COLLECTIONS.STORE_REQUESTS, editingRequest.id, {
          fromStoreId,
          fromStoreName: fromStore.name,
          toStoreId,
          toStoreName: toStore.name,
          items: normalizedItems,
          remark,
          voucherDate,
        } as Record<string, unknown>);
        toast({ title: "Request updated successfully" });
      } else {
        const voucherId = formVoucherId.trim() || (await generateSerialVoucherId("REQ", voucherDate));
        const reqDoc: Omit<StoreRequest, "id"> = {
          voucherId,
          fromStoreId,
          fromStoreName: fromStore.name,
          toStoreId,
          toStoreName: toStore.name,
          items: normalizedItems,
          status: "pending",
          remark,
          voucherDate,
          createdByName: user?.name || "Unknown",
        };
        const newId = await create(COLLECTIONS.STORE_REQUESTS, reqDoc as Record<string, unknown>);
        toast({ title: "Store Request created", description: voucherId });
        setShowForm(false);
        resetForm();
        await loadData();
        setShowVoucher({ ...reqDoc, id: newId } as StoreRequest);
        return;
      }
      setShowForm(false);
      resetForm();
      await loadData();
    } catch {
      toast({ title: "Failed to save request", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove(req: StoreRequest) {
    if (!isAdmin) return;
    await update(COLLECTIONS.STORE_REQUESTS, req.id, { status: "approved", approvedBy: user?.name || "Admin" });
    toast({ title: "Request approved" });
    await loadData();
  }

  async function handleReceive(req: StoreRequest) {
    try {
      await update(COLLECTIONS.STORE_REQUESTS, req.id, {
        status: "received",
        receivedBy: user?.name || "Staff",
        receivedAt: new Date()
      });

      // Create a Transfer record so stock movement reflects in Transfers module
      const transferItems = (req.items || []).map(it => {
        const totalQty = it.quantity;
        return {
          productId: it.productId,
          productName: it.productName,
          productCode: it.productCode,
          photoUrl: it.photoUrl || "",
          quantityPerCarton: it.quantityPerCarton,
          availableQty: it.availableQtyFrom,
          price: it.price || 0,
          quantity: totalQty,
          sellByCarton: it.sellByCarton,
        };
      });

      const transferDoc: Omit<Transfer, "id"> = {
        voucherId: generateVoucherId("TRF"),
        fromStoreId: req.fromStoreId,
        fromStoreName: req.fromStoreName,
        toStoreId: req.toStoreId,
        toStoreName: req.toStoreName,
        items: transferItems,
        status: "active",
      };
      await create(COLLECTIONS.TRANSFERS, transferDoc as Record<string, unknown>);

      toast({ title: "Stock received & transfer record created" });
      setShowVoucher(null);
      await loadData();
    } catch {
      toast({ title: "Failed to mark received", variant: "destructive" });
    }
  }

  async function handleVoid(req: StoreRequest) {
    if (!confirm("Are you sure you want to void this store request?")) return;
    await update(COLLECTIONS.STORE_REQUESTS, req.id, { isVoided: true, status: "voided" });
    toast({ title: "Request voided" });
    await loadData();
  }

  // Summary computations for current request items
  const totalCartonsRequested = items.reduce((acc, it) => acc + (it.cartons || 0), 0);
  const totalLoosePiecesRequested = items.reduce((acc, it) => acc + (it.loosePieces || 0), 0);
  const totalNetPiecesRequested = items.reduce((acc, it) => acc + (it.quantity || 0), 0);
  const hasOverStockItem = items.some(it => it.quantity > it.availableQtyFrom);

  // Filter products for the interactive catalog section
  const toStoreObj = stores.find(s => s.id === toStoreId);
  const isToStoreBranch = (toStoreObj?.level || "").toLowerCase().includes("branch");

  const catalogProducts = products.filter(p => {
    // Search query match
    if (productSearch) {
      const q = productSearch.toLowerCase();
      const match = (p.name || "").toLowerCase().includes(q) ||
        (p.code || "").toLowerCase().includes(q) ||
        Boolean(p.barcodeValue && p.barcodeValue.toLowerCase().includes(q));
      if (!match) return false;
    }
    // Category match
    if (selectedCategory !== "all" && p.categoryId !== selectedCategory) {
      return false;
    }

    const fromQty = stockMap[fromStoreId]?.[p.id] ?? allStoresStockMap[fromStoreId]?.[p.id] ?? 0;
    const toQty = stockMap[toStoreId]?.[p.id] ?? allStoresStockMap[toStoreId]?.[p.id] ?? 0;
    const qpc = p.quantityPerCarton || 1;

    if (catalogFilterTab === "available") {
      return fromQty > 0;
    }
    if (catalogFilterTab === "low_destination") {
      const threshold = isToStoreBranch ? 2 * qpc : 24;
      return toQty <= threshold;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Store Requests</h1>
          <p className="text-sm text-muted-foreground">Request products between stores with carton & piece stock tracking</p>
        </div>
        <Button onClick={openNew} data-testid="btn-new-request" className="gap-2">
          <Plus className="w-4 h-4" /> New Store Request
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search voucher, store…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Voucher</th>
                <th className="text-left px-4 py-3 font-medium">From → To</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Items</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Audit (ኦዲት)</th>
                <th className="text-left px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-12">No requests found</td></tr>
              )}
              {filtered.map(req => (
                <tr key={req.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">
                    <button
                      onClick={() => setShowVoucher({ ...req, items: Array.isArray(req.items) ? req.items : [] })}
                      className="font-bold text-primary hover:underline cursor-pointer"
                      title="Click to view request voucher"
                    >
                      {req.voucherId}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-xs">{req.fromStoreName}</div>
                    <div className="text-muted-foreground text-xs">→ {req.toStoreName}</div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {formatEthDate(req.voucherDate || req.createdAt, { short: true })}
                    </div>
                    {(req.voucherDate || req.createdAt) && (
                      <div className="text-[10px] text-muted-foreground">{toSafeIsoDate(req.voucherDate || req.createdAt, "—")}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs">{(req.items?.length || 0)} product{(req.items?.length || 0) !== 1 ? "s" : ""}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[req.status] || ""}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <AuditStatusBadge
                      isChecked={req.isChecked}
                      checkedBy={req.checkedBy}
                      canAudit={canAudit}
                      onQuickCheck={() =>
                        performQuickAudit({
                          collectionName: COLLECTIONS.STORE_REQUESTS,
                          docId: req.id,
                          currentChecked: req.isChecked,
                          isAuditor,
                          isAdmin,
                          user,
                          registeredAuditors,
                          activeAuditorName,
                          toast,
                          onSuccess: (newChecked, auditorName) => {
                            setRequests(prev => prev.map(item => item.id === req.id ? { ...item, isChecked: newChecked, checkedBy: auditorName } : item));
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-xs" data-testid={`button-actions-${req.id}`}>
                          Actions
                          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">
                          {req.voucherId}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setShowVoucher({ ...req, items: Array.isArray(req.items) ? req.items : [] })} data-testid={`button-view-${req.id}`}>
                          <Eye className="w-4 h-4 mr-2" /> View Voucher
                        </DropdownMenuItem>
                        {req.status !== "voided" && (
                          <DropdownMenuItem onClick={() => openEdit(req)} data-testid={`button-edit-${req.id}`}>
                            <Pencil className="w-4 h-4 mr-2 text-amber-600" /> Edit Request (አስተካክል)
                          </DropdownMenuItem>
                        )}
                        {isAdmin && req.status === "pending" && (
                          <DropdownMenuItem onClick={() => handleApprove(req)} className="text-blue-600 focus:text-blue-600">
                            <CheckCircle className="w-4 h-4 mr-2 text-blue-600" /> Approve Request
                          </DropdownMenuItem>
                        )}
                        {req.status === "approved" && (
                          <DropdownMenuItem onClick={() => handleReceive(req)} className="text-emerald-600 focus:text-emerald-600">
                            <PackageCheck className="w-4 h-4 mr-2 text-emerald-600" /> Mark Received
                          </DropdownMenuItem>
                        )}
                        {!req.isVoided && req.status !== "received" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleVoid(req)} className="text-destructive focus:text-destructive">
                              <XCircle className="w-4 h-4 mr-2" /> Void Request
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          NEW / EDIT STORE REQUEST DIALOG
      ───────────────────────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto max-w-5xl p-5 sm:p-6">
          <DialogHeader className="pb-2 border-b">
            <DialogTitle className="text-xl flex items-center gap-2">
              <Boxes className="w-5 h-5 text-primary" />
              {editingRequest ? "Edit Store Request" : "New Store Request"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Store Selectors & Voucher ID */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-muted/30 p-3.5 rounded-xl border">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Voucher ID
                  </Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 px-1 text-[11px] text-primary"
                    onClick={async () => {
                      const nextId = await generateSerialVoucherId("REQ", voucherDate);
                      setFormVoucherId(nextId);
                    }}
                  >
                    Auto ID
                  </Button>
                </div>
                <Input
                  value={formVoucherId}
                  onChange={e => setFormVoucherId(e.target.value)}
                  placeholder="e.g. REQ-20260911-0001"
                  className="bg-background font-mono text-xs h-9"
                  data-testid="input-req-voucher-id"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  From Store (Source)
                </Label>
                <Select value={fromStoreId} onValueChange={setFromStoreId} disabled={!!editingRequest}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select source store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.level ? `(${s.level})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {fromStoreId && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Products will be requested out of this store.
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  To Store (Destination / Requesting Store)
                </Label>
                <Select value={toStoreId} onValueChange={setToStoreId} disabled={!!editingRequest}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Select destination store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.filter(s => s.id !== fromStoreId).map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} {s.level ? `(${s.level})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {toStoreId && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Products will be received into this store upon arrival.
                  </p>
                )}
              </div>
            </div>

            {/* If stores are not selected yet */}
            {(!fromStoreId || !toStoreId) && (
              <div className="text-center py-10 border border-dashed rounded-xl bg-muted/10 text-muted-foreground space-y-2">
                <Boxes className="w-10 h-10 mx-auto opacity-40" />
                <p className="font-medium text-sm">Please select both &quot;From Store&quot; and &quot;To Store&quot; to begin requesting products.</p>
                <p className="text-xs">You will be able to enter Cartons and Pieces while comparing live balances from both stores.</p>
              </div>
            )}

            {/* ── SECTION 1: REQUESTED ITEMS LIST ── */}
            {fromStoreId && toStoreId && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-primary" />
                    <h3 className="font-semibold text-sm">
                      Requested Products ({items.length})
                    </h3>
                  </div>
                  {items.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={() => setItems([])} className="text-xs text-destructive hover:bg-destructive/10 h-7 px-2">
                      Clear All Items
                    </Button>
                  )}
                </div>

                {items.length === 0 ? (
                  <div className="border border-dashed rounded-xl p-6 text-center bg-muted/20 text-muted-foreground text-xs space-y-1">
                    <p className="font-medium text-foreground">No items added yet to this request.</p>
                    <p>Select products from the catalog below or search to specify Carton and Piece quantities.</p>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {items.map((it, idx) => {
                      const qpc = it.quantityPerCarton || 1;
                      const ctns = it.cartons ?? 0;
                      const pcs = it.loosePieces ?? 0;
                      const totalPcs = it.quantity;
                      const fromBal = it.availableQtyFrom;
                      const toBal = it.availableQtyTo;
                      const remainingFrom = fromBal - totalPcs;
                      const projectedTo = toBal + totalPcs;
                      const isOverStock = totalPcs > fromBal;

                      return (
                        <div
                          key={it.productId}
                          className={`rounded-xl border p-3.5 transition-all bg-card shadow-sm ${
                            isOverStock ? "border-red-400 bg-red-50/40 dark:bg-red-950/20" : "hover:border-primary/40"
                          }`}
                        >
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                            {/* Product Info */}
                            <div className="flex items-start gap-3 min-w-0 lg:w-1/3">
                              {it.photoUrl ? (
                                <img src={it.photoUrl} alt={it.productName} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border" />
                              ) : (
                                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 border">
                                  <Package className="w-6 h-6 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0">
                                <div className="font-semibold text-sm leading-tight text-foreground truncate">{it.productName}</div>
                                <div className="text-xs font-mono text-primary font-medium mt-0.5">{it.productCode}</div>
                                <div className="text-[11px] text-muted-foreground mt-0.5">
                                  {qpc > 1 ? `📦 1 Carton = ${qpc} Pcs` : "Single piece item"}
                                </div>
                              </div>
                            </div>

                            {/* Stock Comparison (From Store vs To Store) */}
                            <div className="grid grid-cols-2 gap-2 bg-muted/40 p-2 rounded-lg text-xs lg:w-1/3">
                              <div className="border-r pr-2">
                                <div className="text-[10px] uppercase font-bold text-blue-600 tracking-wider">From Store Stock</div>
                                <div className="font-semibold text-foreground mt-0.5">
                                  {formatStockDisplay(fromBal, qpc)}
                                </div>
                                <div className={`text-[10px] mt-1 font-medium ${remainingFrom < 0 ? "text-red-600 font-bold" : "text-muted-foreground"}`}>
                                  Remaining: {remainingFrom < 0 ? `⚠️ Short by ${Math.abs(remainingFrom)} pcs` : formatStockDisplay(remainingFrom, qpc)}
                                </div>
                              </div>

                              <div className="pl-1">
                                <div className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">To Store Current</div>
                                <div className="font-semibold text-foreground mt-0.5">
                                  {formatStockDisplay(toBal, qpc)}
                                </div>
                                <div className="text-[10px] mt-1 font-medium text-emerald-700">
                                  After Request: {formatStockDisplay(projectedTo, qpc)}
                                </div>
                              </div>
                            </div>

                            {/* Quantity Inputs (Cartons + Loose Pieces) & Remove */}
                            <div className="flex items-center gap-3 lg:w-1/3 justify-end flex-wrap sm:flex-nowrap">
                              {/* Cartons Input */}
                              {qpc > 1 && (
                                <div className="flex flex-col items-center">
                                  <span className="text-[10px] font-semibold text-muted-foreground mb-1">Cartons</span>
                                  <div className="flex items-center border rounded-lg bg-background overflow-hidden h-8">
                                    <button
                                      type="button"
                                      onClick={() => updateItemCartons(idx, ctns - 1)}
                                      className="px-2 py-1 text-xs hover:bg-muted font-bold text-muted-foreground hover:text-foreground"
                                    >
                                      -
                                    </button>
                                    <input
                                      type="number"
                                      min={0}
                                      value={ctns}
                                      onChange={e => updateItemCartons(idx, Number(e.target.value))}
                                      className="w-12 text-center text-xs font-bold border-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => updateItemCartons(idx, ctns + 1)}
                                      className="px-2 py-1 text-xs hover:bg-muted font-bold text-muted-foreground hover:text-foreground"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              )}

                              {/* Loose Pieces Input */}
                              <div className="flex flex-col items-center">
                                <span className="text-[10px] font-semibold text-muted-foreground mb-1">
                                  {qpc > 1 ? "Pieces (Pcs)" : "Quantity"}
                                </span>
                                <div className="flex items-center border rounded-lg bg-background overflow-hidden h-8">
                                  <button
                                    type="button"
                                    onClick={() => updateItemPieces(idx, pcs - 1)}
                                    className="px-2 py-1 text-xs hover:bg-muted font-bold text-muted-foreground hover:text-foreground"
                                  >
                                    -
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    value={pcs}
                                    onChange={e => updateItemPieces(idx, Number(e.target.value))}
                                    className="w-12 text-center text-xs font-bold border-0 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateItemPieces(idx, pcs + 1)}
                                    className="px-2 py-1 text-xs hover:bg-muted font-bold text-muted-foreground hover:text-foreground"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>

                              {/* Total Pcs Display */}
                              <div className="text-right min-w-[75px]">
                                <div className="text-[10px] text-muted-foreground">Total:</div>
                                <div className={`font-bold text-xs ${isOverStock ? "text-red-600" : "text-primary"}`}>
                                  {totalPcs} pcs
                                </div>
                                {qpc > 1 && ctns > 0 && (
                                  <div className="text-[10px] text-muted-foreground">
                                    ({ctns} ctn{pcs > 0 ? ` + ${pcs}p` : ""})
                                  </div>
                                )}
                              </div>

                              {/* Delete Button */}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeItem(idx)}
                                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0 flex-shrink-0"
                                title="Remove item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Overstock Warning Banner */}
                          {isOverStock && (
                            <div className="mt-2.5 flex items-center gap-1.5 text-xs text-red-600 bg-red-100/70 dark:bg-red-950/50 p-2 rounded-lg font-medium">
                              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                              <span>
                                Insufficient stock in From Store! You requested {totalPcs} pcs, but only {fromBal} pcs are available.
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Quick Summary Pill Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-xl p-3 text-xs">
                      <div className="flex items-center gap-4 flex-wrap font-medium">
                        <span>Items: <strong className="text-foreground">{items.length}</strong></span>
                        {totalCartonsRequested > 0 && (
                          <span>Total Cartons: <strong className="text-foreground">{totalCartonsRequested} ctn</strong></span>
                        )}
                        {totalLoosePiecesRequested > 0 && (
                          <span>Loose Pieces: <strong className="text-foreground">{totalLoosePiecesRequested} pcs</strong></span>
                        )}
                        <span>Total Quantity: <strong className="text-primary text-sm font-bold">{totalNetPiecesRequested} pcs</strong></span>
                      </div>

                      {hasOverStockItem ? (
                        <span className="text-red-600 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> Please adjust over-stock quantities
                        </span>
                      ) : (
                        <span className="text-emerald-600 font-semibold flex items-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Stock available in From Store
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── SECTION 2: PRODUCT CATALOG BROWSER & STOCK VIEW ── */}
            {fromStoreId && toStoreId && (
              <div className="space-y-3 pt-2 border-t">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                      <Layers className="w-4 h-4 text-primary" />
                      Browse Store Products &amp; Compare Stock
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      View products in <strong>From Store</strong> and <strong>To Store</strong> with Carton &amp; Piece balances.
                    </p>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center gap-1 bg-muted p-1 rounded-lg text-xs self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setCatalogFilterTab("available")}
                      className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                        catalogFilterTab === "available" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      In-Stock in Source
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatalogFilterTab("low_destination")}
                      className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                        catalogFilterTab === "low_destination" ? "bg-background text-amber-700 shadow-sm font-semibold" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      Low in Destination
                    </button>
                    <button
                      type="button"
                      onClick={() => setCatalogFilterTab("all")}
                      className={`px-2.5 py-1 rounded-md transition-all font-medium ${
                        catalogFilterTab === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      All Catalog
                    </button>
                  </div>
                </div>

                {/* Search & Category Filter */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="relative sm:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search product name, code, barcode…"
                      value={productSearch}
                      onChange={e => setProductSearch(e.target.value)}
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger className="h-9 text-xs">
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
                </div>

                {/* Catalog Product Cards Grid */}
                {allStoresLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
                  </div>
                ) : catalogProducts.length === 0 ? (
                  <div className="text-center py-8 border border-dashed rounded-xl text-muted-foreground text-xs">
                    No products match the selected criteria.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-96 overflow-y-auto pr-1">
                    {catalogProducts.map(prod => {
                      const fromQty = stockMap[fromStoreId]?.[prod.id] ?? allStoresStockMap[fromStoreId]?.[prod.id] ?? 0;
                      const toQty = stockMap[toStoreId]?.[prod.id] ?? allStoresStockMap[toStoreId]?.[prod.id] ?? 0;
                      const qpc = prod.quantityPerCarton || 1;
                      const existingItem = items.find(i => i.productId === prod.id);

                      return (
                        <div
                          key={prod.id}
                          className={`rounded-xl border p-2.5 flex flex-col justify-between transition-all text-xs bg-card ${
                            existingItem ? "border-primary/60 bg-primary/5 ring-1 ring-primary/20" : "hover:border-border hover:shadow-sm"
                          }`}
                        >
                          <div>
                            {/* Product Header */}
                            <div className="flex gap-2 items-start mb-2">
                              {prod.photoUrl ? (
                                <img src={prod.photoUrl} alt={prod.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 border">
                                  <Package className="w-5 h-5 text-muted-foreground" />
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="font-semibold text-xs leading-snug line-clamp-2 text-foreground">{prod.name}</div>
                                <div className="flex items-center gap-1.5 text-[10px] mt-0.5">
                                  <span className="font-mono text-primary font-bold">{prod.code}</span>
                                  {qpc > 1 && <span className="text-muted-foreground">· {qpc} pcs/ctn</span>}
                                </div>
                              </div>
                            </div>

                            {/* Dual Stock Indicators */}
                            <div className="space-y-1 bg-muted/40 p-2 rounded-lg mb-2">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-blue-700 font-medium flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> From Store:
                                </span>
                                <span className={`font-bold ${fromQty === 0 ? "text-red-500" : "text-blue-900"}`}>
                                  {formatStockDisplay(fromQty, qpc)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="text-emerald-700 font-medium flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> To Store:
                                </span>
                                <span className={`font-bold ${toQty === 0 ? "text-amber-600" : "text-emerald-900"}`}>
                                  {formatStockDisplay(toQty, qpc)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div>
                            {existingItem ? (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between bg-primary/10 text-primary px-2 py-1 rounded text-[11px] font-semibold">
                                  <span>✓ In Request:</span>
                                  <span>{formatRequestedDisplay(existingItem)}</span>
                                </div>
                                <div className="flex gap-1">
                                  {qpc > 1 && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 h-7 text-[11px] px-1"
                                      onClick={() => addOrUpdateProduct(prod, 1, 0)}
                                    >
                                      +1 Ctn
                                    </Button>
                                  )}
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="flex-1 h-7 text-[11px] px-1"
                                    onClick={() => addOrUpdateProduct(prod, 0, 1)}
                                  >
                                    +1 Pc
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex gap-1.5">
                                {qpc > 1 ? (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 h-7 text-[11px] font-medium border-blue-200 hover:bg-blue-50 text-blue-700"
                                      disabled={fromQty <= 0}
                                      onClick={() => addOrUpdateProduct(prod, 1, 0)}
                                    >
                                      +1 Ctn
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="flex-1 h-7 text-[11px] font-medium border-emerald-200 hover:bg-emerald-50 text-emerald-700"
                                      disabled={fromQty <= 0}
                                      onClick={() => addOrUpdateProduct(prod, 0, 1)}
                                    >
                                      +1 Pc
                                    </Button>
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="w-full h-7 text-[11px]"
                                    disabled={fromQty <= 0}
                                    onClick={() => addOrUpdateProduct(prod, 0, 1)}
                                  >
                                    + Add to Request
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Remark & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t">
              <div className="sm:col-span-2">
                <Label className="text-xs">Remark / Request Note (optional)</Label>
                <Input
                  value={remark}
                  onChange={e => setRemark(e.target.value)}
                  placeholder="e.g., Weekly branch replenishment, urgent stock request…"
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <HabeshaDatePicker
                  label="Request Date (ቀን)"
                  value={voucherDate}
                  onChange={async (v) => {
                    setVoucherDate(v);
                    if (!editingRequest) {
                      const nextId = await generateSerialVoucherId("REQ", v);
                      setFormVoucherId(nextId);
                    }
                  }}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 pt-3 border-t mt-4">
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || items.length === 0 || hasOverStockItem}
              className="gap-2"
            >
              {saving ? "Saving…" : editingRequest ? "Update Request" : "Submit Store Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─────────────────────────────────────────────────────────────
          STORE REQUEST VOUCHER DIALOG
      ───────────────────────────────────────────────────────────── */}
      {showVoucher && (
        <Dialog open onOpenChange={() => setShowVoucher(null)}>
          <DialogContent className={`max-h-[90vh] overflow-y-auto ${(showVoucher.referencePhotoUrl || showVoucher.photoProofUrl) ? "max-w-6xl xl:max-w-7xl" : "max-w-3xl"}`}>
            <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" /> Store Request Voucher
              </DialogTitle>
              {showVoucher && showVoucher.status !== "voided" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-amber-700 hover:text-amber-800 dark:text-amber-400"
                  onClick={() => {
                    const reqToEdit = showVoucher;
                    setShowVoucher(null);
                    openEdit(reqToEdit);
                  }}
                >
                  <Pencil className="w-4 h-4" /> Edit Request (አስተካክል)
                </Button>
              )}
            </DialogHeader>

            <ReceiptWithReferenceView
              referencePhotoUrl={showVoucher.referencePhotoUrl || showVoucher.photoProofUrl}
              voucherId={showVoucher.voucherId}
            >
              <div className="space-y-4">
                <div ref={receiptRef} className="receipt-a4 space-y-4 p-4 text-sm bg-white dark:bg-card">
                  <div className="text-center border-b pb-4">
                    <h2 className="text-xl font-bold tracking-tight">STORE REQUEST VOUCHER</h2>
                    <p className="text-sm font-mono font-bold text-primary">{showVoucher.voucherId}</p>
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                      {formatEthDate(showVoucher.voucherDate || showVoucher.createdAt, { includeGregorian: true })}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm bg-muted/20 p-3 rounded-lg border">
                    <div>
                      <span className="font-semibold text-xs text-muted-foreground uppercase">From Store (Source):</span>
                      <div className="font-bold text-sm text-foreground">{showVoucher.fromStoreName}</div>
                    </div>
                    <div>
                      <span className="font-semibold text-xs text-muted-foreground uppercase">To Store (Destination):</span>
                      <div className="font-bold text-sm text-foreground">{showVoucher.toStoreName}</div>
                    </div>
                    <div>
                      <span className="font-semibold text-xs text-muted-foreground uppercase">Requested By:</span>
                      <div className="font-medium text-foreground">{showVoucher.createdByName || "—"}</div>
                    </div>
                    <div>
                      <span className="font-semibold text-xs text-muted-foreground uppercase">Status:</span>
                      <div>
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${statusColor[showVoucher.status] || ""}`}>
                          {showVoucher.status}
                        </span>
                      </div>
                    </div>
                  </div>

                  {showVoucher.remark && (
                    <div className="text-xs bg-muted/40 p-2.5 rounded border">
                      <span className="font-bold">Remark:</span> {showVoucher.remark}
                    </div>
                  )}

                  <table className="w-full text-xs border rounded-lg overflow-hidden">
                    <thead className="bg-muted/60 text-muted-foreground font-semibold">
                      <tr>
                        <th className="text-left px-3 py-2">#</th>
                        <th className="text-left px-3 py-2">Product Name</th>
                        <th className="text-left px-3 py-2">Code</th>
                        <th className="text-center px-3 py-2">Packing</th>
                        <th className="text-right px-3 py-2">Source Bal.</th>
                        <th className="text-right px-3 py-2 font-bold">Requested Quantity</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(() => {
                        const safeItems = Array.isArray(showVoucher.items) ? showVoucher.items : [];
                        if (safeItems.length === 0) {
                          return (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground italic">
                                No item records found for this voucher.
                              </td>
                            </tr>
                          );
                        }
                        return safeItems.map((it, i) => {
                          const qpc = it.quantityPerCarton || 1;
                          const requestedStr = formatRequestedDisplay(it);
                          return (
                            <tr key={i} className="hover:bg-muted/20">
                              <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                              <td className="px-3 py-2 font-medium">
                                <div className="flex items-center gap-2">
                                  {it.photoUrl && <img src={it.photoUrl} alt={it.productName} className="w-6 h-6 rounded object-cover border" />}
                                  <span>{it.productName}</span>
                                </div>
                              </td>
                              <td className="px-3 py-2 font-mono">{it.productCode}</td>
                              <td className="px-3 py-2 text-center text-muted-foreground">
                                {qpc > 1 ? `${qpc} pcs/ctn` : "Single"}
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">
                                {formatStockDisplay(it.availableQtyFrom, qpc)}
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-foreground">
                                {requestedStr}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>

                  {/* Total Requested Summary */}
                  <div className="flex justify-end pt-2">
                    <div className="bg-muted/40 p-3 rounded-lg border text-right space-y-1 text-xs min-w-[200px]">
                      <div>Total Items: <strong>{(showVoucher.items || []).length}</strong></div>
                      <div>
                        Total Pieces: <strong className="text-primary text-sm font-bold">
                          {(showVoucher.items || []).reduce((acc, it) => acc + (it.quantity || 0), 0)} pcs
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Signatures & Tracking */}
                  <div className="border-t pt-4 mt-6 grid grid-cols-3 gap-4 text-xs text-muted-foreground text-center">
                    <div className="border-t border-dashed pt-2">
                      <div className="font-semibold text-foreground">{showVoucher.createdByName || "—"}</div>
                      <div>Requested By (Staff)</div>
                    </div>
                    <div className="border-t border-dashed pt-2">
                      <div className="font-semibold text-foreground">{showVoucher.approvedBy || "—"}</div>
                      <div>Approved By (Admin)</div>
                    </div>
                    <div className="border-t border-dashed pt-2">
                      <div className="font-semibold text-foreground">{showVoucher.receivedBy || "—"}</div>
                      <div>Received By (Store)</div>
                    </div>
                  </div>

                  {/* Receipt Checked By Line */}
                  <ReceiptCheckedByLine
                    isChecked={showVoucher.isChecked}
                    checkedBy={showVoucher.checkedBy}
                    checkedAt={showVoucher.checkedAt}
                  />
                </div>

                {/* Voucher Audit / Checked By Module */}
                <VoucherAuditSection
                  collectionName={COLLECTIONS.STORE_REQUESTS}
                  docId={showVoucher.id}
                  isChecked={showVoucher.isChecked}
                  checkedBy={showVoucher.checkedBy}
                  checkedAt={showVoucher.checkedAt}
                  checkedNote={showVoucher.checkedNote}
                  voucherNumber={showVoucher.voucherId}
                  onAuditChange={(newChecked, auditorName, note) => {
                    setShowVoucher(prev => prev ? { ...prev, isChecked: newChecked, checkedBy: auditorName, checkedNote: note } : null);
                    setRequests(prev => prev.map(s => s.id === showVoucher.id ? { ...s, isChecked: newChecked, checkedBy: auditorName, checkedNote: note } : s));
                  }}
                />
              </div>
            </ReceiptWithReferenceView>

            <DialogFooter className="gap-2 flex-wrap sm:justify-between">
              <ReceiptActionBar
                receiptRef={receiptRef}
                referencePhotoUrl={showVoucher?.referencePhotoUrl || showVoucher?.photoProofUrl}
                voucherId={showVoucher?.voucherId}
                voucherTitle="STORE REQUEST VOUCHER"
                voucherSubtitle={`From: ${showVoucher?.fromStoreName || ""} • To: ${showVoucher?.toStoreName || ""}`}
                filenamePrefix="store_request"
                documentType="voucher"
                onExportExcel={() => showVoucher && exportExcel(showVoucher)}
                onSharePdf={handleSharePdf}
                onShare={handleShare}
                onPrint={handlePrint}
                sharing={sharing}
                sharingPdf={sharingPdf}
                exportingExcel={exportingExcel}
              />
              <div className="flex gap-2 flex-wrap">
                {isAdmin && showVoucher.status === "pending" && (
                  <Button
                    variant="outline"
                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    onClick={() => { handleApprove(showVoucher); setShowVoucher(null); }}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" /> Approve Request
                  </Button>
                )}
                {showVoucher.status === "approved" && (
                  <Button
                    variant="outline"
                    className="text-green-600 border-green-300 hover:bg-green-50"
                    onClick={() => handleReceive(showVoucher)}
                  >
                    <PackageCheck className="w-4 h-4 mr-2" /> Mark Received
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setShowVoucher(null)}>Close</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

