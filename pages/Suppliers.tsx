import { useState, useEffect, useRef, Fragment } from "react";
import {
  Plus, Search, Truck, Edit, Trash2, DollarSign, Eye, Printer, Pencil, Share2,
  Ban, RotateCcw, FileText, Maximize2, Minimize2, ChevronDown, ChevronUp, ChevronRight,
  Package, Receipt, CheckCheck, CheckCircle2, AlertCircle, Sparkles, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { getAll, create, update, remove, COLLECTIONS, subscribeCollection } from "@/lib/firestore";
import { uploadImage } from "@/lib/cloudinary";
import { fmt } from "@/lib/currency";
import type { Supplier, SupplierPayment, StockIn } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { shareAsImage, shareAsPdf, exportToExcel, exportToPdf } from "@/lib/shareImage";
import { ReceiptActionBar } from "@/components/ReceiptActionBar";
import { ReceiptWithReferenceView } from "@/components/ReceiptWithReferenceView";
import { useAuth } from "@/lib/auth";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { getStoredBrandName, replaceBrandInTitle } from "@/lib/brandConfig";
import { postSupplierPaymentJournalEntry, voidJournalEntryByReference, reactivateJournalEntryByReference, postSupplierOpeningBalanceJournalEntry } from "@/lib/accountingEngine";

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<SupplierPayment[]>([]);
  const [stockIns, setStockIns] = useState<StockIn[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState<Supplier | null>(null);
  const [showVoucher, setShowVoucher] = useState<Supplier | null>(null);
  const [isFullScreenVoucher, setIsFullScreenVoucher] = useState(false);
  const [selectedStockIn, setSelectedStockIn] = useState<StockIn | null>(null);
  const [expandedStockInIds, setExpandedStockInIds] = useState<Set<string>>(new Set());
  const [voucherTab, setVoucherTab] = useState<"all" | "stockin" | "payments">("all");
  const [suppViewMode, setSuppViewMode] = useState<"cards" | "table">("cards");
  const [clearTargetSupplier, setClearTargetSupplier] = useState<Supplier | null>(null);
  const [clearPayAmount, setClearPayAmount] = useState(0);
  const [clearPayDate, setClearPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [clearPayNote, setClearPayNote] = useState("ዕዳ በሙሉ ተከፍሎ ተጠናቋል (Full settlement)");
  const [clearing, setClearing] = useState(false);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", beginningBalance: 0, beginningDate: "", beginningPaid: 0, beginningPaidDate: "" });
  const [payForm, setPayForm] = useState({ amountPaid: 0, note: "", fsNumber: "", photoProofUrl: "", paymentDate: new Date().toISOString().slice(0, 10) });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editingPayment, setEditingPayment] = useState<SupplierPayment | null>(null);
  const [editPayForm, setEditPayForm] = useState({ amountPaid: 0, note: "", paymentDate: "" });
  const [paymentSearch, setPaymentSearch] = useState("");
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [sharingStockInReceipt, setSharingStockInReceipt] = useState(false);
  const [sharingStockInPdf, setSharingStockInPdf] = useState(false);
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();
  const { isAdmin } = useAuth();
  const voucherRef = useRef<HTMLDivElement>(null);
  const stockInReceiptRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => printElement(voucherRef.current, `Supplier_${showVoucher?.name || "Voucher"}`);
  const handlePrintStockInReceipt = () => printElement(stockInReceiptRef.current, `StockIn_Receipt_${selectedStockIn?.voucherId || "Receipt"}`);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingListPdf, setExportingListPdf] = useState(false);

  const getSupplierStockIns = (s: Supplier | null | undefined) => {
    if (!s) return [];
    const sId = s.id ? String(s.id).trim() : "";
    const sName = s.name ? String(s.name).trim().toLowerCase() : "";
    return stockIns.filter(si => {
      if (!si) return false;
      if (sId && si.supplierId && String(si.supplierId).trim() === sId) return true;
      const siName = si.supplierName ? String(si.supplierName).trim().toLowerCase() : "";
      if (sName && siName && siName === sName) return true;
      return false;
    });
  };

  async function handleSharePdf() {
    if (showVoucher) {
      setSharingPdf(true);
      try {
        await exportSupplierPdf(showVoucher);
      } finally {
        setSharingPdf(false);
      }
      return;
    }
    if (!voucherRef.current) return;
    setSharingPdf(true);
    try {
      const r = await shareAsPdf(voucherRef.current, `supplier_${showVoucher?.name || "voucher"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingPdf(false);
    }
  }

  async function handleShareStockInReceipt() {
    if (!stockInReceiptRef.current || !selectedStockIn) return;
    setSharingStockInReceipt(true);
    try {
      const r = await shareAsImage(stockInReceiptRef.current, `StockIn_Receipt_${selectedStockIn.voucherId || "StockIn"}.png`);
      if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    } catch {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setSharingStockInReceipt(false);
    }
  }

  async function handleShareStockInPdf() {
    if (!stockInReceiptRef.current || !selectedStockIn) return;
    setSharingStockInPdf(true);
    try {
      const r = await shareAsPdf(stockInReceiptRef.current, `StockIn_Receipt_${selectedStockIn.voucherId || "StockIn"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingStockInPdf(false);
    }
  }

  async function handleVoidPayment(p: SupplierPayment) {
    const nextVoided = !p.voided;
    await update(COLLECTIONS.SUPPLIER_PAYMENTS, p.id, { voided: nextVoided } as any);
    if (nextVoided) {
      voidJournalEntryByReference(p.fsNumber || p.id).catch(err => console.warn("Void supplier payment JE error:", err));
    } else {
      reactivateJournalEntryByReference(p.fsNumber || p.id).catch(err => console.warn("Reactivate supplier payment JE error:", err));
    }
    setPayments(prev => prev.map(x => x.id === p.id ? { ...x, voided: nextVoided } : x));
    toast({ title: nextVoided ? "Payment voided" : "Payment activated" });
  }

  async function handleShare() {
    if (!voucherRef.current) return;
    setSharing(true);
    try {
      const r = await shareAsImage(voucherRef.current, `supplier_${showVoucher?.name || "payment"}.png`);
      if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    } catch {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  async function handleConfirmClearPay() {
    if (!clearTargetSupplier || clearPayAmount <= 0) return;
    setClearing(true);
    try {
      const newPaid = (clearTargetSupplier.totalPaid || 0) + clearPayAmount;
      const newBalance = Math.max(0, (clearTargetSupplier.totalBalance || 0) - clearPayAmount);

      const clearPayPayload = {
        supplierId: clearTargetSupplier.id,
        supplierName: clearTargetSupplier.name,
        amountPaid: clearPayAmount,
        remainingBalance: newBalance,
        note: clearPayNote || "ዕዳ በሙሉ ተከፍሎ ተጠናቋል (Full settlement)",
        paymentDate: clearPayDate || new Date().toISOString().slice(0, 10),
      };

      const [newPayId] = await Promise.all([
        create(COLLECTIONS.SUPPLIER_PAYMENTS, clearPayPayload),
        update(COLLECTIONS.SUPPLIERS, clearTargetSupplier.id, {
          totalPaid: newPaid,
          totalBalance: newBalance,
        }),
      ]);

      postSupplierPaymentJournalEntry({ ...clearPayPayload, id: newPayId } as any).catch(err => console.warn("Auto supplier payment journal error:", err));

      toast({ title: "የአቅራቢው ክፍያ ተመዝግቧል", description: `${fmt(clearPayAmount)} ETB payment recorded and debt settled.` });
      setClearTargetSupplier(null);
      if (showVoucher && showVoucher.id === clearTargetSupplier.id) {
        setShowVoucher({ ...showVoucher, totalPaid: newPaid, totalBalance: newBalance });
      }
      loadData();
    } catch (err) {
      console.error(err);
      toast({ title: "Failed to clear debt", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  }

  async function handleResetBalanceZero() {
    if (!clearTargetSupplier) return;
    confirmDelete(async () => {
      setClearing(true);
      try {
        await update(COLLECTIONS.SUPPLIERS, clearTargetSupplier.id, {
          totalBalance: 0,
        });
        toast({ title: "የአቅራቢው ቀሪ እዳ ወደ 0 ተቀይሯል", description: "Outstanding debt balance reset to 0." });
        setClearTargetSupplier(null);
        if (showVoucher && showVoucher.id === clearTargetSupplier.id) {
          setShowVoucher({ ...showVoucher, totalBalance: 0 });
        }
        loadData();
      } catch (err) {
        console.error(err);
        toast({ title: "Failed to reset balance", variant: "destructive" });
      } finally {
        setClearing(false);
      }
    });
  }

  function handleClearAllSupplierPayments(supplier: Supplier) {
    const supPayments = payments.filter(p => p.supplierId === supplier.id);
    if (supPayments.length === 0) {
      toast({ title: "No payments to clear", description: "This supplier has no payment records." });
      return;
    }
    confirmDelete(async () => {
      try {
        await Promise.all(supPayments.map(p => remove(COLLECTIONS.SUPPLIER_PAYMENTS, p.id)));
        const totalAmountWiped = supPayments.reduce((acc, p) => acc + (p.amountPaid || 0), 0);
        const newPaid = Math.max(0, (supplier.totalPaid || 0) - totalAmountWiped);
        const newBalance = (supplier.totalBalance || 0) + totalAmountWiped;
        await update(COLLECTIONS.SUPPLIERS, supplier.id, {
          totalPaid: newPaid,
          totalBalance: newBalance,
        });
        toast({ title: `Cleared ${supPayments.length} payments`, description: "All payment records for this supplier have been removed." });
        if (showVoucher && showVoucher.id === supplier.id) {
          setShowVoucher({ ...showVoucher, totalPaid: newPaid, totalBalance: newBalance });
        }
        await loadData();
      } catch {
        toast({ title: "Failed to clear payments", variant: "destructive" });
      }
    });
  }

  async function exportExcel(s: Supplier) {
    setExportingExcel(true);
    try {
      const supPayments = payments.filter(p => p.supplierId === s.id);
      const supStockIns = getSupplierStockIns(s);
      const totalPaid = supPayments.filter(p => !p.voided).reduce((sum, x) => sum + (x.amountPaid || 0), 0);
      const totalStockIn = supStockIns.filter(si => si.status !== "voided").reduce((sum, x) => sum + (x.totalPrice || 0), 0);
      const brand = getStoredBrandName();

      const data = [
        [`${brand.toUpperCase()} - SUPPLIER ACCOUNT STATEMENT / VOUCHER`],
        ["Supplier Name", s.name || "—"],
        ["Phone", s.phone || "—"],
        ["Address", s.address || "—"],
        ["Statement Date", new Date().toISOString().slice(0, 10)],
        ["Opening Balance (ETB)", s.beginningBalance || 0],
        ["Total Goods Received / Stock In (ETB)", totalStockIn],
        ["Total Paid (ETB)", totalPaid],
        ["Remaining Balance (ETB)", s.totalBalance || 0],
        [],
        ["─── GOODS RECEIVED / STOCK IN RECEIPTS (የተረከቧቸው እቃዎች) ───"],
        ["Date", "Stock In Voucher ID", "Store", "Items Summary", "Total Cartons", "Total Value (ETB)", "Amount Paid at Receipt (ETB)", "Remaining Credit (ETB)", "Status"],
        ...supStockIns.map(si => [
          si.voucherDate || String(si.createdAt || "").slice(0, 10),
          si.voucherId || "—",
          si.storeName || "—",
          (si.items || []).map(i => `${i.productName} (${i.cartonsReceived || 0} ctn)`).join("; "),
          si.totalCartons || 0,
          si.totalPrice || 0,
          si.amountPaid || 0,
          si.remainingBalance || 0,
          si.status === "voided" ? "VOIDED" : "ACTIVE",
        ]),
        [],
        ["─── PAYMENT RECORDS (የተከፈሉ ክፍያዎች) ───"],
        ["Date", "Amount Paid (ETB)", "FS Number", "Note", "Status"],
        ...supPayments.map(p => [
          (p as any).paymentDate || String(p.createdAt || "").slice(0, 10),
          p.amountPaid,
          p.fsNumber || "—",
          p.note || "",
          p.voided ? "VOIDED" : "ACTIVE"
        ]),
        [],
        ["", "Total Goods Received (ETB):", totalStockIn],
        ["", "Total Paid (ETB):", totalPaid],
        ["", "Current Outstanding Balance (ETB):", s.totalBalance || 0]
      ];

      const res = await exportToExcel({
        data,
        sheetName: "Supplier Voucher",
        filename: `supplier_${s.name.replace(/\s+/g, "_")}.xlsx`,
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

  async function exportSupplierPdf(s: Supplier) {
    try {
      const supPayments = payments.filter(p => p.supplierId === s.id);
      const supStockIns = getSupplierStockIns(s);
      const totalPaid = supPayments.filter(p => !p.voided).reduce((sum, x) => sum + (x.amountPaid || 0), 0);
      const totalStockIn = supStockIns.filter(si => si.status !== "voided").reduce((sum, x) => sum + (x.totalPrice || 0), 0);
      const brand = getStoredBrandName();

      const pdfColumns = [
        { header: "#", key: "index", width: 6, align: "center" as const, isInteger: true },
        { header: "Type", key: "type", width: 14, align: "center" as const },
        { header: "Date", key: "date", width: 14, align: "center" as const },
        { header: "Ref / Voucher #", key: "ref", width: 18, align: "center" as const },
        { header: "Details / Items Summary", key: "details", width: 28, align: "left" as const },
        { header: "Goods Recv (ETB)", key: "debit", width: 16, align: "right" as const, isCurrency: true },
        { header: "Paid Out (ETB)", key: "credit", width: 16, align: "right" as const, isCurrency: true },
        { header: "Status", key: "status", width: 10, align: "center" as const },
      ];

      type TxRow = {
        date: string;
        type: string;
        ref: string;
        details: string;
        debit: number;
        credit: number;
        status: string;
      };

      const transactions: TxRow[] = [];

      supStockIns.forEach(si => {
        const d = si.voucherDate || String(si.createdAt || "").slice(0, 10);
        const itemSum = (si.items || []).map(i => `${i.productName} (${i.cartonsReceived || 0} ctn)`).join(", ");
        transactions.push({
          date: d,
          type: "Stock In",
          ref: si.voucherId || "—",
          details: itemSum ? `${itemSum} [${si.storeName || ""}]` : `Goods Receiving [${si.storeName || ""}]`,
          debit: si.totalPrice || 0,
          credit: si.amountPaid || 0,
          status: si.status === "voided" ? "VOIDED" : "ACTIVE",
        });
      });

      supPayments.forEach(p => {
        const d = (p as any).paymentDate || String(p.createdAt || "").slice(0, 10);
        transactions.push({
          date: d,
          type: "Payment",
          ref: p.fsNumber || "—",
          details: p.note ? `Payment: ${p.note}` : "Payment Out",
          debit: 0,
          credit: p.amountPaid || 0,
          status: p.voided ? "VOIDED" : "ACTIVE",
        });
      });

      transactions.sort((a, b) => a.date.localeCompare(b.date));

      const pdfRows = transactions.map((t, idx) => ({
        index: idx + 1,
        type: t.type,
        date: t.date,
        ref: t.ref,
        details: t.details,
        debit: t.debit || 0,
        credit: t.credit || 0,
        status: t.status,
      }));

      pdfRows.push({
        index: "",
        type: "",
        date: "TOTAL",
        ref: "",
        details: `${transactions.length} transactions (${supStockIns.length} Stock Ins, ${supPayments.length} Payments)`,
        debit: totalStockIn,
        credit: totalPaid,
        status: "",
        _isGrandTotal: true,
      } as any);

      await exportToPdf({
        title: replaceBrandInTitle(`${brand.toUpperCase()} SUPPLIER STATEMENT & VOUCHER`),
        subtitle: `Supplier: ${s.name} | Phone: ${s.phone || "—"} | Address: ${s.address || "—"}`,
        filename: `Supplier_Statement_${s.name.replace(/\s+/g, "_")}.pdf`,
        orientation: "portrait",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Opening Balance", value: `${fmt(s.beginningBalance || 0)} ETB` },
          { label: "Total Goods Received", value: `${fmt(totalStockIn)} ETB` },
          { label: "Total Paid Out", value: `${fmt(totalPaid)} ETB` },
          { label: "Remaining Payable", value: `${fmt(s.totalBalance || 0)} ETB` },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          if (row.status === "VOIDED") return { textColor: [220, 38, 38] };
          if (row.type === "Stock In") return { backgroundColor: [248, 250, 252] };
          return null;
        },
      });
      toast({ title: "Supplier statement exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    }
  }

  async function exportSuppliersListPdf() {
    setExportingListPdf(true);
    try {
      const brand = getStoredBrandName();
      const pdfColumns = [
        { header: "#", key: "index", width: 8, align: "center" as const, isInteger: true },
        { header: "Supplier Name", key: "name", width: 26, align: "left" as const },
        { header: "Phone", key: "phone", width: 16, align: "center" as const },
        { header: "Address", key: "address", width: 22, align: "left" as const },
        { header: "Total Paid (ETB)", key: "totalPaid", width: 16, align: "right" as const, isCurrency: true },
        { header: "Balance (ETB)", key: "totalBalance", width: 16, align: "right" as const, isCurrency: true },
      ];

      let sumPaid = 0;
      let sumBalance = 0;

      const pdfRows = filtered.map((s, idx) => {
        sumPaid += s.totalPaid || 0;
        sumBalance += s.totalBalance || 0;
        return {
          index: idx + 1,
          name: s.name,
          phone: s.phone || "—",
          address: s.address || "—",
          totalPaid: s.totalPaid || 0,
          totalBalance: s.totalBalance || 0,
        };
      });

      pdfRows.push({
        index: "",
        name: "GRAND TOTAL",
        phone: "",
        address: `${filtered.length} Suppliers`,
        totalPaid: sumPaid,
        totalBalance: sumBalance,
        _isGrandTotal: true,
      } as any);

      const dateStr = new Date().toISOString().slice(0, 10);
      await exportToPdf({
        title: replaceBrandInTitle(`${brand.toUpperCase()} SUPPLIERS DIRECTORY & BALANCES`),
        subtitle: `Total Suppliers: ${filtered.length} | Export Date: ${dateStr}`,
        filename: `Suppliers_Report_${dateStr}.pdf`,
        orientation: "landscape",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Total Suppliers", value: filtered.length },
          { label: "Total Paid Out (ETB)", value: fmt(sumPaid) },
          { label: "Total Payable Balance (ETB)", value: fmt(sumBalance) },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          return null;
        },
      });
      toast({ title: "Suppliers report exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    } finally {
      setExportingListPdf(false);
    }
  }

  async function loadData() {
    setLoading(true);
    const [sups, pays, sIns] = await Promise.all([
      getAll<Supplier>(COLLECTIONS.SUPPLIERS),
      getAll<SupplierPayment>(COLLECTIONS.SUPPLIER_PAYMENTS),
      getAll<StockIn>(COLLECTIONS.STOCK_IN),
    ]);
    setSuppliers(sups.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    setPayments(pays);
    setStockIns(sIns);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const unsubSups = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, (data) => {
      setSuppliers(data.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    });
    const unsubPays = subscribeCollection<SupplierPayment>(COLLECTIONS.SUPPLIER_PAYMENTS, setPayments);
    const unsubStockIns = subscribeCollection<StockIn>(COLLECTIONS.STOCK_IN, setStockIns);

    return () => {
      unsubSups();
      unsubPays();
      unsubStockIns();
    };
  }, []);

  const filtered = suppliers.filter(s =>
    Boolean(s) && (
      (s.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (s.phone || "").includes(search) ||
      (s.address || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  function openAdd() {
    setEditSupplier(null);
    setForm({ name: "", address: "", phone: "", beginningBalance: 0, beginningDate: "", beginningPaid: 0, beginningPaidDate: "" });
    setShowDialog(true);
  }

  function openEdit(s: Supplier) {
    setEditSupplier(s);
    setForm({ name: s.name, address: s.address, phone: s.phone, beginningBalance: 0, beginningDate: "", beginningPaid: 0, beginningPaidDate: "" });
    setShowDialog(true);
  }

  async function handleSave() {
    if (!form.name) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editSupplier) {
        const { beginningBalance, beginningDate, beginningPaid, beginningPaidDate, ...basic } = form;
        await update(COLLECTIONS.SUPPLIERS, editSupplier.id, basic);
        toast({ title: "Supplier updated" });
      } else {
        const bPaid = form.beginningPaid || 0;
        const bBal = form.beginningBalance || 0;
        const newSuppId = await create(COLLECTIONS.SUPPLIERS, {
          ...form,
          totalPaid: bPaid,
          totalBalance: bBal - bPaid,
          beginningBalance: bBal,
          beginningDate: form.beginningDate || "",
          beginningPaid: bPaid,
          beginningPaidDate: form.beginningPaidDate || "",
        });
        if (bBal > 0 && newSuppId) {
          postSupplierOpeningBalanceJournalEntry({
            id: newSuppId,
            name: form.name,
            beginningBalance: bBal,
            beginningDate: form.beginningDate,
            totalBalance: bBal - bPaid,
            totalPaid: bPaid,
          } as Supplier).catch(err => console.warn("Supplier opening balance JE error:", err));
        }
        toast({ title: "Supplier added" });
      }
      setShowDialog(false);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(s: Supplier) {
    confirmDelete(async () => {
      await remove(COLLECTIONS.SUPPLIERS, s.id);
      toast({ title: "Supplier deleted" });
      loadData();
    });
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const url = await uploadImage(file, "payments");
      setPayForm(f => ({ ...f, photoProofUrl: url }));
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
    finally { setUploading(false); }
  }

  async function handlePayment() {
    if (!showPayDialog || !payForm.amountPaid || payForm.amountPaid <= 0) {
      toast({ title: "Enter a valid payment amount", variant: "destructive" });
      return;
    }
    if (payForm.fsNumber) {
      const [existingSupp, existingCust] = await Promise.all([
        getAll<SupplierPayment>(COLLECTIONS.SUPPLIER_PAYMENTS),
        getAll<{ fsNumber?: string }>(COLLECTIONS.CUSTOMER_PAYMENTS),
      ]);
      const isDuplicate =
        existingSupp.some(p => p.fsNumber === payForm.fsNumber) ||
        existingCust.some(p => p.fsNumber === payForm.fsNumber);
      if (isDuplicate) {
        toast({ title: `FS Number "${payForm.fsNumber}" already exists`, description: "Each payment must have a unique FS Number.", variant: "destructive" });
        return;
      }
    }
    setPaying(true);
    try {
      const newPaid = (showPayDialog.totalPaid || 0) + payForm.amountPaid;
      const newBalance = Math.max(0, (showPayDialog.totalBalance || 0) - payForm.amountPaid);
      const payPayload = {
        supplierId: showPayDialog.id,
        supplierName: showPayDialog.name,
        amountPaid: payForm.amountPaid,
        remainingBalance: newBalance,
        photoProofUrl: payForm.photoProofUrl,
        fsNumber: payForm.fsNumber,
        note: payForm.note,
        paymentDate: payForm.paymentDate,
      };

      const [newPayId] = await Promise.all([
        create(COLLECTIONS.SUPPLIER_PAYMENTS, payPayload),
        update(COLLECTIONS.SUPPLIERS, showPayDialog.id, { totalPaid: newPaid, totalBalance: newBalance })
      ]);

      postSupplierPaymentJournalEntry({ ...payPayload, id: newPayId } as any).catch(err => console.warn("Auto supplier payment journal error:", err));
      toast({ title: "Payment recorded" });
      setShowPayDialog(null);
      setPayForm({ amountPaid: 0, note: "", fsNumber: "", photoProofUrl: "", paymentDate: new Date().toISOString().slice(0, 10) });
      loadData();
    } finally {
      setPaying(false);
    }
  }

  function handleDeletePayment(p: SupplierPayment, supplier: Supplier) {
    confirmDelete(async () => {
      try {
        await remove(COLLECTIONS.SUPPLIER_PAYMENTS, p.id);
        voidJournalEntryByReference(p.fsNumber || p.id).catch(err => console.warn("Void supplier payment JE error:", err));
        const newPaid = Math.max(0, (supplier.totalPaid || 0) - p.amountPaid);
        const newBalance = (supplier.totalBalance || 0) + p.amountPaid;
        await update(COLLECTIONS.SUPPLIERS, supplier.id, { totalPaid: newPaid, totalBalance: newBalance });
        toast({ title: "Payment deleted" });
        await loadData();
      } catch { toast({ title: "Failed", variant: "destructive" }); }
    });
  }

  async function handleSaveEditPayment(supplier: Supplier) {
    if (!editingPayment) return;
    const diff = editPayForm.amountPaid - editingPayment.amountPaid;
    const newPaid = (supplier.totalPaid || 0) + diff;
    const newBalance = Math.max(0, (supplier.totalBalance || 0) - diff);
    try {
      await update(COLLECTIONS.SUPPLIER_PAYMENTS, editingPayment.id, {
        amountPaid: editPayForm.amountPaid,
        note: editPayForm.note,
        paymentDate: editPayForm.paymentDate,
        remainingBalance: newBalance,
      });
      await update(COLLECTIONS.SUPPLIERS, supplier.id, { totalPaid: newPaid, totalBalance: newBalance });
      toast({ title: "Payment updated" });
      setEditingPayment(null);
      await loadData();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  }

  const getPayments = (sid?: string) => (sid ? payments.filter(p => p.supplierId === sid) : []);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage suppliers and payments</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportSuppliersListPdf} disabled={filtered.length === 0 || exportingListPdf} className="text-rose-600 dark:text-rose-400 hover:text-rose-700">
            <FileText className="w-4 h-4 mr-2" /> {exportingListPdf ? "Exporting PDF..." : "Export Suppliers PDF"}
          </Button>
          <Button onClick={openAdd} data-testid="button-add-supplier">
            <Plus className="w-4 h-4 mr-2" /> Add Supplier
          </Button>
        </div>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input className="pl-9" placeholder="Search suppliers..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-suppliers" />
      </div>
      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <Card key={s.id} data-testid={`card-supplier-${s.id}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{s.phone} · {s.address}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap justify-end">
                  {(s.totalBalance || 0) > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 font-semibold"
                      onClick={() => {
                        setClearTargetSupplier(s);
                        setClearPayAmount(s.totalBalance || 0);
                        setClearPayDate(new Date().toISOString().slice(0, 10));
                        setClearPayNote("ዕዳ በሙሉ ተከፍሎ ተጠናቋል (Full settlement)");
                      }}
                      title="Clear / Settle Debt (ዕዳ አጽዳ)"
                      data-testid={`button-clear-${s.id}`}
                    >
                      <CheckCheck className="w-3 h-3 mr-1" /> Clear
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => { setShowPayDialog(s); setPayForm({ amountPaid: 0, note: "", fsNumber: "", photoProofUrl: "", paymentDate: new Date().toISOString().slice(0, 10) }); }} data-testid={`button-pay-${s.id}`}>
                    <DollarSign className="w-3 h-3 mr-1" /> Payment
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowVoucher(s); setPaymentSearch(""); setVoucherTab("all"); }} data-testid={`button-view-${s.id}`}>
                    <Eye className="w-3 h-3 mr-1" /> Voucher
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => exportSupplierPdf(s)} className="text-rose-600 hover:text-rose-700" title="Export Statement PDF">
                    <FileText className="w-3 h-3 mr-1" /> PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => openEdit(s)} data-testid={`button-edit-${s.id}`}><Edit className="w-3 h-3" /></Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(s)} data-testid={`button-delete-${s.id}`}><Trash2 className="w-3 h-3" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-6 text-sm flex-wrap">
                  <div>
                    <span className="text-muted-foreground">Goods Received: </span>
                    <span className="font-semibold text-blue-600">
                      {fmt(getSupplierStockIns(s).filter(si => si.status !== "voided").reduce((sum, x) => sum + (x.totalPrice || 0), 0))}
                    </span>
                  </div>
                  <div><span className="text-muted-foreground">Total Paid: </span><span className="font-semibold text-green-600">{fmt(s.totalPaid)}</span></div>
                  <div><span className="text-muted-foreground">Balance: </span><span className="font-semibold text-red-500">{fmt(s.totalBalance)}</span></div>
                  <div><span className="text-muted-foreground">Stock Ins: </span><span className="font-medium">{getSupplierStockIns(s).length}</span></div>
                  <div><span className="text-muted-foreground">Payments: </span><span className="font-medium">{getPayments(s.id).length}</span></div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No suppliers found</p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
          <DialogHeader><DialogTitle>{editSupplier ? "Edit Supplier" : "Add Supplier"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-supplier-name" /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} data-testid="input-supplier-address" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} data-testid="input-supplier-phone" /></div>
            {!editSupplier && (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-3">
                  <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Beginning Balance (optional)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Balance Amount (ETB)</Label><Input type="number" min={0} step={0.01} value={form.beginningBalance || ""} onChange={e => setForm(f => ({ ...f, beginningBalance: Number(e.target.value) }))} className="mt-1 h-8" placeholder="0.00" /></div>
                    <div><Label className="text-xs">Balance Date</Label><Input type="date" value={form.beginningDate} onChange={e => setForm(f => ({ ...f, beginningDate: e.target.value }))} className="mt-1 h-8" /></div>
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 space-y-3">
                  <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Beginning Amount Paid (optional)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs">Amount Paid (ETB)</Label><Input type="number" min={0} step={0.01} value={form.beginningPaid || ""} onChange={e => setForm(f => ({ ...f, beginningPaid: Number(e.target.value) }))} className="mt-1 h-8" placeholder="0.00" /></div>
                    <div><Label className="text-xs">Payment Date</Label><Input type="date" value={form.beginningPaidDate} onChange={e => setForm(f => ({ ...f, beginningPaidDate: e.target.value }))} className="mt-1 h-8" /></div>
                  </div>
                  <p className="text-xs text-emerald-600">This will appear as the first payment entry in the supplier voucher.</p>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-supplier">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!showPayDialog} onOpenChange={() => setShowPayDialog(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
          <DialogHeader><DialogTitle>Record Payment — {showPayDialog?.name}</DialogTitle></DialogHeader>
          {showPayDialog && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3 text-sm grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Total Paid: </span><span className="font-medium text-green-600">{fmt(showPayDialog.totalPaid)}</span></div>
                <div><span className="text-muted-foreground">Balance: </span><span className="font-medium text-red-500">{fmt(showPayDialog.totalBalance)}</span></div>
              </div>
              <div><Label>Payment Date</Label><Input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} data-testid="input-pay-date" /></div>
              <div><Label>Amount Paid (ETB)</Label><Input type="number" min={0} step={0.01} value={payForm.amountPaid} onChange={e => setPayForm(f => ({ ...f, amountPaid: Number(e.target.value) }))} data-testid="input-pay-amount" /></div>
              <div><Label>FS Number</Label><Input value={payForm.fsNumber} onChange={e => setPayForm(f => ({ ...f, fsNumber: e.target.value }))} placeholder="Fiscal Number (optional)" data-testid="input-pay-fs-number" /></div>
              <div><Label>Note</Label><Input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} data-testid="input-pay-note" /></div>
              <div>
                <Label>Photo Proof</Label>
                <Input type="file" accept="image/*" onChange={handlePhotoUpload} />
                {uploading && <p className="text-xs text-muted-foreground mt-1">Uploading...</p>}
                {payForm.photoProofUrl && <img src={payForm.photoProofUrl} alt="Proof" className="mt-2 h-16 rounded" />}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPayDialog(null)} disabled={paying}>Cancel</Button>
            <Button onClick={handlePayment} disabled={paying || uploading} data-testid="button-confirm-payment">
              {paying ? "Recording..." : "Confirm Payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Voucher Dialog */}
      <Dialog open={!!showVoucher} onOpenChange={(open) => { if (!open) { setShowVoucher(null); setIsFullScreenVoucher(false); } }}>
        <DialogContent
          className={`transition-all duration-200 p-0 flex flex-col overflow-hidden ${
            isFullScreenVoucher
              ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none top-0 left-0 translate-x-0 translate-y-0 z-50 border-0 m-0 bg-slate-100/95 dark:bg-slate-950/95"
              : "fixed top-0 sm:top-[50%] left-0 sm:left-[50%] translate-x-0 sm:translate-x-[-50%] translate-y-0 sm:translate-y-[-50%] w-full h-[100dvh] sm:h-auto sm:max-h-[94vh] sm:max-w-4xl md:max-w-5xl rounded-none sm:rounded-2xl border bg-background shadow-2xl z-50"
          }`}
        >
          <DialogHeader className="p-3 sm:p-4 border-b border-border/60 shrink-0 bg-background flex flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Truck className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
              <DialogTitle className="text-sm sm:text-base font-bold truncate">
                Supplier Statement: {showVoucher?.name}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {showVoucher && (showVoucher.totalBalance || 0) > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setClearTargetSupplier(showVoucher);
                    setClearPayAmount(showVoucher.totalBalance || 0);
                    setClearPayDate(new Date().toISOString().slice(0, 10));
                    setClearPayNote("ዕዳ በሙሉ ተከፍሎ ተጠናቋል (Full settlement)");
                  }}
                  className="h-8 px-2 sm:px-2.5 text-xs gap-1 font-bold text-emerald-700 bg-emerald-50 border-emerald-300 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400 shrink-0"
                  title="Clear Debt (ዕዳ አጽዳ)"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="hidden sm:inline">Clear Debt</span>
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsFullScreenVoucher(prev => !prev)}
                className="h-8 px-2 sm:px-2.5 text-xs gap-1 font-medium border-slate-300 dark:border-slate-700 hover:bg-muted shrink-0"
                title={isFullScreenVoucher ? "Exit Full Screen" : "Full Screen"}
              >
                {isFullScreenVoucher ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">{isFullScreenVoucher ? "Exit" : "Full Screen"}</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => { setShowVoucher(null); setIsFullScreenVoucher(false); }}
                className="h-8 w-8 p-0 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>

          {showVoucher && (() => {
            const supStockIns = getSupplierStockIns(showVoucher);
            const paymentsList = getPayments(showVoucher.id);
            const totalStockInVal = supStockIns.filter(si => si.status !== "voided").reduce((sum, x) => sum + (x.totalPrice || 0), 0);

            const toggleExpand = (id: string) => {
              setExpandedStockInIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              });
            };

            return (
              <div className="flex-1 overflow-y-auto p-2 sm:p-5 bg-slate-100/60 dark:bg-slate-950/60">
                <div
                  ref={voucherRef}
                  className="bg-white text-slate-900 overflow-hidden border border-slate-200 max-w-4xl mx-auto w-full rounded-xl sm:rounded-2xl shadow-xs"
                  style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}
                >
                  {/* ── Header ── */}
                  <div style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)" }} className="p-4 sm:p-5 text-white">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                          <Truck className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="text-white/60 text-[10px] tracking-wider uppercase font-semibold">{getStoredBrandName()}</div>
                          <div className="text-white font-extrabold text-base sm:text-lg tracking-tight">SUPPLIER STATEMENT</div>
                        </div>
                      </div>
                      <span className="bg-white/15 text-white/90 text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap">
                        OFFICIAL STATEMENT
                      </span>
                    </div>
                    <div className="border-t border-white/15 pt-2.5 flex items-center justify-between text-[10px] sm:text-xs text-white/70">
                      <span>
                        Generated: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} ({formatEthDate(new Date().toISOString().slice(0, 10))} ዓ.ም)
                      </span>
                      <span className="font-semibold text-white/90">{showVoucher.name}</span>
                    </div>
                  </div>

                  {/* ── Contact Info ── */}
                  <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/50">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                      <div className="flex justify-between sm:flex-col sm:justify-start border-b sm:border-b-0 pb-1.5 sm:pb-0 border-slate-200">
                        <span className="text-slate-500 font-medium">Supplier Name</span>
                        <span className="text-slate-900 font-bold sm:mt-0.5">{showVoucher.name || "—"}</span>
                      </div>
                      <div className="flex justify-between sm:flex-col sm:justify-start border-b sm:border-b-0 pb-1.5 sm:pb-0 border-slate-200">
                        <span className="text-slate-500 font-medium">Phone Number</span>
                        <span className="text-slate-900 font-semibold sm:mt-0.5">{showVoucher.phone || "—"}</span>
                      </div>
                      <div className="flex justify-between sm:flex-col sm:justify-start">
                        <span className="text-slate-500 font-medium">Address</span>
                        <span className="text-slate-900 font-medium sm:mt-0.5 truncate">{showVoucher.address || "—"}</span>
                      </div>
                    </div>
                  </div>

                  {/* ── Summary Cards (KPIs) ── */}
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-3.5 p-2.5 sm:p-4 border-b border-slate-200">
                    <div style={{ background: "linear-gradient(135deg, #1e3a8a, #2563eb)" }} className="rounded-xl p-2 sm:p-3.5 text-white shadow-xs">
                      <div className="text-white/80 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center justify-between">
                        <span className="truncate">Received</span>
                        <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" />
                      </div>
                      <div className="text-white text-xs sm:text-lg font-black truncate">{fmt(totalStockInVal)}</div>
                      <div className="text-white/70 text-[8px] sm:text-[10px] mt-0.5 truncate">{supStockIns.length} Receipts</div>
                    </div>

                    <div style={{ background: "linear-gradient(135deg, #065f46, #059669)" }} className="rounded-xl p-2 sm:p-3.5 text-white shadow-xs">
                      <div className="text-white/80 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center justify-between">
                        <span className="truncate">Paid (የተከፈለ)</span>
                        <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" />
                      </div>
                      <div className="text-white text-xs sm:text-lg font-black truncate">{fmt(showVoucher.totalPaid || 0)}</div>
                      <div className="text-white/70 text-[8px] sm:text-[10px] mt-0.5 truncate">{paymentsList.length} Records</div>
                    </div>

                    <div style={{ background: (showVoucher.totalBalance || 0) > 0 ? "linear-gradient(135deg, #7f1d1d, #dc2626)" : "linear-gradient(135deg, #065f46, #10b981)" }} className="rounded-xl p-2 sm:p-3.5 text-white shadow-xs flex flex-col justify-between">
                      <div>
                        <div className="text-white/80 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center justify-between">
                          <span className="truncate">Credit (እዳ)</span>
                          {(showVoucher.totalBalance || 0) > 0 ? <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" /> : <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" />}
                        </div>
                        <div className="text-white text-xs sm:text-lg font-black truncate">{fmt(showVoucher.totalBalance || 0)}</div>
                      </div>
                      <div className="text-white/70 text-[8px] sm:text-[10px] mt-0.5 truncate">{(showVoucher.totalBalance || 0) > 0 ? "Debt Active" : "Settled"}</div>
                    </div>
                  </div>

                  {/* ── Tabs & View Mode Bar ── */}
                  <div className="px-2.5 sm:px-5 pt-1 pb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
                    <div className="flex items-center gap-1 p-0.5 sm:p-1 bg-slate-100 rounded-lg text-xs">
                      <button
                        type="button"
                        onClick={() => setVoucherTab("all")}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-medium text-[11px] sm:text-xs transition-all ${
                          voucherTab === "all" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        All ({supStockIns.length + paymentsList.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoucherTab("stockin")}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-medium text-[11px] sm:text-xs transition-all flex items-center gap-1 ${
                          voucherTab === "stockin" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        Stock In ({supStockIns.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setVoucherTab("payments")}
                        className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-medium text-[11px] sm:text-xs transition-all flex items-center gap-1 ${
                          voucherTab === "payments" ? "bg-white text-emerald-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                        }`}
                      >
                        <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        Payments ({paymentsList.length})
                      </button>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto no-print">
                      <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs shrink-0">
                        <button
                          type="button"
                          onClick={() => setSuppViewMode("cards")}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                            suppViewMode === "cards" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Cards
                        </button>
                        <button
                          type="button"
                          onClick={() => setSuppViewMode("table")}
                          className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                            suppViewMode === "table" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                          }`}
                        >
                          Table
                        </button>
                      </div>

                      <div className="relative flex-1 sm:w-48 no-print">
                        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          placeholder="Search items, notes, FS..."
                          value={paymentSearch}
                          onChange={e => setPaymentSearch(e.target.value)}
                          className="h-7 sm:h-8 text-xs pl-8 w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── Section: Stock In / Goods Receiving ── */}
                  {(voucherTab === "all" || voucherTab === "stockin") && (
                    <div className="p-2.5 sm:p-5 border-b border-slate-200">
                      <div className="flex items-center justify-between pb-2.5">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <Package className="w-4 h-4 text-blue-600" />
                          <span>Stock In (Goods Receiving) — የተረከቧቸው እቃዎች</span>
                          <span className="text-[10px] sm:text-[11px] font-normal text-slate-500">
                            ({supStockIns.length} records)
                          </span>
                        </div>
                      </div>

                      {supStockIns.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs sm:text-sm bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
                          No goods receiving records recorded for this supplier yet.
                        </div>
                      ) : (
                        <>
                          {/* Mobile Cards View */}
                          <div className={suppViewMode === "cards" ? "block sm:hidden space-y-2" : "hidden"}>
                            {supStockIns.map((si, i) => {
                              const isExpanded = expandedStockInIds.has(si.id);
                              const dateStr = si.voucherDate || String(si.createdAt || "").slice(0, 10);
                              return (
                                <div key={si.id || i} className={`p-3 rounded-xl border transition-all ${si.status === "voided" ? "bg-red-50/40 border-red-200 opacity-70" : "bg-white border-slate-200 shadow-2xs"}`}>
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="font-mono font-bold text-blue-700 text-xs truncate">#{si.voucherId || "—"}</span>
                                      {si.status === "voided" && (
                                        <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-sans font-bold">VOID</span>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-mono text-slate-500 shrink-0">
                                      {dateStr}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                                    <span>Store: <strong className="text-slate-800">{si.storeName || "—"}</strong></span>
                                    <span>{si.totalCartons || 0} cartons</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50 rounded-lg text-center mb-2">
                                    <div>
                                      <div className="text-[9px] uppercase font-bold text-slate-500">Total Value</div>
                                      <div className="text-xs font-bold text-blue-800 truncate">{fmt(si.totalPrice || 0)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] uppercase font-bold text-emerald-600">Paid</div>
                                      <div className="text-xs font-bold text-emerald-700 truncate">{fmt(si.amountPaid || 0)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] uppercase font-bold text-red-600">Credit</div>
                                      <div className="text-xs font-bold text-red-600 truncate">{fmt(si.remainingBalance || 0)}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => toggleExpand(si.id)}
                                      className="text-xs text-blue-600 font-medium inline-flex items-center gap-1 py-1"
                                    >
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      <span>{isExpanded ? "Hide breakdown" : `View ${(si.items || []).length} items`}</span>
                                    </button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setSelectedStockIn(si)}
                                      className="h-7 px-2.5 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50 gap-1"
                                    >
                                      <Receipt className="w-3 h-3" /> Full Receipt
                                    </Button>
                                  </div>
                                  {isExpanded && (
                                    <div className="mt-2 pt-2 border-t border-slate-200 space-y-1.5">
                                      {(si.items || []).map((itm, idx) => (
                                        <div key={idx} className="flex items-center justify-between text-xs bg-slate-50 p-1.5 rounded">
                                          <div className="min-w-0 pr-2">
                                            <span className="font-semibold text-slate-800 truncate block">{itm.productName}</span>
                                            <span className="text-[10px] text-slate-500">{itm.cartonsReceived || 0} ctn · @{fmt(itm.unitPrice || 0)}</span>
                                          </div>
                                          <span className="font-bold text-blue-700 text-xs shrink-0">{fmt(itm.totalPrice || 0)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Desktop & Printable Table View */}
                          <div className={suppViewMode === "cards" ? "hidden sm:block overflow-x-auto rounded-lg border border-slate-200" : "overflow-x-auto rounded-lg border border-slate-200"}>
                            <table className="w-full text-xs min-w-[620px] sm:min-w-full border-collapse">
                              <thead>
                                <tr className="bg-slate-100 text-slate-700">
                                  <th className="p-2 sm:p-2.5 text-left font-bold text-[10px] sm:text-xs uppercase tracking-wider">Date</th>
                                  <th className="p-2 sm:p-2.5 text-left font-bold text-[10px] sm:text-xs uppercase tracking-wider">Voucher ID</th>
                                  <th className="p-2 sm:p-2.5 text-left font-bold text-[10px] sm:text-xs uppercase tracking-wider">Store</th>
                                  <th className="p-2 sm:p-2.5 text-right font-bold text-[10px] sm:text-xs uppercase tracking-wider">Cartons</th>
                                  <th className="p-2 sm:p-2.5 text-right font-bold text-[10px] sm:text-xs uppercase tracking-wider">Total Value</th>
                                  <th className="p-2 sm:p-2.5 text-right font-bold text-[10px] sm:text-xs uppercase tracking-wider">Paid at Receipt</th>
                                  <th className="p-2 sm:p-2.5 text-right font-bold text-[10px] sm:text-xs uppercase tracking-wider">Remaining</th>
                                  <th className="p-2 sm:p-2.5 text-center font-bold text-[10px] sm:text-xs uppercase tracking-wider no-print">Receipt / Details</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {supStockIns.map((si, i) => {
                                  const isExpanded = expandedStockInIds.has(si.id);
                                  const dateStr = si.voucherDate || String(si.createdAt || "").slice(0, 10);
                                  return (
                                    <Fragment key={si.id || i}>
                                      <tr className={`hover:bg-slate-50/80 transition-colors ${si.status === "voided" ? "bg-red-50/50 opacity-70" : i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                        <td className="p-2 sm:p-2.5 font-mono text-slate-700 whitespace-nowrap">
                                          <div>{dateStr}</div>
                                          <div className="text-[10px] text-slate-400">{formatEthDate(dateStr)} ዓ.ም</div>
                                        </td>
                                        <td className="p-2 sm:p-2.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                                          #{si.voucherId || "—"}
                                          {si.status === "voided" && (
                                            <span className="ml-1.5 text-[9px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">
                                              VOID
                                            </span>
                                          )}
                                        </td>
                                        <td className="p-2 sm:p-2.5 text-slate-700 whitespace-nowrap">{si.storeName || "—"}</td>
                                        <td className="p-2 sm:p-2.5 text-right font-bold text-slate-800">{si.totalCartons || 0}</td>
                                        <td className="p-2 sm:p-2.5 text-right font-bold text-blue-800 whitespace-nowrap">{fmt(si.totalPrice || 0)}</td>
                                        <td className="p-2 sm:p-2.5 text-right font-semibold text-emerald-700 whitespace-nowrap">{fmt(si.amountPaid || 0)}</td>
                                        <td className="p-2 sm:p-2.5 text-right font-bold text-red-600 whitespace-nowrap">{fmt(si.remainingBalance || 0)}</td>
                                        <td className="p-2 sm:p-2.5 text-center whitespace-nowrap no-print">
                                          <div className="flex items-center justify-center gap-1.5">
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => toggleExpand(si.id)}
                                              className="h-7 px-2 text-xs gap-1 text-slate-600 hover:text-slate-900"
                                              title={isExpanded ? "Hide items" : "Show items"}
                                            >
                                              {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                              <span>{(si.items || []).length} items</span>
                                            </Button>
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="outline"
                                              onClick={() => setSelectedStockIn(si)}
                                              className="h-7 px-2 text-xs gap-1 font-medium text-blue-700 border-blue-200 hover:bg-blue-50"
                                              title="View & Print Full Goods Receiving Receipt"
                                            >
                                              <Receipt className="w-3.5 h-3.5" />
                                              <span>Full Receipt</span>
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                      {isExpanded && (
                                        <tr className="bg-blue-50/40">
                                          <td colSpan={8} className="p-3">
                                            <div className="bg-white rounded-lg border border-blue-100 p-2.5 shadow-2xs">
                                              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                                                <Package className="w-3.5 h-3.5 text-blue-600" />
                                                <span>Received Items Breakdown</span>
                                              </p>
                                              <table className="w-full text-xs">
                                                <thead>
                                                  <tr className="border-b border-slate-100 text-slate-500 text-[10px]">
                                                    <th className="text-left pb-1 font-semibold">Item</th>
                                                    <th className="text-center pb-1 font-semibold">Code</th>
                                                    <th className="text-right pb-1 font-semibold">Cartons</th>
                                                    <th className="text-right pb-1 font-semibold">Pieces</th>
                                                    <th className="text-right pb-1 font-semibold">Unit Price</th>
                                                    <th className="text-right pb-1 font-semibold">Total Price</th>
                                                  </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                  {(si.items || []).map((itm, idx) => (
                                                    <tr key={idx} className="py-1">
                                                      <td className="py-1 font-medium text-slate-800">{itm.productName}</td>
                                                      <td className="py-1 text-center font-mono text-slate-500">{itm.productCode || "—"}</td>
                                                      <td className="py-1 text-right font-semibold text-blue-700">{itm.cartonsReceived || 0}</td>
                                                      <td className="py-1 text-right text-slate-600">{(itm as any).quantity || ((itm.cartonsReceived || 0) * (itm.quantityPerCarton || 1))}</td>
                                                      <td className="py-1 text-right text-slate-600">{fmt(itm.unitPrice || 0)}</td>
                                                      <td className="py-1 text-right font-bold text-slate-800">{fmt(itm.totalPrice || 0)}</td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* ── Section: Payment History ── */}
                  {(voucherTab === "all" || voucherTab === "payments") && (
                    <div className="p-2.5 sm:p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <DollarSign className="w-4 h-4 text-emerald-600" />
                          <span>Payment History — የተከፈሉ ክፍያዎች</span>
                          <span className="text-[10px] sm:text-[11px] font-normal text-slate-500">
                            ({paymentsList.length} records)
                          </span>
                          {paymentsList.length > 0 && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleClearAllSupplierPayments(showVoucher)}
                              className="h-6 px-2 text-[11px] text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Wipe/Delete all payment records for this supplier"
                            >
                              <Trash2 className="w-3 h-3 mr-1" /> Clear All Payments
                            </Button>
                          )}
                        </div>
                      </div>

                      {(() => {
                        const hasBegBal = (showVoucher.beginningBalance || 0) > 0;
                        const hasBegPaid = (showVoucher.beginningPaid || 0) > 0;
                        const hasAnyData = paymentsList.length > 0 || hasBegBal || hasBegPaid;

                        if (!hasAnyData) {
                          return <div className="text-center py-8 text-slate-400 text-xs sm:text-sm">No payments recorded yet</div>;
                        }

                        const filteredPayments = paymentsList.filter(p => {
                          if (!p) return false;
                          const q = (paymentSearch || "").toLowerCase();
                          if (!q) return true;
                          return (
                            ((p as any).paymentDate || "").includes(q) ||
                            (p.note || "").toLowerCase().includes(q) ||
                            String(p.amountPaid ?? "").includes(q) ||
                            String(p.remainingBalance ?? "").includes(q) ||
                            (p.fsNumber || "").toLowerCase().includes(q)
                          );
                        });

                        return (
                          <>
                            {/* Mobile Cards View */}
                            <div className={suppViewMode === "cards" ? "block sm:hidden space-y-2" : "hidden"}>
                              {hasBegBal && (
                                <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/70 flex items-center justify-between">
                                  <div>
                                    <div className="text-xs font-bold text-blue-800">Opening Balance</div>
                                    <div className="text-[11px] text-slate-500 font-mono">{showVoucher.beginningDate || "Initial record"}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs font-bold text-red-600">{fmt(showVoucher.beginningBalance || 0)}</div>
                                  </div>
                                </div>
                              )}
                              {hasBegPaid && (
                                <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/70 flex items-center justify-between">
                                  <div>
                                    <div className="text-xs font-bold text-emerald-800">Opening Payment</div>
                                    <div className="text-[11px] text-slate-500 font-mono">{showVoucher.beginningPaidDate || "Initial record"}</div>
                                  </div>
                                  <div className="text-right">
                                    <div className="text-xs font-bold text-emerald-700">+{fmt(showVoucher.beginningPaid || 0)}</div>
                                    <div className="text-[10px] font-bold text-red-600">Bal: {fmt((showVoucher.beginningBalance || 0) - (showVoucher.beginningPaid || 0))}</div>
                                  </div>
                                </div>
                              )}

                              {filteredPayments.length === 0 && paymentsList.length > 0 ? (
                                <div className="text-center py-6 text-slate-400 text-xs bg-white rounded-lg border border-dashed">
                                  No payments match "{paymentSearch}"
                                </div>
                              ) : (
                                filteredPayments.map((p, i) => (
                                  <div key={i} className={`p-3 rounded-xl border transition-all ${p.voided ? "bg-red-50/40 border-red-200 opacity-70" : "bg-white border-slate-200 shadow-2xs"}`}>
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="font-mono text-xs text-slate-600">{(p as any).paymentDate || "—"}</span>
                                        {p.fsNumber && <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700 font-semibold">FS: {p.fsNumber}</span>}
                                        {p.voided && <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold">VOID</span>}
                                      </div>
                                      <div className="text-right">
                                        <div className={`text-xs font-bold ${p.voided ? "text-slate-400 line-through" : "text-emerald-700"}`}>
                                          +{fmt(p.amountPaid)}
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between text-xs text-slate-600 py-1">
                                      <span className="text-[11px] text-slate-600 truncate max-w-[180px]">
                                        {p.note || "Supplier payment"}
                                      </span>
                                      <span className="text-xs font-bold text-red-600">
                                        Bal: {fmt(p.remainingBalance)}
                                      </span>
                                    </div>
                                    <div className="flex items-center justify-end gap-1 pt-1.5 border-t border-slate-100 no-print">
                                      {(p as any).photoProofUrl && (
                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-emerald-600 hover:bg-emerald-50" onClick={() => window.open((p as any).photoProofUrl, "_blank")}>
                                          <Eye className="w-3.5 h-3.5 mr-1" /> Photo
                                        </Button>
                                      )}
                                      {!p.voided && (
                                        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-blue-600 hover:bg-blue-50" onClick={() => { setEditingPayment(p); setEditPayForm({ amountPaid: p.amountPaid, note: p.note || "", paymentDate: (p as any).paymentDate || "" }); }}>
                                          <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
                                        </Button>
                                      )}
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-600 hover:bg-red-50" onClick={() => handleDeletePayment(p, showVoucher)}>
                                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                                      </Button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>

                            {/* Desktop & Printable Table View */}
                            <div className={suppViewMode === "cards" ? "hidden sm:block overflow-x-auto rounded-lg border border-slate-200" : "overflow-x-auto rounded-lg border border-slate-200"}>
                              <table className="w-full text-xs min-w-[520px] sm:min-w-full border-collapse">
                                <thead>
                                  <tr className="bg-slate-100 text-slate-700">
                                    {["Date", "Amount Paid", "FS #", "Note", "Balance", ""].map(h => (
                                      <th
                                        key={h}
                                        className={`p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider ${
                                          h === "Balance" ? "text-right" : "text-left"
                                        }`}
                                      >
                                        {h}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {hasBegBal && (
                                    <tr className="bg-blue-50/70">
                                      <td className="p-2 sm:p-2.5 text-slate-600 italic font-mono">{showVoucher.beginningDate || "—"}</td>
                                      <td className="p-2 sm:p-2.5 text-blue-700 font-bold">—</td>
                                      <td className="p-2 sm:p-2.5 text-slate-700">—</td>
                                      <td className="p-2 sm:p-2.5 text-blue-700 font-semibold">Opening Balance</td>
                                      <td className="p-2 sm:p-2.5 text-red-600 font-bold text-right">{fmt(showVoucher.beginningBalance || 0)}</td>
                                      <td></td>
                                    </tr>
                                  )}
                                  {hasBegPaid && (
                                    <tr className="bg-emerald-50/70">
                                      <td className="p-2 sm:p-2.5 text-slate-600 italic font-mono">{showVoucher.beginningPaidDate || "—"}</td>
                                      <td className="p-2 sm:p-2.5 text-emerald-700 font-bold">{fmt(showVoucher.beginningPaid || 0)}</td>
                                      <td className="p-2 sm:p-2.5 text-slate-700">—</td>
                                      <td className="p-2 sm:p-2.5 text-emerald-700 font-semibold">Opening Payment</td>
                                      <td className="p-2 sm:p-2.5 text-red-600 font-bold text-right">{fmt((showVoucher.beginningBalance || 0) - (showVoucher.beginningPaid || 0))}</td>
                                      <td></td>
                                    </tr>
                                  )}
                                  {filteredPayments.length === 0 && paymentsList.length > 0 ? (
                                    <tr><td colSpan={6} className="text-center py-6 text-slate-400 text-xs">No payments match "{paymentSearch}"</td></tr>
                                  ) : filteredPayments.map((p, i) => (
                                    <tr key={i} className={`hover:bg-slate-50/80 transition-colors ${p.voided ? "bg-red-50/50 opacity-70" : i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                                      <td className={`p-2 sm:p-2.5 text-slate-600 font-mono whitespace-nowrap ${p.voided ? "line-through" : ""}`}>
                                        {(p as any).paymentDate || "—"}
                                      </td>
                                      <td className={`p-2 sm:p-2.5 font-bold whitespace-nowrap ${p.voided ? "text-slate-400 line-through" : "text-emerald-700"}`}>
                                        {fmt(p.amountPaid)}
                                        {p.voided && (
                                          <span className="ml-1.5 text-[9px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded">
                                            VOID
                                          </span>
                                        )}
                                      </td>
                                      <td className={`p-2 sm:p-2.5 text-slate-700 font-mono whitespace-nowrap ${p.voided ? "line-through" : ""}`}>
                                        {(p as any).fsNumber || "—"}
                                      </td>
                                      <td className={`p-2 sm:p-2.5 text-slate-600 max-w-[140px] truncate ${p.voided ? "line-through" : ""}`}>
                                        {p.note || "—"}
                                      </td>
                                      <td className={`p-2 sm:p-2.5 font-bold text-right whitespace-nowrap ${p.voided ? "text-slate-400 line-through" : "text-red-600"}`}>
                                        {fmt(p.remainingBalance)}
                                      </td>
                                      <td className="p-2 sm:p-2.5 text-right whitespace-nowrap no-print">
                                        <div className="flex items-center justify-end gap-1">
                                          {(p as any).photoProofUrl && (
                                            <button className="p-1 rounded text-emerald-600 hover:bg-emerald-50" title="View Photo Proof" onClick={() => window.open((p as any).photoProofUrl, "_blank")}>
                                              <Eye className="w-3.5 h-3.5 inline" />
                                            </button>
                                          )}
                                          {!p.voided && (
                                            <button className="p-1 rounded text-blue-600 hover:bg-blue-50" title="Edit" onClick={() => { setEditingPayment(p); setEditPayForm({ amountPaid: p.amountPaid, note: p.note || "", paymentDate: (p as any).paymentDate || "" }); }}>
                                              <Pencil className="w-3.5 h-3.5 inline" />
                                            </button>
                                          )}
                                          <button className="p-1 rounded text-red-600 hover:bg-red-50" title="Delete" onClick={() => handleDeletePayment(p, showVoucher)}>
                                            <Trash2 className="w-3.5 h-3.5 inline" />
                                          </button>
                                          {isAdmin && (
                                            p.voided
                                              ? <button className="p-1 rounded text-green-600 hover:bg-green-50" title="Activate payment" onClick={() => handleVoidPayment(p)}><RotateCcw className="w-3.5 h-3.5 inline" /></button>
                                              : <button className="p-1 rounded text-orange-600 hover:bg-orange-50" title="Void payment" onClick={() => handleVoidPayment(p)}><Ban className="w-3.5 h-3.5 inline" /></button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}

                  {/* ── Footer ── */}
                  <div className="bg-slate-50 border-t border-slate-200 px-4 py-2.5 flex items-center justify-between text-[10px] text-slate-500">
                    <span>Computer-generated official statement · {getStoredBrandName()}</span>
                    <span>{new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
              </div>
            );
          })()}

          {editingPayment && showVoucher && (
            <div className="border rounded-xl p-3.5 space-y-2.5 bg-muted/40 m-3 shrink-0">
              <h4 className="text-xs sm:text-sm font-bold">Edit Payment</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div><Label className="text-xs">Amount</Label><Input type="number" min={0} step={0.01} value={editPayForm.amountPaid} onChange={e => setEditPayForm(f => ({ ...f, amountPaid: parseFloat(e.target.value) || 0 }))} className="h-8 text-xs" /></div>
                <div><Label className="text-xs">Date</Label><Input type="date" value={editPayForm.paymentDate} onChange={e => setEditPayForm(f => ({ ...f, paymentDate: e.target.value }))} className="h-8 text-xs" /></div>
              </div>
              <div><Label className="text-xs">Note</Label><Input value={editPayForm.note} onChange={e => setEditPayForm(f => ({ ...f, note: e.target.value }))} className="h-8 text-xs" /></div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => handleSaveEditPayment(showVoucher)}>Save Changes</Button>
                <Button size="sm" variant="outline" onClick={() => setEditingPayment(null)}>Cancel</Button>
              </div>
            </div>
          )}

          <DialogFooter className="p-2 sm:p-3 border-t border-border bg-background flex flex-row items-center justify-between gap-2 shrink-0">
            <ReceiptActionBar
              receiptRef={voucherRef}
              voucherId={showVoucher ? `Statement_${showVoucher.name.replace(/\s+/g, "_")}` : "Supplier_Statement"}
              voucherTitle={`SUPPLIER STATEMENT: ${showVoucher?.name || ""}`}
              voucherSubtitle={`Phone: ${showVoucher?.phone || "—"} | Payable Debt: ${fmt(showVoucher?.totalBalance || 0)}`}
              filenamePrefix="supplier_statement"
              documentType="statement"
              onExportExcel={() => showVoucher && exportExcel(showVoucher)}
              onSharePdf={handleSharePdf}
              onShare={handleShare}
              onPrint={handlePrint}
              sharing={sharing}
              sharingPdf={sharingPdf}
              exportingExcel={exportingExcel}
            />
            <Button variant="outline" size="sm" onClick={() => setShowVoucher(null)} className="h-8 px-3 text-xs shrink-0">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clear Debt Dialog */}
      <Dialog open={!!clearTargetSupplier} onOpenChange={(open) => { if (!open) setClearTargetSupplier(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCheck className="w-6 h-6" />
              <DialogTitle>Clear Supplier Debt (የአቅራቢ እዳ አጽዳ)</DialogTitle>
            </div>
          </DialogHeader>
          {clearTargetSupplier && (
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-900 border rounded-xl p-3.5 space-y-2 text-xs sm:text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supplier:</span>
                  <span className="font-bold">{clearTargetSupplier.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Paid:</span>
                  <span className="font-semibold text-green-600">{fmt(clearTargetSupplier.totalPaid)}</span>
                </div>
                <div className="flex justify-between text-base pt-1 border-t">
                  <span className="font-bold">Outstanding Debt (ቀሪ እዳ):</span>
                  <span className="font-extrabold text-red-600">{fmt(clearTargetSupplier.totalBalance)}</span>
                </div>
              </div>

              <div className="border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl p-3.5 space-y-3">
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
                  Option 1: Record Settle Payment (ቀሪ እዳውን ከፍሎ መጨረስ)
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label className="text-xs">Payment Date</Label>
                    <Input type="date" value={clearPayDate} onChange={e => setClearPayDate(e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Amount (ETB)</Label>
                    <Input type="number" min={0} step={0.01} value={clearPayAmount} onChange={e => setClearPayAmount(parseFloat(e.target.value) || 0)} className="h-8 text-xs mt-1 font-bold text-emerald-700" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Note</Label>
                  <Input value={clearPayNote} onChange={e => setClearPayNote(e.target.value)} className="h-8 text-xs mt-1" placeholder="e.g. Settle debt in full" />
                </div>
                <Button
                  type="button"
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold h-9"
                  disabled={clearing || clearPayAmount <= 0}
                  onClick={handleConfirmClearPay}
                >
                  <CheckCircle2 className="w-4 h-4 mr-1.5" />
                  {clearing ? "Processing..." : `Record Settle Payment (${fmt(clearPayAmount)} ETB)`}
                </Button>
              </div>

              <div className="border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">Option 2: Reset Balance to 0</p>
                    <p className="text-[11px] text-muted-foreground">ቀጥታ ቀሪ እዳውን ወደ 0 ማጽዳት (ወደ ዜሮ ማስተካከል)</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-amber-700 border-amber-300 hover:bg-amber-100 dark:border-amber-700 text-xs font-semibold shrink-0"
                    disabled={clearing}
                    onClick={handleResetBalanceZero}
                  >
                    Reset to 0
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearTargetSupplier(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Full Stock In (Goods Receiving) Receipt Dialog */}
      <Dialog open={!!selectedStockIn} onOpenChange={(open) => { if (!open) setSelectedStockIn(null); }}>
        <DialogContent className={`max-h-[92vh] overflow-y-auto p-3 sm:p-6 ${(selectedStockIn?.referencePhotoUrl || (selectedStockIn as any)?.photoProofUrl) ? "max-w-6xl xl:max-w-7xl" : "max-w-3xl"}`}>
          <DialogHeader className="flex flex-row items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-primary" />
              <DialogTitle className="text-base sm:text-lg font-bold">Stock In (Goods Receiving) Voucher</DialogTitle>
            </div>
          </DialogHeader>
          {selectedStockIn && (
            <ReceiptWithReferenceView
              referencePhotoUrl={selectedStockIn.referencePhotoUrl || (selectedStockIn as any).photoProofUrl}
              voucherId={selectedStockIn.voucherId}
              receiptNode={
                <div ref={stockInReceiptRef} className="bg-white text-slate-900 border rounded-xl p-4 sm:p-6 space-y-4" style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}>
                  {/* Receipt Header */}
                  <div className="border-b pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">{getStoredBrandName().toUpperCase()}</h2>
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-semibold">Goods Receiving Official Voucher</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-block px-2.5 py-1 text-[11px] font-bold rounded-full bg-blue-100 text-blue-800">
                          {selectedStockIn.status === "voided" ? "VOIDED" : "OFFICIAL RECEIPT"}
                        </span>
                        <p className="text-xs font-mono font-bold text-slate-800 mt-1">#{selectedStockIn.voucherId || "—"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <div>
                        <span className="text-slate-500 font-medium">Date:</span>
                        <p className="font-semibold text-slate-800">{selectedStockIn.voucherDate || String(selectedStockIn.createdAt || "").slice(0, 10)}</p>
                        <p className="text-[10px] text-slate-500">{formatEthDate(selectedStockIn.voucherDate || String(selectedStockIn.createdAt || "").slice(0, 10))} ዓ.ም</p>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Supplier:</span>
                        <p className="font-bold text-slate-900">{selectedStockIn.supplierName || "—"}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">Store:</span>
                        <p className="font-semibold text-slate-800">{selectedStockIn.storeName || "—"}</p>
                      </div>
                      <div>
                        <span className="text-slate-500 font-medium">FS / Ref Number:</span>
                        <p className="font-mono font-semibold text-slate-800">{selectedStockIn.fsNumber || "—"}</p>
                      </div>
                    </div>
                  </div>

                  {/* Itemized Table */}
                  <div className="overflow-x-auto rounded-lg border border-slate-200">
                    <table className="w-full text-xs min-w-[500px] border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700">
                          <th className="p-2 text-center font-bold text-[11px] uppercase w-8">#</th>
                          <th className="p-2 text-left font-bold text-[11px] uppercase">Product Description</th>
                          <th className="p-2 text-center font-bold text-[11px] uppercase">Code</th>
                          <th className="p-2 text-right font-bold text-[11px] uppercase">Cartons</th>
                          <th className="p-2 text-right font-bold text-[11px] uppercase">Pieces</th>
                          <th className="p-2 text-right font-bold text-[11px] uppercase">Cost/Pcs</th>
                          <th className="p-2 text-right font-bold text-[11px] uppercase">Total (ETB)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {(selectedStockIn.items || []).map((item, idx) => (
                          <tr key={idx} className={idx % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                            <td className="p-2 text-center text-slate-500">{idx + 1}</td>
                            <td className="p-2 font-medium text-slate-900">{item.productName}</td>
                            <td className="p-2 text-center font-mono text-slate-600">{item.productCode || "—"}</td>
                            <td className="p-2 text-right font-semibold text-blue-700">{item.cartonsReceived || 0}</td>
                            <td className="p-2 text-right text-slate-700">{(item as any).quantity || ((item.cartonsReceived || 0) * (item.quantityPerCarton || 1))}</td>
                            <td className="p-2 text-right text-slate-700">{fmt(item.unitPrice || 0)}</td>
                            <td className="p-2 text-right font-bold text-slate-900">{fmt(item.totalPrice || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary Breakdown */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 pt-2">
                    <div className="text-xs text-slate-600">
                      {selectedStockIn.remark && <p><span className="font-semibold">Remarks:</span> {selectedStockIn.remark}</p>}
                      <p className="text-[11px] text-slate-400 mt-1">Total Cartons Received: <span className="font-bold text-slate-700">{selectedStockIn.totalCartons || 0}</span></p>
                    </div>
                    <div className="w-full sm:w-64 bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Total Goods Value:</span>
                        <span className="font-bold text-slate-900">{fmt(selectedStockIn.totalPrice || 0)} ETB</span>
                      </div>
                      <div className="flex justify-between text-emerald-700 font-semibold">
                        <span>Paid at Receiving:</span>
                        <span>{fmt(selectedStockIn.amountPaid || 0)} ETB</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-300 pt-1.5 font-bold text-sm text-red-600">
                        <span>Remaining Balance:</span>
                        <span>{fmt(selectedStockIn.remainingBalance || 0)} ETB</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="border-t pt-3 flex justify-between items-center text-[10px] text-slate-400">
                    <span>Official Goods Receipt · {getStoredBrandName()}</span>
                    <span>Verified & Recorded</span>
                  </div>
                </div>
              }
            />
          )}
          <DialogFooter className="gap-2 flex-wrap sm:justify-between pt-2 border-t">
            <ReceiptActionBar
              receiptRef={stockInReceiptRef}
              referencePhotoUrl={selectedStockIn?.referencePhotoUrl}
              voucherId={selectedStockIn?.voucherId || "StockIn_Receipt"}
              voucherTitle="STOCK IN GOODS RECEIPT"
              voucherSubtitle={`Supplier: ${selectedStockIn?.supplierName || ""} | Value: ${fmt(selectedStockIn?.totalPrice || 0)}`}
              filenamePrefix="stock_in_receipt"
              documentType="receipt"
              onPrint={handlePrintStockInReceipt}
              onShare={handleShareStockInReceipt}
              onSharePdf={handleShareStockInPdf}
              sharing={sharingStockInReceipt}
              sharingPdf={sharingStockInPdf}
            />
            <Button variant="secondary" onClick={() => setSelectedStockIn(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {DeleteAuthDialog}
    </div>
  );
}
