import { useState, useEffect, useRef } from "react";
import { fmt } from "@/lib/currency";
import { Plus, Search, Eye, Trash2, Printer, Share2, XCircle, Package, CheckCircle, FileText, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { getAll, create, update, COLLECTIONS, generateVoucherId, generateSerialVoucherId, subscribeCollection } from "@/lib/firestore";
import { useAuth } from "@/lib/auth";
import { shareAsImage, shareAsPdf } from "@/lib/shareImage";
import { computeStockBalances } from "@/lib/stockUtils";
import { postDirectSaleJournalEntry, voidJournalEntryByReference } from "@/lib/accountingEngine";
import type { Product, Store, DirectSale, DirectSaleItem, PricingRecord } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { ReceiptQRCode } from "@/components/ReceiptQRCode";
import { ReceiptActionBar } from "@/components/ReceiptActionBar";
import { HabeshaDatePicker } from "@/components/HabeshaDatePicker";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { toSafeDateOrToday, formatSafeDate, toSafeIsoDate, safeDateSort, todayIsoDate } from "@/lib/dateUtils";
import { VoucherAuditSection, AuditStatusBadge, ReceiptCheckedByLine, performQuickAudit } from "@/components/VoucherAuditSection";

function toDate(val: unknown): Date {
  return toSafeDateOrToday(val);
}
function fmtDate(val: unknown): string {
  return formatSafeDate(val);
}

const statusColor: Record<string, string> = {
  active: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  voided: "bg-red-100 text-red-700",
};

export default function DirectSales() {
  const [sales, setSales] = useState<DirectSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showVoucher, setShowVoucher] = useState<DirectSale | null>(null);
  const [saving, setSaving] = useState(false);
  const [stockMap, setStockMap] = useState<Record<string, number>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [storeId, setStoreId] = useState("");
  const [remark, setRemark] = useState("");
  const [voucherDate, setVoucherDate] = useState(new Date().toISOString().slice(0, 10));
  const [voucherIdInput, setVoucherIdInput] = useState("");
  const [items, setItems] = useState<DirectSaleItem[]>([]);
  const [productSearch, setProductSearch] = useState("");

  const { toast } = useToast();
  const { user, isAdmin, isAuditor, canAudit, registeredAuditors, activeAuditorName } = useAuth();
  const [sharing, setSharing] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const receiptRef = useRef<HTMLDivElement>(null);
  function handlePrint() {
    if (!receiptRef.current) return;
    printElement(receiptRef.current, "Direct_Sale_Receipt");
  }
  async function handleShare() {
    if (!receiptRef.current) return;
    setSharing(true);
    const r = await shareAsImage(receiptRef.current, "direct_sale_receipt.png");
    if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    setSharing(false);
  }
  async function handleSharePdf() {
    if (!receiptRef.current) return;
    setSharingPdf(true);
    const r = await shareAsPdf(receiptRef.current, "direct_sale_receipt.pdf");
    if (r === "failed") toast({ title: "PDF share failed", variant: "destructive" });
    setSharingPdf(false);
  }

  async function loadData() {
    setLoading(true);
    const [sls, prods, sts, prs] = await Promise.all([
      getAll<DirectSale>(COLLECTIONS.DIRECT_SALES),
      getAll<Product>(COLLECTIONS.PRODUCTS),
      getAll<Store>(COLLECTIONS.STORES),
      getAll<PricingRecord>(COLLECTIONS.PRICING),
    ]);
    const safeSales = (sls || []).map(s => ({
      ...s,
      items: Array.isArray(s.items) ? s.items : [],
    }));
    setSales(safeSales.sort((a, b) => safeDateSort(a.voucherDate || a.createdAt, b.voucherDate || b.createdAt, "desc")));
    setProducts(prods.filter(p => !p.isVoided));
    setStores(sts.filter(s => !s.isVoided));
    setPricing(prs);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const unsubSales = subscribeCollection<DirectSale>(COLLECTIONS.DIRECT_SALES, (data) => {
      const safeData = (data || []).map(s => ({
        ...s,
        items: Array.isArray(s.items) ? s.items : [],
      }));
      setSales(safeData.sort((a, b) => safeDateSort(a.voucherDate || a.createdAt, b.voucherDate || b.createdAt, "desc")));
    });
    const unsubProds = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, (p) => setProducts(p.filter(x => !x.isVoided)));
    const unsubStores = subscribeCollection<Store>(COLLECTIONS.STORES, (s) => setStores(s.filter(x => !x.isVoided)));
    const unsubPricing = subscribeCollection<PricingRecord>(COLLECTIONS.PRICING, setPricing);

    return () => {
      unsubSales();
      unsubProds();
      unsubStores();
      unsubPricing();
    };
  }, []);

  async function loadStockForStore(sid: string) {
    const balances = await computeStockBalances(sid);
    setStockMap(Object.fromEntries(Object.entries(balances).map(([pid, b]) => [pid, b.quantity])));
  }

  useEffect(() => { if (storeId) loadStockForStore(storeId); }, [storeId]);

  const filtered = sales.filter(s =>
    s.voucherId?.toLowerCase().includes(search.toLowerCase()) ||
    s.storeName?.toLowerCase().includes(search.toLowerCase()) ||
    s.soldByName?.toLowerCase().includes(search.toLowerCase())
  );

  function resetForm() {
    setEditingId(null);
    setStoreId("");
    setRemark("");
    setVoucherDate(todayIsoDate());
    setVoucherIdInput("");
    setItems([]);
    setProductSearch("");
  }
  async function openNew() {
    resetForm();
    setShowForm(true);
    try {
      const today = todayIsoDate();
      const nextId = await generateSerialVoucherId("DS", today);
      setVoucherDate(today);
      setVoucherIdInput(nextId);
    } catch {}
  }

  function openEdit(sale: DirectSale) {
    setEditingId(sale.id);
    setVoucherIdInput(sale.voucherId || "");
    setStoreId(sale.storeId);
    setRemark(sale.remark || "");
    setVoucherDate(sale.voucherDate || toSafeIsoDate(sale.createdAt, todayIsoDate()));
    setItems((sale.items || []).map(it => ({ ...it })));
    setProductSearch("");
    setShowForm(true);
  }

  const filteredProducts = products.filter(p =>
    Boolean(p) &&
    ((p.name || "").toLowerCase().includes(productSearch.toLowerCase()) || (p.code || "").toLowerCase().includes(productSearch.toLowerCase())) &&
    !items.find(i => i.productId === p.id)
  ).slice(0, 8);

  function getDefaultPrice(productId: string) {
    return pricing.find(p => p.productId === productId)?.sellingPrice || 0;
  }

  function addProduct(prod: Product) {
    setItems(prev => [...prev, {
      productId: prod.id, productName: prod.name, productCode: prod.code,
      photoUrl: prod.photoUrl || "", quantityPerCarton: prod.quantityPerCarton,
      quantity: 1, sellByCarton: false,
      unitPrice: getDefaultPrice(prod.id),
      totalPrice: getDefaultPrice(prod.id),
    }]);
    setProductSearch("");
  }

  function updateItem(idx: number, field: string, value: number | boolean) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      const qty = updated.sellByCarton ? updated.quantity * updated.quantityPerCarton : updated.quantity;
      updated.totalPrice = qty * updated.unitPrice;
      return updated;
    }));
  }

  function toggleCarton(idx: number) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, sellByCarton: !it.sellByCarton, quantity: 1 };
      const qty = updated.sellByCarton ? updated.quantityPerCarton : 1;
      updated.totalPrice = qty * updated.unitPrice;
      return updated;
    }));
  }

  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  const total = items.reduce((s, i) => s + i.totalPrice, 0);

  async function handleSave() {
    if (!storeId) { toast({ title: "Select a store", variant: "destructive" }); return; }
    if (items.length === 0) { toast({ title: "Add at least one product", variant: "destructive" }); return; }

    const oldSale = editingId ? sales.find(s => s.id === editingId) : null;
    const oldItemsMap: Record<string, number> = {};
    if (oldSale && oldSale.status !== "voided" && oldSale.storeId === storeId) {
      for (const oldIt of oldSale.items || []) {
        const oldQty = oldIt.sellByCarton ? (oldIt.quantity || 0) * (oldIt.quantityPerCarton || 1) : (oldIt.quantity || 0);
        oldItemsMap[oldIt.productId] = (oldItemsMap[oldIt.productId] || 0) + oldQty;
      }
    }

    for (const it of items) {
      const actualQty = it.sellByCarton ? it.quantity * (it.quantityPerCarton || 1) : it.quantity;
      const currentAvailable = stockMap[it.productId] || 0;
      const originalInThisSale = oldItemsMap[it.productId] || 0;
      const effectiveAvailable = currentAvailable + originalInThisSale;

      if (actualQty > effectiveAvailable) {
        toast({
          title: `Insufficient stock for ${it.productName}`,
          description: `Available: ${effectiveAvailable} pcs (${originalInThisSale} in original sale + ${currentAvailable} in stock), requested: ${actualQty} pcs`,
          variant: "destructive"
        });
        return;
      }
    }

    setSaving(true);
    try {
      const store = stores.find(s => s.id === storeId)!;
      if (editingId) {
        await update(COLLECTIONS.DIRECT_SALES, editingId, {
          voucherId: voucherIdInput.trim() || oldSale?.voucherId || (await generateSerialVoucherId("DS", voucherDate)),
          storeId,
          storeName: store.name,
          items,
          totalAmount: total,
          voucherDate,
          remark,
        } as Record<string, unknown>);
        toast({ title: "Sale updated" });
      } else {
        const voucherId = voucherIdInput.trim() || (await generateSerialVoucherId("DS", voucherDate));
        const doc: Omit<DirectSale, "id"> = {
          voucherId, storeId, storeName: store.name,
          soldByName: user?.name || "Unknown",
          items, totalAmount: total,
          voucherDate,
          remark, status: "active",
          createdByName: user?.name || "",
        };
        const newId = await create(COLLECTIONS.DIRECT_SALES, doc as Record<string, unknown>);
        postDirectSaleJournalEntry({ ...doc, id: newId } as DirectSale).catch(err => console.warn("Automatic journal entry error:", err));
        toast({ title: "Sale recorded", description: voucherId });
      }
      setShowForm(false); resetForm(); await loadData();
    } catch { toast({ title: "Failed", variant: "destructive" }); } finally { setSaving(false); }
  }

  async function handleVoid(sale: DirectSale) {
    if (!confirm(`Void sale ${sale.voucherId}? Stock will be restored.`)) return;
    await update(COLLECTIONS.DIRECT_SALES, sale.id, { isVoided: true, status: "voided" });
    voidJournalEntryByReference(sale.voucherId || sale.id).catch(err => console.warn(err));
    toast({ title: "Voided — stock restored" }); await loadData();
  }

  async function handleApprove(sale: DirectSale) {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const posVoucherId = await generateSerialVoucherId("POS");

      // Build POS sale items from direct sale items
      const posItems = (sale.items || []).map(it => ({
        productId: it.productId, productName: it.productName, productCode: it.productCode,
        photoUrl: it.photoUrl || "", quantityPerCarton: it.quantityPerCarton,
        remainingStock: stockMap[it.productId] ?? 0,
        sellingPrice: it.unitPrice, adjustedPrice: it.unitPrice,
        sellByCarton: it.sellByCarton,
        quantity: it.sellByCarton ? it.quantity * it.quantityPerCarton : it.quantity,
        totalPrice: it.totalPrice,
      }));

      // Create POS sale
      await create(COLLECTIONS.POS_SALES, {
        voucherId: posVoucherId,
        storeId: sale.storeId, storeName: sale.storeName,
        items: posItems,
        subtotal: sale.totalAmount, totalAmount: sale.totalAmount,
        paymentMethod: "cash",
        amountPaid: sale.totalAmount, remainingBalance: 0,
        remark: `From Direct Sale: ${sale.voucherId}`,
        status: "active",
      } as Record<string, unknown>);

      // Mark direct sale as approved
      await update(COLLECTIONS.DIRECT_SALES, sale.id, {
        status: "approved",
        approvedBy: user?.name || "Admin",
        approvedAt: new Date(),
        posVoucherId,
      } as Record<string, unknown>);

      toast({ title: "Approved & added to POS", description: `POS Voucher: ${posVoucherId}` });
      setShowVoucher(null);
      await loadData();
    } catch { toast({ title: "Failed", variant: "destructive" }); } finally { setSaving(false); }
  }

  function buildShareText(s: DirectSale) {
    return [
      "DIRECT SALE VOUCHER", `Voucher: ${s.voucherId}`, `Date: ${fmtDate(s.createdAt)}`,
      `Store: ${s.storeName}`, `Sold By: ${s.soldByName}`, "",
      ...(s.items || []).map(it => {
        const qty = it.sellByCarton ? it.quantity * it.quantityPerCarton : it.quantity;
        return `• ${it.productName} [${it.productCode}]: ${it.sellByCarton ? `${it.quantity} ctn (${qty} pcs)` : `${qty} pcs`} × ${fmt(it.unitPrice)} = ${fmt(it.totalPrice)}`;
      }),
      "", `TOTAL: ${fmt(s.totalAmount)}`,
      s.approvedBy ? `\nApproved By: ${s.approvedBy}` : "",
    ].filter(l => l !== undefined).join("\n");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Direct Sales</h1>
          <p className="text-sm text-muted-foreground">Record direct product sales from store. Approve to push to POS.</p>
        </div>
        <Button onClick={openNew}><Plus className="w-4 h-4 mr-2" /> New Sale</Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search voucher, store, seller…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Voucher</th>
                <th className="text-left px-4 py-3 font-medium">Store</th>
                <th className="text-left px-4 py-3 font-medium">Sold By</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Total</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Audit (ኦዲት)</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-muted-foreground py-12">No sales yet</td></tr>
              )}
              {filtered.map(sale => (
                <tr key={sale.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-primary">{sale.voucherId}</td>
                  <td className="px-4 py-3 text-xs">{sale.storeName}</td>
                  <td className="px-4 py-3 text-xs">{sale.soldByName}</td>
                  <td className="px-4 py-3 text-xs">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {formatEthDate(sale.voucherDate || sale.createdAt, { short: true })}
                    </div>
                    {(sale.voucherDate || sale.createdAt) && (
                      <div className="text-[10px] text-muted-foreground">{toSafeIsoDate(sale.voucherDate || sale.createdAt, "—")}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(sale.totalAmount)}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[sale.status] || ""}`}>
                      {sale.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <AuditStatusBadge
                      isChecked={sale.isChecked}
                      checkedBy={sale.checkedBy}
                      canAudit={canAudit}
                      onQuickCheck={() =>
                        performQuickAudit({
                          collectionName: COLLECTIONS.DIRECT_SALES,
                          docId: sale.id,
                          currentChecked: sale.isChecked,
                          isAuditor,
                          isAdmin,
                          user,
                          registeredAuditors,
                          activeAuditorName,
                          toast,
                          onSuccess: (newChecked, auditorName) => {
                            setSales(prev => prev.map(item => item.id === sale.id ? { ...item, isChecked: newChecked, checkedBy: auditorName } : item));
                          },
                        })
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" title="View Voucher" onClick={() => setShowVoucher({ ...sale, items: Array.isArray(sale.items) ? sale.items : [] })}><Eye className="w-4 h-4" /></Button>
                      {sale.status !== "voided" && (
                        <Button size="sm" variant="ghost" title="Edit Sale (አስተካክል)" onClick={() => openEdit(sale)} className="text-amber-600 hover:text-amber-700">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      )}
                      {isAdmin && sale.status === "active" && (
                        <Button size="sm" variant="ghost" className="text-green-600" title="Approve & push to POS" onClick={() => handleApprove(sale)}>
                          <CheckCircle className="w-4 h-4" />
                        </Button>
                      )}
                      {sale.status === "active" && (
                        <Button size="sm" variant="ghost" className="text-red-500" title="Void Sale" onClick={() => handleVoid(sale)}><XCircle className="w-4 h-4" /></Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New / Edit Sale Dialog */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-4xl">
          <DialogHeader><DialogTitle>{editingId ? "Edit Direct Sale" : "New Direct Sale"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-semibold">Voucher ID</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-4 px-1 text-[11px] text-primary"
                    onClick={async () => {
                      const nextId = await generateSerialVoucherId("DS", voucherDate);
                      setVoucherIdInput(nextId);
                    }}
                  >
                    Auto ID
                  </Button>
                </div>
                <Input
                  value={voucherIdInput}
                  onChange={e => setVoucherIdInput(e.target.value)}
                  placeholder="e.g. DS-20260911-0001"
                  className="font-mono text-xs h-9"
                  data-testid="input-ds-voucher-id"
                />
              </div>
              <div>
                <Label>Store</Label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select store" /></SelectTrigger>
                  <SelectContent>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sold By</Label>
                <Input value={user?.name || ""} readOnly className="mt-1 bg-muted text-xs h-9" />
              </div>
              <div>
                <HabeshaDatePicker
                  label="Sale Date (ቀን)"
                  value={voucherDate}
                  onChange={async (v) => {
                    setVoucherDate(v);
                    if (!editingId) {
                      const nextId = await generateSerialVoucherId("DS", v);
                      setVoucherIdInput(nextId);
                    }
                  }}
                />
              </div>
            </div>

            <div className="relative">
              <Label>Add Products</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search by name or code…" value={productSearch} onChange={e => setProductSearch(e.target.value)} className="pl-9" disabled={!storeId} />
              </div>
              {productSearch && filteredProducts.length > 0 && (
                <div className="absolute z-20 mt-1 w-full bg-card border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {filteredProducts.map(p => (
                    <button key={p.id} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 text-left" onClick={() => addProduct(p)}>
                      {p.photoUrl ? <img src={p.photoUrl} alt={p.name} className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 bg-muted rounded flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.code} · Stock: {stockMap[p.id] ?? "…"} pcs</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-center px-3 py-2">By Carton</th>
                      <th className="text-left px-3 py-2">Quantity</th>
                      <th className="text-right px-3 py-2">Unit Price</th>
                      <th className="text-right px-3 py-2">Total</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((it, idx) => {
                      const actualQty = it.sellByCarton ? it.quantity * it.quantityPerCarton : it.quantity;
                      const overStock = actualQty > (stockMap[it.productId] || 0);
                      return (
                        <tr key={it.productId} className={overStock ? "bg-red-50" : ""}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {it.photoUrl ? <img src={it.photoUrl} alt={it.productName} className="w-8 h-8 rounded object-cover" /> : <div className="w-8 h-8 bg-muted rounded flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                              <div>
                                <div className="font-medium text-xs">{it.productName}</div>
                                <div className="text-xs text-muted-foreground">{it.productCode} · {stockMap[it.productId] ?? "…"} pcs left</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {it.quantityPerCarton > 1 && <input type="checkbox" checked={it.sellByCarton} onChange={() => toggleCarton(idx)} />}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-col gap-0.5">
                              <Input type="number" min={1} value={it.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} className="w-20 h-7 text-xs" />
                              {it.sellByCarton && <span className="text-xs text-muted-foreground">{actualQty} pcs</span>}
                              {overStock && <span className="text-xs text-red-600">Over stock!</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input type="number" min={0} step={0.01} value={it.unitPrice} onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))} className="w-24 h-7 text-xs text-right" />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-sm">{fmt(it.totalPrice)}</td>
                          <td className="px-3 py-2">
                            <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-muted/30">
                    <tr>
                      <td colSpan={4} className="px-3 py-2 text-right font-semibold text-sm">Total:</td>
                      <td className="px-3 py-2 text-right font-bold">{fmt(total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div><Label>Remark (optional)</Label><Input value={remark} onChange={e => setRemark(e.target.value)} placeholder="Notes…" className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Sale"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voucher View */}
      {showVoucher && (
        <Dialog open onOpenChange={() => setShowVoucher(null)}>
          <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
            <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
              <DialogTitle>Sale Voucher</DialogTitle>
              {showVoucher && showVoucher.status !== "voided" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-amber-700 hover:text-amber-800 dark:text-amber-400"
                  onClick={() => {
                    const saleToEdit = showVoucher;
                    setShowVoucher(null);
                    openEdit(saleToEdit);
                  }}
                >
                  <Pencil className="w-4 h-4" /> Edit Sale (አስተካክል)
                </Button>
              )}
            </DialogHeader>
            <div ref={receiptRef} className="receipt-a4 space-y-4 p-4 text-sm">
              <div className="text-center border-b pb-4">
                <h2 className="text-xl font-bold">DIRECT SALE VOUCHER</h2>
                <p className="font-mono text-primary font-bold">{showVoucher.voucherId}</p>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
                  {formatEthDate(showVoucher.voucherDate || showVoucher.createdAt, { includeGregorian: true })}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">Store:</span><div className="font-semibold">{showVoucher.storeName}</div></div>
                <div><span className="text-muted-foreground">Sold By:</span><div className="font-semibold">{showVoucher.soldByName}</div></div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <div><span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[showVoucher.status] || ""}`}>{showVoucher.status}</span></div>
                </div>
                {showVoucher.posVoucherId && <div><span className="text-muted-foreground">POS Voucher:</span><div className="font-mono text-xs text-primary">{showVoucher.posVoucherId}</div></div>}
              </div>
              {showVoucher.remark && <div><span className="text-muted-foreground">Remark:</span> {showVoucher.remark}</div>}
              <table className="w-full border rounded-lg overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">Product</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Unit Price</th>
                    <th className="text-right px-3 py-2">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(() => {
                    const safeItems = Array.isArray(showVoucher.items) ? showVoucher.items : [];
                    if (safeItems.length === 0) {
                      return (
                        <tr>
                          <td colSpan={4} className="px-4 py-6 text-center text-xs text-muted-foreground italic">
                            No item records found for this voucher.
                          </td>
                        </tr>
                      );
                    }
                    return safeItems.map((it, i) => {
                      const actualQty = it.sellByCarton ? it.quantity * it.quantityPerCarton : it.quantity;
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {it.photoUrl ? <img src={it.photoUrl} alt={it.productName} className="w-10 h-10 rounded object-cover" /> : <div className="w-10 h-10 bg-muted rounded flex items-center justify-center"><Package className="w-4 h-4 text-muted-foreground" /></div>}
                              <div><div className="font-medium">{it.productName}</div><div className="text-xs text-muted-foreground">{it.productCode}</div></div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">{it.sellByCarton ? `${it.quantity} ctn (${actualQty} pcs)` : `${actualQty} pcs`}</td>
                          <td className="px-3 py-2 text-right">{fmt(it.unitPrice)}</td>
                          <td className="px-3 py-2 text-right font-semibold">{fmt(it.totalPrice)}</td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
                <tfoot className="bg-muted/30">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right font-bold">TOTAL</td>
                    <td className="px-3 py-2 text-right font-bold text-lg">{fmt(showVoucher.totalAmount)}</td>
                  </tr>
                </tfoot>
              </table>

              {/* Footer */}
              <div className="border-t pt-4 mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between"><span>Placed by:</span><span className="font-medium text-foreground">{showVoucher.soldByName}</span></div>
                {showVoucher.approvedBy && (
                  <div className="flex justify-between"><span>Approved by:</span><span className="font-medium text-foreground">{showVoucher.approvedBy} · {showVoucher.approvedAt ? fmtDate(showVoucher.approvedAt) : ""}</span></div>
                )}
                {/* Receipt Checked By Line */}
                <ReceiptCheckedByLine
                  isChecked={showVoucher.isChecked}
                  checkedBy={showVoucher.checkedBy}
                  checkedAt={showVoucher.checkedAt}
                />
                <div className="flex justify-between mt-2"><span>Page 1 of 1</span><span>{fmtDate(showVoucher.voucherDate || showVoucher.createdAt)}</span></div>
              </div>

              {/* Customer Digital Receipt QR Code */}
              <div className="border-t pt-3 flex flex-col sm:flex-row items-center justify-between gap-3 bg-muted/20 p-3 rounded-lg">
                <ReceiptQRCode
                  voucherId={showVoucher.voucherId}
                  voucherData={{
                    totalAmount: showVoucher.totalAmount,
                    voucherDate: toSafeIsoDate(showVoucher.voucherDate || showVoucher.createdAt),
                    storeName: showVoucher.storeName,
                    customerName: "Store Customer",
                    itemsCount: showVoucher.items?.length,
                    type: "direct_sale",
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

            {/* Voucher Audit / Checked By Module */}
            <div className="p-4 border-t bg-muted/20">
              <VoucherAuditSection
                collectionName={COLLECTIONS.DIRECT_SALES}
                docId={showVoucher.id}
                isChecked={showVoucher.isChecked}
                checkedBy={showVoucher.checkedBy}
                checkedAt={showVoucher.checkedAt}
                checkedNote={showVoucher.auditorNotes}
                voucherNumber={showVoucher.voucherId}
                onAuditChange={(newChecked, auditorName, note) => {
                  setSales(prev => prev.map(item => item.id === showVoucher.id ? {
                    ...item,
                    isChecked: newChecked,
                    checkedBy: auditorName,
                    checkedById: newChecked ? (user?.uid || "") : "",
                    checkedAt: newChecked ? new Date().toISOString() : "",
                    auditorNotes: note || "",
                  } : item));
                  setShowVoucher(prev => prev ? {
                    ...prev,
                    isChecked: newChecked,
                    checkedBy: auditorName,
                    checkedById: newChecked ? (user?.uid || "") : "",
                    checkedAt: newChecked ? new Date().toISOString() : "",
                    auditorNotes: note || "",
                  } : null);
                }}
              />
            </div>
            <DialogFooter className="flex-wrap gap-2 sm:justify-between">
              <ReceiptActionBar
                receiptRef={receiptRef}
                voucherId={showVoucher.voucherId}
                voucherTitle="DIRECT SALE VOUCHER"
                voucherSubtitle={`Store: ${showVoucher.storeName} | Placed by: ${showVoucher.soldByName}`}
                filenamePrefix="direct_sale"
                totalAmount={showVoucher.totalAmount}
                customerName="Store Customer"
                storeName={showVoucher.storeName}
                voucherDate={toSafeIsoDate(showVoucher.voucherDate || showVoucher.createdAt)}
                onSharePdf={handleSharePdf}
                onShare={handleShare}
                onPrint={() => handlePrint()}
                sharing={sharing}
                sharingPdf={sharingPdf}
              />
              {isAdmin && showVoucher.status === "active" && (
                <Button className="bg-green-600 hover:bg-green-700" onClick={() => handleApprove(showVoucher)} disabled={saving}>
                  <CheckCircle className="w-4 h-4 mr-2" /> {saving ? "Approving…" : "Approve & Push to POS"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
