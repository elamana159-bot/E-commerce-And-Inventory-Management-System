import { useState, useEffect, useRef } from "react";
import { fmt } from "@/lib/currency";
import { Plus, Search, Eye, Printer, Trash2, Share2, Package, Pencil, CheckCircle, FileText, ChevronDown, MoreHorizontal, AlertTriangle, RotateCcw } from "lucide-react";
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
import { getAll, create, update, remove, COLLECTIONS, generateVoucherId, generateSerialVoucherId, subscribeCollection } from "@/lib/firestore";
import { useAuth } from "@/lib/auth";
import { shareAsImage, shareAsPdf, exportToExcel } from "@/lib/shareImage";
import { ReceiptActionBar } from "@/components/ReceiptActionBar";
import { HabeshaDatePicker } from "@/components/HabeshaDatePicker";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { toSafeIsoDate, todayIsoDate, formatSafeDate, safeDateSort } from "@/lib/dateUtils";
import { VoidVoucherOverlay } from "@/components/VoidVoucherOverlay";
import { FormalVoucherHeader } from "@/components/FormalVoucherHeader";
import { FormalVoucherSignatures } from "@/components/FormalVoucherSignatures";
import * as XLSX from "xlsx";
import { computeStockBalances } from "@/lib/stockUtils";
import type { Store, Expense, Product, PricingRecord } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { postExpenseJournalEntry, voidJournalEntryByReference, reactivateJournalEntryByReference } from "@/lib/accountingEngine";

interface ExpenseItem {
  description: string;
  productId?: string;
  productCode?: string;
  photoUrl?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  isByCarton?: boolean;
  availableStock?: number;
}

export default function Expenses() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pricing, setPricing] = useState<PricingRecord[]>([]);
  const [storeStockMap, setStoreStockMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showVoucher, setShowVoucher] = useState<Expense | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [form, setForm] = useState({ storeId: "", type: "general" as "product" | "general", remark: "", voucherDate: todayIsoDate() });
  const [items, setItems] = useState<ExpenseItem[]>([{ description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }]);
  const [productSearches, setProductSearches] = useState<string[]>([""]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();
  const { user, isAdmin } = useAuth();
  const receiptRef = useRef<HTMLDivElement>(null);

  async function loadData() {
    setLoading(true);
    const [exps, sts, prods, pric] = await Promise.all([
      getAll<Expense>(COLLECTIONS.EXPENSES),
      getAll<Store>(COLLECTIONS.STORES),
      getAll<Product>(COLLECTIONS.PRODUCTS),
      getAll<PricingRecord>(COLLECTIONS.PRICING),
    ]);
    setExpenses(exps.sort((a, b) => safeDateSort(a.voucherDate || a.createdAt, b.voucherDate || b.createdAt, "desc")));
    setStores(sts);
    setProducts(prods);
    setPricing(pric);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const unsubExps = subscribeCollection<Expense>(COLLECTIONS.EXPENSES, (data) => {
      setExpenses(data.sort((a, b) => safeDateSort(a.voucherDate || a.createdAt, b.voucherDate || b.createdAt, "desc")));
    });
    const unsubStores = subscribeCollection<Store>(COLLECTIONS.STORES, setStores);
    const unsubProds = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, setProducts);
    const unsubPricing = subscribeCollection<PricingRecord>(COLLECTIONS.PRICING, setPricing);

    return () => {
      unsubExps();
      unsubStores();
      unsubProds();
      unsubPricing();
    };
  }, []);

  // Reload store balances when store changes (for product type)
  async function loadStoreBalances(storeId: string) {
    if (!storeId || storeId === "general") { setStoreStockMap({}); return; }
    const balanceMap = await computeStockBalances(storeId);
    const qtyMap: Record<string, number> = {};
    for (const [pid, bal] of Object.entries(balanceMap)) {
      qtyMap[pid] = bal.quantity;
    }
    setStoreStockMap(qtyMap);
  }

  function getAvailableStock(productId: string): number {
    return storeStockMap[productId] || 0;
  }

  function getSellingPrice(productId: string): number {
    return pricing.find(p => p.productId === productId)?.sellingPrice || 0;
  }

  function resetForm() {
    setEditingId(null);
    setEditingExpense(null);
    setForm({ storeId: "", type: "general", remark: "", voucherDate: todayIsoDate() });
    setItems([{ description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }]);
    setProductSearches([""]);
    setStoreStockMap({});
  }

  function openNew() { resetForm(); setShowForm(true); }

  async function openEdit(exp: Expense) {
    setEditingId(exp.id);
    setEditingExpense(exp);
    setForm({ storeId: exp.storeId || "", type: exp.type || "general", remark: exp.remark || "", voucherDate: exp.voucherDate || toSafeIsoDate(exp.createdAt, todayIsoDate()) });
    let currentStoreStock: Record<string, number> = {};
    if (exp.type === "product" && exp.storeId && exp.storeId !== "general") {
      const balanceMap = await computeStockBalances(exp.storeId);
      for (const [pid, bal] of Object.entries(balanceMap)) {
        currentStoreStock[pid] = bal.quantity;
      }
      setStoreStockMap(currentStoreStock);
    }
    setItems((exp.items || []).map(i => {
      const oldQty = i.quantity || 0;
      const curStock = i.productId ? (currentStoreStock[i.productId] || 0) : 0;
      return {
        ...i,
        availableStock: curStock + oldQty,
      };
    }));
    setProductSearches((exp.items || []).map(() => ""));
    setShowForm(true);
  }

  async function handleApprove(exp: Expense) {
    await update(COLLECTIONS.EXPENSES, exp.id, { status: "active" });
    toast({ title: "Expense approved" });
    loadData();
  }

  function handleVoid(exp: Expense) {
    confirmDelete(async () => {
      const nowIso = new Date().toISOString();
      const operatorName = user?.name || user?.displayName || user?.email || "Admin";
      await update(COLLECTIONS.EXPENSES, exp.id, {
        status: "voided",
        voidedAt: nowIso,
        voidedBy: operatorName,
      });
      voidJournalEntryByReference(exp.voucherId || exp.id).catch(err => console.warn(err));
      toast({ title: "Expense voucher voided (ወጪው ተሰርዟል)" });
      if (showVoucher && showVoucher.id === exp.id) {
        setShowVoucher(v => (v ? { ...v, status: "voided", voidedAt: nowIso, voidedBy: operatorName } : null));
      }
      loadData();
    });
  }

  async function handleActivate(exp: Expense) {
    await update(COLLECTIONS.EXPENSES, exp.id, { status: "active", voidedAt: null, voidedBy: null });
    reactivateJournalEntryByReference(exp.voucherId || exp.id).catch(err => console.warn(err));
    toast({ title: "Expense voucher reactivated" });
    if (showVoucher && showVoucher.id === exp.id) {
      setShowVoucher(v => (v ? { ...v, status: "active", voidedAt: undefined, voidedBy: undefined } : null));
    }
    loadData();
  }

  function handleDelete(exp: Expense) {
    confirmDelete(async () => {
      await remove(COLLECTIONS.EXPENSES, exp.id);
      voidJournalEntryByReference(exp.voucherId || exp.id).catch(err => console.warn(err));
      toast({ title: "Expense deleted" });
      loadData();
    });
  }

  const filtered = expenses.filter(e =>
    e.voucherId?.toLowerCase().includes(search.toLowerCase()) ||
    e.storeName?.toLowerCase().includes(search.toLowerCase())
  );

  function addItem() {
    setItems(prev => [...prev, { description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }]);
    setProductSearches(prev => [...prev, ""]);
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
    setProductSearches(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: string, value: string | number | boolean) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[idx], [field]: value };
      item.totalPrice = (item.unitPrice || 0) * (item.quantity || 1);
      updated[idx] = item;
      return updated;
    });
  }

  function selectProduct(idx: number, product: Product) {
    const price = getSellingPrice(product.id);
    const oldQty = editingExpense?.items?.find(i => i.productId === product.id)?.quantity || 0;
    const available = getAvailableStock(product.id) + oldQty;
    setItems(prev => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        productId: product.id,
        productCode: product.code,
        photoUrl: product.photoUrl || "",
        description: product.name,
        unitPrice: price,
        totalPrice: price * (updated[idx].quantity || 1),
        availableStock: available,
      };
      return updated;
    });
    setProductSearches(prev => {
      const updated = [...prev];
      updated[idx] = "";
      return updated;
    });
  }

  const totalAmount = items.reduce((s, i) => s + i.totalPrice, 0);

  async function handleSave() {
    setSaving(true);
    try {
      if (form.type === "product") {
        if (!form.storeId || form.storeId === "general") {
          toast({ title: "Select a store for product expenses", variant: "destructive" }); return;
        }
        for (const item of items) {
          if (!item.productId) {
            toast({ title: "Select a product for each row", variant: "destructive" }); return;
          }
          if (item.quantity <= 0) {
            toast({ title: "All quantities must be greater than zero", variant: "destructive" }); return;
          }
          const oldQty = editingExpense?.items?.find(i => i.productId === item.productId)?.quantity || 0;
          const available = getAvailableStock(item.productId) + oldQty;
          if (item.quantity > available) {
            toast({ title: `Insufficient stock for "${item.description}" (available: ${available})`, variant: "destructive" }); return;
          }
        }
      } else {
        if (items.some(i => !i.description)) {
          toast({ title: "All items need a description", variant: "destructive" }); return;
        }
        if (items.some(i => i.quantity <= 0)) {
          toast({ title: "All quantities must be greater than zero", variant: "destructive" }); return;
        }
        if (items.some(i => i.unitPrice < 0)) {
          toast({ title: "Prices cannot be negative", variant: "destructive" }); return;
        }
      }
      const store = stores.find(s => s.id === form.storeId);
      const cleanItems = items.map(item =>
        Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined))
      );
      if (editingId) {
        await update(COLLECTIONS.EXPENSES, editingId, {
          storeId: form.storeId || null,
          storeName: store?.name || "General",
          type: form.type,
          items: cleanItems,
          totalAmount,
          voucherDate: form.voucherDate,
          remark: form.remark || "",
        } as Record<string, unknown>);
        toast({ title: "Expense updated" });
      } else {
        const expensePayload = {
          voucherId: await generateSerialVoucherId("EXP"),
          storeId: form.storeId || null,
          storeName: store?.name || "General",
          type: form.type,
          items: cleanItems,
          totalAmount,
          voucherDate: form.voucherDate,
          remark: form.remark || "",
          status: isAdmin ? "active" : "pending",
          createdByName: user?.name || "",
        };
        const newId = await create(COLLECTIONS.EXPENSES, expensePayload);
        postExpenseJournalEntry({ ...expensePayload, id: newId } as Expense).catch(err => console.warn("Automatic journal entry error:", err));
        toast({ title: isAdmin ? "Expense recorded" : "Submitted for admin approval" });
      }
      setShowForm(false);
      resetForm();
      loadData();
    } finally {
      setSaving(false);
    }
  }

  const handlePrint = () => printElement(receiptRef.current, `Expense_${showVoucher?.voucherId || ""}`);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  async function handleShare() {
    if (!receiptRef.current) return;
    setSharing(true);
    try {
      const r = await shareAsImage(receiptRef.current, `expense_${showVoucher?.voucherId || "receipt"}.png`);
      if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    } catch (err) {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  async function handleSharePdf() {
    if (!receiptRef.current) return;
    setSharingPdf(true);
    try {
      const r = await shareAsPdf(receiptRef.current, `expense_${showVoucher?.voucherId || "receipt"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch (err) {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingPdf(false);
    }
  }

  async function exportExcel(exp: Expense) {
    setExportingExcel(true);
    try {
      const data = [
        ["EXPENSE VOUCHER"],
        ["Voucher ID", exp.voucherId || "—"],
        ["Store", exp.storeName || "—"],
        ["Date", exp.voucherDate || "—"],
        ["Type", exp.type?.toUpperCase() || "—"],
        ["Status", exp.status?.toUpperCase() || "—"],
        ["Created By", exp.createdByName || "—"],
        ["Remark", exp.remark || ""],
        [],
        ["Description", "Quantity", "Unit Price (ETB)", "Total Price (ETB)"],
        ...(exp.items || []).map(i => [i.description, i.quantity, Math.round(i.unitPrice), Math.round(i.totalPrice)]),
        [],
        ["", "", "Grand Total (ETB):", exp.totalAmount || 0],
      ];

      const res = await exportToExcel({
        data,
        sheetName: "Expense",
        filename: `${exp.voucherId || "expense"}.xlsx`,
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

  const isProduct = form.type === "product";

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Expenses</h1>
          <p className="text-muted-foreground text-sm">Track business expenses</p>
        </div>
        <Button onClick={openNew} data-testid="button-new-expense"><Plus className="w-4 h-4 mr-2" /> New Expense</Button>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input className="pl-9" placeholder="Search expenses..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 rounded" />)}</div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>{["Voucher", "Date", "Store", "Type", "Items", "Total Amount", "Status", "Actions"].map(h => (
                <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs">{h}</th>
              ))}</tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-muted/30" data-testid={`row-expense-${e.id}`}>
                  <td className="px-4 py-2 font-mono text-xs">
                    <button
                      onClick={() => setShowVoucher(e)}
                      className="font-bold text-primary hover:underline cursor-pointer"
                      title="Click to view expense voucher"
                    >
                      {e.voucherId}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {formatEthDate(e.voucherDate || e.createdAt, { short: true })}
                    </div>
                    {(e.voucherDate || e.createdAt) && (
                      <div className="text-[10px] text-muted-foreground">{toSafeIsoDate(e.voucherDate || e.createdAt, "—")}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">{e.storeName || "General"}</td>
                  <td className="px-4 py-2 capitalize">
                    <Badge variant={e.type === "product" ? "default" : "secondary"}>
                      {e.type === "product" ? "Product" : "General"}
                    </Badge>
                  </td>
                  <td className="px-4 py-2">{e.items?.length || 0}</td>
                  <td className="px-4 py-2 font-medium">{fmt(e.totalAmount)}</td>
                  <td className="px-4 py-2">
                    <Badge
                      variant={e.status === "active" ? "default" : e.status === "pending" ? "outline" : "destructive"}
                      className={e.status === "pending" ? "border-amber-500 text-amber-600 bg-amber-50" : ""}
                    >{e.status || "active"}</Badge>
                  </td>
                  <td className="px-4 py-2">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-xs" data-testid={`button-actions-${e.id}`}>
                          Actions
                          <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuLabel className="text-xs text-muted-foreground font-mono">
                          {e.voucherId}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setShowVoucher(e)} data-testid={`button-view-${e.id}`}>
                          <Eye className="w-4 h-4 mr-2" /> View Voucher
                        </DropdownMenuItem>
                        {isAdmin && e.status === "pending" && (
                          <DropdownMenuItem onClick={() => handleApprove(e)} className="text-emerald-600 focus:text-emerald-600" data-testid={`button-approve-${e.id}`}>
                            <CheckCircle className="w-4 h-4 mr-2 text-emerald-600" /> Approve Expense
                          </DropdownMenuItem>
                        )}
                        {e.status !== "pending" && e.status !== "voided" && (
                          <DropdownMenuItem onClick={() => openEdit(e)} data-testid={`button-edit-${e.id}`}>
                            <Pencil className="w-4 h-4 mr-2" /> Edit Expense
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {e.status === "voided" ? (
                          <DropdownMenuItem
                            onClick={() => handleActivate(e)}
                            className="text-emerald-600 focus:text-emerald-600"
                            data-testid={`button-activate-${e.id}`}
                          >
                            <RotateCcw className="w-4 h-4 mr-2" /> Reactivate Expense
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            onClick={() => handleVoid(e)}
                            className="text-orange-600 focus:text-orange-600"
                            data-testid={`button-void-${e.id}`}
                          >
                            <AlertTriangle className="w-4 h-4 mr-2" /> Void Expense (ሰርዝ)
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleDelete(e)} className="text-destructive focus:text-destructive" data-testid={`button-delete-${e.id}`}>
                          <Trash2 className="w-4 h-4 mr-2" /> Delete Expense
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No expenses found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* New / Edit Expense Dialog */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); resetForm(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-3xl">
          <DialogHeader><DialogTitle>{editingId ? "Edit Expense" : "New Expense"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Store {isProduct && <span className="text-destructive">*</span>}</Label>
                <Select
                  value={form.storeId}
                  onValueChange={v => {
                    setForm(f => ({ ...f, storeId: v }));
                    loadStoreBalances(v);
                    // reset product selections when store changes
                    setItems(prev => prev.map(() => ({ description: "", quantity: 1, unitPrice: 0, totalPrice: 0 })));
                    setProductSearches(prev => prev.map(() => ""));
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="General (no store)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={v => {
                    const t = v as "product" | "general";
                    setForm(f => ({ ...f, type: t }));
                    setItems([{ description: "", quantity: 1, unitPrice: 0, totalPrice: 0 }]);
                    setProductSearches([""]);
                    if (t === "product" && form.storeId && form.storeId !== "general") {
                      loadStoreBalances(form.storeId);
                    }
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General Expense</SelectItem>
                    <SelectItem value="product">Product Related</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <HabeshaDatePicker
                  label="Date (ቀን)"
                  value={form.voucherDate}
                  onChange={v => setForm(f => ({ ...f, voucherDate: v }))}
                />
              </div>
            </div>

            {isProduct && (!form.storeId || form.storeId === "general") && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                <Package className="w-4 h-4 flex-shrink-0" />
                Please select a store first to see available product stock.
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{isProduct ? "Products to Expense" : "Expense Items"}</Label>
                <Button size="sm" variant="outline" onClick={addItem}><Plus className="w-3 h-3 mr-1" /> Add Row</Button>
              </div>

              {isProduct ? (
                // ── Product rows ──
                <div className="space-y-2">
                  {items.map((item, idx) => {
                    const search = productSearches[idx] || "";
                    const results = products.filter(p =>
                      search.trim() &&
                      (p.name.toLowerCase().includes(search.toLowerCase()) ||
                       p.code.toLowerCase().includes(search.toLowerCase()))
                    ).slice(0, 5);

                    return (
                      <div key={idx} className="rounded-lg border p-3 space-y-2 bg-muted/20">
                        <div className="flex items-center gap-2">
                          {item.photoUrl ? (
                            <img src={item.photoUrl} alt={item.description} className="w-10 h-10 rounded object-cover border flex-shrink-0" />
                          ) : (
                            <div className="w-10 h-10 rounded border bg-muted flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex-1 relative">
                            {item.productId ? (
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{item.description}</span>
                                <span className="text-xs text-muted-foreground">{item.productCode}</span>
                                {item.availableStock !== undefined && (
                                  <Badge variant={item.quantity > item.availableStock ? "destructive" : "secondary"} className="text-xs">
                                    Stock: {item.availableStock}
                                  </Badge>
                                )}
                                <Button
                                  size="sm" variant="ghost" className="h-6 px-2 text-xs text-muted-foreground"
                                  onClick={() => {
                                    setItems(prev => {
                                      const u = [...prev];
                                      u[idx] = { description: "", quantity: 1, unitPrice: 0, totalPrice: 0 };
                                      return u;
                                    });
                                    setProductSearches(prev => { const u = [...prev]; u[idx] = ""; return u; });
                                  }}
                                >
                                  Change
                                </Button>
                              </div>
                            ) : (
                              <div className="relative">
                                <Input
                                  className="h-8 text-sm"
                                  placeholder="Search product by name or code…"
                                  value={search}
                                  onChange={e => setProductSearches(prev => { const u = [...prev]; u[idx] = e.target.value; return u; })}
                                  disabled={!form.storeId || form.storeId === "general"}
                                />
                                {results.length > 0 && (
                                  <div className="absolute z-20 top-full left-0 right-0 bg-card border rounded-b shadow-lg">
                                    {results.map(p => {
                                      const stock = getAvailableStock(p.id);
                                      return (
                                        <div
                                          key={p.id}
                                          className="px-3 py-2 hover:bg-muted cursor-pointer flex items-center gap-3"
                                          onClick={() => selectProduct(idx, p)}
                                        >
                                          {p.photoUrl && <img src={p.photoUrl} alt={p.name} className="w-7 h-7 rounded object-cover" />}
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{p.name}</p>
                                            <p className="text-xs text-muted-foreground">{p.code}</p>
                                          </div>
                                          <Badge variant={stock > 0 ? "secondary" : "destructive"} className="text-xs flex-shrink-0">
                                            {stock} in stock
                                          </Badge>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          {items.length > 1 && (
                            <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="flex-shrink-0">
                              <Trash2 className="w-3 h-3 text-destructive" />
                            </Button>
                          )}
                        </div>

                        {item.productId && (
                          <div className="grid grid-cols-3 gap-2 pl-12">
                            <div>
                              <Label className="text-xs">Quantity</Label>
                              <Input
                                type="number" min={1} className="h-7 text-xs"
                                value={item.quantity}
                                onChange={e => {
                                  const qty = Number(e.target.value);
                                  setItems(prev => {
                                    const u = [...prev];
                                    u[idx] = { ...u[idx], quantity: qty, totalPrice: u[idx].unitPrice * qty };
                                    return u;
                                  });
                                }}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Unit Price (ETB)</Label>
                              <Input
                                type="number" min={0} step={0.01} className="h-7 text-xs"
                                value={item.unitPrice}
                                onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Total</Label>
                              <Input value={`ETB ${item.totalPrice.toFixed(2)}`} readOnly className="h-7 text-xs bg-muted font-semibold" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                // ── General rows ──
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>{["Description", "Qty", "Unit Price (ETB)", "Total", ""].map(h => (
                      <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2">
                          <Input className="h-7 text-xs" value={item.description} onChange={e => updateItem(idx, "description", e.target.value)} placeholder="Description" />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={1} className="w-16 h-7 text-xs" value={item.quantity} onChange={e => updateItem(idx, "quantity", Number(e.target.value))} />
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} step={0.01} className="w-24 h-7 text-xs" value={item.unitPrice} onChange={e => updateItem(idx, "unitPrice", Number(e.target.value))} />
                        </td>
                        <td className="px-3 py-2 font-medium">${item.totalPrice.toFixed(2)}</td>
                        <td className="px-3 py-2">
                          {items.length > 1 && (
                            <Button size="sm" variant="ghost" onClick={() => removeItem(idx)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/30 font-semibold">
                    <tr>
                      <td colSpan={3} className="px-3 py-2 text-xs">Total</td>
                      <td className="px-3 py-2 text-xs">${totalAmount.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              )}

              {isProduct && items.length > 0 && items.some(i => i.productId) && (
                <div className="flex justify-end text-sm font-semibold pt-1">
                  Total: <span className="ml-2">${totalAmount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div><Label>Remark</Label><Input value={form.remark} onChange={e => setForm(f => ({ ...f, remark: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-expense">
              {saving ? "Saving…" : editingId ? "Save Changes" : "Save Expense"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voucher Detail */}
      <Dialog open={!!showVoucher} onOpenChange={() => setShowVoucher(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-2xl">
          <DialogHeader><DialogTitle>Expense Voucher</DialogTitle></DialogHeader>
          {showVoucher && (
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
                voucherTitle="PAYMENT VOUCHER / OPERATING EXPENSE"
                voucherTitleAmharic="የወጪ ማዘዣ እና መክፈያ ደረሰኝ"
                voucherId={showVoucher.voucherId}
                voucherDate={String(showVoucher.voucherDate || showVoucher.createdAt || "")}
                storeName={showVoucher.storeName || "General Operations"}
                counterPartyLabel="Expense Category / Type"
                counterPartyName={showVoucher.type === "product" ? "Product-Related Expense" : "General Business Expense"}
                badgeContent={
                  <div className="flex items-center gap-1.5">
                    <Badge variant={showVoucher.type === "product" ? "default" : "secondary"} className="capitalize">
                      {showVoucher.type === "product" ? "Product Related" : "General"}
                    </Badge>
                    <Badge
                      variant={showVoucher.status === "voided" ? "destructive" : "outline"}
                      className="text-xs"
                    >
                      {showVoucher.status === "voided" ? "VOIDED (ተሰርዟል)" : "APPROVED"}
                    </Badge>
                  </div>
                }
              />

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse border border-slate-300">
                  <thead>
                    <tr className="bg-slate-100 text-slate-800">
                      {["No.", "Expense Description / እቃ ወይም አገልግሎት", "Qty", "Unit Cost", "Total Amount"].map(h => (
                        <th key={h} className="border border-slate-300 px-2.5 py-1.5 text-left font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {showVoucher.items?.map((item, i) => (
                      <tr key={i} className="border-b border-slate-200">
                        <td className="border border-slate-300 px-2 py-1.5 text-center text-slate-500 w-8 font-bold">{i + 1}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 font-medium text-slate-900">{item.description}</td>
                        <td className="border border-slate-300 px-2 py-1.5 text-center font-bold text-slate-900 w-16">{item.quantity}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-right font-mono w-28">{fmt(item.unitPrice)}</td>
                        <td className="border border-slate-300 px-2.5 py-1.5 text-right font-bold text-slate-950 font-mono w-32">{fmt(item.totalPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-400">
                    <tr>
                      <td colSpan={4} className="border border-slate-300 px-2.5 py-2 text-right">
                        Grand Total Expense (ጠቅላላ ወጪ):
                      </td>
                      <td className="border border-slate-300 px-2.5 py-2 text-right text-sm font-black text-slate-950 font-mono">
                        {fmt(showVoucher.totalAmount || 0)} ETB
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <FormalVoucherSignatures
                preparedBy={showVoucher.createdByName || "Cashier"}
                approvedBy="Finance Manager"
                receivedBy={showVoucher.storeName || "Payee / Disbursed"}
                date={String(showVoucher.voucherDate || showVoucher.createdAt || "")}
                notes={showVoucher.remark}
              />
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            <ReceiptActionBar
              receiptRef={receiptRef}
              voucherId={showVoucher?.voucherId}
              voucherTitle="EXPENSE VOUCHER"
              voucherSubtitle={`Store: ${showVoucher?.storeName || "General"} | Total: $${showVoucher?.totalAmount?.toFixed(2) || 0}`}
              filenamePrefix="expense_voucher"
              documentType="voucher"
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
