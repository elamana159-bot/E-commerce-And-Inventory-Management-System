import { useState, useEffect, useRef, Fragment } from "react";
import { useLocation } from "wouter";
import { fmt } from "@/lib/currency";
import { Plus, Search, Users, Edit, Trash2, Eye, Printer, DollarSign, Pencil, Share2, Ban, RotateCcw, FileText, X, ChevronDown, ChevronUp, ChevronRight, MoreHorizontal, Maximize2, Minimize2, ShoppingBag, Receipt, CheckCheck, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { getAll, getById, create, update, remove, COLLECTIONS, generateVoucherId, generateSerialVoucherId, subscribeCollection } from "@/lib/firestore";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { uploadImage } from "@/lib/cloudinary";
import type { Customer, CustomerPayment, Supplier, Account, AccountVoucher, PosSale, Product } from "@/lib/types";
import { printElement } from "@/lib/printUtils";
import { shareAsImage, shareAsPdf, exportToExcel, exportToPdf } from "@/lib/shareImage";
import { ReceiptActionBar } from "@/components/ReceiptActionBar";
import { ReceiptWithReferenceView } from "@/components/ReceiptWithReferenceView";
import { useAuth } from "@/lib/auth";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { getStoredBrandName, replaceBrandInTitle } from "@/lib/brandConfig";
import { postCustomerPaymentJournalEntry, voidJournalEntryByReference, reactivateJournalEntryByReference, postCustomerOpeningBalanceJournalEntry } from "@/lib/accountingEngine";

export default function Customers() {
  const [, setLocation] = useLocation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [posSales, setPosSales] = useState<PosSale[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showDialog, setShowDialog] = useState(false);
  const [showVoucher, setShowVoucher] = useState<Customer | null>(null);
  const [isFullScreenVoucher, setIsFullScreenVoucher] = useState(false);
  const [selectedPosSale, setSelectedPosSale] = useState<PosSale | null>(null);
  const [expandedSaleIds, setExpandedSaleIds] = useState<Set<string>>(new Set());
  const [voucherTab, setVoucherTab] = useState<"all" | "sales" | "payments">("all");
  const [custViewMode, setCustViewMode] = useState<"cards" | "table">("cards");
  const [clearTargetCustomer, setClearTargetCustomer] = useState<Customer | null>(null);
  const [clearPayAmount, setClearPayAmount] = useState(0);
  const [clearPayDate, setClearPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [clearPayNote, setClearPayNote] = useState("ዕዳ በሙሉ ተከፍሎ ተጠናቋል (Full settlement)");
  const [clearing, setClearing] = useState(false);
  const [showPayDialog, setShowPayDialog] = useState<Customer | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", beginningBalance: 0, beginningDate: "", beginningNote: "", beginningPhotoUrl: "" });
  const [beginningUploading, setBeginningUploading] = useState(false);
  const beginningPhotoRef = useRef<HTMLInputElement>(null);
  const [payForm, setPayForm] = useState({ amountPaid: 0, note: "", fsNumber: "", photoProofUrl: "", paymentDate: new Date().toISOString().slice(0, 10), payVia: "none" as "none" | "supplier" | "account", supplierId: "", accountId: "" });
  const [saving, setSaving] = useState(false);
  const [paying, setPaying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingPayment, setEditingPayment] = useState<CustomerPayment | null>(null);
  const [editPayForm, setEditPayForm] = useState({ amountPaid: 0, note: "", paymentDate: "" });
  const [paymentSearch, setPaymentSearch] = useState("");
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const [sharingPdf, setSharingPdf] = useState(false);
  const [sharingSaleReceipt, setSharingSaleReceipt] = useState(false);
  const [sharingSalePdf, setSharingSalePdf] = useState(false);
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();
  const { isAdmin } = useAuth();
  const voucherRef = useRef<HTMLDivElement>(null);
  const posReceiptRef = useRef<HTMLDivElement>(null);
  const handlePrint = () => printElement(voucherRef.current, `Customer_${showVoucher?.name || "Voucher"}`);
  const handlePrintPosReceipt = () => printElement(posReceiptRef.current, `POS_Receipt_${selectedPosSale?.voucherId || "Receipt"}`);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingListPdf, setExportingListPdf] = useState(false);

  const [showBalancePopup, setShowBalancePopup] = useState(true);
  const [popupExpanded, setPopupExpanded] = useState(true);

  const customersWithBalance = customers
    .filter(c => (c.totalBalance || 0) > 0)
    .sort((a, b) => (b.totalBalance || 0) - (a.totalBalance || 0));

  async function handleSharePdf() {
    if (showVoucher) {
      setSharingPdf(true);
      try {
        await exportCustomerPdf(showVoucher);
      } finally {
        setSharingPdf(false);
      }
      return;
    }
    if (!voucherRef.current) return;
    setSharingPdf(true);
    try {
      const r = await shareAsPdf(voucherRef.current, `customer_${showVoucher?.name || "voucher"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingPdf(false);
    }
  }

  async function handleVoidPayment(p: CustomerPayment) {
    const nextVoided = !p.voided;
    await update(COLLECTIONS.CUSTOMER_PAYMENTS, p.id, { voided: nextVoided } as any);
    if (nextVoided) {
      voidJournalEntryByReference(p.fsNumber || p.id).catch(err => console.warn("Void payment JE error:", err));
    } else {
      reactivateJournalEntryByReference(p.fsNumber || p.id).catch(err => console.warn("Reactivate payment JE error:", err));
    }
    setPayments(prev => prev.map(x => x.id === p.id ? { ...x, voided: nextVoided } : x));
    toast({ title: nextVoided ? "Payment voided" : "Payment activated" });
  }

  async function handleShareSaleReceipt() {
    if (!posReceiptRef.current || !selectedPosSale) return;
    setSharingSaleReceipt(true);
    try {
      const r = await shareAsImage(posReceiptRef.current, `POS_Receipt_${selectedPosSale.voucherId || "Sale"}.png`);
      if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    } catch {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setSharingSaleReceipt(false);
    }
  }

  async function handleShareSalePdf() {
    if (!posReceiptRef.current || !selectedPosSale) return;
    setSharingSalePdf(true);
    try {
      const r = await shareAsPdf(posReceiptRef.current, `POS_Receipt_${selectedPosSale.voucherId || "Sale"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingSalePdf(false);
    }
  }

  async function handleShare() {
    if (!voucherRef.current) return;
    setSharing(true);
    try {
      const r = await shareAsImage(voucherRef.current, `customer_${showVoucher?.name || "payment"}.png`);
      if (r === "failed") toast({ title: "Share failed", variant: "destructive" });
    } catch {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setSharing(false);
    }
  }

  async function exportExcel(c: Customer) {
    setExportingExcel(true);
    try {
      const custPayments = payments.filter(p => p.customerId === c.id);
      const cleanCid = c.id ? String(c.id).trim() : "";
      const cleanCname = c.name ? String(c.name).trim().toLowerCase() : "";
      const custSales = posSales.filter(s => {
        if (!s) return false;
        if (cleanCid && s.customerId && String(s.customerId).trim() === cleanCid) return true;
        const sName = s.customerName ? String(s.customerName).trim().toLowerCase() : "";
        if (cleanCname && sName && sName === cleanCname) return true;
        return false;
      });
      const totalPaid = custPayments.filter(p => !p.voided).reduce((s, x) => s + (x.amountPaid || 0), 0);
      const totalSales = custSales.filter(s => s.status !== "voided").reduce((s, x) => s + (x.totalAmount || (x as any).subtotal || 0), 0);
      const brand = getStoredBrandName();

      const data = [
        [`${brand.toUpperCase()} - CUSTOMER ACCOUNT STATEMENT / VOUCHER`],
        ["Customer Name", c.name || "—"],
        ["Phone", c.phone || "—"],
        ["Address", c.address || "—"],
        ["Statement Date", new Date().toISOString().slice(0, 10)],
        ["Opening Balance (ETB)", c.beginningBalance || 0],
        ["Total Goods Taken / POS Sales (ETB)", totalSales],
        ["Total Paid (ETB)", totalPaid],
        ["Remaining Balance (ETB)", c.totalBalance || 0],
        [],
        ["─── GOODS TAKEN / POS SALES RECEIPTS (የተወሰዱ እቃዎች) ───"],
        ["Date", "POS Voucher ID", "Store", "Items Summary", "Total Value (ETB)", "Paid at Sale (ETB)", "Credit Balance (ETB)"],
        ...custSales.map(s => [
          s.voucherDate || String(s.createdAt || "").slice(0, 10),
          s.voucherId || "—",
          s.storeName || "—",
          (s.items || []).map(i => `${i.productName} (${i.cartons || 0} ctn, ${i.quantity || 0} pcs)`).join("; "),
          s.totalAmount || s.subtotal || 0,
          s.amountPaid || 0,
          s.remainingBalance || 0,
        ]),
        [],
        ["─── PAYMENT RECORDS (የተከፈሉ ክፍያዎች) ───"],
        ["Date", "Amount Paid (ETB)", "FS Number", "Paid Via", "Note", "Status"],
        ...custPayments.map(p => [
          (p as any).paymentDate || String(p.createdAt || "").slice(0, 10),
          p.amountPaid,
          p.fsNumber || "—",
          (p as any).paidVia || "—",
          p.note || "",
          p.voided ? "VOIDED" : "ACTIVE"
        ]),
        [],
        ["", "Total Paid (ETB):", totalPaid]
      ];

      const res = await exportToExcel({
        data,
        sheetName: "Customer Statement",
        filename: `customer_statement_${c.name.replace(/\s+/g, "_")}.xlsx`,
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

  async function exportCustomerPdf(c: Customer) {
    try {
      const custPayments = payments.filter(p => p.customerId === c.id);
      const cleanCid = c.id ? String(c.id).trim() : "";
      const cleanCname = c.name ? String(c.name).trim().toLowerCase() : "";
      const custSales = posSales.filter(s => {
        if (!s) return false;
        if (cleanCid && s.customerId && String(s.customerId).trim() === cleanCid) return true;
        const sName = s.customerName ? String(s.customerName).trim().toLowerCase() : "";
        if (cleanCname && sName && sName === cleanCname) return true;
        return false;
      });
      const totalPaid = custPayments.filter(p => !p.voided).reduce((s, x) => s + (x.amountPaid || 0), 0);
      const totalSales = custSales.filter(s => s.status !== "voided").reduce((s, x) => s + (x.totalAmount || (x as any).subtotal || 0), 0);
      const brand = getStoredBrandName();

      const pdfColumns = [
        { header: "#", key: "index", width: 6, align: "center" as const, isInteger: true },
        { header: "Type", key: "type", width: 14, align: "center" as const },
        { header: "Date", key: "date", width: 14, align: "center" as const },
        { header: "Ref / Voucher #", key: "ref", width: 18, align: "center" as const },
        { header: "Details / Items Summary", key: "details", width: 28, align: "left" as const },
        { header: "Debit / Sale (ETB)", key: "debit", width: 16, align: "right" as const, isCurrency: true },
        { header: "Credit / Paid (ETB)", key: "credit", width: 16, align: "right" as const, isCurrency: true },
        { header: "Status", key: "status", width: 10, align: "center" as const },
      ];

      const pdfRows: any[] = [];
      let rowIdx = 1;

      if ((c.beginningBalance || 0) > 0) {
        pdfRows.push({
          index: rowIdx++,
          type: "OPENING",
          date: c.beginningDate || "—",
          ref: "BEG-BAL",
          details: `Opening Balance ${c.beginningNote ? `(${c.beginningNote})` : ""}`,
          debit: c.beginningBalance || 0,
          credit: 0,
          status: "ACTIVE",
        });
      }

      custSales.forEach(s => {
        const itemSummary = (s.items || []).map(i => `${i.productName} x${i.cartons || 0}ctn`).join(", ") || "POS Sale";
        pdfRows.push({
          index: rowIdx++,
          type: "POS SALE",
          date: s.voucherDate || String(s.createdAt || "").slice(0, 10),
          ref: s.voucherId || "—",
          details: itemSummary.length > 50 ? itemSummary.slice(0, 50) + "..." : itemSummary,
          debit: s.totalAmount || s.subtotal || 0,
          credit: s.amountPaid || 0,
          status: s.status === "voided" ? "VOIDED" : "ACTIVE",
        });
      });

      custPayments.forEach(p => {
        pdfRows.push({
          index: rowIdx++,
          type: "PAYMENT",
          date: (p as any).paymentDate || String(p.createdAt || "").slice(0, 10),
          ref: p.fsNumber || "—",
          details: p.note || `Paid via ${((p as any).paidVia || "DIRECT").toUpperCase()}`,
          debit: 0,
          credit: p.amountPaid || 0,
          status: p.voided ? "VOIDED" : "ACTIVE",
        });
      });

      pdfRows.push({
        index: "",
        type: "TOTAL",
        date: "",
        ref: "",
        details: `Sales: ${custSales.length} | Payments: ${custPayments.length}`,
        debit: totalSales + (c.beginningBalance || 0),
        credit: totalPaid,
        status: "",
        _isGrandTotal: true,
      });

      await exportToPdf({
        title: `${brand.toUpperCase()} CUSTOMER ACCOUNT STATEMENT & VOUCHER`,
        subtitle: `Customer: ${c.name} | Phone: ${c.phone || "—"} | Address: ${c.address || "—"}`,
        filename: `Customer_Statement_${c.name.replace(/\s+/g, "_")}.pdf`,
        orientation: "landscape",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Opening Balance", value: `${fmt(c.beginningBalance || 0)} ETB` },
          { label: "Goods Taken (Sales)", value: `${fmt(totalSales)} ETB` },
          { label: "Total Paid", value: `${fmt(totalPaid)} ETB` },
          { label: "Outstanding Balance", value: `${fmt(c.totalBalance || 0)} ETB` },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          if (row.status === "VOIDED") return { textColor: [220, 38, 38] };
          if (row.type === "POS SALE") return { bgColor: [248, 250, 252] };
          if (row.type === "PAYMENT") return { bgColor: [240, 253, 244] };
          return null;
        },
      });
      toast({ title: "Customer statement exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    }
  }

  async function exportCustomersListPdf() {
    setExportingListPdf(true);
    try {
      const pdfColumns = [
        { header: "#", key: "index", width: 8, align: "center" as const, isInteger: true },
        { header: "Customer Name", key: "name", width: 26, align: "left" as const },
        { header: "Phone", key: "phone", width: 16, align: "center" as const },
        { header: "Address", key: "address", width: 22, align: "left" as const },
        { header: "Total Paid (ETB)", key: "totalPaid", width: 16, align: "right" as const, isCurrency: true },
        { header: "Balance (ETB)", key: "totalBalance", width: 16, align: "right" as const, isCurrency: true },
      ];

      let sumPaid = 0;
      let sumBalance = 0;

      const pdfRows = filtered.map((c, idx) => {
        sumPaid += c.totalPaid || 0;
        sumBalance += c.totalBalance || 0;
        return {
          index: idx + 1,
          name: c.name,
          phone: c.phone || "—",
          address: c.address || "—",
          totalPaid: c.totalPaid || 0,
          totalBalance: c.totalBalance || 0,
        };
      });

      pdfRows.push({
        index: "",
        name: "GRAND TOTAL",
        phone: "",
        address: `${filtered.length} Customers`,
        totalPaid: sumPaid,
        totalBalance: sumBalance,
        _isGrandTotal: true,
      } as any);

      const dateStr = new Date().toISOString().slice(0, 10);
      await exportToPdf({
        title: "YESERAHUT CUSTOMERS DIRECTORY & BALANCES",
        subtitle: `Total Customers: ${filtered.length} | Export Date: ${dateStr}`,
        filename: `Customers_Report_${dateStr}.pdf`,
        orientation: "landscape",
        columns: pdfColumns,
        rows: pdfRows,
        summaryCards: [
          { label: "Total Customers", value: filtered.length },
          { label: "Total Collected (ETB)", value: fmt(sumPaid) },
          { label: "Total Outstanding Balance (ETB)", value: fmt(sumBalance) },
        ],
        rowStyler: (row) => {
          if (row._isGrandTotal) return { isGrandTotal: true, bold: true };
          return null;
        },
      });
      toast({ title: "Customers report exported to PDF" });
    } catch (err: any) {
      toast({ title: "PDF Export Failed", description: err.message || "Failed to generate PDF", variant: "destructive" });
    } finally {
      setExportingListPdf(false);
    }
  }

  async function loadData() {
    setLoading(true);
    const [custs, pays, sups, accs, sales, prods] = await Promise.all([
      getAll<Customer>(COLLECTIONS.CUSTOMERS),
      getAll<CustomerPayment>(COLLECTIONS.CUSTOMER_PAYMENTS),
      getAll<Supplier>(COLLECTIONS.SUPPLIERS),
      getAll<Account>(COLLECTIONS.ACCOUNTS),
      getAll<PosSale>(COLLECTIONS.POS_SALES),
      getAll<Product>(COLLECTIONS.PRODUCTS),
    ]);
    setCustomers(custs.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    setPayments(pays);
    setSuppliers(sups);
    setAccounts(accs);
    setPosSales(sales);
    setProducts(prods);
    setLoading(false);
  }

  useEffect(() => {
    loadData();

    const unsubCusts = subscribeCollection<Customer>(COLLECTIONS.CUSTOMERS, (data) => {
      setCustomers(data.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    });
    const unsubPays = subscribeCollection<CustomerPayment>(COLLECTIONS.CUSTOMER_PAYMENTS, setPayments);
    const unsubSups = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, setSuppliers);
    const unsubAccs = subscribeCollection<Account>(COLLECTIONS.ACCOUNTS, setAccounts);
    const unsubSales = subscribeCollection<PosSale>(COLLECTIONS.POS_SALES, setPosSales);
    const unsubProds = subscribeCollection<Product>(COLLECTIONS.PRODUCTS, setProducts);

    return () => {
      unsubCusts();
      unsubPays();
      unsubSups();
      unsubAccs();
      unsubSales();
      unsubProds();
    };
  }, []);

  const filtered = customers.filter(c =>
    Boolean(c) && (
      (c.name || "").toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search) ||
      (c.address || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  function openAdd() {
    setEditCustomer(null);
    setForm({ name: "", address: "", phone: "", beginningBalance: 0, beginningDate: "", beginningNote: "", beginningPhotoUrl: "" });
    setShowDialog(true);
  }

  function openEdit(c: Customer) {
    setEditCustomer(c);
    setForm({ name: c.name, address: c.address, phone: c.phone, beginningBalance: 0, beginningDate: "", beginningNote: "", beginningPhotoUrl: "" });
    setShowDialog(true);
  }

  async function handleBeginningPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBeginningUploading(true);
    try {
      const url = await uploadImage(file, "beginning");
      setForm(f => ({ ...f, beginningPhotoUrl: url }));
    } catch {
      toast({ title: "Photo upload failed", variant: "destructive" });
    } finally {
      setBeginningUploading(false);
    }
  }

  async function handleSave() {
    if (!form.name) { toast({ title: "Name required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      if (editCustomer) {
        const { beginningBalance, beginningDate, beginningNote, beginningPhotoUrl, ...basic } = form;
        await update(COLLECTIONS.CUSTOMERS, editCustomer.id, basic);
        toast({ title: "Customer updated" });
      } else {
        const newCustId = await create(COLLECTIONS.CUSTOMERS, {
          ...form,
          totalPaid: 0,
          totalBalance: form.beginningBalance || 0,
          beginningBalance: form.beginningBalance || 0,
          beginningDate: form.beginningDate || "",
          beginningNote: form.beginningNote || "",
          beginningPhotoUrl: form.beginningPhotoUrl || "",
          voucherId: generateVoucherId("CUST"),
        });
        if (form.beginningBalance && form.beginningBalance > 0 && newCustId) {
          postCustomerOpeningBalanceJournalEntry({
            id: newCustId,
            name: form.name,
            beginningBalance: form.beginningBalance,
            beginningDate: form.beginningDate,
            totalBalance: form.beginningBalance,
            totalPaid: 0,
          } as Customer).catch(err => console.warn("Customer opening balance JE error:", err));
        }
        toast({ title: "Customer added" });
      }
      setShowDialog(false);
      loadData();
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(c: Customer) {
    confirmDelete(async () => {
      await remove(COLLECTIONS.CUSTOMERS, c.id);
      toast({ title: "Customer deleted" });
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
    } catch (err) {
      toast({ title: "Upload failed", description: String(err instanceof Error ? err.message : err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  function resetPayForm() {
    setPayForm({ amountPaid: 0, note: "", fsNumber: "", photoProofUrl: "", paymentDate: new Date().toISOString().slice(0, 10), payVia: "none", supplierId: "", accountId: "" });
  }

  async function handlePayment() {
    if (!showPayDialog || !payForm.amountPaid || payForm.amountPaid <= 0) {
      toast({ title: "Enter a valid payment amount", variant: "destructive" });
      return;
    }
    if (payForm.fsNumber) {
      const [existingCust, existingSupp, existingAccVouchers] = await Promise.all([
        getAll<CustomerPayment>(COLLECTIONS.CUSTOMER_PAYMENTS),
        getAll<{ fsNumber?: string }>(COLLECTIONS.SUPPLIER_PAYMENTS),
        getAll<AccountVoucher>(COLLECTIONS.ACCOUNT_VOUCHERS),
      ]);
      const inCust = existingCust.some(p => p.fsNumber === payForm.fsNumber);
      const inSupp = existingSupp.some(p => p.fsNumber === payForm.fsNumber);
      const inAcc = existingAccVouchers.some(v => v.fsNumber === payForm.fsNumber && !v.isVoided);
      if (inCust || inSupp || inAcc) {
        const where = inCust ? "Customer Payments" : inSupp ? "Supplier Payments" : "Account Vouchers";
        toast({ title: `FS Number "${payForm.fsNumber}" already exists`, description: `Found in: ${where}`, variant: "destructive" });
        return;
      }
    }
    // Validate supplier/account selection
    const supplier = payForm.payVia === "supplier" ? suppliers.find(s => s.id === payForm.supplierId) : undefined;
    const account = payForm.payVia === "account" ? accounts.find(a => a.id === payForm.accountId) : undefined;
    if (payForm.payVia === "supplier" && !supplier) {
      toast({ title: "Please select a supplier", variant: "destructive" }); return;
    }
    if (payForm.payVia === "account" && !account) {
      toast({ title: "Please select an account", variant: "destructive" }); return;
    }
    setPaying(true);
    try {
      const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, showPayDialog.id) || showPayDialog;
      const currentBal = Number(freshCust.totalBalance || 0);
      const currentPaid = Number(freshCust.totalPaid || 0);
      const newPaid = currentPaid + payForm.amountPaid;
      const newBalance = Math.max(0, currentBal - payForm.amountPaid);
      const payPayload = {
        customerId: showPayDialog.id,
        customerName: showPayDialog.name,
        amountPaid: payForm.amountPaid,
        remainingBalance: newBalance,
        photoProofUrl: payForm.photoProofUrl,
        fsNumber: payForm.fsNumber,
        note: payForm.note,
        paymentDate: payForm.paymentDate,
        payVia: payForm.payVia,
        supplierId: payForm.payVia === "supplier" ? payForm.supplierId : "",
        supplierName: payForm.payVia === "supplier" ? (supplier?.name || "") : "",
        accountId: payForm.payVia === "account" ? payForm.accountId : "",
        accountName: payForm.payVia === "account" ? (account ? `${account.bankName} - ${account.personName}` : "") : "",
        accountNumber: payForm.payVia === "account" ? (account?.accountNumber || "") : "",
      };
      const [newPayId] = await Promise.all([
        create(COLLECTIONS.CUSTOMER_PAYMENTS, payPayload),
        update(COLLECTIONS.CUSTOMERS, showPayDialog.id, { totalPaid: newPaid, totalBalance: newBalance }),
      ]);
      postCustomerPaymentJournalEntry({ ...payPayload, id: newPayId } as any).catch(err => console.warn("Auto customer payment journal error:", err));
      // Supplier: increase totalPaid, decrease totalBalance, create supplier_payments record
      if (supplier) {
        const sNewPaid = (supplier.totalPaid || 0) + payForm.amountPaid;
        const sNewBalance = Math.max(0, (supplier.totalBalance || 0) - payForm.amountPaid);
        await Promise.all([
          create(COLLECTIONS.SUPPLIER_PAYMENTS, {
            supplierId: supplier.id,
            supplierName: supplier.name,
            amountPaid: payForm.amountPaid,
            remainingBalance: sNewBalance,
            fsNumber: payForm.fsNumber,
            note: payForm.note,
            paymentDate: payForm.paymentDate,
            photoProofUrl: payForm.photoProofUrl,
          }),
          update(COLLECTIONS.SUPPLIERS, supplier.id, { totalPaid: sNewPaid, totalBalance: sNewBalance }),
        ]);
      }
      // Account: create deposit voucher and recompute balance
      if (account) {
        const avVoucherId = await generateSerialVoucherId("AV");
        await create(COLLECTIONS.ACCOUNT_VOUCHERS, {
          voucherId: avVoucherId,
          accountId: account.id,
          accountBankName: account.bankName,
          accountPersonName: account.personName,
          accountNumber: account.accountNumber,
          type: "deposit",
          amount: payForm.amountPaid,
          fsNumber: payForm.fsNumber,
          customerName: showPayDialog.name,
          note: payForm.note,
          date: payForm.paymentDate,
          photoProofUrl: payForm.photoProofUrl,
        } as Record<string, unknown>);
        const allVouchers = await getAll<AccountVoucher>(COLLECTIONS.ACCOUNT_VOUCHERS);
        const active = allVouchers.filter(v => v.accountId === account.id && !v.isVoided);
        const totalDeposit = active.filter(v => v.type === "deposit").reduce((s, v) => s + v.amount, 0);
        const totalWithdraw = active.filter(v => v.type === "withdraw").reduce((s, v) => s + v.amount, 0);
        await update(COLLECTIONS.ACCOUNTS, account.id, { totalDeposit, totalWithdraw, balance: totalDeposit - totalWithdraw });
      }
      toast({ title: "Payment recorded" });
      setShowPayDialog(null);
      resetPayForm();
      loadData();
    } finally {
      setPaying(false);
    }
  }

  function handleDeletePayment(p: CustomerPayment, customer: Customer) {
    confirmDelete(async () => {
      try {
        await remove(COLLECTIONS.CUSTOMER_PAYMENTS, p.id);
        voidJournalEntryByReference(p.fsNumber || p.id).catch(err => console.warn("Void payment JE error:", err));
        const newPaid = Math.max(0, (customer.totalPaid || 0) - p.amountPaid);
        const newBalance = (customer.totalBalance || 0) + p.amountPaid;
        await update(COLLECTIONS.CUSTOMERS, customer.id, { totalPaid: newPaid, totalBalance: newBalance });
        toast({ title: "Payment deleted" });
        await loadData();
      } catch { toast({ title: "Failed", variant: "destructive" }); }
    });
  }

  async function handleSaveEditPayment(customer: Customer) {
    if (!editingPayment) return;
    const diff = editPayForm.amountPaid - editingPayment.amountPaid;
    const newPaid = (customer.totalPaid || 0) + diff;
    const newBalance = Math.max(0, (customer.totalBalance || 0) - diff);
    try {
      await update(COLLECTIONS.CUSTOMER_PAYMENTS, editingPayment.id, {
        amountPaid: editPayForm.amountPaid,
        note: editPayForm.note,
        paymentDate: editPayForm.paymentDate,
        remainingBalance: newBalance,
      });
      await update(COLLECTIONS.CUSTOMERS, customer.id, { totalPaid: newPaid, totalBalance: newBalance });
      toast({ title: "Payment updated" });
      setEditingPayment(null);
      await loadData();
    } catch { toast({ title: "Failed", variant: "destructive" }); }
  }

  const getPayments = (cid?: string) => (cid ? payments.filter(p => p.customerId === cid) : []);

  const getCustomerSales = (cid?: string, cname?: string) => {
    const cleanCid = cid ? String(cid).trim() : "";
    const cleanCname = cname ? String(cname).trim().toLowerCase() : "";
    return posSales.filter(s => {
      if (!s) return false;
      if (cleanCid && s.customerId && String(s.customerId).trim() === cleanCid) return true;
      const sName = s.customerName ? String(s.customerName).trim().toLowerCase() : "";
      if (cleanCname && sName && sName === cleanCname) return true;
      return false;
    });
  };

  const toggleSaleExpand = (id: string) => {
    setExpandedSaleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  async function reconcileCustomerBalance(targetCust: Customer) {
    try {
      const custSales = getCustomerSales(targetCust.id, targetCust.name);
      const activeSales = custSales.filter(s => s.status !== "voided");
      const totalUnpaidFromSales = activeSales.reduce((sum, s) => sum + (s.remainingBalance || 0), 0);
      
      const custPayments = payments.filter(p => p.customerId === targetCust.id && !p.voided);
      const totalPaidEntries = custPayments.reduce((sum, p) => sum + (p.amountPaid || 0), 0);
      
      const freshCust = await getById<Customer>(COLLECTIONS.CUSTOMERS, targetCust.id) || targetCust;
      const openingBal = freshCust.beginningBalance || 0;
      
      const calculatedBalance = Math.max(0, openingBal + totalUnpaidFromSales - totalPaidEntries);
      
      await update(COLLECTIONS.CUSTOMERS, targetCust.id, {
        totalBalance: calculatedBalance,
      });

      setShowVoucher(prev => prev && prev.id === targetCust.id ? { ...prev, totalBalance: calculatedBalance } : prev);
      
      toast({
        title: "የደንበኛው ቀሪ እዳ ተመሳክሯል (Balance Reconciled)",
        description: `${targetCust.name}: አጠቃላይ ቀሪ እዳ ወደ ${fmt(calculatedBalance)} ETB ተስተካክሏል (ከ POS Sales ያልተከፈለ: ${fmt(totalUnpaidFromSales)} ETB)።`,
      });
      
      await loadData();
    } catch (err) {
      console.error("Reconciliation error:", err);
      toast({ title: "Reconciliation failed", variant: "destructive" });
    }
  }

  function openClearModal(c: Customer) {
    setClearTargetCustomer(c);
    setClearPayAmount(c.totalBalance || 0);
    setClearPayDate(new Date().toISOString().slice(0, 10));
    setClearPayNote("ዕዳ በሙሉ ተከፍሎ ተጠናቋል (Full settlement - Debt Cleared)");
  }

  async function handleConfirmClearPay() {
    if (!clearTargetCustomer) return;
    setClearing(true);
    try {
      const settleAmount = clearPayAmount;
      const newPaid = (clearTargetCustomer.totalPaid || 0) + settleAmount;
      const newBalance = Math.max(0, (clearTargetCustomer.totalBalance || 0) - settleAmount);

      const clearPayRecord = {
        customerId: clearTargetCustomer.id,
        customerName: clearTargetCustomer.name,
        amountPaid: settleAmount,
        note: clearPayNote || "ዕዳ በሙሉ ተከፍሎ ተጠናቋል (Debt Cleared)",
        fsNumber: "CLEAR-SETTLE",
        photoProofUrl: "",
        paymentDate: clearPayDate,
        remainingBalance: newBalance,
        payVia: "none" as const,
      };

      const [clearPayId] = await Promise.all([
        create(COLLECTIONS.CUSTOMER_PAYMENTS, clearPayRecord),
        update(COLLECTIONS.CUSTOMERS, clearTargetCustomer.id, {
          totalPaid: newPaid,
          totalBalance: newBalance,
        }),
      ]);

      postCustomerPaymentJournalEntry({ ...clearPayRecord, id: clearPayId } as any).catch(err => console.warn("Auto customer clear payment journal error:", err));

      toast({ title: "ዕዳ ተከፍሎ ተጠናቋል (Debt Successfully Cleared & Settled)" });
      setClearTargetCustomer(null);
      if (showVoucher && showVoucher.id === clearTargetCustomer.id) {
        setShowVoucher(prev => prev ? { ...prev, totalPaid: newPaid, totalBalance: newBalance } : null);
      }
      await loadData();
    } catch {
      toast({ title: "Failed to clear debt", variant: "destructive" });
    } finally {
      setClearing(false);
    }
  }

  async function handleResetBalanceZero() {
    if (!clearTargetCustomer) return;
    confirmDelete(async () => {
      setClearing(true);
      try {
        await update(COLLECTIONS.CUSTOMERS, clearTargetCustomer.id, {
          totalBalance: 0,
        });
        toast({ title: "የደንበኛው ቀሪ እዳ ወደ 0 ተደርጓል (Balance Reset to 0)" });
        if (showVoucher && showVoucher.id === clearTargetCustomer.id) {
          setShowVoucher(prev => prev ? { ...prev, totalBalance: 0 } : null);
        }
        setClearTargetCustomer(null);
        await loadData();
      } catch {
        toast({ title: "Failed to reset balance", variant: "destructive" });
      } finally {
        setClearing(false);
      }
    });
  }

  async function handleClearAllCustomerPayments(customer: Customer) {
    const custPays = payments.filter(p => p.customerId === customer.id);
    if (custPays.length === 0) {
      toast({ title: "No payment records to clear" });
      return;
    }
    confirmDelete(async () => {
      try {
        await Promise.all(custPays.map(p => remove(COLLECTIONS.CUSTOMER_PAYMENTS, p.id)));
        const restoredBalance = (customer.totalBalance || 0) + (customer.totalPaid || 0);
        await update(COLLECTIONS.CUSTOMERS, customer.id, { totalPaid: 0, totalBalance: restoredBalance });
        toast({ title: `${custPays.length} payment records cleared (ተሰርዘዋል)` });
        if (showVoucher && showVoucher.id === customer.id) {
          setShowVoucher(prev => prev ? { ...prev, totalPaid: 0, totalBalance: restoredBalance } : null);
        }
        await loadData();
      } catch {
        toast({ title: "Failed to clear payments", variant: "destructive" });
      }
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage customer accounts and payment history</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCustomersListPdf} disabled={filtered.length === 0 || exportingListPdf} className="text-rose-600 dark:text-rose-400 hover:text-rose-700">
            <FileText className="w-4 h-4 mr-2" /> {exportingListPdf ? "Exporting PDF..." : "Export Customers PDF"}
          </Button>
          <Button onClick={openAdd} data-testid="button-add-customer">
            <Plus className="w-4 h-4 mr-2" /> Add Customer
          </Button>
        </div>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
        <Input className="pl-9" placeholder="Search customers..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-customers" />
      </div>
      {loading ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)}</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <Card key={c.id} data-testid={`card-customer-${c.id}`}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">{c.phone} · {c.address}</p>
                  </div>
                </div>
                <div className="flex gap-2 items-center">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1 text-blue-600 border-blue-300 hover:bg-blue-50"
                    onClick={() => setLocation(`/pos-sales?customerId=${c.id}&new=1`)}
                    title="Record POS Sale for this customer (የሽያጭ ደረሰኝ መዝግብ)"
                  >
                    <ShoppingBag className="w-3.5 h-3.5" /> Record POS Sale
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs gap-1 text-emerald-600 border-emerald-300 hover:bg-emerald-50" onClick={() => { setShowPayDialog(c); resetPayForm(); }} data-testid={`button-pay-${c.id}`}>
                    <DollarSign className="w-3.5 h-3.5" /> Record Payment
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" variant="outline" className="h-8 gap-1 px-2.5 text-xs" data-testid={`button-actions-customer-${c.id}`}>
                        Actions
                        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
                        {c.name}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setLocation(`/pos-sales?customerId=${c.id}&new=1`)} className="text-blue-600 font-medium">
                        <ShoppingBag className="w-4 h-4 mr-2 text-blue-600" /> Record POS Sale (ሽያጭ መዝግብ)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setShowPayDialog(c); resetPayForm(); }}>
                        <DollarSign className="w-4 h-4 mr-2 text-emerald-600" /> Record Payment (ክፍያ መዝግብ)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => reconcileCustomerBalance(c)} className="text-amber-700">
                        <RotateCcw className="w-4 h-4 mr-2 text-amber-700" /> Reconcile Balance (እዳ አመሳክር)
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => { setShowVoucher(c); setPaymentSearch(""); }} data-testid={`button-view-${c.id}`}>
                        <Eye className="w-4 h-4 mr-2" /> Statement / Voucher
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => exportCustomerPdf(c)} className="text-rose-600 focus:text-rose-600">
                        <FileText className="w-4 h-4 mr-2" /> Export Statement PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => openEdit(c)} data-testid={`button-edit-${c.id}`}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit Customer
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => handleDelete(c)} className="text-destructive focus:text-destructive" data-testid={`button-delete-${c.id}`}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Customer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div><span className="text-muted-foreground">Total Paid: </span><span className="font-medium text-green-600">{fmt(c.totalPaid)} ETB</span></div>
                  <div><span className="text-muted-foreground">Debt Balance: </span><span className="font-bold text-red-600">{fmt(c.totalBalance)} ETB</span></div>
                  <div><span className="text-muted-foreground">POS Receipts: </span><span className="font-medium text-blue-600">{getCustomerSales(c.id, c.name).length}</span></div>
                  <div><span className="text-muted-foreground">Payments: </span><span className="font-medium">{getPayments(c.id).length}</span></div>
                </div>
              </CardContent>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No customers found</p>
            </div>
          )}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
          <DialogHeader><DialogTitle>{editCustomer ? "Edit Customer" : "Add Customer"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} data-testid="input-customer-name" /></div>
            <div><Label>Address</Label><Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} data-testid="input-customer-address" /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} data-testid="input-customer-phone" /></div>
            {!editCustomer && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Beginning Outstanding Balance (optional)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label className="text-xs">Outstanding Amount (ETB)</Label><Input type="number" min={0} step={0.01} value={form.beginningBalance || ""} onChange={e => setForm(f => ({ ...f, beginningBalance: Number(e.target.value) }))} className="mt-1 h-8" placeholder="0.00" /></div>
                  <div><Label className="text-xs">Date</Label><Input type="date" value={form.beginningDate} onChange={e => setForm(f => ({ ...f, beginningDate: e.target.value }))} className="mt-1 h-8" /></div>
                </div>
                <div><Label className="text-xs">Note</Label><Input value={form.beginningNote} onChange={e => setForm(f => ({ ...f, beginningNote: e.target.value }))} className="mt-1 h-8" placeholder="Optional note..." /></div>
                <div>
                  <Label className="text-xs">Photo Proof</Label>
                  <input type="file" accept="image/*" className="hidden" ref={beginningPhotoRef} onChange={handleBeginningPhoto} />
                  <Button type="button" variant="outline" size="sm" className="mt-1 w-full h-8 text-xs" onClick={() => beginningPhotoRef.current?.click()} disabled={beginningUploading}>
                    {beginningUploading ? "Uploading…" : form.beginningPhotoUrl ? "Change Photo" : "Upload Photo"}
                  </Button>
                  {form.beginningPhotoUrl && (
                    <img src={form.beginningPhotoUrl} alt="Proof" className="mt-2 h-16 rounded border object-cover" />
                  )}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-customer">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={!!showPayDialog} onOpenChange={() => { setShowPayDialog(null); resetPayForm(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
          <DialogHeader><DialogTitle>Record Payment — {showPayDialog?.name}</DialogTitle></DialogHeader>
          {showPayDialog && (
            <div className="space-y-4">
              <div className="bg-muted rounded-lg p-3 text-sm grid grid-cols-2 gap-2">
                <div><span className="text-muted-foreground">Total Paid: </span><span className="font-medium text-green-600">{fmt(showPayDialog.totalPaid ?? 0)}</span></div>
                <div><span className="text-muted-foreground">Balance: </span><span className="font-medium text-red-500">{fmt(showPayDialog.totalBalance ?? 0)}</span></div>
              </div>
              <div><Label>Payment Date</Label><Input type="date" value={payForm.paymentDate} onChange={e => setPayForm(f => ({ ...f, paymentDate: e.target.value }))} data-testid="input-pay-date" /></div>
              <div><Label>Amount Paid (ETB)</Label><Input type="number" min={0} step={0.01} value={payForm.amountPaid} onChange={e => setPayForm(f => ({ ...f, amountPaid: Number(e.target.value) }))} data-testid="input-pay-amount" /></div>
              <div><Label>FS Number</Label><Input value={payForm.fsNumber} onChange={e => setPayForm(f => ({ ...f, fsNumber: e.target.value }))} placeholder="Fiscal Number (optional)" data-testid="input-pay-fs-number" /></div>

              {/* Transfer Via */}
              <div className="rounded-lg border bg-blue-50/50 p-4 space-y-3">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Payment Via</p>
                <div>
                  <Label>Route Payment To</Label>
                  <Select value={payForm.payVia} onValueChange={v => setPayForm(f => ({ ...f, payVia: v as "none" | "supplier" | "account", supplierId: "", accountId: "" }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Direct / Cash —</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="account">Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {payForm.payVia === "supplier" && (
                  <div>
                    <Label>Select Supplier</Label>
                    <Select value={payForm.supplierId} onValueChange={v => setPayForm(f => ({ ...f, supplierId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {payForm.supplierId && (() => {
                      const s = suppliers.find(x => x.id === payForm.supplierId);
                      return s ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Current balance: <span className="font-semibold text-red-500">{fmt(s.totalBalance ?? 0)}</span>
                          {" · "}Total paid: <span className="font-semibold text-green-600">{fmt(s.totalPaid ?? 0)}</span>
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
                {payForm.payVia === "account" && (
                  <div>
                    <Label>Select Account</Label>
                    <Select value={payForm.accountId} onValueChange={v => setPayForm(f => ({ ...f, accountId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.bankName} — {a.personName} ({a.accountNumber})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {payForm.accountId && (() => {
                      const a = accounts.find(x => x.id === payForm.accountId);
                      return a ? (
                        <p className="text-xs text-muted-foreground mt-1">
                          Current balance: <span className="font-semibold text-green-600">{fmt(a.balance ?? 0)}</span>
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
              </div>

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
            <Button variant="outline" onClick={() => { setShowPayDialog(null); resetPayForm(); }} disabled={paying}>Cancel</Button>
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
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" />
              <DialogTitle className="text-sm sm:text-base font-bold truncate">
                Customer Statement: {showVoucher?.name}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {showVoucher && (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    const custId = showVoucher.id;
                    setShowVoucher(null);
                    setLocation(`/pos-sales?customerId=${custId}&new=1`);
                  }}
                  className="h-8 px-2.5 text-xs gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shrink-0 font-medium"
                  title="Record New POS Sale for this customer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">New POS Sale (አዲስ ሽያጭ)</span>
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

          {showVoucher && (
            <div className="flex-1 overflow-y-auto p-2 sm:p-5 bg-slate-100/60 dark:bg-slate-950/60">
              <div
                ref={voucherRef}
                className="bg-white text-slate-900 overflow-hidden border border-slate-200 max-w-4xl mx-auto w-full rounded-xl sm:rounded-2xl shadow-xs"
                style={{ fontFamily: "'Inter','Segoe UI',sans-serif" }}
              >
                {/* ── Header ── */}
                <div style={{ background: "linear-gradient(135deg, #14532d 0%, #166534 50%, #15803d 100%)" }} className="p-4 sm:p-5 text-white">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                        <Users className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="text-white/60 text-[10px] tracking-wider uppercase font-semibold">Payment Statement</div>
                        <div className="text-white font-extrabold text-base sm:text-lg tracking-tight">CUSTOMER VOUCHER</div>
                      </div>
                    </div>
                    <span className="bg-white/15 text-white/90 text-[10px] sm:text-xs font-semibold px-2.5 py-1 rounded-full font-mono whitespace-nowrap">
                      {showVoucher.voucherId || "OFFICIAL RECORD"}
                    </span>
                  </div>
                  <div className="border-t border-white/15 pt-2.5 flex items-center justify-between text-[10px] sm:text-xs text-white/70">
                    <span>Generated {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</span>
                    <span className="font-semibold text-white/90">{showVoucher.name}</span>
                  </div>
                </div>

                {/* ── Contact Info ── */}
                <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/50">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="flex justify-between sm:flex-col sm:justify-start border-b sm:border-b-0 pb-1.5 sm:pb-0 border-slate-200">
                      <span className="text-slate-500 font-medium">Customer Name</span>
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
                {(() => {
                  const custSales = getCustomerSales(showVoucher.id, showVoucher.name);
                  const totalSalesVal = custSales.filter(s => s.status !== "voided").reduce((s, x) => s + (x.totalAmount || (x as any).subtotal || 0), 0);
                  return (
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-3.5 p-2.5 sm:p-4 border-b border-slate-200">
                      <div style={{ background: "linear-gradient(135deg, #1e3a8a, #2563eb)" }} className="rounded-xl p-2 sm:p-3.5 text-white shadow-xs">
                        <div className="text-white/80 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center justify-between">
                          <span className="truncate">POS Sales</span>
                          <ShoppingBag className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" />
                        </div>
                        <div className="text-white text-xs sm:text-lg font-black truncate">{fmt(totalSalesVal)}</div>
                        <div className="text-white/70 text-[8px] sm:text-[10px] mt-0.5 truncate">{custSales.length} Receipts</div>
                      </div>
                      <div style={{ background: "linear-gradient(135deg, #065f46, #059669)" }} className="rounded-xl p-2 sm:p-3.5 text-white shadow-xs">
                        <div className="text-white/80 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center justify-between">
                          <span className="truncate">Paid (የተከፈለ)</span>
                          <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" />
                        </div>
                        <div className="text-white text-xs sm:text-lg font-black truncate">{fmt(showVoucher.totalPaid || 0)}</div>
                        <div className="text-white/70 text-[8px] sm:text-[10px] mt-0.5 truncate">{getPayments(showVoucher.id).length} Records</div>
                      </div>
                      <div style={{ background: (showVoucher.totalBalance || 0) > 0 ? "linear-gradient(135deg, #7f1d1d, #dc2626)" : "linear-gradient(135deg, #065f46, #10b981)" }} className="rounded-xl p-2 sm:p-3.5 text-white shadow-xs">
                        <div className="text-white/80 text-[8px] sm:text-[10px] uppercase font-bold tracking-wider mb-0.5 sm:mb-1 flex items-center justify-between">
                          <span className="truncate">Credit (እዳ)</span>
                          {(showVoucher.totalBalance || 0) > 0 ? <AlertCircle className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" /> : <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/70 shrink-0" />}
                        </div>
                        <div className="text-white text-xs sm:text-lg font-black truncate">{fmt(showVoucher.totalBalance || 0)}</div>
                        <div className="text-white/70 text-[8px] sm:text-[10px] mt-0.5 truncate">{(showVoucher.totalBalance || 0) > 0 ? "Debt Active" : "Settled"}</div>
                      </div>
                    </div>
                  );
                })()}

                {/* ── Clear Debt & Settlement Action Bar ── */}
                <div className="mx-2.5 sm:mx-4 my-2.5 p-2.5 sm:p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {(showVoucher.totalBalance || 0) <= 0 ? (
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                        <AlertCircle className="w-4 h-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 truncate">
                        {(showVoucher.totalBalance || 0) <= 0 ? (
                          <span className="text-emerald-700">ዕዳ በሙሉ ተከፍሏል (Debt Fully Cleared)</span>
                        ) : (
                          <span>ቀሪ የደንበኛ እዳ፦ <span className="text-red-600 font-extrabold">{fmt(showVoucher.totalBalance || 0)} ETB</span></span>
                        )}
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-slate-500 truncate">
                        {(showVoucher.totalBalance || 0) <= 0
                          ? "ደንበኛው ምንም አይነት ቀሪ እዳ የለበትም። ሁሉም ክፍያዎች ተጠናቀዋል።"
                          : "ክፍያ ሲጠናቀቅ 'Clear Debt' በመጫን እዳውን በሙሉ ይዝጉ ወይም ያጥፉ።"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      onClick={() => {
                        const custId = showVoucher.id;
                        setShowVoucher(null);
                        setLocation(`/pos-sales?customerId=${custId}&new=1`);
                      }}
                      className="h-7 sm:h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white gap-1 shadow-xs"
                      title="Record New POS Sale for this customer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> POS Sale (አዲስ ሽያጭ)
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => reconcileCustomerBalance(showVoucher)}
                      className="h-7 sm:h-8 text-xs font-semibold text-amber-800 dark:text-amber-200 border-amber-300 dark:border-amber-700 hover:bg-amber-50 gap-1 shadow-xs"
                      title="Reconcile customer balance from POS sales"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" /> Reconcile (እዳ አመሳክር)
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => openClearModal(showVoucher)}
                      className="h-7 sm:h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1 shadow-xs"
                      title="Clear customer debt"
                    >
                      <CheckCheck className="w-3.5 h-3.5" /> Clear Debt (ዕዳ አጽዳ)
                    </Button>
                    {getPayments(showVoucher.id).length > 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleClearAllCustomerPayments(showVoucher)}
                        className="h-7 sm:h-8 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                        title="Delete all payment records"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
                      </Button>
                    )}
                  </div>
                </div>

                {/* ── Tabs Selector & View Toggle ── */}
                <div className="px-2.5 sm:px-5 pt-1 pb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200">
                  <div className="flex items-center gap-1 p-0.5 sm:p-1 bg-slate-100 rounded-lg text-xs">
                    <button
                      type="button"
                      onClick={() => setVoucherTab("all")}
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-medium text-[11px] sm:text-xs transition-all ${
                        voucherTab === "all" ? "bg-white text-slate-900 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      All ({getCustomerSales(showVoucher.id, showVoucher.name).length + getPayments(showVoucher.id).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoucherTab("sales")}
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-medium text-[11px] sm:text-xs transition-all flex items-center gap-1 ${
                        voucherTab === "sales" ? "bg-white text-blue-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <ShoppingBag className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      Sales ({getCustomerSales(showVoucher.id, showVoucher.name).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoucherTab("payments")}
                      className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-md font-medium text-[11px] sm:text-xs transition-all flex items-center gap-1 ${
                        voucherTab === "payments" ? "bg-white text-emerald-700 shadow-xs font-bold" : "text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      <DollarSign className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      Payments ({getPayments(showVoucher.id).length})
                    </button>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto no-print">
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-xs shrink-0">
                      <button
                        type="button"
                        onClick={() => setCustViewMode("cards")}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          custViewMode === "cards" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Cards
                      </button>
                      <button
                        type="button"
                        onClick={() => setCustViewMode("table")}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                          custViewMode === "table" ? "bg-white text-slate-900 shadow-xs" : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        Table
                      </button>
                    </div>

                    <div className="relative flex-1 sm:w-48 no-print">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <Input
                        placeholder="Search items, notes..."
                        value={paymentSearch}
                        onChange={e => setPaymentSearch(e.target.value)}
                        className="h-7 sm:h-8 text-xs pl-8 w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Goods Taken / POS Sales Receipts Section ── */}
                {(voucherTab === "all" || voucherTab === "sales") && (() => {
                  const custSales = getCustomerSales(showVoucher.id, showVoucher.name);
                  const q = (paymentSearch || "").toLowerCase();
                  const filteredSales = custSales.filter(s => {
                    if (!q) return true;
                    return (
                      (s.voucherId || "").toLowerCase().includes(q) ||
                      (s.voucherDate || "").includes(q) ||
                      (s.storeName || "").toLowerCase().includes(q) ||
                      (s.items || []).some(i => (i.productName || "").toLowerCase().includes(q)) ||
                      String(s.totalAmount ?? "").includes(q)
                    );
                  });

                  return (
                    <div className="p-2.5 sm:p-5 border-b border-slate-200 bg-slate-50/30">
                      <div className="flex items-center justify-between pb-2">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                          <ShoppingBag className="w-4 h-4 text-blue-600" />
                          <span>Goods Taken / POS Receipts (የተወሰዱ እቃዎች)</span>
                          <span className="text-[10px] sm:text-[11px] font-normal text-slate-500">
                            ({filteredSales.length} receipts)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              const custId = showVoucher.id;
                              setShowVoucher(null);
                              setLocation(`/pos-sales?customerId=${custId}&new=1`);
                            }}
                            className="h-7 px-2 text-xs gap-1 text-blue-700 border-blue-200 hover:bg-blue-50 font-medium"
                          >
                            <Plus className="w-3 h-3" /> New Sale (ሽያጭ መዝግብ)
                          </Button>
                        </div>
                      </div>

                      {filteredSales.length === 0 ? (
                        <div className="text-center py-6 text-slate-400 text-xs bg-white rounded-lg border border-dashed border-slate-200">
                          {custSales.length === 0 ? "No POS sales recorded for this customer yet" : "No sales match search query"}
                        </div>
                      ) : (
                        <>
                          {/* Mobile Cards View */}
                          <div className={custViewMode === "cards" ? "block sm:hidden space-y-2" : "hidden"}>
                            {filteredSales.map((sale) => {
                              const isExpanded = expandedSaleIds.has(sale.id);
                              const totalItemsCount = (sale.items || []).length;
                              const totalCartons = (sale.items || []).reduce((acc, it) => acc + (it.cartons || 0), 0);
                              return (
                                <div key={sale.id} className={`p-3 rounded-xl border transition-all ${sale.status === "voided" ? "bg-red-50/40 border-red-200 opacity-70" : "bg-white border-slate-200 shadow-2xs"}`}>
                                  <div className="flex items-center justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <span className="font-mono font-bold text-blue-700 text-xs truncate">#{sale.voucherId || "—"}</span>
                                      {sale.status === "voided" && (
                                        <span className="text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-sans font-bold">VOID</span>
                                      )}
                                    </div>
                                    <span className="text-[11px] font-mono text-slate-500 shrink-0">
                                      {sale.voucherDate || String(sale.createdAt || "").slice(0, 10)}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between text-xs text-slate-600 mb-2">
                                    <span>Store: <strong className="text-slate-800">{sale.storeName || "—"}</strong></span>
                                    <span>{totalItemsCount} items ({totalCartons} ctn)</span>
                                  </div>
                                  <div className="grid grid-cols-3 gap-1.5 p-2 bg-slate-50 rounded-lg text-center mb-2">
                                    <div>
                                      <div className="text-[9px] uppercase font-bold text-slate-500">Total</div>
                                      <div className="text-xs font-bold text-slate-900 truncate">{fmt(sale.totalAmount || sale.subtotal || 0)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] uppercase font-bold text-emerald-600">Paid</div>
                                      <div className="text-xs font-bold text-emerald-700 truncate">{fmt(sale.amountPaid || 0)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] uppercase font-bold text-red-600">Credit</div>
                                      <div className="text-xs font-bold text-red-600 truncate">{fmt(sale.remainingBalance || 0)}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                                    <button
                                      type="button"
                                      onClick={() => toggleSaleExpand(sale.id)}
                                      className="text-xs text-blue-600 font-medium inline-flex items-center gap-1 py-1"
                                    >
                                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                      <span>{isExpanded ? "Hide items" : `View ${totalItemsCount} items`}</span>
                                    </button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setSelectedPosSale(sale)}
                                      className="h-7 px-2.5 text-xs font-semibold text-blue-700 border-blue-200 hover:bg-blue-50 gap-1"
                                    >
                                      <Receipt className="w-3 h-3" /> Full Receipt
                                    </Button>
                                  </div>
                                  {isExpanded && (
                                    <div className="mt-2 pt-2 border-t border-slate-200 space-y-1.5">
                                      {(sale.items || []).map((it, idx) => {
                                        const itemP = it.sellingPrice || it.adjustedPrice || (it as any).unitPrice || 0;
                                        return (
                                          <div key={idx} className="flex items-center justify-between text-xs bg-slate-50 p-1.5 rounded">
                                            <div className="min-w-0 pr-2">
                                              <span className="font-semibold text-slate-800 truncate block">{it.productName}</span>
                                              <span className="text-[10px] text-slate-500">{it.cartons || 0} ctn ({it.quantity || 0} pcs) @ {fmt(itemP)}</span>
                                            </div>
                                            <span className="font-bold text-blue-700 text-xs shrink-0">{fmt(it.totalPrice || (itemP * (it.quantity || 0)))}</span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Desktop & Printable Table View */}
                          <div className={custViewMode === "cards" ? "hidden sm:block overflow-x-auto rounded-lg border border-slate-200 bg-white" : "overflow-x-auto rounded-lg border border-slate-200 bg-white"}>
                            <table className="w-full text-xs min-w-[650px] sm:min-w-full border-collapse">
                              <thead>
                                <tr className="bg-slate-100 text-slate-700">
                                  <th className="p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider text-left">Date</th>
                                  <th className="p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider text-left">POS Voucher #</th>
                                  <th className="p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider text-left">Store</th>
                                  <th className="p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider text-left">Items Taken</th>
                                  <th className="p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider text-right">Total (ETB)</th>
                                  <th className="p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider text-right">Paid at Sale</th>
                                  <th className="p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider text-right">Credit (እዳ)</th>
                                  <th className="p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider text-center no-print">Receipt</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {filteredSales.map((sale) => {
                                  const isExpanded = expandedSaleIds.has(sale.id);
                                  const totalItemsCount = (sale.items || []).length;
                                  const totalCartons = (sale.items || []).reduce((acc, it) => acc + (it.cartons || 0), 0);
                                  return (
                                    <Fragment key={sale.id}>
                                      <tr className={`hover:bg-blue-50/40 transition-colors ${sale.status === "voided" ? "bg-red-50/40 opacity-70" : ""}`}>
                                        <td className="p-2 sm:p-2.5 text-slate-600 font-mono whitespace-nowrap">
                                          {sale.voucherDate || String(sale.createdAt || "").slice(0, 10)}
                                        </td>
                                        <td className="p-2 sm:p-2.5 font-mono font-bold text-blue-700 whitespace-nowrap">
                                          {sale.voucherId || "—"}
                                          {sale.status === "voided" && (
                                            <span className="ml-1 text-[9px] bg-red-600 text-white px-1 py-0.5 rounded font-sans">VOID</span>
                                          )}
                                        </td>
                                        <td className="p-2 sm:p-2.5 text-slate-700 whitespace-nowrap">{sale.storeName || "—"}</td>
                                        <td className="p-2 sm:p-2.5 text-slate-800">
                                          <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-semibold text-slate-900">{totalItemsCount} items</span>
                                            <span className="text-[11px] text-slate-500">({totalCartons} ctn)</span>
                                            <button
                                              type="button"
                                              onClick={() => toggleSaleExpand(sale.id)}
                                              className="text-blue-600 hover:text-blue-800 text-[11px] underline inline-flex items-center ml-1"
                                            >
                                              {isExpanded ? <ChevronUp className="w-3 h-3 mr-0.5" /> : <ChevronDown className="w-3 h-3 mr-0.5" />}
                                              {isExpanded ? "Hide items" : "Show items"}
                                            </button>
                                          </div>
                                        </td>
                                        <td className="p-2 sm:p-2.5 font-bold text-right text-slate-900 whitespace-nowrap">
                                          {fmt(sale.totalAmount || sale.subtotal || 0)}
                                        </td>
                                        <td className="p-2 sm:p-2.5 font-semibold text-right text-emerald-700 whitespace-nowrap">
                                          {fmt(sale.amountPaid || 0)}
                                        </td>
                                        <td className="p-2 sm:p-2.5 font-bold text-right text-red-600 whitespace-nowrap">
                                          {fmt(sale.remainingBalance || 0)}
                                        </td>
                                        <td className="p-2 sm:p-2.5 text-center whitespace-nowrap no-print">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setSelectedPosSale(sale)}
                                            className="h-7 px-2 text-[11px] font-semibold text-blue-600 border-blue-200 hover:bg-blue-50 gap-1"
                                          >
                                            <Receipt className="w-3 h-3" /> Full Receipt
                                          </Button>
                                        </td>
                                      </tr>
                                      {isExpanded && (
                                        <tr className="bg-slate-50/90">
                                          <td colSpan={8} className="p-3">
                                            <div className="border border-slate-200 rounded-lg p-2.5 bg-white shadow-xs">
                                              <div className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                                                <span>Detailed Items Taken in Voucher {sale.voucherId}:</span>
                                                <span className="text-slate-500 font-normal">Customer: {sale.customerName || showVoucher.name}</span>
                                              </div>
                                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                                {(sale.items || []).map((it, idx) => {
                                                  const itemP = it.sellingPrice || it.adjustedPrice || (it as any).unitPrice || 0;
                                                  return (
                                                    <div key={idx} className="border border-slate-100 rounded p-2 text-xs bg-slate-50/50">
                                                      <div className="font-bold text-slate-900 truncate">{it.productName}</div>
                                                      <div className="text-[11px] text-slate-500 flex justify-between mt-0.5">
                                                        <span>{it.cartons || 0} ctn ({it.quantity || 0} pcs)</span>
                                                        <span className="font-medium text-slate-700">@{fmt(itemP)} ETB</span>
                                                      </div>
                                                      <div className="text-right font-bold text-blue-700 text-xs mt-1">
                                                        {fmt(it.totalPrice || (itemP * (it.quantity || 0)))} ETB
                                                      </div>
                                                    </div>
                                                  );
                                                })}
                                              </div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </Fragment>
                                  );
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="bg-slate-100 font-bold border-t-2 border-slate-300 text-slate-900">
                                  <td colSpan={4} className="p-2 sm:p-2.5 text-right uppercase text-[10px] sm:text-xs">
                                    ጠቅላላ የሽያጭ ደረሰኞች ድምር (Receipts Totals):
                                  </td>
                                  <td className="p-2 sm:p-2.5 text-right font-black text-blue-700">
                                    {fmt(filteredSales.filter(s => s.status !== "voided").reduce((sum, s) => sum + (s.totalAmount || (s as any).subtotal || 0), 0))} ETB
                                  </td>
                                  <td className="p-2 sm:p-2.5 text-right font-bold text-emerald-700">
                                    {fmt(filteredSales.filter(s => s.status !== "voided").reduce((sum, s) => sum + (s.amountPaid || 0), 0))} ETB
                                  </td>
                                  <td className="p-2 sm:p-2.5 text-right font-black text-red-600">
                                    {fmt(filteredSales.filter(s => s.status !== "voided").reduce((sum, s) => sum + (s.remainingBalance || 0), 0))} ETB
                                  </td>
                                  <td className="p-2 sm:p-2.5 no-print" />
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* ── Payment History Section ── */}
                {(voucherTab === "all" || voucherTab === "payments") && (
                  <div className="p-2.5 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3">
                      <div className="text-xs sm:text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <span>Payment History (የተከፈሉ ክፍያዎች)</span>
                        <span className="text-[10px] sm:text-[11px] font-normal text-slate-500">
                          ({getPayments(showVoucher.id).length} records)
                        </span>
                      </div>
                    </div>

                    {(() => {
                      const paymentsList = getPayments(showVoucher.id);
                      const hasBegBal = (showVoucher.beginningBalance || 0) > 0;
                      const hasAnyData = paymentsList.length > 0 || hasBegBal;

                      if (!hasAnyData) {
                        return <div className="text-center py-8 text-slate-400 text-xs sm:text-sm">No payments recorded yet</div>;
                      }

                      const filtered = paymentsList.filter(p => {
                        if (!p) return false;
                        const q = (paymentSearch || "").toLowerCase();
                        if (!q) return true;
                        return (
                          ((p as any).paymentDate || "").includes(q) ||
                          (p.note || "").toLowerCase().includes(q) ||
                          String(p.amountPaid ?? "").includes(q) ||
                          String(p.remainingBalance ?? "").includes(q) ||
                          (p.fsNumber || "").toLowerCase().includes(q) ||
                          (p.supplierName || "").toLowerCase().includes(q) ||
                          (p.accountName || "").toLowerCase().includes(q)
                        );
                      });

                      return (
                        <>
                          {/* Mobile Cards View */}
                          <div className={custViewMode === "cards" ? "block sm:hidden space-y-2" : "hidden"}>
                            {hasBegBal && (
                              <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/70 flex items-center justify-between">
                                <div>
                                  <div className="text-xs font-bold text-blue-800">Opening Balance</div>
                                  <div className="text-[11px] text-slate-500 font-mono">{showVoucher.beginningDate || "Initial record"}</div>
                                  {showVoucher.beginningNote && <div className="text-[10px] text-slate-500 italic mt-0.5">{showVoucher.beginningNote}</div>}
                                </div>
                                <div className="text-right">
                                  <div className="text-xs font-bold text-red-600">{fmt(showVoucher.beginningBalance || 0)}</div>
                                  {showVoucher.beginningPhotoUrl && (
                                    <button onClick={() => window.open((showVoucher as any).beginningPhotoUrl, "_blank")} className="text-[11px] text-blue-600 underline inline-flex items-center gap-0.5 mt-0.5">
                                      <Eye className="w-3 h-3" /> Photo
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}

                            {filtered.length === 0 && paymentsList.length > 0 ? (
                              <div className="text-center py-6 text-slate-400 text-xs bg-white rounded-lg border border-dashed">
                                No payments match "{paymentSearch}"
                              </div>
                            ) : (
                              filtered.map((p, i) => (
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
                                      {p.payVia === "supplier" && p.supplierName ? `Via Supplier: ${p.supplierName}` :
                                       p.payVia === "account" && p.accountName ? `Via Account: ${p.accountName}` :
                                       p.note || "Direct payment"}
                                    </span>
                                    <span className="text-xs font-bold text-red-600">
                                      Bal: {fmt(p.remainingBalance)}
                                    </span>
                                  </div>
                                  {p.note && (p.payVia === "supplier" || p.payVia === "account") && (
                                    <p className="text-[11px] text-slate-500 italic mb-1.5 truncate">{p.note}</p>
                                  )}
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
                          <div className={custViewMode === "cards" ? "hidden sm:block overflow-x-auto rounded-lg border border-slate-200" : "overflow-x-auto rounded-lg border border-slate-200"}>
                            <table className="w-full text-xs min-w-[620px] sm:min-w-full border-collapse">
                              <thead>
                                <tr className="bg-slate-100 text-slate-700">
                                  {["Date", "Amount Paid", "FS #", "Via", "Note", "Balance", "Clear / Delete"].map(h => (
                                    <th
                                      key={h}
                                      className={`p-2 sm:p-2.5 font-bold text-[10px] sm:text-xs uppercase tracking-wider ${
                                        h === "Balance" ? "text-right" : h === "Clear / Delete" ? "text-center no-print" : "text-left"
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
                                    <td className="p-2 sm:p-2.5 text-slate-700">—</td>
                                    <td className="p-2 sm:p-2.5 text-blue-700 font-semibold">
                                      Opening Balance{showVoucher.beginningNote ? ` · ${showVoucher.beginningNote}` : ""}
                                    </td>
                                    <td className="p-2 sm:p-2.5 text-red-600 font-bold text-right">{fmt(showVoucher.beginningBalance || 0)}</td>
                                    <td className="p-2 sm:p-2.5 text-center no-print">
                                      {showVoucher.beginningPhotoUrl && (
                                        <button
                                          title="View Photo Proof"
                                          onClick={() => window.open((showVoucher as any).beginningPhotoUrl, "_blank")}
                                          className="p-1 rounded text-blue-600 hover:bg-blue-50"
                                        >
                                          <Eye className="w-3.5 h-3.5 inline" />
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                )}
                                {filtered.length === 0 && paymentsList.length > 0 ? (
                                  <tr><td colSpan={7} className="text-center py-6 text-slate-400 text-xs">No payments match "{paymentSearch}"</td></tr>
                                ) : filtered.map((p, i) => (
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
                                      {p.fsNumber || "—"}
                                    </td>
                                    <td className={`p-2 sm:p-2.5 text-blue-700 text-[11px] max-w-[110px] truncate ${p.voided ? "line-through" : ""}`}>
                                      {p.payVia === "supplier" && p.supplierName ? p.supplierName :
                                       p.payVia === "account" && p.accountName ? `${p.accountName}${p.accountNumber ? ` (${p.accountNumber})` : ""}` :
                                       "—"}
                                    </td>
                                    <td className={`p-2 sm:p-2.5 text-slate-600 max-w-[140px] truncate ${p.voided ? "line-through" : ""}`}>
                                      {p.note || "—"}
                                    </td>
                                    <td className={`p-2 sm:p-2.5 font-bold text-right whitespace-nowrap ${p.voided ? "text-slate-400 line-through" : "text-red-600"}`}>
                                      {fmt(p.remainingBalance)}
                                    </td>
                                    <td className="p-2 sm:p-2.5 text-center whitespace-nowrap no-print">
                                      <div className="flex items-center justify-center gap-1">
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
                                        <button
                                          className="p-1 px-1.5 rounded text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-1 border border-transparent hover:border-red-200 transition-colors"
                                          title="Clear / Delete this payment (አጥፋ)"
                                          onClick={() => handleDeletePayment(p, showVoucher)}
                                        >
                                          <Trash2 className="w-3.5 h-3.5 inline" />
                                          <span className="text-[10px] font-semibold">Clear</span>
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
                  <span>Computer-generated official statement · Nexus Stock</span>
                  <span>{new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              </div>
            </div>
          )}

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
              voucherId={showVoucher ? `Statement_${showVoucher.name.replace(/\s+/g, "_")}` : "Customer_Statement"}
              voucherTitle={`CUSTOMER STATEMENT: ${showVoucher?.name || ""}`}
              voucherSubtitle={`Phone: ${showVoucher?.phone || "—"} | Debt Balance: ${fmt(showVoucher?.totalBalance || 0)}`}
              filenamePrefix="customer_statement"
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
      {DeleteAuthDialog}

      {/* ── Clear Customer Debt Dialog ── */}
      <Dialog open={!!clearTargetCustomer} onOpenChange={open => { if (!open) setClearTargetCustomer(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <CheckCheck className="w-5 h-5 text-emerald-600" />
              Clear Debt (ዕዳ አጽዳ / ከፍሎ ጨርስ)
            </DialogTitle>
          </DialogHeader>
          {clearTargetCustomer && (
            <div className="space-y-4 py-1 text-xs sm:text-sm">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Customer:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{clearTargetCustomer.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Total Paid so far:</span>
                  <span className="font-semibold text-emerald-600">{fmt(clearTargetCustomer.totalPaid || 0)} ETB</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-1.5">
                  <span className="text-slate-700 dark:text-slate-300 font-bold">Current Outstanding Debt:</span>
                  <span className="font-extrabold text-red-600 text-sm">{fmt(clearTargetCustomer.totalBalance || 0)} ETB</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                  Option 1: Record Settle Payment (ቀሪ እዳ በክፍያ ጨርስ)
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Settlement Amount (ETB)</Label>
                    <Input
                      type="number"
                      value={clearPayAmount}
                      onChange={e => setClearPayAmount(parseFloat(e.target.value) || 0)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Settlement Date</Label>
                    <Input
                      type="date"
                      value={clearPayDate}
                      onChange={e => setClearPayDate(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Note</Label>
                  <Input
                    value={clearPayNote}
                    onChange={e => setClearPayNote(e.target.value)}
                    placeholder="e.g. ዕዳ በሙሉ ተከፍሎ ተጠናቋል"
                    className="h-8 text-xs"
                  />
                </div>
                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1.5 h-9"
                  onClick={handleConfirmClearPay}
                  disabled={clearing || clearPayAmount <= 0}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {clearing ? "Processing..." : `Settle & Clear ${fmt(clearPayAmount)} ETB`}
                </Button>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-2">
                <div className="font-bold text-slate-800 dark:text-slate-200 text-xs uppercase tracking-wider">
                  Option 2: Reset Balance to 0 Directly (ቀሪ እዳውን ሰርዝ)
                </div>
                <p className="text-[11px] text-slate-500">
                  ክፍያ ሳይመዘገብ የደንበኛውን ቀሪ እዳ ወደ 0 ለማድረግ ይህንን ይጠቀሙ።
                </p>
                <Button
                  variant="outline"
                  className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 font-semibold gap-1.5 h-9"
                  onClick={handleResetBalanceZero}
                  disabled={clearing}
                >
                  <Trash2 className="w-4 h-4" />
                  Reset Outstanding Balance to 0 (እዳውን ሰርዝ)
                </Button>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClearTargetCustomer(null)} disabled={clearing}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Full POS Sale Receipt Dialog ── */}
      <Dialog open={!!selectedPosSale} onOpenChange={open => { if (!open) setSelectedPosSale(null); }}>
        <DialogContent className={`w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 ${(selectedPosSale?.referencePhotoUrl || (selectedPosSale as any)?.photoProofUrl) ? "max-w-6xl xl:max-w-7xl" : "max-w-2xl"}`}>
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <div className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-600" />
              <DialogTitle className="text-base sm:text-lg font-bold">POS Sales Receipt (የሽያጭ ደረሰኝ)</DialogTitle>
            </div>
          </DialogHeader>

          {selectedPosSale && (
            <ReceiptWithReferenceView
              referencePhotoUrl={selectedPosSale.referencePhotoUrl || (selectedPosSale as any).photoProofUrl}
              voucherId={selectedPosSale.voucherId}
              receiptNode={
                <div
                  ref={posReceiptRef}
                  className="bg-white text-slate-900 border border-slate-200 rounded-xl overflow-hidden shadow-xs relative"
                  style={{ fontFamily: "'Inter','Segoe UI',sans-serif", position: "relative" }}
                >
                  {/* Watermark */}
                  <div
                    style={{
                      position: "absolute",
                      top: "50%",
                      left: "50%",
                      transform: "translate(-50%, -50%) rotate(-30deg)",
                      pointerEvents: "none",
                      zIndex: 0,
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                    aria-hidden="true"
                  >
                    <span
                      style={{
                        fontSize: "5rem",
                        fontWeight: 900,
                        color: "rgba(100, 116, 139, 0.08)",
                        letterSpacing: "0.15em",
                        textTransform: "uppercase",
                      }}
                    >
                      ATTACHMENT
                    </span>
                  </div>

                  {/* Receipt Top Header */}
                  <div className="p-4 bg-slate-900 text-white text-center relative z-10">
                    <div className="text-xs uppercase tracking-widest text-slate-400 font-semibold">{getStoredBrandName()}</div>
                    <div className="text-lg font-black tracking-tight mt-0.5">POS SALES ATTACHMENT</div>
                    <div className="text-xs text-blue-300 font-mono mt-1 font-bold">#{selectedPosSale.voucherId}</div>
                  </div>

              {/* Meta information */}
              <div className="p-3.5 bg-slate-50 border-b border-slate-200 text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-slate-500 font-medium">Customer: </span>
                  <span className="font-bold text-slate-900">{selectedPosSale.customerName || showVoucher?.name || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Store: </span>
                  <span className="font-semibold text-slate-900">{selectedPosSale.storeName || "—"}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Date: </span>
                  <span className="font-mono text-slate-900">{selectedPosSale.voucherDate || String(selectedPosSale.createdAt || "").slice(0, 10)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">Payment Mode: </span>
                  <span className="font-semibold capitalize text-slate-900">{selectedPosSale.paymentMethod || "Credit"}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="p-3.5">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Itemized Goods (የተወሰዱ እቃዎች)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="border-b-2 border-slate-300 text-slate-700">
                        <th className="py-1.5 text-left font-bold">#</th>
                        <th className="py-1.5 text-left font-bold">Product</th>
                        <th className="py-1.5 text-right font-bold">Qty</th>
                        <th className="py-1.5 text-right font-bold">Unit Price</th>
                        <th className="py-1.5 text-right font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(selectedPosSale.items || []).map((it, idx) => {
                        const itemP = it.sellingPrice || it.adjustedPrice || (it as any).unitPrice || 0;
                        return (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-1.5 text-slate-400 font-mono">{idx + 1}</td>
                            <td className="py-1.5 font-medium text-slate-900">
                              {it.productName}
                              {it.cartons ? <span className="text-[10px] text-slate-500 ml-1">({it.cartons} ctn)</span> : null}
                            </td>
                            <td className="py-1.5 text-right font-semibold text-slate-800">{it.quantity || 0}</td>
                            <td className="py-1.5 text-right font-mono text-slate-700">{fmt(itemP)}</td>
                            <td className="py-1.5 text-right font-bold text-slate-900 font-mono">
                              {fmt(it.totalPrice || (itemP * (it.quantity || 0)))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Receipt Totals Summary */}
                <div className="mt-4 border-t-2 border-slate-300 pt-2.5 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold">{fmt(selectedPosSale.subtotal || selectedPosSale.totalAmount || 0)} ETB</span>
                  </div>
                  {(selectedPosSale as any).discountAmount ? (
                    <div className="flex justify-between text-slate-600">
                      <span>Discount:</span>
                      <span className="font-mono font-semibold text-emerald-600">-{fmt((selectedPosSale as any).discountAmount)} ETB</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between text-slate-900 font-black text-sm border-t border-slate-200 pt-1.5">
                    <span>Total Amount:</span>
                    <span className="font-mono text-blue-700">{fmt(selectedPosSale.totalAmount || selectedPosSale.subtotal || 0)} ETB</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Amount Paid at Sale:</span>
                    <span className="font-mono">{fmt(selectedPosSale.amountPaid || 0)} ETB</span>
                  </div>
                  <div className="flex justify-between text-red-600 font-extrabold text-sm border-t border-slate-200 pt-1">
                    <span>Credit / Balance (ቀሪ እዳ):</span>
                    <span className="font-mono">{fmt(selectedPosSale.remainingBalance || 0)} ETB</span>
                  </div>
                </div>
              </div>

              {/* Receipt Footer */}
              <div className="bg-slate-50 p-3 border-t border-slate-200 text-center text-[10px] text-slate-500">
                <div>Thank you for your business! · አመሰግናለን!</div>
                <div className="font-mono mt-0.5">{new Date().toLocaleString()}</div>
              </div>
            </div>
              }
            />
          )}

          <DialogFooter className="gap-2 flex-wrap sm:justify-between pt-2 border-t">
            <ReceiptActionBar
              receiptRef={posReceiptRef}
              referencePhotoUrl={selectedPosSale?.referencePhotoUrl || (selectedPosSale as any)?.photoProofUrl}
              voucherId={selectedPosSale?.voucherId || "POS_Receipt"}
              voucherTitle="POS SALE RECEIPT"
              voucherSubtitle={`Customer: ${selectedPosSale?.customerName || ""} | Total: ${fmt(selectedPosSale?.totalAmount || 0)}`}
              filenamePrefix="pos_receipt"
              documentType="receipt"
              onPrint={handlePrintPosReceipt}
              onShare={handleShareSaleReceipt}
              onSharePdf={handleShareSalePdf}
              sharing={sharingSaleReceipt}
              sharingPdf={sharingSalePdf}
            />
            <Button size="sm" variant="secondary" onClick={() => setSelectedPosSale(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Outstanding Balance Popup */}
      {showBalancePopup && customersWithBalance.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="pointer-events-auto w-full max-w-2xl mx-4 mb-0 rounded-t-2xl shadow-2xl border border-border overflow-hidden bg-white dark:bg-card">
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span className="font-semibold text-sm">
                  {customersWithBalance.length} Customer{customersWithBalance.length !== 1 ? "s" : ""} with Outstanding Balance — Highest First
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button className="p-1 rounded hover:bg-white/20 transition-colors" onClick={() => setPopupExpanded(e => !e)}>
                  <span className="text-xs font-bold">{popupExpanded ? "▼" : "▲"}</span>
                </button>
                <button className="p-1 rounded hover:bg-white/20 transition-colors" onClick={() => setShowBalancePopup(false)}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {popupExpanded && (
              <div className="max-h-52 overflow-y-auto divide-y divide-border">
                {customersWithBalance.map((c, i) => (
                  <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold ${i === 0 ? "bg-red-600" : i === 1 ? "bg-orange-500" : "bg-yellow-500"}`}>{i + 1}</div>
                      <div>
                        <p className="font-medium text-sm text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone || c.address || "—"}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-red-600 text-sm">{fmt(c.totalBalance || 0)}</p>
                      <p className="text-xs text-muted-foreground">Paid: {fmt(c.totalPaid || 0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
