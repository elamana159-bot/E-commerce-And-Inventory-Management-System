import { useState, useEffect, useMemo, useRef } from "react";
import { fmt } from "@/lib/currency";
import { Plus, Search, Eye, Pencil, Trash2, Printer, Share2, ArrowUpCircle, ArrowDownCircle, Building2, CheckCircle2, FileText, History, FileSpreadsheet, Download, Wallet, ShieldCheck, Maximize2, Minimize2, X, BookOpen, Landmark } from "lucide-react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { getAll, create, update, remove, COLLECTIONS, generateVoucherId, generateSerialVoucherId, subscribeCollection } from "@/lib/firestore";
import { useAuth } from "@/lib/auth";
import { shareAsImage, shareAsPdf, exportToExcel } from "@/lib/shareImage";
import { uploadImage } from "@/lib/cloudinary";
import type { Account, AccountVoucher, Supplier, ChartAccount } from "@/lib/types";
import { postAccountVoucherJournalEntry } from "@/lib/accountingEngine";
import { printElement } from "@/lib/printUtils";
import { ReceiptActionBar } from "@/components/ReceiptActionBar";
import { ReceiptWithReferenceView } from "@/components/ReceiptWithReferenceView";

import { toSafeDate, toSafeDateOrToday, formatSafeDate, todayIsoDate } from "@/lib/dateUtils";

function toDate(val: unknown): Date {
  return toSafeDateOrToday(val);
}
function fmtDate(val: unknown): string {
  return formatSafeDate(val);
}
function todayStr(): string {
  return todayIsoDate();
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [vouchers, setVouchers] = useState<AccountVoucher[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [showAccountForm, setShowAccountForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [accForm, setAccForm] = useState({ bankName: "", personName: "", accountNumber: "" });

  const [showDepositForm, setShowDepositForm] = useState(false);
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<AccountVoucher | null>(null);

  const [depositForm, setDepositForm] = useState({
    accountId: "",
    chartAccountCode: "",
    chartAccountName: "",
    amount: 0,
    fsNumber: "",
    customerName: "",
    date: todayStr(),
    note: "",
    photoProofUrl: "",
  });
  const [withdrawForm, setWithdrawForm] = useState({
    accountId: "",
    chartAccountCode: "",
    chartAccountName: "",
    amount: 0,
    reason: "",
    date: todayStr(),
    note: "",
    fsNumber: "",
    photoProofUrl: "",
    payToSupplier: false,
    supplierId: "",
  });

  const [showHistory, setShowHistory] = useState<Account | null>(null);
  const [isFullScreenHistory, setIsFullScreenHistory] = useState(false);
  const [accountViewMode, setAccountViewMode] = useState<"cards" | "table">("cards");
  const [showVoucherView, setShowVoucherView] = useState<AccountVoucher | null>(null);
  const [isFullScreenVoucherView, setIsFullScreenVoucherView] = useState(false);
  const [txSearch, setTxSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [withdrawUpload, setWithdrawUpload] = useState(false);

  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();
  const { user, isAdmin } = useAuth();
  const receiptRef = useRef<HTMLDivElement>(null);
  function handlePrint() {
    if (!receiptRef.current) return;
    printElement(receiptRef.current, `Account_Voucher_${showVoucherView?.voucherId || ""}`);
  }
  const [sharingPdf, setSharingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  async function handleShare() {
    if (!receiptRef.current) return;
    setSharing(true);
    try {
      const r = await shareAsImage(receiptRef.current, `account_voucher_${showVoucherView?.voucherId || "receipt"}.png`);
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
      const r = await shareAsPdf(receiptRef.current, `account_voucher_${showVoucherView?.voucherId || "receipt"}.pdf`);
      if (r === "failed") toast({ title: "PDF export failed", variant: "destructive" });
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setSharingPdf(false);
    }
  }

  async function exportExcel(vc: AccountVoucher) {
    setExportingExcel(true);
    try {
      const data = [
        ["ACCOUNT TRANSACTION VOUCHER"],
        ["Voucher ID", vc.voucherId || "—"],
        ["Bank Name", vc.accountBankName || "—"],
        ["Account Holder", vc.accountPersonName || "—"],
        ["Account Number", vc.accountNumber || "—"],
        ["Transaction Type", vc.type?.toUpperCase() || "—"],
        ["Amount (ETB)", vc.amount || 0],
        ["Transaction Date", vc.date || fmtDate(vc.createdAt)],
        ["Note / Purpose", vc.note || "—"],
        ["Chart of Account", vc.chartOfAccountCode ? `${vc.chartOfAccountCode} - ${vc.chartOfAccountName || ""}` : "—"],
        ["Created By", vc.createdByName || "—"],
      ];

      const res = await exportToExcel({
        data,
        sheetName: "Account Voucher",
        filename: `${vc.voucherId || "account_voucher"}.xlsx`,
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
    const [accs, vcs, sups, coas] = await Promise.all([
      getAll<Account>(COLLECTIONS.ACCOUNTS),
      getAll<AccountVoucher>(COLLECTIONS.ACCOUNT_VOUCHERS),
      getAll<Supplier>(COLLECTIONS.SUPPLIERS),
      getAll<ChartAccount>(COLLECTIONS.CHART_OF_ACCOUNTS).catch(() => []),
    ]);
    setAccounts(accs.filter(a => !a.isVoided).sort((a, b) => (a.bankName || "").localeCompare(b.bankName || "")));
    setVouchers(vcs.filter(v => !v.isVoided).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))));
    setSuppliers(sups.filter(s => !(s as any).isVoided).sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setChartAccounts((coas || []).sort((a, b) => a.code.localeCompare(b.code)));
    setLoading(false);
  }

  useEffect(() => {
    loadData();
    const unsub = subscribeCollection<ChartAccount>(COLLECTIONS.CHART_OF_ACCOUNTS, (data) => {
      setChartAccounts((data || []).sort((a, b) => a.code.localeCompare(b.code)));
    });
    return () => unsub();
  }, []);

  // Helper: Find Chart of Accounts registered under this specific Bank Account as their Parent Account
  function getSubChartAccountsForBank(acc: Account | undefined, coas: ChartAccount[]): ChartAccount[] {
    if (!acc) return [];
    const accNum = (acc.accountNumber || "").trim();
    const accId = (acc.id || "").trim();

    return coas.filter(ca => {
      if (ca.isActive === false) return false;
      const pCode = (ca.parentCode || "").trim();
      const pName = (ca.parentName || "").toLowerCase();

      if (accNum && pCode === accNum) return true;
      if (accId && pCode === accId) return true;
      if (pCode === `bank_${accId}` || pCode === `bank_${accNum}`) return true;
      if (accNum && pName.includes(accNum.toLowerCase())) return true;
      if (accNum && ca.name.includes(accNum)) return true;
      return false;
    });
  }

  // Fallback: Standard Chart of Account for this Bank type if no sub-account created
  function getFallbackStandardCoa(acc: Account | undefined, coas: ChartAccount[]): ChartAccount | undefined {
    if (!acc) return undefined;
    const bName = (acc.bankName || "").toLowerCase();
    if (bName.includes("telebirr") || bName.includes("ቴሌብር")) {
      return coas.find(c => c.code === "1030");
    }
    if (bName.includes("awash") || bName.includes("አዋሽ")) {
      return coas.find(c => c.code === "1021");
    }
    if (bName.includes("dashen") || bName.includes("ዳሽን")) {
      return coas.find(c => c.code === "1022");
    }
    return coas.find(c => c.code === "1020") || coas.find(c => c.subType === "bank") || coas.find(c => c.type === "asset");
  }

  // Handlers for Account selection in Deposit & Withdraw to auto-select matching Chart of Account
  function handleAccountSelectForDeposit(accId: string) {
    const acc = accounts.find(a => a.id === accId);
    const subCoas = getSubChartAccountsForBank(acc, chartAccounts);
    let defaultCode = "";
    let defaultName = "";
    if (subCoas.length > 0) {
      defaultCode = subCoas[0].code;
      defaultName = subCoas[0].name;
    } else if (acc) {
      const fallback = getFallbackStandardCoa(acc, chartAccounts);
      if (fallback) {
        defaultCode = fallback.code;
        defaultName = fallback.name;
      }
    }
    setDepositForm(p => ({
      ...p,
      accountId: accId,
      chartAccountCode: defaultCode,
      chartAccountName: defaultName,
    }));
  }

  function handleAccountSelectForWithdraw(accId: string) {
    const acc = accounts.find(a => a.id === accId);
    const subCoas = getSubChartAccountsForBank(acc, chartAccounts);
    let defaultCode = "";
    let defaultName = "";
    if (subCoas.length > 0) {
      defaultCode = subCoas[0].code;
      defaultName = subCoas[0].name;
    } else if (acc) {
      const fallback = getFallbackStandardCoa(acc, chartAccounts);
      if (fallback) {
        defaultCode = fallback.code;
        defaultName = fallback.name;
      }
    }
    setWithdrawForm(p => ({
      ...p,
      accountId: accId,
      chartAccountCode: defaultCode,
      chartAccountName: defaultName,
    }));
  }

  // Memoized sub-accounts and other accounts for Deposit form
  const depositMatchingSubAccounts = useMemo(() => {
    const selectedAcc = accounts.find(a => a.id === depositForm.accountId);
    return getSubChartAccountsForBank(selectedAcc, chartAccounts);
  }, [depositForm.accountId, accounts, chartAccounts]);

  const depositOtherAccounts = useMemo(() => {
    const subIds = new Set(depositMatchingSubAccounts.map(s => s.id));
    return chartAccounts.filter(c => !subIds.has(c.id) && (c.subType === "bank" || c.subType === "cash" || c.type === "asset"));
  }, [depositMatchingSubAccounts, chartAccounts]);

  // Memoized sub-accounts and other accounts for Withdraw form
  const withdrawMatchingSubAccounts = useMemo(() => {
    const selectedAcc = accounts.find(a => a.id === withdrawForm.accountId);
    return getSubChartAccountsForBank(selectedAcc, chartAccounts);
  }, [withdrawForm.accountId, accounts, chartAccounts]);

  const withdrawOtherAccounts = useMemo(() => {
    const subIds = new Set(withdrawMatchingSubAccounts.map(s => s.id));
    return chartAccounts.filter(c => !subIds.has(c.id) && (c.subType === "bank" || c.subType === "cash" || c.type === "asset"));
  }, [withdrawMatchingSubAccounts, chartAccounts]);

  const filtered = accounts.filter(a =>
    Boolean(a) && (
      (a.bankName || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.personName || "").toLowerCase().includes(search.toLowerCase()) ||
      (a.accountNumber || "").toLowerCase().includes(search.toLowerCase())
    )
  );

  // --- Account CRUD ---
  function resetAccForm() { setAccForm({ bankName: "", personName: "", accountNumber: "" }); setEditingAccount(null); }

  async function handleSaveAccount() {
    if (!accForm.bankName || !accForm.personName || !accForm.accountNumber) {
      toast({ title: "Fill all fields", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      if (editingAccount) {
        await update(COLLECTIONS.ACCOUNTS, editingAccount.id, accForm as Record<string, unknown>);
        toast({ title: "Account updated" });
      } else {
        await create(COLLECTIONS.ACCOUNTS, { ...accForm, totalDeposit: 0, totalWithdraw: 0, balance: 0 } as Record<string, unknown>);
        toast({ title: "Account created" });
      }
      setShowAccountForm(false); resetAccForm(); await loadData();
    } catch { toast({ title: "Failed", variant: "destructive" }); } finally { setSaving(false); }
  }

  function handleDeleteAccount(a: Account) {
    if (!isAdmin) return;
    confirmDelete(async () => {
      await update(COLLECTIONS.ACCOUNTS, a.id, { isVoided: true });
      toast({ title: "Account deleted" }); await loadData();
    });
  }

  // --- Recompute account balance from all vouchers (safe, no stale state) ---
  async function recomputeBalance(accountId: string) {
    const all = await getAll<AccountVoucher>(COLLECTIONS.ACCOUNT_VOUCHERS);
    const active = all.filter(v => v.accountId === accountId && !v.isVoided);
    const totalDeposit = active.filter(v => v.type === "deposit").reduce((s, v) => s + v.amount, 0);
    const totalWithdraw = active.filter(v => v.type === "withdraw").reduce((s, v) => s + v.amount, 0);
    await update(COLLECTIONS.ACCOUNTS, accountId, { totalDeposit, totalWithdraw, balance: totalDeposit - totalWithdraw } as Record<string, unknown>);
  }

  // --- Deposit ---
  function resetDeposit() {
    setDepositForm({
      accountId: "",
      chartAccountCode: "",
      chartAccountName: "",
      amount: 0,
      fsNumber: "",
      customerName: "",
      date: todayStr(),
      note: "",
      photoProofUrl: "",
    });
    setEditingVoucher(null);
  }

  async function checkFsUnique(fsNumber: string, excludeId?: string): Promise<boolean> {
    const all = await getAll<AccountVoucher>(COLLECTIONS.ACCOUNT_VOUCHERS);
    return !all.some(v => v.fsNumber === fsNumber && !v.isVoided && v.id !== excludeId);
  }

  async function handleSaveDeposit() {
    if (!depositForm.accountId || !depositForm.amount) {
      toast({ title: "Select account and enter amount", variant: "destructive" }); return;
    }
    if (!depositForm.fsNumber) {
      toast({ title: "FS Number is required for deposits", variant: "destructive" }); return;
    }
    const isUnique = await checkFsUnique(depositForm.fsNumber, editingVoucher?.id);
    if (!isUnique) {
      toast({ title: "FS Number already exists", description: "Each deposit must have a unique FS number", variant: "destructive" }); return;
    }
    const account = accounts.find(a => a.id === depositForm.accountId)!;
    setSaving(true);
    try {
      if (editingVoucher) {
        await update(COLLECTIONS.ACCOUNT_VOUCHERS, editingVoucher.id, {
          amount: depositForm.amount, fsNumber: depositForm.fsNumber,
          customerName: depositForm.customerName, date: depositForm.date,
          note: depositForm.note, photoProofUrl: depositForm.photoProofUrl,
          chartOfAccountCode: depositForm.chartAccountCode || "",
          chartOfAccountName: depositForm.chartAccountName || "",
        } as Record<string, unknown>);
        await recomputeBalance(account.id);
        toast({ title: "Deposit updated" });
      } else {
        const voucherId = await generateSerialVoucherId("AV");
        const voucherData = {
          voucherId, accountId: account.id, accountBankName: account.bankName,
          accountPersonName: account.personName, accountNumber: account.accountNumber,
          type: "deposit", amount: depositForm.amount, fsNumber: depositForm.fsNumber,
          customerName: depositForm.customerName, date: depositForm.date, note: depositForm.note,
          photoProofUrl: depositForm.photoProofUrl, createdByName: user?.name || "",
          chartOfAccountCode: depositForm.chartAccountCode || "",
          chartOfAccountName: depositForm.chartAccountName || "",
        };
        const newId = await create(COLLECTIONS.ACCOUNT_VOUCHERS, voucherData as Record<string, unknown>);
        postAccountVoucherJournalEntry({ ...voucherData, id: newId } as AccountVoucher).catch(err => console.warn("Automatic journal entry error:", err));
        await recomputeBalance(account.id);
        toast({ title: "Deposit saved", description: voucherId });
      }
      setShowDepositForm(false); resetDeposit(); await loadData();
    } catch { toast({ title: "Failed", variant: "destructive" }); } finally { setSaving(false); }
  }

  // --- Withdraw ---
  function resetWithdraw() {
    setWithdrawForm({
      accountId: "",
      chartAccountCode: "",
      chartAccountName: "",
      amount: 0,
      reason: "",
      date: todayStr(),
      note: "",
      fsNumber: "",
      photoProofUrl: "",
      payToSupplier: false,
      supplierId: "",
    });
    setEditingVoucher(null);
  }

  async function handleWithdrawPhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setWithdrawUpload(true);
    try { const url = await uploadImage(file); setWithdrawForm(prev => ({ ...prev, photoProofUrl: url })); }
    catch { toast({ title: "Upload failed", variant: "destructive" }); } finally { setWithdrawUpload(false); }
  }

  async function handleSaveWithdraw() {
    if (!withdrawForm.accountId || !withdrawForm.amount) {
      toast({ title: "Select account and enter amount", variant: "destructive" }); return;
    }
    if (!withdrawForm.reason && !withdrawForm.payToSupplier) {
      toast({ title: "Reason is required for withdrawals", variant: "destructive" }); return;
    }
    if (withdrawForm.payToSupplier && !withdrawForm.supplierId) {
      toast({ title: "Please select a supplier", variant: "destructive" }); return;
    }
    const account = accounts.find(a => a.id === withdrawForm.accountId)!;
    const selectedSupplier = withdrawForm.payToSupplier ? suppliers.find(s => s.id === withdrawForm.supplierId) : null;
    const autoReason = selectedSupplier ? `Payment to supplier: ${selectedSupplier.name}` : withdrawForm.reason;
    setSaving(true);
    try {
      if (editingVoucher) {
        await update(COLLECTIONS.ACCOUNT_VOUCHERS, editingVoucher.id, {
          amount: withdrawForm.amount, reason: autoReason,
          date: withdrawForm.date, note: withdrawForm.note,
          fsNumber: withdrawForm.fsNumber, photoProofUrl: withdrawForm.photoProofUrl,
          chartOfAccountCode: withdrawForm.chartAccountCode || "",
          chartOfAccountName: withdrawForm.chartAccountName || "",
        } as Record<string, unknown>);
        await recomputeBalance(account.id);
        toast({ title: "Withdrawal updated" });
      } else {
        const voucherId = await generateSerialVoucherId("AV");
        const withdrawData = {
          voucherId, accountId: account.id, accountBankName: account.bankName,
          accountPersonName: account.personName, accountNumber: account.accountNumber,
          type: "withdraw", amount: withdrawForm.amount, reason: autoReason,
          date: withdrawForm.date, note: withdrawForm.note, createdByName: user?.name || "",
          fsNumber: withdrawForm.fsNumber, photoProofUrl: withdrawForm.photoProofUrl,
          supplierId: selectedSupplier?.id || "", supplierName: selectedSupplier?.name || "",
          chartOfAccountCode: withdrawForm.chartAccountCode || "",
          chartOfAccountName: withdrawForm.chartAccountName || "",
        };
        const newId = await create(COLLECTIONS.ACCOUNT_VOUCHERS, withdrawData as Record<string, unknown>);
        postAccountVoucherJournalEntry({ ...withdrawData, id: newId } as AccountVoucher).catch(err => console.warn("Automatic journal entry error:", err));
        await recomputeBalance(account.id);

        // If paying to supplier, create a supplier payment record and update supplier balance
        if (selectedSupplier) {
          const newTotalPaid = (selectedSupplier.totalPaid || 0) + withdrawForm.amount;
          const newBalance = Math.max(0, (selectedSupplier.totalBalance || 0) - withdrawForm.amount);
          await create(COLLECTIONS.SUPPLIER_PAYMENTS, {
            supplierId: selectedSupplier.id,
            supplierName: selectedSupplier.name,
            amountPaid: withdrawForm.amount,
            remainingBalance: newBalance,
            fsNumber: withdrawForm.fsNumber,
            photoProofUrl: withdrawForm.photoProofUrl,
            note: withdrawForm.note || `Paid via account: ${account.bankName} — ${account.personName}`,
            paymentDate: withdrawForm.date,
            fromAccountVoucherId: voucherId,
            fromAccountBankName: account.bankName,
          } as Record<string, unknown>);
          await update(COLLECTIONS.SUPPLIERS, selectedSupplier.id, {
            totalPaid: newTotalPaid,
            totalBalance: newBalance,
          } as Record<string, unknown>);
        }

        toast({ title: "Withdrawal saved", description: voucherId });
      }
      setShowWithdrawForm(false); resetWithdraw(); await loadData();
    } catch { toast({ title: "Failed", variant: "destructive" }); } finally { setSaving(false); }
  }

  // --- Edit voucher ---
  function openEditVoucher(v: AccountVoucher) {
    setEditingVoucher(v);
    if (v.type === "deposit") {
      setDepositForm({
        accountId: v.accountId,
        chartAccountCode: v.chartOfAccountCode || "",
        chartAccountName: v.chartOfAccountName || "",
        amount: v.amount,
        fsNumber: v.fsNumber || "",
        customerName: v.customerName || "",
        date: v.date || todayStr(),
        note: v.note || "",
        photoProofUrl: v.photoProofUrl || "",
      });
      setShowDepositForm(true);
    } else {
      setWithdrawForm({
        accountId: v.accountId,
        chartAccountCode: v.chartOfAccountCode || "",
        chartAccountName: v.chartOfAccountName || "",
        amount: v.amount,
        reason: v.reason || "",
        date: v.date || todayStr(),
        note: v.note || "",
        fsNumber: v.fsNumber || "",
        photoProofUrl: v.photoProofUrl || "",
        payToSupplier: false,
        supplierId: v.supplierId || "",
      });
      setShowWithdrawForm(true);
    }
  }

  // --- Delete voucher ---
  function handleDeleteVoucher(v: AccountVoucher) {
    if (!isAdmin) return;
    confirmDelete(async () => {
      const account = accounts.find(a => a.id === v.accountId);
      await update(COLLECTIONS.ACCOUNT_VOUCHERS, v.id, { isVoided: true });
      if (account) await recomputeBalance(account.id);
      toast({ title: "Voucher deleted" }); await loadData();
    });
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    try { const url = await uploadImage(file); setDepositForm(prev => ({ ...prev, photoProofUrl: url })); }
    catch { toast({ title: "Upload failed", variant: "destructive" }); } finally { setUploading(false); }
  }

  function buildShareText(v: AccountVoucher) {
    return [
      "ACCOUNT VOUCHER", `Voucher: ${v.voucherId}`,
      `Date: ${v.date || fmtDate(v.createdAt)}`,
      `Bank: ${v.accountBankName || "—"}`, `Person: ${v.accountPersonName || "—"}`,
      `Account No: ${v.accountNumber || "—"}`, `Type: ${(v.type || "").toUpperCase()}`,
      `Amount: ${fmt(v.amount)}`,
      v.fsNumber ? `FS Number: ${v.fsNumber}` : "",
      v.customerName ? `Customer: ${v.customerName}` : "",
      v.supplierName ? `Paid to Supplier: ${v.supplierName}` : "",
      v.reason && !v.supplierName ? `Reason: ${v.reason}` : "",
      v.note ? `Note: ${v.note}` : "",
    ].filter(Boolean).join("\n");
  }

  const historyReceiptRef = useRef<HTMLDivElement>(null);
  const [historySharing, setHistorySharing] = useState(false);
  const [historySharingPdf, setHistorySharingPdf] = useState(false);
  const [historyExportingExcel, setHistoryExportingExcel] = useState(false);

  const historyVouchers = showHistory ? vouchers.filter(v => v.accountId === showHistory.id) : [];

  const filteredHistory = historyVouchers.filter(v => {
    const q = txSearch.toLowerCase().trim();
    if (!q) return true;
    return (
      (v.voucherId || "").toLowerCase().includes(q) ||
      (v.date || fmtDate(v.createdAt) || "").toLowerCase().includes(q) ||
      (v.type || "").toLowerCase().includes(q) ||
      String(v.amount).includes(q) ||
      (v.fsNumber || "").toLowerCase().includes(q) ||
      (v.reason || "").toLowerCase().includes(q) ||
      (v.customerName || "").toLowerCase().includes(q) ||
      (v.supplierName || "").toLowerCase().includes(q) ||
      (v.note || "").toLowerCase().includes(q) ||
      (v.createdByName || "").toLowerCase().includes(q)
    );
  });

  const historyTotalDeposit = filteredHistory
    .filter(v => v.type === "deposit")
    .reduce((s, v) => s + (v.amount || 0), 0);

  const historyTotalWithdraw = filteredHistory
    .filter(v => v.type === "withdraw")
    .reduce((s, v) => s + (v.amount || 0), 0);

  const historyNetBalance = showHistory?.balance ?? (historyTotalDeposit - historyTotalWithdraw);

  function handleHistoryPrint() {
    if (!historyReceiptRef.current || !showHistory) return;
    printElement(historyReceiptRef.current, `${showHistory.bankName}_Transaction_Statement`);
  }

  async function handleHistoryShare() {
    if (!historyReceiptRef.current || !showHistory) return;
    setHistorySharing(true);
    try {
      const filename = `${showHistory.bankName}_Transaction_History_${new Date().toISOString().slice(0, 10)}.png`.replace(/\s+/g, "_");
      const res = await shareAsImage(historyReceiptRef.current, filename);
      if (res === "failed") {
        toast({ title: "Share failed", variant: "destructive" });
      } else if (res === "shared") {
        toast({ title: "Shared successfully" });
      }
    } catch {
      toast({ title: "Share failed", variant: "destructive" });
    } finally {
      setHistorySharing(false);
    }
  }

  async function handleHistorySharePdf() {
    if (!historyReceiptRef.current || !showHistory) return;
    setHistorySharingPdf(true);
    try {
      const filename = `${showHistory.bankName}_Transaction_History_${new Date().toISOString().slice(0, 10)}.pdf`.replace(/\s+/g, "_");
      const res = await shareAsPdf(historyReceiptRef.current, filename);
      if (res === "failed") {
        toast({ title: "PDF export failed", variant: "destructive" });
      } else if (res === "shared") {
        toast({ title: "PDF shared successfully" });
      } else {
        toast({ title: "PDF downloaded successfully" });
      }
    } catch {
      toast({ title: "PDF export failed", variant: "destructive" });
    } finally {
      setHistorySharingPdf(false);
    }
  }

  async function handleHistoryExportExcel() {
    if (!showHistory) return;
    setHistoryExportingExcel(true);
    try {
      const wb = XLSX.utils.book_new();
      const stmtDate = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
      const stmtIso = new Date().toISOString().slice(0, 10);

      // Sheet 1: Detailed Statement
      const rows: any[][] = [
        ["BANK ACCOUNT TRANSACTION STATEMENT / የባንክ ሂሳብ ዝውውር መግለጫ"],
        ["Official Financial Record • Nexus Inventory & Accounting System"],
        [],
        ["ACCOUNT PROFILE", "", "", "FINANCIAL SUMMARY"],
        ["Bank Name:", showHistory.bankName, "", "Total Deposits (ETB):", historyTotalDeposit],
        ["Account Holder:", showHistory.personName, "", "Total Withdrawals (ETB):", historyTotalWithdraw],
        ["Account Number:", showHistory.accountNumber, "", "Net Balance (ETB):", historyNetBalance],
        ["Statement Date:", stmtDate, "", "Total Transactions:", filteredHistory.length],
        ["Generated By:", user?.name || "System Admin", "", "Filter Applied:", txSearch ? `"${txSearch}"` : "All Transactions"],
        [],
        ["DETAILED TRANSACTION AUDIT LEDGER"],
        [
          "No.",
          "Voucher ID",
          "Date",
          "Type",
          "Deposit (ETB)",
          "Withdrawal (ETB)",
          "FS No / Reference",
          "Customer / Supplier / Reason",
          "Note",
          "Created By"
        ],
        ...filteredHistory.map((v, idx) => [
          idx + 1,
          v.voucherId || `AV-${idx + 1}`,
          v.date || fmtDate(v.createdAt),
          v.type === "deposit" ? "DEPOSIT (+)" : "WITHDRAWAL (-)",
          v.type === "deposit" ? (v.amount || 0) : 0,
          v.type === "withdraw" ? (v.amount || 0) : 0,
          v.fsNumber || "—",
          v.customerName || v.supplierName || v.reason || "—",
          v.note || "",
          v.createdByName || "—"
        ]),
        [],
        [
          "",
          "",
          "",
          "TOTALS (ETB):",
          historyTotalDeposit,
          historyTotalWithdraw,
          "",
          "",
          "",
          ""
        ],
        [
          "",
          "",
          "",
          "NET ACCOUNT BALANCE (ETB):",
          historyNetBalance,
          "",
          "",
          "",
          "",
          ""
        ]
      ];

      const ws = XLSX.utils.aoa_to_sheet(rows);

      ws["!cols"] = [
        { wch: 6 },  // No.
        { wch: 18 }, // Voucher ID
        { wch: 14 }, // Date
        { wch: 18 }, // Type
        { wch: 18 }, // Deposit (ETB)
        { wch: 18 }, // Withdrawal (ETB)
        { wch: 18 }, // FS No
        { wch: 32 }, // Customer / Supplier / Reason
        { wch: 24 }, // Note
        { wch: 18 }, // Created By
      ];

      XLSX.utils.book_append_sheet(wb, ws, "Statement");

      // Sheet 2: Executive Summary
      const summaryRows: any[][] = [
        ["EXECUTIVE ACCOUNT SUMMARY"],
        [],
        ["Item", "Details"],
        ["Bank Name", showHistory.bankName],
        ["Account Holder", showHistory.personName],
        ["Account Number", showHistory.accountNumber],
        ["Statement Date", stmtDate],
        ["Generated At", new Date().toLocaleString()],
        ["Prepared By", user?.name || "System Admin"],
        [],
        ["Metric", "Value"],
        ["Total Deposit Transactions", filteredHistory.filter(v => v.type === "deposit").length],
        ["Total Withdrawal Transactions", filteredHistory.filter(v => v.type === "withdraw").length],
        ["Total Deposits Sum (ETB)", historyTotalDeposit],
        ["Total Withdrawals Sum (ETB)", historyTotalWithdraw],
        ["Current Net Balance (ETB)", historyNetBalance],
      ];

      const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ wch: 30 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

      const filename = `${showHistory.bankName}_Transaction_History_${stmtIso}.xlsx`.replace(/\s+/g, "_");

      const res = await exportToExcel({
        workbook: wb,
        filename,
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
      setHistoryExportingExcel(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Accounts</h1>
          <p className="text-sm text-muted-foreground">Bank account management and transaction vouchers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" onClick={() => { resetDeposit(); setShowDepositForm(true); }}>
            <ArrowUpCircle className="w-4 h-4 mr-2" /> Deposit
          </Button>
          <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => { resetWithdraw(); setShowWithdrawForm(true); }}>
            <ArrowDownCircle className="w-4 h-4 mr-2" /> Withdraw
          </Button>
          <Button onClick={() => { resetAccForm(); setShowAccountForm(true); }}>
            <Plus className="w-4 h-4 mr-2" /> New Account
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search accounts…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(acc => (
            <div key={acc.id} className="bg-card border rounded-xl p-5 space-y-3 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold">{acc.bankName}</div>
                  <div className="text-sm text-muted-foreground">{acc.personName}</div>
                  <div className="text-xs font-mono text-muted-foreground">{acc.accountNumber}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setShowHistory(acc); setTxSearch(""); }}><Eye className="w-4 h-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditingAccount(acc); setAccForm({ bankName: acc.bankName, personName: acc.personName, accountNumber: acc.accountNumber }); setShowAccountForm(true); }}><Pencil className="w-4 h-4" /></Button>
                  {isAdmin && <Button size="sm" variant="ghost" className="text-red-500" onClick={() => handleDeleteAccount(acc)}><Trash2 className="w-4 h-4" /></Button>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs border-t pt-3">
                <div><div className="text-muted-foreground">Deposit</div><div className="font-semibold text-green-600">{fmt(acc.totalDeposit || 0)}</div></div>
                <div><div className="text-muted-foreground">Withdraw</div><div className="font-semibold text-red-600">{fmt(acc.totalWithdraw || 0)}</div></div>
                <div><div className="text-muted-foreground">Balance</div><div className={`font-bold text-sm ${(acc.balance || 0) >= 0 ? "text-primary" : "text-red-600"}`}>{fmt(acc.balance || 0)}</div></div>
              </div>
              <div className="pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs font-semibold h-8 gap-1.5 text-primary border-primary/25 hover:bg-primary/5 hover:border-primary/50 transition-all"
                  onClick={() => { setShowHistory(acc); setTxSearch(""); }}
                >
                  <History className="w-3.5 h-3.5" />
                  <span>Transaction History</span>
                </Button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="col-span-3 text-center text-muted-foreground py-16">No accounts found</div>}
        </div>
      )}

      {/* Account Form */}
      <Dialog open={showAccountForm} onOpenChange={v => { if (!v) { setShowAccountForm(false); resetAccForm(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
          <DialogHeader><DialogTitle>{editingAccount ? "Edit Account" : "New Account"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Bank Name</Label><Input value={accForm.bankName} onChange={e => setAccForm(p => ({ ...p, bankName: e.target.value }))} className="mt-1" placeholder="e.g. Commercial Bank of Ethiopia" /></div>
            <div><Label>Person Name</Label><Input value={accForm.personName} onChange={e => setAccForm(p => ({ ...p, personName: e.target.value }))} className="mt-1" /></div>
            <div><Label>Account Number</Label><Input value={accForm.accountNumber} onChange={e => setAccForm(p => ({ ...p, accountNumber: e.target.value }))} className="mt-1" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAccountForm(false); resetAccForm(); }}>Cancel</Button>
            <Button onClick={handleSaveAccount} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Deposit Form */}
      <Dialog open={showDepositForm} onOpenChange={v => { if (!v) { setShowDepositForm(false); resetDeposit(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
          <DialogHeader><DialogTitle>{editingVoucher ? "Edit Deposit" : "New Deposit"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Account <span className="text-red-500">*</span></Label>
              <Select value={depositForm.accountId} onValueChange={handleAccountSelectForDeposit} disabled={!!editingVoucher}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bankName} — {a.personName}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Chart of Accounts Sub-Account Selector */}
            {depositForm.accountId && (
              <div>
                <Label className="flex items-center justify-between text-xs">
                  <span className="font-semibold">Chart of Account (የሂሳብ ሠንጠረዥ መደብ)</span>
                  {depositMatchingSubAccounts.length > 0 ? (
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {depositMatchingSubAccounts.length} Sub-Account{depositMatchingSubAccounts.length > 1 ? "s" : ""} Linked
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Standard Bank Account</span>
                  )}
                </Label>
                <Select
                  value={depositForm.chartAccountCode}
                  onValueChange={(val) => {
                    const coa = chartAccounts.find((c) => c.code === val);
                    setDepositForm((p) => ({
                      ...p,
                      chartAccountCode: val,
                      chartAccountName: coa?.name || "",
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Chart of Account" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    {depositMatchingSubAccounts.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-xs flex items-center gap-1.5 uppercase tracking-wider">
                          <BookOpen className="w-3 h-3" />
                          Registered Under this Bank (በዚህ ባንክ ስር የተመዘገቡ)
                        </SelectLabel>
                        {depositMatchingSubAccounts.map((c) => (
                          <SelectItem key={c.id} value={c.code} className="text-xs">
                            <span className="font-mono font-bold mr-1.5 text-emerald-700 dark:text-emerald-400">
                              {c.code}
                            </span>
                            <span className="font-semibold">{c.name}</span>
                            {c.nameAmharic && (
                              <span className="text-muted-foreground text-[10px] ml-1.5">
                                ({c.nameAmharic})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    <SelectGroup>
                      <SelectLabel className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xs mt-1 flex items-center gap-1.5 uppercase tracking-wider">
                        <Landmark className="w-3 h-3" />
                        Other Bank / Asset Accounts (ሌሎች ተዛማጅ የባንክ መደቦች)
                      </SelectLabel>
                      {depositOtherAccounts.map((c) => (
                        <SelectItem key={c.id} value={c.code} className="text-xs">
                          <span className="font-mono font-bold mr-1.5">{c.code}</span>
                          <span>{c.name}</span>
                          {c.nameAmharic && (
                            <span className="text-muted-foreground text-[10px] ml-1.5">
                              ({c.nameAmharic})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {depositForm.chartAccountCode && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    <BookOpen className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="truncate">
                      Posting Journal Entry to: <strong>{depositForm.chartAccountCode} - {depositForm.chartAccountName}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
            <div><Label>Date</Label><Input type="date" value={depositForm.date} onChange={e => setDepositForm(p => ({ ...p, date: e.target.value }))} className="mt-1" /></div>
            <div><Label>Amount (ETB)</Label><Input type="number" min={0} step="0.01" placeholder="0.00" value={depositForm.amount || ""} onChange={e => setDepositForm(p => ({ ...p, amount: Number(e.target.value) }))} className="mt-1" /></div>
            <div><Label>FS Number <span className="text-red-500">*</span></Label><Input value={depositForm.fsNumber} onChange={e => setDepositForm(p => ({ ...p, fsNumber: e.target.value }))} className="mt-1" placeholder="Must be unique" /></div>
            <div><Label>Customer Name</Label><Input value={depositForm.customerName} onChange={e => setDepositForm(p => ({ ...p, customerName: e.target.value }))} className="mt-1" /></div>
            <div><Label>Note (optional)</Label><Input value={depositForm.note} onChange={e => setDepositForm(p => ({ ...p, note: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Photo Proof (optional)</Label>
              <Input type="file" accept="image/*" onChange={handlePhotoUpload} className="mt-1" disabled={uploading} />
              {depositForm.photoProofUrl && <img src={depositForm.photoProofUrl} alt="proof" className="mt-2 h-24 rounded object-cover" />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDepositForm(false); resetDeposit(); }}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleSaveDeposit} disabled={saving || uploading}>{saving ? "Saving…" : editingVoucher ? "Update Deposit" : "Save Deposit"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Form */}
      <Dialog open={showWithdrawForm} onOpenChange={v => { if (!v) { setShowWithdrawForm(false); resetWithdraw(); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto max-w-md">
          <DialogHeader><DialogTitle>{editingVoucher ? "Edit Withdrawal" : "New Withdrawal"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Account <span className="text-red-500">*</span></Label>
              <Select value={withdrawForm.accountId} onValueChange={handleAccountSelectForWithdraw} disabled={!!editingVoucher}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.bankName} — {a.personName}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            {/* Chart of Accounts Sub-Account Selector */}
            {withdrawForm.accountId && (
              <div>
                <Label className="flex items-center justify-between text-xs">
                  <span className="font-semibold">Chart of Account (የሂሳብ ሠንጠረዥ መደብ)</span>
                  {withdrawMatchingSubAccounts.length > 0 ? (
                    <span className="text-[10px] text-emerald-600 font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      {withdrawMatchingSubAccounts.length} Sub-Account{withdrawMatchingSubAccounts.length > 1 ? "s" : ""} Linked
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">Standard Bank Account</span>
                  )}
                </Label>
                <Select
                  value={withdrawForm.chartAccountCode}
                  onValueChange={(val) => {
                    const coa = chartAccounts.find((c) => c.code === val);
                    setWithdrawForm((p) => ({
                      ...p,
                      chartAccountCode: val,
                      chartAccountName: coa?.name || "",
                    }));
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select Chart of Account" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    {withdrawMatchingSubAccounts.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-1 rounded-xs flex items-center gap-1.5 uppercase tracking-wider">
                          <BookOpen className="w-3 h-3" />
                          Registered Under this Bank (በዚህ ባንክ ስር የተመዘገቡ)
                        </SelectLabel>
                        {withdrawMatchingSubAccounts.map((c) => (
                          <SelectItem key={c.id} value={c.code} className="text-xs">
                            <span className="font-mono font-bold mr-1.5 text-emerald-700 dark:text-emerald-400">
                              {c.code}
                            </span>
                            <span className="font-semibold">{c.name}</span>
                            {c.nameAmharic && (
                              <span className="text-muted-foreground text-[10px] ml-1.5">
                                ({c.nameAmharic})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    <SelectGroup>
                      <SelectLabel className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xs mt-1 flex items-center gap-1.5 uppercase tracking-wider">
                        <Landmark className="w-3 h-3" />
                        Other Bank / Asset Accounts (ሌሎች ተዛማጅ የባንክ መደቦች)
                      </SelectLabel>
                      {withdrawOtherAccounts.map((c) => (
                        <SelectItem key={c.id} value={c.code} className="text-xs">
                          <span className="font-mono font-bold mr-1.5">{c.code}</span>
                          <span>{c.name}</span>
                          {c.nameAmharic && (
                            <span className="text-muted-foreground text-[10px] ml-1.5">
                              ({c.nameAmharic})
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {withdrawForm.chartAccountCode && (
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                    <BookOpen className="w-3 h-3 text-emerald-600 shrink-0" />
                    <span className="truncate">
                      Posting Journal Entry to: <strong>{withdrawForm.chartAccountCode} - {withdrawForm.chartAccountName}</strong>
                    </span>
                  </div>
                )}
              </div>
            )}
            <div><Label>Date</Label><Input type="date" value={withdrawForm.date} onChange={e => setWithdrawForm(p => ({ ...p, date: e.target.value }))} className="mt-1" /></div>
            <div><Label>Amount (ETB)</Label><Input type="number" min={0} step="0.01" placeholder="0.00" value={withdrawForm.amount || ""} onChange={e => setWithdrawForm(p => ({ ...p, amount: Number(e.target.value) }))} className="mt-1" /></div>
            <div><Label>FS Number</Label><Input value={withdrawForm.fsNumber} onChange={e => setWithdrawForm(p => ({ ...p, fsNumber: e.target.value }))} className="mt-1" placeholder="Enter FS number (optional)" /></div>

            {/* Pay to Supplier toggle */}
            <div
              className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors select-none ${withdrawForm.payToSupplier ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : "border-muted hover:border-muted-foreground/40"}`}
              onClick={() => !editingVoucher && setWithdrawForm(p => ({ ...p, payToSupplier: !p.payToSupplier, supplierId: "" }))}
            >
              <div className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-colors ${withdrawForm.payToSupplier ? "bg-blue-600 border-blue-600" : "border-muted-foreground/40"}`}>
                {withdrawForm.payToSupplier && <CheckCircle2 className="w-4 h-4 text-white" />}
              </div>
              <Building2 className={`w-4 h-4 ${withdrawForm.payToSupplier ? "text-blue-600" : "text-muted-foreground"}`} />
              <span className={`text-sm font-medium ${withdrawForm.payToSupplier ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}>
                Pay to Supplier
              </span>
            </div>

            {/* Supplier selector — shown only when Pay to Supplier is checked */}
            {withdrawForm.payToSupplier && (
              <div>
                <Label>Select Supplier <span className="text-red-500">*</span></Label>
                <Select value={withdrawForm.supplierId} onValueChange={v => setWithdrawForm(p => ({ ...p, supplierId: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Choose a supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-medium">{s.name}</span>
                        <span className="ml-2 text-muted-foreground text-xs">Balance: {fmt(s.totalBalance || 0)}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {withdrawForm.supplierId && (() => {
                  const sup = suppliers.find(s => s.id === withdrawForm.supplierId);
                  return sup ? (
                    <div className="mt-2 rounded-md bg-muted/50 px-3 py-2 text-sm space-y-0.5">
                      <div><span className="text-muted-foreground">Current Balance:</span> <span className="font-semibold text-red-600">{fmt(sup.totalBalance || 0)}</span></div>
                      <div><span className="text-muted-foreground">Total Paid so far:</span> <span className="font-semibold">{fmt(sup.totalPaid || 0)}</span></div>
                      {withdrawForm.amount > 0 && <div className="pt-1 border-t"><span className="text-muted-foreground">Balance after payment:</span> <span className="font-semibold text-green-600">{fmt(Math.max(0, (sup.totalBalance || 0) - withdrawForm.amount))}</span></div>}
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            {!withdrawForm.payToSupplier && (
              <div><Label>Reason <span className="text-red-500">*</span></Label><Input value={withdrawForm.reason} onChange={e => setWithdrawForm(p => ({ ...p, reason: e.target.value }))} className="mt-1" placeholder="Purpose of withdrawal" /></div>
            )}
            <div><Label>Note (optional)</Label><Input value={withdrawForm.note} onChange={e => setWithdrawForm(p => ({ ...p, note: e.target.value }))} className="mt-1" /></div>
            <div>
              <Label>Photo Proof (optional)</Label>
              <Input type="file" accept="image/*" onChange={handleWithdrawPhotoUpload} className="mt-1" disabled={withdrawUpload} />
              {withdrawForm.photoProofUrl && <img src={withdrawForm.photoProofUrl} alt="proof" className="mt-2 h-24 rounded object-cover" />}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowWithdrawForm(false); resetWithdraw(); }}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" onClick={handleSaveWithdraw} disabled={saving || withdrawUpload}>{saving ? "Saving…" : editingVoucher ? "Update Withdrawal" : "Save Withdrawal"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Account History */}
      {showHistory && (
        <Dialog open onOpenChange={(open) => { if (!open) { setShowHistory(null); setIsFullScreenHistory(false); } }}>
          <DialogContent
            className={`transition-all duration-200 p-0 flex flex-col overflow-hidden ${
              isFullScreenHistory
                ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none top-0 left-0 translate-x-0 translate-y-0 z-50 border-0 m-0 bg-slate-100/95 dark:bg-slate-950/95"
                : "fixed top-0 sm:top-[50%] left-0 sm:left-[50%] translate-x-0 sm:translate-x-[-50%] translate-y-0 sm:translate-y-[-50%] w-full h-[100dvh] sm:h-auto sm:max-h-[94vh] sm:max-w-5xl lg:max-w-6xl rounded-none sm:rounded-2xl border bg-background shadow-2xl z-50"
            }`}
          >
            <DialogHeader className="p-3 sm:p-4 border-b border-border/60 shrink-0 bg-background flex flex-row items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-sm sm:text-lg font-bold flex items-center gap-2 truncate">
                  <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-primary shrink-0" />
                  <span className="truncate">{showHistory.bankName} — Statement</span>
                </DialogTitle>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 truncate">
                  {showHistory.personName} • Acct: <span className="font-mono font-semibold text-foreground">{showHistory.accountNumber}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullScreenHistory(prev => !prev)}
                  className="h-8 px-2 sm:px-2.5 text-xs gap-1 font-medium border-slate-300 dark:border-slate-700 hover:bg-muted shrink-0"
                  title={isFullScreenHistory ? "Exit Full Screen" : "Full Screen"}
                >
                  {isFullScreenHistory ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  <span className="hidden md:inline">{isFullScreenHistory ? "Exit" : "Full Screen"}</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowHistory(null)}
                  className="h-8 w-8 p-0 rounded-full text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </DialogHeader>

            {/* Live Filter & Mobile View Toggle Bar */}
            <div className="px-3 py-1.5 sm:px-4 sm:py-2 bg-slate-50 dark:bg-slate-900 border-b border-border/50 shrink-0 flex items-center justify-between gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search date, type, amount, FS No..."
                  value={txSearch}
                  onChange={e => setTxSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-white dark:bg-slate-950"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* Mobile View Mode Toggle (Cards vs Table) */}
                <div className="sm:hidden flex items-center bg-slate-200 dark:bg-slate-800 rounded-lg p-0.5 text-[10px]">
                  <button
                    type="button"
                    onClick={() => setAccountViewMode("cards")}
                    className={`px-2 py-0.5 rounded font-semibold transition-all ${
                      accountViewMode === "cards" ? "bg-white text-primary shadow-xs font-bold" : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccountViewMode("table")}
                    className={`px-2 py-0.5 rounded font-semibold transition-all ${
                      accountViewMode === "table" ? "bg-white text-primary shadow-xs font-bold" : "text-slate-600 dark:text-slate-300"
                    }`}
                  >
                    Table
                  </button>
                </div>
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  {filteredHistory.length} of {historyVouchers.length} txs
                </span>
                {txSearch && (
                  <Button variant="ghost" size="sm" onClick={() => setTxSearch("")} className="h-7 px-1.5 text-xs text-muted-foreground hover:text-foreground">
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Scrollable Document Area */}
            <div className="flex-1 overflow-y-auto p-2 sm:p-5 bg-slate-100/60 dark:bg-slate-950/60">
              {/* Printable & Exportable Formal Colorful Statement */}
              <div
                ref={historyReceiptRef}
                className={`receipt-a4 bg-white text-slate-900 border border-slate-200 shadow-xs space-y-3 sm:space-y-4 p-3 sm:p-6 transition-all ${
                  isFullScreenHistory ? "max-w-6xl mx-auto w-full rounded-xl sm:rounded-2xl shadow-md my-auto" : "w-full rounded-xl"
                }`}
                style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif" }}
              >
                {/* Colorful Top Accent Ribbon */}
                <div
                  className="h-1.5 sm:h-2 -mx-3 sm:-mx-6 -mt-3 sm:-mt-6 rounded-t-xl mb-3 sm:mb-4"
                  style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #059669 100%)" }}
                />

                {/* Statement Header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-200">
                  <div className="flex items-start gap-2.5 sm:gap-3">
                    <div
                      className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs"
                      style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%)" }}
                    >
                      <Building2 className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <h2 className="text-sm sm:text-xl font-black text-slate-900 tracking-tight leading-snug">
                        BANK ACCOUNT TRANSACTION STATEMENT
                      </h2>
                      <p className="text-[10px] sm:text-xs font-semibold text-slate-600">
                        የባንክ ሂሳብ ዝውውር መግለጫና ሪፖርት • Nexus Inventory & Accounting
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="inline-flex items-center gap-1 text-[9px] sm:text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Official Audit Ledger
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-[10px] sm:text-xs text-slate-600 sm:text-right flex flex-row sm:flex-col justify-between sm:justify-start gap-1 bg-slate-50 p-2 sm:p-2.5 rounded-lg border border-slate-200 shrink-0">
                    <div>
                      <span className="text-slate-500">Ref:</span>{" "}
                      <span className="font-mono font-bold text-slate-900">
                        STMT-{showHistory.accountNumber ? showHistory.accountNumber.slice(-6) : "ACC"}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500">Date:</span>{" "}
                      <span className="font-medium text-slate-900">
                        {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </span>
                    </div>
                    <div className="hidden sm:block">
                      <span className="text-slate-500">By:</span>{" "}
                      <span className="font-medium text-slate-900">{user?.name || "System Admin"}</span>
                    </div>
                  </div>
                </div>

                {/* Account Profile Card */}
                <div className="bg-slate-50/80 rounded-lg p-2.5 sm:p-3.5 border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-xs">
                  <div>
                    <div className="text-slate-500 font-medium text-[10px] sm:text-[11px]">Bank Name</div>
                    <div className="font-bold text-slate-900 text-xs sm:text-sm mt-0.5">{showHistory.bankName}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-medium text-[10px] sm:text-[11px]">Account Holder</div>
                    <div className="font-semibold text-slate-900 text-xs sm:text-sm mt-0.5 truncate">{showHistory.personName}</div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-medium text-[10px] sm:text-[11px]">Account Number</div>
                    <div className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block mt-0.5 text-xs">
                      {showHistory.accountNumber}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500 font-medium text-[10px] sm:text-[11px]">Ledger Status</div>
                    <div className="text-emerald-700 font-semibold flex items-center gap-1 mt-0.5 text-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      Verified Active
                    </div>
                  </div>
                </div>

                {/* Colorful Financial KPI Summary Cards (Compact 3-Column on Mobile & Desktop) */}
                <div className="grid grid-cols-3 gap-1.5 sm:gap-3">
                  {/* Deposits KPI */}
                  <div
                    className="rounded-xl p-2 sm:p-3.5 border shadow-xs"
                    style={{ background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)", borderColor: "#a7f3d0" }}
                  >
                    <div className="flex items-center justify-between text-[9px] sm:text-xs text-emerald-800 font-bold mb-0.5 sm:mb-1">
                      <span className="flex items-center gap-1 truncate">
                        <ArrowUpCircle className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                        <span className="truncate">Deposits (ገቢ)</span>
                      </span>
                    </div>
                    <div className="text-xs sm:text-lg font-black text-emerald-700 truncate">
                      +{fmt(historyTotalDeposit)}
                    </div>
                    <div className="text-[8px] sm:text-[11px] text-emerald-600 font-medium truncate mt-0.5">
                      {filteredHistory.filter(v => v.type === "deposit").length} records
                    </div>
                  </div>

                  {/* Withdrawals KPI */}
                  <div
                    className="rounded-xl p-2 sm:p-3.5 border shadow-xs"
                    style={{ background: "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)", borderColor: "#fecdd3" }}
                  >
                    <div className="flex items-center justify-between text-[9px] sm:text-xs text-rose-800 font-bold mb-0.5 sm:mb-1">
                      <span className="flex items-center gap-1 truncate">
                        <ArrowDownCircle className="w-3 h-3 sm:w-4 sm:h-4 text-rose-600 shrink-0" />
                        <span className="truncate">Withdrawals (ወጪ)</span>
                      </span>
                    </div>
                    <div className="text-xs sm:text-lg font-black text-rose-700 truncate">
                      -{fmt(historyTotalWithdraw)}
                    </div>
                    <div className="text-[8px] sm:text-[11px] text-rose-600 font-medium truncate mt-0.5">
                      {filteredHistory.filter(v => v.type === "withdraw").length} records
                    </div>
                  </div>

                  {/* Balance KPI */}
                  <div
                    className="rounded-xl p-2 sm:p-3.5 border shadow-xs"
                    style={{ background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)", borderColor: "#bfdbfe" }}
                  >
                    <div className="flex items-center justify-between text-[9px] sm:text-xs text-blue-800 font-bold mb-0.5 sm:mb-1">
                      <span className="flex items-center gap-1 truncate">
                        <Wallet className="w-3 h-3 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
                        <span className="truncate">Balance (ቀሪ)</span>
                      </span>
                    </div>
                    <div className="text-xs sm:text-lg font-black text-blue-700 truncate">
                      {fmt(historyNetBalance)}
                    </div>
                    <div className="text-[8px] sm:text-[11px] text-blue-600 font-medium truncate mt-0.5">
                      Verified net
                    </div>
                  </div>
                </div>

                {/* Mobile Cards View (Easy viewing on phones) */}
                <div className={`${accountViewMode === "cards" ? "block sm:hidden" : "hidden"} space-y-2 no-print`}>
                  {filteredHistory.length === 0 ? (
                    <div className="text-center text-slate-500 py-8 text-xs bg-slate-50 rounded-xl border border-slate-200">
                      {txSearch ? `No transactions match "${txSearch}"` : "No transaction vouchers recorded for this account yet"}
                    </div>
                  ) : (
                    filteredHistory.map((v, idx) => (
                      <div
                        key={v.id}
                        className={`rounded-xl border p-2.5 bg-white shadow-xs transition-colors ${
                          v.type === "deposit" ? "border-emerald-200" : "border-rose-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-mono text-[10px] text-slate-400 font-bold">#{idx + 1}</span>
                            <span className="font-mono font-bold text-[11px] text-blue-700 truncate">
                              {v.voucherId || `AV-${idx + 1}`}
                            </span>
                          </div>
                          {v.type === "deposit" ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                              <ArrowUpCircle className="w-2.5 h-2.5 text-emerald-600" /> DEPOSIT
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 shrink-0">
                              <ArrowDownCircle className="w-2.5 h-2.5 text-rose-600" /> WITHDRAW
                            </span>
                          )}
                        </div>

                        <div className="flex items-baseline justify-between mt-1.5 pt-1.5 border-t border-slate-100">
                          <div className="text-[11px] text-slate-500">
                            {formatSafeDate(v.date || v.createdAt)}
                          </div>
                          <div className={`font-black text-sm ${v.type === "deposit" ? "text-emerald-700" : "text-rose-700"}`}>
                            {v.type === "deposit" ? `+${fmt(v.amount)}` : `-${fmt(v.amount)}`} <span className="text-[10px] font-bold">ETB</span>
                          </div>
                        </div>

                        {(v.customerName || v.supplierName || v.reason || v.note || v.fsNumber) && (
                          <div className="mt-1.5 pt-1.5 border-t border-slate-100 text-xs space-y-0.5">
                            {v.customerName && (
                              <div className="text-slate-800 text-[11px]">
                                <span className="text-slate-400">Customer:</span> <span className="font-semibold">{v.customerName}</span>
                              </div>
                            )}
                            {v.supplierName && (
                              <div className="text-blue-800 text-[11px]">
                                <span className="text-slate-400">Paid to:</span> <span className="font-semibold">{v.supplierName}</span>
                              </div>
                            )}
                            {v.reason && !v.supplierName && (
                              <div className="text-slate-700 text-[11px]">
                                <span className="text-slate-400">Reason:</span> {v.reason}
                              </div>
                            )}
                            {v.note && (
                              <div className="text-[10px] text-slate-500 italic">
                                Note: {v.note}
                              </div>
                            )}
                            {v.fsNumber && (
                              <div className="text-[10px] font-mono text-slate-600">
                                FS No: <span className="font-bold">{v.fsNumber}</span>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-1.5 mt-2 pt-1.5 border-t border-slate-100">
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1" onClick={() => setShowVoucherView(v)}>
                            <Eye className="w-3 h-3 text-slate-600" /> View
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1" onClick={() => openEditVoucher(v)}>
                            <Pencil className="w-3 h-3 text-slate-600" /> Edit
                          </Button>
                          {isAdmin && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1 text-red-600 hover:text-red-700" onClick={() => handleDeleteVoucher(v)}>
                              <Trash2 className="w-3 h-3" /> Delete
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Transaction Ledger Table (Desktop view + Print view) */}
                <div className={`${accountViewMode === "table" ? "block" : "hidden sm:block"} print:block overflow-x-auto rounded-lg border border-slate-200 shadow-xs`}>
                  <table className="w-full text-xs text-left min-w-[700px] sm:min-w-full border-collapse">
                    <thead>
                      <tr style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)", color: "#ffffff" }}>
                        <th className="px-3 py-2.5 text-center font-bold w-9">#</th>
                        <th className="px-3 py-2.5 font-bold">Voucher ID</th>
                        <th className="px-3 py-2.5 font-bold">Date</th>
                        <th className="px-3 py-2.5 text-center font-bold">Type</th>
                        <th className="px-3 py-2.5 font-bold">Customer / Supplier / Reason</th>
                        <th className="px-3 py-2.5 font-bold">FS No / Ref</th>
                        <th className="px-3 py-2.5 text-right font-bold text-emerald-300">Deposit (+ETB)</th>
                        <th className="px-3 py-2.5 text-right font-bold text-rose-300">Withdrawal (-ETB)</th>
                        <th className="px-3 py-2.5 text-center font-bold no-print" data-html2canvas-ignore="true">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {filteredHistory.length === 0 && (
                        <tr>
                          <td colSpan={9} className="text-center text-slate-500 py-10">
                            {txSearch ? `No transactions match "${txSearch}"` : "No transaction vouchers recorded for this account yet"}
                          </td>
                        </tr>
                      )}
                      {filteredHistory.map((v, idx) => (
                        <tr
                          key={v.id}
                          className={idx % 2 === 0 ? "bg-white hover:bg-slate-50/80" : "bg-slate-50/60 hover:bg-slate-100/60"}
                        >
                          <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                          <td className="px-3 py-2 font-mono font-bold text-blue-700 whitespace-nowrap">
                            {v.voucherId || `AV-${idx + 1}`}
                          </td>
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">
                            {formatSafeDate(v.date || v.createdAt)}
                          </td>
                          <td className="px-3 py-2 text-center whitespace-nowrap">
                            {v.type === "deposit" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                                <ArrowUpCircle className="w-3 h-3 text-emerald-600" /> DEPOSIT
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300">
                                <ArrowDownCircle className="w-3 h-3 text-rose-600" /> WITHDRAW
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {v.customerName && (
                              <div className="font-semibold text-slate-800">
                                <span className="text-[10px] text-slate-500 font-normal">Customer: </span>
                                {v.customerName}
                              </div>
                            )}
                            {v.supplierName && (
                              <div className="font-semibold text-blue-800">
                                <span className="text-[10px] text-slate-500 font-normal">Paid to Supplier: </span>
                                {v.supplierName}
                              </div>
                            )}
                            {v.reason && !v.supplierName && (
                              <div className="text-slate-700">{v.reason}</div>
                            )}
                            {v.note && (
                              <div className="text-[10px] text-slate-500 italic mt-0.5">{v.note}</div>
                            )}
                            {!v.customerName && !v.supplierName && !v.reason && !v.note && (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                            <div>{v.fsNumber || "—"}</div>
                            {v.chartOfAccountCode && (
                              <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 font-sans">
                                <BookOpen className="w-2.5 h-2.5 shrink-0" />
                                <span>COA: {v.chartOfAccountCode}</span>
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-600 whitespace-nowrap">
                            {v.type === "deposit" ? `+${fmt(v.amount)}` : <span className="text-slate-300 font-normal">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right font-bold text-rose-600 whitespace-nowrap">
                            {v.type === "withdraw" ? `-${fmt(v.amount)}` : <span className="text-slate-300 font-normal">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center no-print" data-html2canvas-ignore="true">
                            <div className="flex items-center justify-center gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View Voucher" onClick={() => setShowVoucherView(v)}>
                                <Eye className="w-3.5 h-3.5 text-slate-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit Voucher" onClick={() => openEditVoucher(v)}>
                                <Pencil className="w-3.5 h-3.5 text-slate-600" />
                              </Button>
                              {isAdmin && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" title="Delete Voucher" onClick={() => handleDeleteVoucher(v)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* Summary Totals Row */}
                    <tfoot>
                      <tr className="bg-slate-100 font-bold border-t-2 border-slate-400 text-slate-900">
                        <td colSpan={6} className="px-3 py-2.5 text-right font-bold text-xs uppercase tracking-wide">
                          Totals ({filteredHistory.length} Transactions):
                        </td>
                        <td className="px-3 py-2.5 text-right text-emerald-700 font-black text-xs whitespace-nowrap">
                          +{fmt(historyTotalDeposit)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-rose-700 font-black text-xs whitespace-nowrap">
                          -{fmt(historyTotalWithdraw)}
                        </td>
                        <td className="px-3 py-2.5 no-print" data-html2canvas-ignore="true"></td>
                      </tr>
                      <tr className="bg-emerald-50/80 font-bold border-t border-emerald-200 text-emerald-950">
                        <td colSpan={6} className="px-3 py-2 text-right font-bold text-xs">
                          Net Statement Balance (ቀሪ የሂሳብ መጠን):
                        </td>
                        <td colSpan={2} className="px-3 py-2 text-right font-black text-sm text-emerald-700 whitespace-nowrap">
                          {fmt(historyNetBalance)}
                        </td>
                        <td className="px-3 py-2 no-print" data-html2canvas-ignore="true"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Official Stamp & Signatures Block */}
                <div className="pt-3 sm:pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 text-xs text-slate-600">
                  <div className="space-y-1.5 border-b sm:border-b-0 sm:border-r border-slate-200 pb-2.5 sm:pb-0 sm:pr-4">
                    <div className="font-semibold text-slate-800">Prepared & Verified By:</div>
                    <div className="h-7 sm:h-9 border-b border-dashed border-slate-300 flex items-end pb-1 font-medium text-slate-900">
                      {user?.name || "System Accountant / Administrator"}
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-500">
                      Date: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:pl-4">
                    <div className="font-semibold text-slate-800">Authorized Auditor / Branch Stamp:</div>
                    <div className="h-7 sm:h-9 border-b border-dashed border-slate-300 flex items-end pb-1 text-slate-400 italic">
                      Signature & Official Stamp
                    </div>
                    <div className="text-[10px] sm:text-[11px] text-slate-500">
                      Authorized Financial Approval
                    </div>
                  </div>
                </div>

                {/* Security Footnote */}
                <div className="text-[10px] text-slate-600 pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span>Certified Official Audit Statement • Nexus Stock & Account Management</span>
                  <span>Page 1 of 1</span>
                </div>
              </div>
            </div>

            {/* Dialog Bottom Footer */}
            <DialogFooter className="p-2 sm:p-3 border-t border-border bg-background flex flex-row items-center justify-between gap-2 shrink-0">
              <ReceiptActionBar
                receiptRef={historyReceiptRef}
                voucherId={showHistory ? `${showHistory.bankName}_Statement` : "Statement"}
                voucherTitle={`${showHistory?.bankName || "ACCOUNT"} STATEMENT`}
                voucherSubtitle={`Account: ${showHistory?.accountNumber || ""} | Balance: ${fmt(showHistory?.balance || 0)}`}
                filenamePrefix="account_statement"
                documentType="statement"
                onExportExcel={handleHistoryExportExcel}
                onSharePdf={handleHistorySharePdf}
                onShare={handleHistoryShare}
                onPrint={handleHistoryPrint}
                sharing={historySharing}
                sharingPdf={historySharingPdf}
                exportingExcel={historyExportingExcel}
                disabled={filteredHistory.length === 0}
              />
              <Button variant="outline" size="sm" onClick={() => setShowHistory(null)} className="h-8 px-3 text-xs shrink-0">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Voucher View */}
      {showVoucherView && (
        <Dialog open onOpenChange={(open) => { if (!open) { setShowVoucherView(null); setIsFullScreenVoucherView(false); } }}>
          <DialogContent
            className={`overflow-y-auto transition-all duration-200 ${
              isFullScreenVoucherView
                ? "fixed inset-0 w-screen h-screen max-w-none max-h-none rounded-none top-0 left-0 translate-x-0 translate-y-0 z-50 border-0 m-0 p-2 sm:p-4 md:p-6 bg-slate-100/95 dark:bg-slate-950/95 flex flex-col"
                : showVoucherView.photoProofUrl
                ? "max-w-6xl xl:max-w-7xl max-h-[92vh] p-3 sm:p-5 rounded-xl sm:rounded-2xl"
                : "w-full max-w-full sm:max-w-md md:max-w-lg max-h-[92vh] p-3 sm:p-5 rounded-xl sm:rounded-2xl"
            }`}
          >
            <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b border-border/50 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <DialogTitle className="text-base sm:text-lg font-bold truncate">Account Voucher</DialogTitle>
              </div>
              <div className="flex items-center gap-1.5 mr-6 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsFullScreenVoucherView(prev => !prev)}
                  className="h-8 px-2.5 text-xs gap-1.5 font-medium border-slate-300 dark:border-slate-700 hover:bg-muted"
                  title={isFullScreenVoucherView ? "Exit Full Screen (ሙሉ ስክሪን ውጣ)" : "Full Screen (ሙሉ ስክሪን)"}
                >
                  {isFullScreenVoucherView ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{isFullScreenVoucherView ? "Exit Full Screen" : "Full Screen (ሙሉ ስክሪን)"}</span>
                </Button>
              </div>
            </DialogHeader>

            <ReceiptWithReferenceView
              referencePhotoUrl={showVoucherView.photoProofUrl}
              voucherId={showVoucherView.voucherId}
              receiptNode={
                <div
                  ref={receiptRef}
                  className={`receipt-a4 bg-white text-slate-900 border border-slate-200 overflow-hidden shadow-xs space-y-3 p-4 sm:p-5 text-sm transition-all ${
                    isFullScreenVoucherView ? "max-w-2xl mx-auto w-full rounded-xl shadow-md my-auto" : "w-full rounded-xl"
                  }`}
                >
                  <div className="text-center border-b pb-3">
                    <h2 className="text-base sm:text-lg font-bold tracking-tight">ACCOUNT VOUCHER</h2>
                    <p className="font-mono text-primary text-sm font-semibold">{showVoucherView.voucherId}</p>
                    <p className="text-xs text-muted-foreground">{formatSafeDate(showVoucherView.date || showVoucherView.createdAt)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                    <div><span className="text-muted-foreground text-xs">Bank:</span><div className="font-semibold text-slate-900">{showVoucherView.accountBankName}</div></div>
                    <div><span className="text-muted-foreground text-xs">Person:</span><div className="font-semibold text-slate-900">{showVoucherView.accountPersonName}</div></div>
                    <div><span className="text-muted-foreground text-xs">Account No:</span><div className="font-mono text-blue-700 font-semibold">{showVoucherView.accountNumber}</div></div>
                    <div><span className="text-muted-foreground text-xs">Type:</span><div className={`font-bold uppercase ${showVoucherView.type === "deposit" ? "text-emerald-600" : "text-rose-600"}`}>{showVoucherView.type}</div></div>
                    <div className="col-span-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <span className="text-muted-foreground text-xs">Amount:</span>
                      <div className={`font-black text-xl sm:text-2xl ${showVoucherView.type === "deposit" ? "text-emerald-700" : "text-rose-700"}`}>
                        {showVoucherView.type === "deposit" ? "+" : "-"}{fmt(showVoucherView.amount)}
                      </div>
                    </div>
                    {showVoucherView.fsNumber && <div><span className="text-muted-foreground text-xs">FS Number:</span><div className="font-mono">{showVoucherView.fsNumber}</div></div>}
                    {showVoucherView.chartOfAccountCode && (
                      <div className="col-span-2 rounded-md border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1.5 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                          <BookOpen className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-medium">Chart of Account:</span>
                        </div>
                        <div className="font-mono font-bold text-xs text-emerald-700 dark:text-emerald-300">
                          {showVoucherView.chartOfAccountCode} - {showVoucherView.chartOfAccountName || ""}
                        </div>
                      </div>
                    )}
                    {showVoucherView.customerName && <div><span className="text-muted-foreground text-xs">Customer:</span><div className="font-semibold">{showVoucherView.customerName}</div></div>}
                    {showVoucherView.supplierName && (
                      <div className="col-span-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 px-3 py-2">
                        <span className="text-muted-foreground text-xs">Paid to Supplier:</span>
                        <div className="font-semibold text-blue-700 dark:text-blue-300">{showVoucherView.supplierName}</div>
                      </div>
                    )}
                    {showVoucherView.reason && !showVoucherView.supplierName && <div className="col-span-2"><span className="text-muted-foreground text-xs">Reason:</span><div>{showVoucherView.reason}</div></div>}
                    {showVoucherView.note && <div className="col-span-2"><span className="text-muted-foreground text-xs">Note:</span><div className="italic text-slate-600">{showVoucherView.note}</div></div>}
                  </div>
                  {/* Footer */}
                  <div className="border-t pt-3 mt-2 text-xs text-muted-foreground space-y-1">
                    {showVoucherView?.createdByName && <div className="flex justify-between"><span>Created by:</span><span className="font-medium text-foreground">{showVoucherView.createdByName}</span></div>}
                    <div className="flex justify-between"><span>Authorized signature: _______________</span><span>Page 1 of 1</span></div>
                  </div>
                </div>
              }
            />

            <DialogFooter className="gap-2 flex-wrap sm:justify-between pt-2 border-t border-border/50">
              <ReceiptActionBar
                receiptRef={receiptRef}
                referencePhotoUrl={showVoucherView.photoProofUrl}
                voucherId={showVoucherView.voucherId}
                voucherTitle={`${showVoucherView.type.toUpperCase()} ACCOUNT VOUCHER`}
                voucherSubtitle={`Account: ${showVoucherView.accountBankName || showVoucherView.accountPersonName || ""} | Amount: ${fmt(showVoucherView.amount || 0)}`}
                filenamePrefix="account_voucher"
                onExportExcel={() => showVoucherView && exportExcel(showVoucherView)}
                onSharePdf={handleSharePdf}
                onShare={handleShare}
                onPrint={handlePrint}
                sharing={sharing}
                sharingPdf={sharingPdf}
                exportingExcel={exportingExcel}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { openEditVoucher(showVoucherView); setShowVoucherView(null); }}>
                  <Pencil className="w-4 h-4 mr-2" /> Edit
                </Button>
                <Button variant="secondary" onClick={() => setShowVoucherView(null)}>Close</Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {DeleteAuthDialog}
    </div>
  );
}
