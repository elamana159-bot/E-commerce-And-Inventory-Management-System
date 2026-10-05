import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  BookOpen,
  DollarSign,
  Layers,
  ArrowRightLeft,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Printer,
  Download,
  Plus,
  Search,
  Filter,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Building2,
  Wallet,
  Landmark,
  ShieldCheck,
  Calendar,
  ChevronRight,
  Eye,
  Trash2,
  Pencil,
  BarChart3,
  PieChart as PieChartIcon,
  Scale,
  Sparkles,
  Info,
  Coins,
  Lock,
  Unlock,
  Ban,
  Users,
  Truck,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from "recharts";
import * as XLSX from "xlsx";
import { fmt } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useDeleteAuth } from "@/hooks/useDeleteAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { printElement } from "@/lib/printUtils";
import { exportToExcel } from "@/lib/shareImage";
import { formatSafeDate, todayIsoDate, safeDateSort } from "@/lib/dateUtils";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { getAll, create, update, remove, COLLECTIONS, subscribeCollection } from "@/lib/firestore";
import type {
  Account,
  ChartAccount,
  JournalEntry,
  JournalLine,
  AccountCategory,
  GeneralLedgerLine,
  TrialBalanceRow,
  Customer,
  Supplier,
  PosSale,
  StockIn,
  CustomerPayment,
  SupplierPayment,
  DamageReturn,
} from "@/lib/types";
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  seedChartOfAccountsIfEmpty,
  createJournalEntry,
  syncAllHistoricalTransactionsToJournal,
  computeGeneralLedger,
  computeTrialBalance,
  computeFinancialStatements,
  postDailyCashUpJournalEntry,
  getFinancialPeriodLock,
  setFinancialPeriodLock,
} from "@/lib/accountingEngine";

const CATEGORY_COLORS: Record<AccountCategory, { bg: string; text: string; border: string }> = {
  asset: { bg: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300", text: "text-blue-700", border: "border-blue-200" },
  liability: { bg: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300", text: "text-amber-700", border: "border-amber-200" },
  equity: { bg: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300", text: "text-purple-700", border: "border-purple-200" },
  revenue: { bg: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300", text: "text-emerald-700", border: "border-emerald-200" },
  expense: { bg: "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300", text: "text-rose-700", border: "border-rose-200" },
};

const CHART_PALETTE = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

export default function Accounting() {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const { confirmDelete, DeleteAuthDialog } = useDeleteAuth();

  // Data states
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Chart of Accounts filter & modal state
  const [coaSearch, setCoaSearch] = useState("");
  const [coaTypeFilter, setCoaTypeFilter] = useState<"all" | AccountCategory>("all");
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [accountForm, setAccountForm] = useState({
    code: "",
    name: "",
    nameAmharic: "",
    type: "asset" as AccountCategory,
    subType: "current_asset",
    parentCode: "",
    parentName: "",
    description: "",
    isActive: true,
  });

  // Manual Journal Entry Modal state
  const [showManualEntryModal, setShowManualEntryModal] = useState(false);
  const [manualEntryDate, setManualEntryDate] = useState(todayIsoDate());
  const [manualEntryMemo, setManualEntryMemo] = useState("");
  const [manualEntryLines, setManualEntryLines] = useState<
    Array<{ accountCode: string; debit: string; credit: string; description: string }>
  >([
    { accountCode: "1010", debit: "0", credit: "0", description: "" },
    { accountCode: "4010", debit: "0", credit: "0", description: "" },
  ]);

  // General Ledger state
  const [glAccountCode, setGlAccountCode] = useState<string>("all");
  const [glStartDate, setGlStartDate] = useState<string>("");
  const [glEndDate, setGlEndDate] = useState<string>("");
  const [glSearch, setGlSearch] = useState<string>("");

  // Trial Balance & Reports Date filter
  const [reportPeriod, setReportPeriod] = useState<"all" | "today" | "week" | "month" | "custom">("month");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  // Historical sync status
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);

  // Daily Cash-Up state
  const [showCashUpModal, setShowCashUpModal] = useState(false);
  const [cashUpCounted, setCashUpCounted] = useState<string>("");
  const [cashUpNote, setCashUpNote] = useState<string>("");
  const [cashUpCashier, setCashUpCashier] = useState<string>(user?.name || "Cashier");
  const [isSavingCashUp, setIsSavingCashUp] = useState(false);

  // Financial Period Lock state
  const [showPeriodLockModal, setShowPeriodLockModal] = useState(false);
  const [periodLock, setPeriodLock] = useState(getFinancialPeriodLock());
  const [lockDateInput, setLockDateInput] = useState(periodLock.lockDate || todayIsoDate());

  // Print Ref
  const reportPrintRef = useRef<HTMLDivElement>(null);
  const expenseReportPrintRef = useRef<HTMLDivElement>(null);
  const revenueReportPrintRef = useRef<HTMLDivElement>(null);

  // Sub-Ledger & AR/AP Reconciliation states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [posSales, setPosSales] = useState<PosSale[]>([]);
  const [stockIns, setStockIns] = useState<StockIn[]>([]);
  const [customerPayments, setCustomerPayments] = useState<CustomerPayment[]>([]);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);
  const [damageReturns, setDamageReturns] = useState<DamageReturn[]>([]);
  const [subLedgerType, setSubLedgerType] = useState<"customers" | "suppliers">("customers");
  const [subLedgerSearch, setSubLedgerSearch] = useState("");
  const [selectedStatementCustomer, setSelectedStatementCustomer] = useState<Customer | null>(null);
  const [selectedStatementSupplier, setSelectedStatementSupplier] = useState<Supplier | null>(null);
  const subledgerPrintRef = useRef<HTMLDivElement>(null);
  const statementPrintRef = useRef<HTMLDivElement>(null);

  // Load and subscribe to real-time data
  useEffect(() => {
    async function initAccounting() {
      setLoading(true);
      await seedChartOfAccountsIfEmpty();

      const [accs, jes, custs, supps, sales, stkIns, custPays, suppPays, dmgs, bAccs] = await Promise.all([
        getAll<ChartAccount>(COLLECTIONS.CHART_OF_ACCOUNTS),
        getAll<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES),
        getAll<Customer>(COLLECTIONS.CUSTOMERS).catch(() => []),
        getAll<Supplier>(COLLECTIONS.SUPPLIERS).catch(() => []),
        getAll<PosSale>(COLLECTIONS.POS_SALES).catch(() => []),
        getAll<StockIn>(COLLECTIONS.STOCK_IN).catch(() => []),
        getAll<CustomerPayment>(COLLECTIONS.CUSTOMER_PAYMENTS).catch(() => []),
        getAll<SupplierPayment>(COLLECTIONS.SUPPLIER_PAYMENTS).catch(() => []),
        getAll<DamageReturn>(COLLECTIONS.DAMAGE_RETURNS).catch(() => []),
        getAll<Account>(COLLECTIONS.ACCOUNTS).catch(() => []),
      ]);

      setAccounts(accs.sort((a, b) => a.code.localeCompare(b.code)));
      setJournalEntries(jes.sort((a, b) => safeDateSort(a.date, b.date, "desc")));
      setCustomers(custs);
      setSuppliers(supps);
      setPosSales(sales);
      setStockIns(stkIns);
      setCustomerPayments(custPays);
      setSupplierPayments(suppPays);
      setDamageReturns(dmgs);
      setBankAccounts((bAccs || []).filter((b) => !b.isVoided).sort((a, b) => (a.bankName || "").localeCompare(b.bankName || "")));
      setLoading(false);
    }

    initAccounting();

    const unsubAcc = subscribeCollection<ChartAccount>(COLLECTIONS.CHART_OF_ACCOUNTS, (data) => {
      setAccounts(data.sort((a, b) => a.code.localeCompare(b.code)));
    });

    const unsubBankAcc = subscribeCollection<Account>(COLLECTIONS.ACCOUNTS, (data) => {
      setBankAccounts((data || []).filter((b) => !b.isVoided).sort((a, b) => (a.bankName || "").localeCompare(b.bankName || "")));
    });

    const unsubJe = subscribeCollection<JournalEntry>(COLLECTIONS.JOURNAL_ENTRIES, (data) => {
      setJournalEntries(data.sort((a, b) => safeDateSort(a.date, b.date, "desc")));
    });

    const unsubCust = subscribeCollection<Customer>(COLLECTIONS.CUSTOMERS, (data) => setCustomers(data));
    const unsubSupp = subscribeCollection<Supplier>(COLLECTIONS.SUPPLIERS, (data) => setSuppliers(data));
    const unsubSales = subscribeCollection<PosSale>(COLLECTIONS.POS_SALES, (data) => setPosSales(data));
    const unsubStk = subscribeCollection<StockIn>(COLLECTIONS.STOCK_IN, (data) => setStockIns(data));
    const unsubCp = subscribeCollection<CustomerPayment>(COLLECTIONS.CUSTOMER_PAYMENTS, (data) => setCustomerPayments(data));
    const unsubSp = subscribeCollection<SupplierPayment>(COLLECTIONS.SUPPLIER_PAYMENTS, (data) => setSupplierPayments(data));
    const unsubDmg = subscribeCollection<DamageReturn>(COLLECTIONS.DAMAGE_RETURNS, (data) => setDamageReturns(data));

    return () => {
      unsubAcc();
      unsubBankAcc();
      unsubJe();
      unsubCust();
      unsubSupp();
      unsubSales();
      unsubStk();
      unsubCp();
      unsubSp();
      unsubDmg();
    };
  }, []);

  // Compute active date boundaries based on reportPeriod
  const { effectiveStart, effectiveEnd } = useMemo(() => {
    const today = new Date();
    if (reportPeriod === "all") return { effectiveStart: "", effectiveEnd: "" };
    if (reportPeriod === "today") {
      const iso = today.toISOString().slice(0, 10);
      return { effectiveStart: iso, effectiveEnd: iso };
    }
    if (reportPeriod === "week") {
      const d = new Date(today);
      d.setDate(d.getDate() - 7);
      return { effectiveStart: d.toISOString().slice(0, 10), effectiveEnd: today.toISOString().slice(0, 10) };
    }
    if (reportPeriod === "month") {
      const y = today.getFullYear();
      const m = String(today.getMonth() + 1).padStart(2, "0");
      return { effectiveStart: `${y}-${m}-01`, effectiveEnd: today.toISOString().slice(0, 10) };
    }
    return { effectiveStart: customStartDate, effectiveEnd: customEndDate };
  }, [reportPeriod, customStartDate, customEndDate]);

  // General Ledger lines
  const glLines = useMemo(() => {
    return computeGeneralLedger(
      journalEntries,
      glAccountCode === "all" ? undefined : glAccountCode,
      glStartDate || effectiveStart,
      glEndDate || effectiveEnd,
      glSearch
    );
  }, [journalEntries, glAccountCode, glStartDate, glEndDate, effectiveStart, effectiveEnd, glSearch]);

  // Trial Balance computed
  const trialBalance = useMemo(() => {
    return computeTrialBalance(journalEntries, accounts, effectiveStart, effectiveEnd);
  }, [journalEntries, accounts, effectiveStart, effectiveEnd]);

  // Financial Statements computed
  const financialStatements = useMemo(() => {
    return computeFinancialStatements(journalEntries, accounts, effectiveStart, effectiveEnd);
  }, [journalEntries, accounts, effectiveStart, effectiveEnd]);

  // ── Customer Sub-Ledger & AR Control Account Reconciliation ──
  const customerSubLedger = useMemo(() => {
    const list = customers.map((c) => {
      const cId = c.id ? String(c.id).trim() : "";
      const cName = c.name ? String(c.name).trim().toLowerCase() : "";
      const opening = Number(c.beginningBalance || 0);

      // Invoices / Credit sales taken by customer
      const matchingSales = posSales.filter((s) => {
        if (!s || s.status === "voided") return false;
        if (cId && s.customerId && String(s.customerId).trim() === cId) return true;
        const sName = s.customerName ? String(s.customerName).trim().toLowerCase() : "";
        return Boolean(cName && sName && sName === cName);
      });
      const totalCreditSales = matchingSales.reduce((sum, s) => sum + Number(s.remainingBalance || 0), 0);
      const totalSalesValue = matchingSales.reduce((sum, s) => sum + Number(s.totalAmount || s.subtotal || 0), 0);

      // Payments made by customer
      const matchingPayments = customerPayments.filter((p) => {
        if (!p || p.voided) return false;
        if (cId && p.customerId && String(p.customerId).trim() === cId) return true;
        const pName = p.customerName ? String(p.customerName).trim().toLowerCase() : "";
        return Boolean(cName && pName && pName === cName);
      });
      const totalPayments = matchingPayments.reduce((sum, p) => sum + Number(p.amountPaid || 0), 0);

      // Returns in credited to customer
      const matchingReturns = damageReturns.filter((d) => {
        if (!d || d.status === "voided") return false;
        const isRet = d.type === "return_in" || (d.type === "return" && d.returnDirection !== "out");
        if (!isRet) return false;
        if (cId && d.customerId && String(d.customerId).trim() === cId) return true;
        const dName = d.customerName ? String(d.customerName).trim().toLowerCase() : "";
        return Boolean(cName && dName && dName === cName);
      });
      const totalReturns = matchingReturns.reduce((sum, d) => sum + Number(d.totalAmount || 0), 0);

      const outstandingBalance = Math.round(((opening + totalCreditSales) - (totalPayments + totalReturns)) * 100) / 100;

      return {
        customer: c,
        openingBalance: opening,
        totalSalesValue,
        totalCreditSales,
        totalPayments,
        totalReturns,
        outstandingBalance,
        salesCount: matchingSales.length,
        paymentCount: matchingPayments.length,
        returnCount: matchingReturns.length,
      };
    });

    const totalReceivables = Math.round(list.reduce((sum, item) => sum + item.outstandingBalance, 0) * 100) / 100;
    const arControlAccount = trialBalance.rows.find((r) => r.accountCode === "1100");
    const arControlBalance = arControlAccount ? arControlAccount.netBalance : 0;
    const variance = Math.round(Math.abs(arControlBalance - totalReceivables) * 100) / 100;
    const isReconciled = variance < 0.05;

    return { list, totalReceivables, arControlBalance, variance, isReconciled };
  }, [customers, posSales, customerPayments, damageReturns, trialBalance]);

  // ── Supplier Sub-Ledger & AP Control Account Reconciliation ──
  const supplierSubLedger = useMemo(() => {
    const list = suppliers.map((s) => {
      const sId = s.id ? String(s.id).trim() : "";
      const sName = s.name ? String(s.name).trim().toLowerCase() : "";
      const opening = Number(s.beginningBalance || 0);

      // Purchases / Credit Stock-Ins from supplier
      const matchingStockIns = stockIns.filter((si) => {
        if (!si || si.status === "voided") return false;
        if (sId && si.supplierId && String(si.supplierId).trim() === sId) return true;
        const siName = si.supplierName ? String(si.supplierName).trim().toLowerCase() : "";
        return Boolean(sName && siName && siName === sName);
      });
      const totalCreditPurchases = matchingStockIns.reduce((sum, si) => sum + Number(si.remainingBalance || 0), 0);
      const totalPurchaseValue = matchingStockIns.reduce((sum, si) => sum + Number(si.totalPrice || 0), 0);

      // Payments made to supplier
      const matchingPayments = supplierPayments.filter((p) => {
        if (!p || p.voided) return false;
        if (sId && p.supplierId && String(p.supplierId).trim() === sId) return true;
        const pName = p.supplierName ? String(p.supplierName).trim().toLowerCase() : "";
        return Boolean(sName && pName && pName === sName);
      });
      const totalPayments = matchingPayments.reduce((sum, p) => sum + Number(p.amountPaid || 0), 0);

      // Returns out to supplier
      const matchingReturns = damageReturns.filter((d) => {
        if (!d || d.status === "voided") return false;
        const isRet = d.type === "return_out" || (d.type === "return" && d.returnDirection === "out");
        if (!isRet) return false;
        if (sId && d.supplierId && String(d.supplierId).trim() === sId) return true;
        const dName = d.supplierName ? String(d.supplierName).trim().toLowerCase() : "";
        return Boolean(sName && dName && dName === sName);
      });
      const totalReturns = matchingReturns.reduce((sum, d) => sum + Number(d.totalAmount || 0), 0);

      const outstandingPayable = Math.round(((opening + totalCreditPurchases) - (totalPayments + totalReturns)) * 100) / 100;

      return {
        supplier: s,
        openingBalance: opening,
        totalPurchaseValue,
        totalCreditPurchases,
        totalPayments,
        totalReturns,
        outstandingPayable,
        purchaseCount: matchingStockIns.length,
        paymentCount: matchingPayments.length,
        returnCount: matchingReturns.length,
      };
    });

    const totalPayables = Math.round(list.reduce((sum, item) => sum + item.outstandingPayable, 0) * 100) / 100;
    const apControlAccount = trialBalance.rows.find((r) => r.accountCode === "2010");
    const apControlBalance = apControlAccount ? apControlAccount.netBalance : 0;
    const variance = Math.round(Math.abs(apControlBalance - totalPayables) * 100) / 100;
    const isReconciled = variance < 0.05;

    return { list, totalPayables, apControlBalance, variance, isReconciled };
  }, [suppliers, stockIns, supplierPayments, damageReturns, trialBalance]);

  // Filtered Chart of Accounts for table
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (coaTypeFilter !== "all" && a.type !== coaTypeFilter) return false;
      if (!coaSearch) return true;
      const q = coaSearch.toLowerCase();
      return (
        a.code.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.nameAmharic || "").toLowerCase().includes(q) ||
        (a.description || "").toLowerCase().includes(q)
      );
    });
  }, [accounts, coaTypeFilter, coaSearch]);

  // Executive Dashboard KPIs
  const dashboardKpis = useMemo(() => {
    const today = todayIsoDate();
    const todaySales = journalEntries
      .filter((e) => e.status !== "voided" && e.date === today && (e.voucherType === "pos_sale" || e.voucherType === "direct_sale"))
      .reduce((s, e) => {
        const revLine = (e.lines || []).find((l) => l.accountType === "revenue");
        return s + (revLine ? revLine.credit : 0);
      }, 0);

    const assetRows = trialBalance.rows.filter((r) => r.accountType === "asset");
    const cashBalance = assetRows.find((r) => r.accountCode === "1010")?.netBalance || 0;
    const bankBalance = assetRows
      .filter((r) => ["1020", "1021", "1022", "1023"].includes(r.accountCode))
      .reduce((s, r) => s + r.netBalance, 0);
    const telebirrBalance = assetRows.find((r) => r.accountCode === "1030")?.netBalance || 0;
    const inventoryValue = assetRows.find((r) => r.accountCode === "1200")?.netBalance || 0;

    return {
      todaySales,
      cashBalance,
      bankBalance,
      telebirrBalance,
      inventoryValue,
      netProfit: financialStatements.profitAndLoss.netProfit,
      totalRevenue: financialStatements.profitAndLoss.totalRevenue,
      totalExpenses: financialStatements.profitAndLoss.totalOperatingExpenses + financialStatements.profitAndLoss.cogs,
      grossProfit: financialStatements.profitAndLoss.grossProfit,
      totalAssets: financialStatements.balanceSheet.totalAssets,
      totalLiabilities: financialStatements.balanceSheet.totalLiabilities,
      totalEquity: financialStatements.balanceSheet.totalEquity,
    };
  }, [journalEntries, trialBalance, financialStatements]);

  // Chart data: Monthly Revenue vs Expense Trend
  const monthlyTrendData = useMemo(() => {
    const monthMap: Record<string, { month: string; revenue: number; expense: number; profit: number }> = {};
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    // Populate last 6 months
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = `${months[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
      monthMap[key] = { month: label, revenue: 0, expense: 0, profit: 0 };
    }

    for (const e of journalEntries.filter((j) => j.status !== "voided")) {
      const key = e.date.slice(0, 7);
      if (monthMap[key]) {
        for (const l of e.lines || []) {
          if (l.accountType === "revenue") {
            monthMap[key].revenue += Number(l.credit) || 0;
          } else if (l.accountType === "expense") {
            monthMap[key].expense += Number(l.debit) || 0;
          }
        }
      }
    }

    return Object.values(monthMap).map((item) => ({
      ...item,
      profit: Math.round((item.revenue - item.expense) * 100) / 100,
    }));
  }, [journalEntries]);

  // Chart data: Payment Method / Liquidity Distribution
  const liquidityDistributionData = useMemo(() => {
    return [
      { name: "Cash on Hand", value: Math.max(0, dashboardKpis.cashBalance) },
      { name: "Bank Accounts", value: Math.max(0, dashboardKpis.bankBalance) },
      { name: "Telebirr", value: Math.max(0, dashboardKpis.telebirrBalance) },
    ].filter((i) => i.value > 0);
  }, [dashboardKpis]);

  // Chart data: Operating Expenses Breakdown
  const expenseBreakdownData = useMemo(() => {
    return financialStatements.profitAndLoss.operatingExpenseRows
      .filter((r) => r.netBalance > 0)
      .map((r) => ({
        name: r.accountName.replace(/Expense/i, "").trim(),
        value: r.netBalance,
      }));
  }, [financialStatements]);

  // Detailed Expense Report data
  const expenseReportData = useMemo(() => {
    const expenseAccounts = accounts.filter((a) => a.type === "expense" && a.subType !== "header");
    const accountTotals: Record<string, { code: string; name: string; nameAmharic: string; total: number }> = {};

    for (const acc of expenseAccounts) {
      accountTotals[acc.code] = {
        code: acc.code,
        name: acc.name,
        nameAmharic: acc.nameAmharic || "",
        total: 0,
      };
    }

    const filteredEntries = journalEntries.filter((e) => {
      if (e.status === "voided") return false;
      if (effectiveStart && e.date < effectiveStart) return false;
      if (effectiveEnd && e.date > effectiveEnd) return false;
      return true;
    });

    const transactions: Array<{
      date: string;
      entryNumber: string;
      reference: string;
      accountCode: string;
      accountName: string;
      storeName: string;
      memo: string;
      amount: number;
    }> = [];

    for (const entry of filteredEntries) {
      for (const line of entry.lines || []) {
        if (line.accountType === "expense" && line.debit > 0) {
          if (!accountTotals[line.accountCode]) {
            accountTotals[line.accountCode] = {
              code: line.accountCode,
              name: line.accountName,
              nameAmharic: "",
              total: 0,
            };
          }
          accountTotals[line.accountCode].total += Number(line.debit) || 0;
          transactions.push({
            date: entry.date,
            entryNumber: entry.entryNumber,
            reference: entry.referenceVoucherId || "",
            accountCode: line.accountCode,
            accountName: line.accountName,
            storeName: entry.storeName || "",
            memo: line.description || entry.memo,
            amount: Number(line.debit) || 0,
          });
        }
      }
    }

    const rows = Object.values(accountTotals)
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
    const totalExpenses = Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100;

    return { rows, totalExpenses, transactions: transactions.sort((a, b) => safeDateSort(a.date, b.date, "desc")) };
  }, [accounts, journalEntries, effectiveStart, effectiveEnd]);

  // Detailed Revenue Report data
  const revenueReportData = useMemo(() => {
    const revenueAccounts = accounts.filter((a) => a.type === "revenue" && a.subType !== "header");
    const streamTotals: Record<string, { code: string; name: string; nameAmharic: string; total: number }> = {};
    for (const acc of revenueAccounts) {
      streamTotals[acc.code] = { code: acc.code, name: acc.name, nameAmharic: acc.nameAmharic || "", total: 0 };
    }

    const channelTotals: Record<string, { name: string; total: number }> = {
      cash: { name: "Cash on Hand (1010)", total: 0 },
      bank: { name: "Bank Transfers (CBE / Awash / Dashen)", total: 0 },
      telebirr: { name: "Telebirr (1030)", total: 0 },
      receivable: { name: "Customer Credit / Receivable (1100)", total: 0 },
    };

    const filteredEntries = journalEntries.filter((e) => {
      if (e.status === "voided") return false;
      if (effectiveStart && e.date < effectiveStart) return false;
      if (effectiveEnd && e.date > effectiveEnd) return false;
      return true;
    });

    const transactions: Array<{
      date: string;
      entryNumber: string;
      reference: string;
      storeName: string;
      customerName: string;
      memo: string;
      amount: number;
    }> = [];

    let totalGrossRevenue = 0;
    let totalReturnsDiscounts = 0;

    for (const entry of filteredEntries) {
      let isRevEntry = false;
      let revAmount = 0;

      for (const line of entry.lines || []) {
        if (line.accountType === "revenue") {
          isRevEntry = true;
          if (line.accountCode === "4090") {
            totalReturnsDiscounts += Number(line.debit) || 0;
          } else {
            const amt = Number(line.credit) || 0;
            totalGrossRevenue += amt;
            revAmount += amt;
            if (!streamTotals[line.accountCode]) {
              streamTotals[line.accountCode] = { code: line.accountCode, name: line.accountName, nameAmharic: "", total: 0 };
            }
            streamTotals[line.accountCode].total += amt;
          }
        }

        // Channel tracking
        if (line.accountType === "asset" && line.debit > 0) {
          if (line.accountCode === "1010") {
            channelTotals.cash.total += line.debit;
          } else if (["1020", "1021", "1022", "1023"].includes(line.accountCode)) {
            channelTotals.bank.total += line.debit;
          } else if (line.accountCode === "1030") {
            channelTotals.telebirr.total += line.debit;
          } else if (line.accountCode === "1100") {
            channelTotals.receivable.total += line.debit;
          }
        }
      }

      if (isRevEntry && revAmount > 0) {
        transactions.push({
          date: entry.date,
          entryNumber: entry.entryNumber,
          reference: entry.referenceVoucherId || "",
          storeName: entry.storeName || "",
          customerName: entry.memo.replace(/^(POS Sale to|Direct Sale -|Direct Sale by)/i, "").split("(")[0].trim() || "Customer",
          memo: entry.memo,
          amount: revAmount,
        });
      }
    }

    const netRevenue = Math.round((totalGrossRevenue - totalReturnsDiscounts) * 100) / 100;
    const streamRows = Object.values(streamTotals).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

    return {
      streamRows,
      channelTotals: Object.values(channelTotals).filter((c) => c.total > 0),
      totalGrossRevenue: Math.round(totalGrossRevenue * 100) / 100,
      totalReturnsDiscounts: Math.round(totalReturnsDiscounts * 100) / 100,
      netRevenue,
      transactions: transactions.sort((a, b) => safeDateSort(a.date, b.date, "desc")),
    };
  }, [accounts, journalEntries, effectiveStart, effectiveEnd]);

  // Single Journal Entry Voucher modal state
  const [viewingJournalEntry, setViewingJournalEntry] = useState<JournalEntry | null>(null);
  const journalVoucherPrintRef = useRef<HTMLDivElement>(null);

  // Handle Chart of Account Modal Open
  function openAddAccount() {
    setEditingAccount(null);
    setAccountForm({
      code: "",
      name: "",
      nameAmharic: "",
      type: "asset",
      subType: "current_asset",
      parentCode: "1000",
      parentName: "Current Assets",
      description: "",
      isActive: true,
    });
    setShowAccountModal(true);
  }

  function openEditAccount(acc: ChartAccount) {
    setEditingAccount(acc);
    setAccountForm({
      code: acc.code,
      name: acc.name,
      nameAmharic: acc.nameAmharic || "",
      type: acc.type,
      subType: acc.subType || "current_asset",
      parentCode: acc.parentCode || "",
      parentName: acc.parentName || "",
      description: acc.description || "",
      isActive: acc.isActive,
    });
    setShowAccountModal(true);
  }

  // Match parentCode to select value (handles COA codes, bank accounts, or none)
  const currentParentSelectValue = useMemo(() => {
    if (!accountForm.parentCode || accountForm.parentCode === "none") return "none";
    // Check if it matches a bank account by id, accountNumber, or prefix
    const matchedBank = bankAccounts.find(
      (b) =>
        b.id === accountForm.parentCode ||
        b.accountNumber === accountForm.parentCode ||
        `bank_${b.id}` === accountForm.parentCode ||
        `bank_${b.accountNumber}` === accountForm.parentCode
    );
    if (matchedBank) return `bank_${matchedBank.id}`;

    // Check if it matches a chart of accounts code
    const matchedCoa = accounts.find(
      (a) => a.code === accountForm.parentCode || `coa_${a.code}` === accountForm.parentCode
    );
    if (matchedCoa) return `coa_${matchedCoa.code}`;

    return "none";
  }, [accountForm.parentCode, bankAccounts, accounts]);

  async function handleSaveAccount() {
    if (!accountForm.code.trim() || !accountForm.name.trim()) {
      toast({ title: "Account Code and Name are required", variant: "destructive" });
      return;
    }

    const codeNum = parseInt(accountForm.code.trim(), 10);
    if (isNaN(codeNum)) {
      toast({ title: "Account Code must be numeric (e.g. 1015)", variant: "destructive" });
      return;
    }

    const ranges: Record<AccountCategory, { min: number; max: number; label: string }> = {
      asset: { min: 1000, max: 1999, label: "1000–1999 for Assets" },
      liability: { min: 2000, max: 2999, label: "2000–2999 for Liabilities" },
      equity: { min: 3000, max: 3999, label: "3000–3999 for Equity" },
      revenue: { min: 4000, max: 4999, label: "4000–4999 for Revenue" },
      expense: { min: 5000, max: 6999, label: "5000–6999 for Expenses" },
    };

    const validRange = ranges[accountForm.type];
    if (validRange && (codeNum < validRange.min || codeNum > validRange.max)) {
      toast({
        title: `Invalid Account Code Range`,
        description: `Code for ${accountForm.type.toUpperCase()} must be between ${validRange.label}.`,
        variant: "destructive",
      });
      return;
    }

    try {
      const parentCoa = accounts.find((a) => a.code === accountForm.parentCode);
      const parentBank = bankAccounts.find(
        (b) => b.id === accountForm.parentCode || b.accountNumber === accountForm.parentCode
      );
      const resolvedParentName =
        parentCoa?.name ||
        (parentBank
          ? `${parentBank.bankName} - ${parentBank.accountNumber}${parentBank.personName ? ` (${parentBank.personName})` : ""}`
          : "") ||
        accountForm.parentName ||
        "";

      const payload: Omit<ChartAccount, "id"> = {
        code: accountForm.code.trim(),
        name: accountForm.name.trim(),
        nameAmharic: accountForm.nameAmharic.trim(),
        type: accountForm.type,
        subType: accountForm.subType,
        parentCode: accountForm.parentCode || "",
        parentName: resolvedParentName,
        description: accountForm.description.trim(),
        isActive: accountForm.isActive,
        isSystem: editingAccount?.isSystem || false,
        currency: "ETB",
      };

      if (editingAccount) {
        await update(COLLECTIONS.CHART_OF_ACCOUNTS, editingAccount.id, payload as Record<string, unknown>);
        toast({ title: "Account updated successfully" });
      } else {
        const existing = accounts.find((a) => a.code === payload.code);
        if (existing) {
          toast({ title: `Account code ${payload.code} already exists`, variant: "destructive" });
          return;
        }
        await create(COLLECTIONS.CHART_OF_ACCOUNTS, payload as Record<string, unknown>);
        toast({ title: "Account created successfully" });
      }
      setShowAccountModal(false);
    } catch (err: unknown) {
      toast({ title: "Failed to save account", description: String(err), variant: "destructive" });
    }
  }

  async function handleDeleteAccount(acc: ChartAccount) {
    if (acc.isSystem) {
      toast({ title: "Protected Account", description: "Default standard ERP accounts cannot be deleted.", variant: "destructive" });
      return;
    }
    const hasEntries = journalEntries.some((e) => e.lines.some((l) => l.accountCode === acc.code));
    if (hasEntries) {
      toast({
        title: "Cannot delete account with transactions",
        description: "This account has posted journal entries. You can deactivate it instead.",
        variant: "destructive",
      });
      return;
    }

    confirmDelete(async () => {
      await remove(COLLECTIONS.CHART_OF_ACCOUNTS, acc.id);
      toast({ title: "Account deleted" });
    });
  }

  // Handle Manual Journal Entry modal lines
  function addManualLine() {
    setManualEntryLines((prev) => [...prev, { accountCode: "1010", debit: "0", credit: "0", description: "" }]);
  }

  function removeManualLine(index: number) {
    if (manualEntryLines.length <= 2) {
      toast({ title: "At least 2 lines required for double-entry", variant: "destructive" });
      return;
    }
    setManualEntryLines((prev) => prev.filter((_, i) => i !== index));
  }

  function updateManualLine(index: number, field: string, value: string) {
    setManualEntryLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  const manualDebitTotal = useMemo(() => {
    return Math.round(manualEntryLines.reduce((s, l) => s + (Number(l.debit) || 0), 0) * 100) / 100;
  }, [manualEntryLines]);

  const manualCreditTotal = useMemo(() => {
    return Math.round(manualEntryLines.reduce((s, l) => s + (Number(l.credit) || 0), 0) * 100) / 100;
  }, [manualEntryLines]);

  const isManualBalanced = Math.abs(manualDebitTotal - manualCreditTotal) < 0.05 && manualDebitTotal > 0;

  async function handleSaveManualEntry() {
    if (!isManualBalanced) {
      toast({ title: "Entry is not balanced!", description: "Total Debits must equal Total Credits.", variant: "destructive" });
      return;
    }

    try {
      const formattedLines: JournalLine[] = manualEntryLines.map((l) => {
        const acc = accounts.find((a) => a.code === l.accountCode);
        return {
          accountId: acc?.id || l.accountCode,
          accountCode: l.accountCode,
          accountName: acc?.name || "Account",
          accountType: acc?.type || "expense",
          debit: Number(l.debit) || 0,
          credit: Number(l.credit) || 0,
          description: l.description || manualEntryMemo,
        };
      });

      await createJournalEntry({
        date: manualEntryDate,
        voucherType: "manual",
        memo: manualEntryMemo.trim() || "Manual Journal Entry",
        lines: formattedLines,
        createdByName: user?.name || "Accountant",
      });

      toast({ title: "Journal Entry posted successfully", description: `Debits & Credits balanced: ${fmt(manualDebitTotal)}` });
      setShowManualEntryModal(false);
      setManualEntryMemo("");
      setManualEntryLines([
        { accountCode: "1010", debit: "0", credit: "0", description: "" },
        { accountCode: "4010", debit: "0", credit: "0", description: "" },
      ]);
    } catch (err: unknown) {
      toast({ title: "Failed to post entry", description: String(err), variant: "destructive" });
    }
  }

  // Handle Historical Transactions Sync
  async function handleSyncHistorical() {
    setIsSyncingHistory(true);
    try {
      const res = await syncAllHistoricalTransactionsToJournal();
      toast({
        title: "Historical Transactions Synced!",
        description: `Generated ${res.totalNewEntries} journal entries (${res.processedSales} sales, ${res.processedPurchases} stock-ins, ${res.processedExpenses} expenses, ${res.processedCustomerPayments || 0} customer debts, ${res.processedSupplierPayments || 0} supplier debts).`,
      });
    } catch (err: unknown) {
      toast({ title: "Sync failed", description: String(err), variant: "destructive" });
    } finally {
      setIsSyncingHistory(false);
    }
  }

  // Handle Daily Cash-Up Reconciliation
  async function handleSaveDailyCashUp() {
    const counted = parseFloat(cashUpCounted);
    if (isNaN(counted) || counted < 0) {
      toast({ title: "Invalid amount", description: "Please enter a valid cash amount.", variant: "destructive" });
      return;
    }

    const systemCash = Number(dashboardKpis.cashBalance || 0);
    setIsSavingCashUp(true);

    try {
      const res = await postDailyCashUpJournalEntry({
        countedCash: counted,
        systemCash,
        cashierName: cashUpCashier,
        notes: cashUpNote,
      });

      if (res) {
        const diff = counted - systemCash;
        toast({
          title: "Cash-Up Reconciled & Journal Posted!",
          description: `Drawer discrepancy of ETB ${diff > 0 ? `+${diff.toFixed(2)} (Overage)` : `${diff.toFixed(2)} (Shortage)`} recorded to ledger.`,
        });
      } else {
        toast({
          title: "Cash Drawer in Perfect Balance!",
          description: `Counted ETB ${counted.toFixed(2)} matches system cash on hand perfectly.`,
        });
      }

      setShowCashUpModal(false);
      setCashUpCounted("");
      setCashUpNote("");
    } catch (err: unknown) {
      toast({ title: "Cash-up failed", description: String(err), variant: "destructive" });
    } finally {
      setIsSavingCashUp(false);
    }
  }

  // Handle Period Lock
  function handleSavePeriodLock(lock: boolean) {
    const newSetting = { isLocked: lock, lockDate: lock ? lockDateInput : null };
    setFinancialPeriodLock(newSetting.isLocked, newSetting.lockDate);
    setPeriodLock(newSetting);
    setShowPeriodLockModal(false);
    toast({
      title: lock ? "Financial Period Locked" : "Financial Period Unlocked",
      description: lock ? `All transactions prior to ${lockDateInput} are locked.` : "All periods unlocked for edits.",
    });
  }

  // Handle Void Journal Entry
  async function handleVoidJournalEntry(je: JournalEntry) {
    if (!confirm(`Are you sure you want to void Journal Entry ${je.entryNumber}? This will exclude it from trial balance, P&L, and balance sheet.`)) return;
    try {
      await update(COLLECTIONS.JOURNAL_ENTRIES, je.id, { status: "voided" });
      toast({ title: "Journal Entry Voided", description: `${je.entryNumber} has been marked as voided.` });
    } catch (err: unknown) {
      toast({ title: "Failed to void entry", description: String(err), variant: "destructive" });
    }
  }

  // Export Chart of Accounts to Excel
  function exportCoaToExcel() {
    const data = filteredAccounts.map((a, i) => ({
      "No.": i + 1,
      "Account Code": a.code,
      "Account Name": a.name,
      Amharic: a.nameAmharic || "",
      Category: a.type.toUpperCase(),
      "Parent Code": a.parentCode || "—",
      Description: a.description || "",
      Status: a.isActive ? "ACTIVE" : "INACTIVE",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Chart_of_Accounts");
    exportToExcel({
      workbook: wb,
      filename: `Chart_of_Accounts_${todayIsoDate()}.xlsx`,
      title: "YESERAHUT ERP — CHART OF ACCOUNTS",
      subtitle: `Total Accounts: ${filteredAccounts.length} | Generated: ${formatSafeDate(new Date())}`,
    });
    toast({ title: "Chart of Accounts exported to Excel" });
  }

  // Export General Ledger to Excel
  function exportGlToExcel() {
    const data = glLines.map((l, i) => ({
      "No.": i + 1,
      Date: l.date,
      "Entry #": l.entryNumber,
      Reference: l.referenceVoucherId || "—",
      "Account Code": l.accountCode,
      "Account Name": l.accountName,
      Description: l.memo,
      "Debit (ETB)": l.debit > 0 ? l.debit : "",
      "Credit (ETB)": l.credit > 0 ? l.credit : "",
      "Running Balance": l.runningBalance,
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "General_Ledger");
    exportToExcel({
      workbook: wb,
      filename: `General_Ledger_${todayIsoDate()}.xlsx`,
      title: "YESERAHUT ERP — GENERAL LEDGER",
      subtitle: `Account: ${glAccountCode === "all" ? "ALL ACCOUNTS" : glAccountCode} | Total Entries: ${glLines.length}`,
    });
    toast({ title: "General Ledger exported to Excel" });
  }

  // Export Trial Balance to Excel
  function exportTrialBalanceExcel() {
    const data = trialBalance.rows.map((r, i) => ({
      "No.": i + 1,
      "Account Code": r.accountCode,
      "Account Name": r.accountName,
      Type: r.accountType.toUpperCase(),
      "Debit Total": r.debit,
      "Credit Total": r.credit,
      "Net Balance": r.netBalance,
    }));

    data.push({
      "No.": "" as any,
      "Account Code": "TOTAL",
      "Account Name": trialBalance.isBalanced ? "BALANCED ✓" : "UNBALANCED",
      Type: "",
      "Debit Total": trialBalance.totalDebit,
      "Credit Total": trialBalance.totalCredit,
      "Net Balance": trialBalance.difference,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Trial_Balance");
    exportToExcel({
      workbook: wb,
      filename: `Trial_Balance_${todayIsoDate()}.xlsx`,
      title: "YESERAHUT ERP — TRIAL BALANCE",
      subtitle: `Status: ${trialBalance.isBalanced ? "BALANCED" : "OUT OF BALANCE"} | Debits: ${fmt(trialBalance.totalDebit)} | Credits: ${fmt(trialBalance.totalCredit)}`,
    });
    toast({ title: "Trial Balance exported to Excel" });
  }

  // Export Expense Report to Excel
  function exportExpenseReportExcel() {
    const data = expenseReportData.rows.map((r, i) => ({
      "No.": i + 1,
      "Account Code": r.code,
      "Account Name": r.name,
      Amharic: r.nameAmharic,
      "Total Amount (ETB)": r.total,
      "Share (%)":
        expenseReportData.totalExpenses > 0
          ? ((r.total / expenseReportData.totalExpenses) * 100).toFixed(1) + "%"
          : "0%",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expense_Report");
    exportToExcel({
      workbook: wb,
      filename: `Expense_Report_${todayIsoDate()}.xlsx`,
      title: "YESERAHUT ERP — EXPENSE REPORT",
      subtitle: `Total Expenses: ${fmt(expenseReportData.totalExpenses)} ETB | Period: ${reportPeriod.toUpperCase()}`,
    });
    toast({ title: "Expense Report exported to Excel" });
  }

  // Export Revenue Report to Excel
  function exportRevenueReportExcel() {
    const data = revenueReportData.streamRows.map((r, i) => ({
      "No.": i + 1,
      "Account Code": r.code,
      "Revenue Stream": r.name,
      "Gross Revenue (ETB)": r.total,
      "Share (%)":
        revenueReportData.totalGrossRevenue > 0
          ? ((r.total / revenueReportData.totalGrossRevenue) * 100).toFixed(1) + "%"
          : "0%",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Revenue_Report");
    exportToExcel({
      workbook: wb,
      filename: `Revenue_Report_${todayIsoDate()}.xlsx`,
      title: "YESERAHUT ERP — REVENUE REPORT",
      subtitle: `Net Revenue: ${fmt(revenueReportData.netRevenue)} ETB | Gross: ${fmt(revenueReportData.totalGrossRevenue)} ETB`,
    });
    toast({ title: "Revenue Report exported to Excel" });
  }

  // Export Customer Sub-Ledger to Excel
  function exportCustomerSubLedgerExcel() {
    const data = customerSubLedger.list.map((item, i) => ({
      "No.": i + 1,
      "Customer Name": item.customer.name,
      Phone: item.customer.phone || "—",
      "Opening Balance (ETB)": item.openingBalance,
      "Total Credit Invoices (ETB)": item.totalCreditSales,
      "Total Payments (ETB)": item.totalPayments,
      "Total Returns (ETB)": item.totalReturns,
      "Outstanding Balance (ETB)": item.outstandingBalance,
    }));

    data.push({
      "No.": "" as any,
      "Customer Name": "TOTAL SUB-LEDGER RECEIVABLES",
      Phone: "",
      "Opening Balance (ETB)": "" as any,
      "Total Credit Invoices (ETB)": "" as any,
      "Total Payments (ETB)": "" as any,
      "Total Returns (ETB)": "" as any,
      "Outstanding Balance (ETB)": customerSubLedger.totalReceivables,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer_SubLedger");
    exportToExcel({
      workbook: wb,
      filename: `Customer_SubLedger_${todayIsoDate()}.xlsx`,
      title: "YESERAHUT ERP — CUSTOMER SUB-LEDGER (ACCOUNTS RECEIVABLE)",
      subtitle: `Total Customers: ${customerSubLedger.list.length} | AR Control (1100): ${fmt(customerSubLedger.arControlBalance)} | Reconciled: ${customerSubLedger.isReconciled ? "YES" : "NO"}`,
    });
    toast({ title: "Customer Sub-Ledger exported to Excel" });
  }

  // Export Supplier Sub-Ledger to Excel
  function exportSupplierSubLedgerExcel() {
    const data = supplierSubLedger.list.map((item, i) => ({
      "No.": i + 1,
      "Supplier Name": item.supplier.name,
      Phone: item.supplier.phone || "—",
      "Opening Balance (ETB)": item.openingBalance,
      "Total Credit Purchases (ETB)": item.totalCreditPurchases,
      "Total Payments (ETB)": item.totalPayments,
      "Total Returns (ETB)": item.totalReturns,
      "Outstanding Payable (ETB)": item.outstandingPayable,
    }));

    data.push({
      "No.": "" as any,
      "Supplier Name": "TOTAL SUB-LEDGER PAYABLES",
      Phone: "",
      "Opening Balance (ETB)": "" as any,
      "Total Credit Purchases (ETB)": "" as any,
      "Total Payments (ETB)": "" as any,
      "Total Returns (ETB)": "" as any,
      "Outstanding Payable (ETB)": supplierSubLedger.totalPayables,
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Supplier_SubLedger");
    exportToExcel({
      workbook: wb,
      filename: `Supplier_SubLedger_${todayIsoDate()}.xlsx`,
      title: "YESERAHUT ERP — SUPPLIER SUB-LEDGER (ACCOUNTS PAYABLE)",
      subtitle: `Total Suppliers: ${supplierSubLedger.list.length} | AP Control (2010): ${fmt(supplierSubLedger.apControlBalance)} | Reconciled: ${supplierSubLedger.isReconciled ? "YES" : "NO"}`,
    });
    toast({ title: "Supplier Sub-Ledger exported to Excel" });
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* ── Top Header & Executive ERP Bar ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-sm">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Accounting & Finance ERP
                <Badge variant="outline" className="text-xs font-mono border-slate-300">
                  Double-Entry
                </Badge>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chart of Accounts, General Ledger, Automated Journal Entries & Financial Statements
              </p>
            </div>
          </div>
        </div>

        {/* Global ERP Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncHistorical}
            disabled={isSyncingHistory}
            className="text-xs font-medium border-slate-300"
            title="Automatically generate double-entry journal entries for all existing past sales, purchases, and expenses"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isSyncingHistory ? "animate-spin" : ""}`} />
            {isSyncingHistory ? "Syncing Past Data..." : "Sync Past Transactions"}
          </Button>

          {isAdmin && (
            <Button size="sm" onClick={() => setShowManualEntryModal(true)} className="text-xs font-medium shadow-xs">
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              New Journal Entry
            </Button>
          )}
        </div>
      </div>

      {/* ── Main Navigation Tabs ── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-2 sm:grid-cols-7 w-full max-w-5xl p-1 bg-slate-100 dark:bg-slate-900">
          <TabsTrigger value="dashboard" className="text-xs font-semibold py-2">
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Overview
          </TabsTrigger>
          <TabsTrigger value="coa" className="text-xs font-semibold py-2">
            <Layers className="w-3.5 h-3.5 mr-1.5" /> Chart of Accounts
          </TabsTrigger>
          <TabsTrigger value="journal" className="text-xs font-semibold py-2">
            <BookOpen className="w-3.5 h-3.5 mr-1.5" /> Journal Entries
          </TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs font-semibold py-2">
            <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" /> General Ledger
          </TabsTrigger>
          <TabsTrigger value="trial" className="text-xs font-semibold py-2">
            <Scale className="w-3.5 h-3.5 mr-1.5" /> Trial Balance
          </TabsTrigger>
          <TabsTrigger value="subledgers" className="text-xs font-semibold py-2">
            <Users className="w-3.5 h-3.5 mr-1.5" /> Sub-Ledgers (AR/AP)
          </TabsTrigger>
          <TabsTrigger value="reports" className="text-xs font-semibold py-2">
            <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Statements
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════
            TAB 1: FINANCIAL OVERVIEW DASHBOARD
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Executive KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" /> Today's Sales
                </span>
                <p className="text-xl font-bold tracking-tight text-emerald-700">{fmt(dashboardKpis.todaySales)}</p>
                <p className="text-[10px] text-muted-foreground">Cash, transfer & credit</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-blue-600" /> Cash on Hand (1010)
                </span>
                <p className="text-xl font-bold tracking-tight text-blue-700">{fmt(dashboardKpis.cashBalance)}</p>
                <p className="text-[10px] text-muted-foreground">Drawer & physical cash</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Landmark className="w-3.5 h-3.5 text-indigo-600" /> Bank Balance (1020)
                </span>
                <p className="text-xl font-bold tracking-tight text-indigo-700">{fmt(dashboardKpis.bankBalance)}</p>
                <p className="text-[10px] text-muted-foreground">CBE, Awash & Dashen</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-amber-600" /> Telebirr (1030)
                </span>
                <p className="text-xl font-bold tracking-tight text-amber-700">{fmt(dashboardKpis.telebirrBalance)}</p>
                <p className="text-[10px] text-muted-foreground">Mobile wallet balance</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardContent className="p-4 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-purple-600" /> Inventory Value (1200)
                </span>
                <p className="text-xl font-bold tracking-tight text-purple-700">{fmt(dashboardKpis.inventoryValue)}</p>
                <p className="text-[10px] text-muted-foreground">Current asset valuation</p>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs bg-slate-50/50 dark:bg-slate-900/50">
              <CardContent className="p-4 space-y-1">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <Scale className="w-3.5 h-3.5 text-slate-700" /> Net Profit (YTD)
                </span>
                <p
                  className={`text-xl font-black tracking-tight ${
                    dashboardKpis.netProfit >= 0 ? "text-emerald-700" : "text-rose-600"
                  }`}
                >
                  {fmt(dashboardKpis.netProfit)}
                </p>
                <p className="text-[10px] text-muted-foreground">Revenue - COGS - Expenses</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Revenue vs Expenses Trend */}
            <Card className="lg:col-span-2 border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold flex items-center justify-between">
                  <span>Revenue vs Operating Expenses (Last 6 Months)</span>
                  <Badge variant="outline" className="text-xs font-normal">
                    Monthly Performance
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Automated comparison of earned revenue vs inventory and operating costs
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyTrendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <RechartsTooltip
                        formatter={(val: number) => [`${fmt(val)} ETB`]}
                        contentStyle={{ borderRadius: 8, fontSize: 12 }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                      <Bar dataKey="revenue" name="Sales Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" name="Total Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Cash & Bank Distribution */}
            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">Liquid Funds Distribution</CardTitle>
                <CardDescription className="text-xs">Breakdown of Cash on Hand, Bank accounts, and Telebirr</CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="h-[200px] w-full">
                  {liquidityDistributionData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={liquidityDistributionData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={75}
                          innerRadius={45}
                          paddingAngle={3}
                        >
                          {liquidityDistributionData.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={CHART_PALETTE[index % CHART_PALETTE.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip formatter={(val: number) => [`${fmt(val)} ETB`]} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                      No liquid account data yet
                    </div>
                  )}
                </div>
                <div className="space-y-2 mt-2 pt-2 border-t text-xs">
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" /> Cash in Hand
                    </span>
                    <span className="font-semibold">{fmt(dashboardKpis.cashBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> Bank Accounts
                    </span>
                    <span className="font-semibold">{fmt(dashboardKpis.bankBalance)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" /> Telebirr Wallet
                    </span>
                    <span className="font-semibold">{fmt(dashboardKpis.telebirrBalance)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Balance Sheet & P&L Snapshot */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Balance Sheet Summary</span>
                  <Badge variant={dashboardKpis.totalAssets > 0 ? "secondary" : "outline"} className="text-xs">
                    Assets = Liabilities + Equity
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Total Assets (1000-1999)</span>
                  <span className="font-bold text-blue-700">{fmt(dashboardKpis.totalAssets)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Total Liabilities (2000-2999)</span>
                  <span className="font-bold text-amber-700">{fmt(dashboardKpis.totalLiabilities)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Total Equity (3000-3999 + Profit)</span>
                  <span className="font-bold text-purple-700">{fmt(dashboardKpis.totalEquity)}</span>
                </div>
                <div className="pt-2 flex justify-between items-center text-xs font-semibold text-muted-foreground">
                  <span>Balance Status:</span>
                  {Math.abs(dashboardKpis.totalAssets - (dashboardKpis.totalLiabilities + dashboardKpis.totalEquity)) < 1 ? (
                    <span className="text-emerald-600 flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Perfectly Balanced
                    </span>
                  ) : (
                    <span className="text-amber-600">Pending journal postings</span>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-sm font-bold flex items-center justify-between">
                  <span>Income Statement Summary</span>
                  <Badge variant="outline" className="text-xs">
                    Current Period
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Total Sales Revenue (4000-4999)</span>
                  <span className="font-bold text-emerald-700">{fmt(dashboardKpis.totalRevenue)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Less: Cost of Goods Sold (5010)</span>
                  <span className="font-bold text-rose-600">- {fmt(financialStatements.profitAndLoss.cogs)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Gross Margin Profit</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{fmt(dashboardKpis.grossProfit)}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="font-medium text-slate-700 dark:text-slate-300">Less: Operating Expenses</span>
                  <span className="font-bold text-rose-600">- {fmt(financialStatements.profitAndLoss.totalOperatingExpenses)}</span>
                </div>
                <div className="pt-2 flex justify-between items-center text-sm font-extrabold text-foreground">
                  <span>Net Operating Income:</span>
                  <span className={dashboardKpis.netProfit >= 0 ? "text-emerald-700" : "text-rose-600"}>
                    {fmt(dashboardKpis.netProfit)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TAB 2: CHART OF ACCOUNTS (COA)
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="coa" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search code or name..."
                  value={coaSearch}
                  onChange={(e) => setCoaSearch(e.target.value)}
                  className="pl-9 h-9 text-xs"
                />
              </div>

              <Select value={coaTypeFilter} onValueChange={(v: any) => setCoaTypeFilter(v)}>
                <SelectTrigger className="w-[140px] h-9 text-xs">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="asset">1000 Assets</SelectItem>
                  <SelectItem value="liability">2000 Liabilities</SelectItem>
                  <SelectItem value="equity">3000 Equity</SelectItem>
                  <SelectItem value="revenue">4000 Revenue</SelectItem>
                  <SelectItem value="expense">5000 Expenses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCoaToExcel} className="text-xs h-9">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Export Excel
              </Button>
              {isAdmin && (
                <Button size="sm" onClick={openAddAccount} className="text-xs h-9">
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Account
                </Button>
              )}
            </div>
          </div>

          {/* Accounts Table */}
          <Card className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Code</th>
                    <th className="py-2.5 px-3">Account Name</th>
                    <th className="py-2.5 px-3 hidden md:table-cell">Amharic</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 hidden lg:table-cell">Parent / SubType</th>
                    <th className="py-2.5 px-3 text-right">Net Balance</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    {isAdmin && <th className="py-2.5 px-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        Loading Chart of Accounts...
                      </td>
                    </tr>
                  ) : filteredAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No accounts match your search filter.
                      </td>
                    </tr>
                  ) : (
                    filteredAccounts.map((acc) => {
                      const tbRow = trialBalance.rows.find((r) => r.accountCode === acc.code);
                      const balance = tbRow ? tbRow.netBalance : 0;
                      const catStyle = CATEGORY_COLORS[acc.type] || CATEGORY_COLORS.asset;

                      return (
                        <tr key={acc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                            {acc.code}
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">
                            {acc.name}
                            {acc.isSystem && (
                              <span className="ml-1.5 text-[9px] font-mono text-muted-foreground bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                                SYSTEM
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-3 hidden md:table-cell text-muted-foreground">{acc.nameAmharic || "—"}</td>
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${catStyle.bg}`}>
                              {acc.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground text-[11px]">
                            {acc.parentName ? (
                              <span className="inline-flex items-center gap-1">
                                {acc.subType === "bank" && <Landmark className="w-3 h-3 text-blue-500 shrink-0" />}
                                <span className="truncate max-w-[200px]" title={acc.parentName}>
                                  {acc.parentName}
                                </span>
                              </span>
                            ) : (
                              acc.subType || "—"
                            )}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {fmt(balance)}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 ${
                                acc.isActive ? "border-emerald-300 text-emerald-700" : "border-slate-300 text-slate-500"
                              }`}
                            >
                              {acc.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </td>
                          {isAdmin && (
                            <td className="py-2 px-3 text-right space-x-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEditAccount(acc)}
                                className="h-7 w-7 p-0 text-slate-600 hover:text-slate-900"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              {!acc.isSystem && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteAccount(acc)}
                                  className="h-7 w-7 p-0 text-rose-600 hover:text-rose-900 hover:bg-rose-50"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TAB 3: DOUBLE-ENTRY JOURNAL ENTRIES
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="journal" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono text-xs">
                {journalEntries.length} Total Entries
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Auto-balanced Debits & Credits
              </Badge>
            </div>

            {isAdmin && (
              <Button size="sm" onClick={() => setShowManualEntryModal(true)} className="text-xs h-9">
                <Plus className="w-3.5 h-3.5 mr-1" /> New Manual Entry
              </Button>
            )}
          </div>

          {/* Journal Entries List */}
          <div className="space-y-3">
            {journalEntries.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground border-dashed">
                <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm font-semibold">No Journal Entries Recorded Yet</p>
                <p className="text-xs mt-1">
                  Click "Sync Past Transactions" above to automatically create double-entry records from your existing POS sales, purchases, and expenses.
                </p>
                <Button size="sm" variant="outline" onClick={handleSyncHistorical} className="mt-4 text-xs">
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Auto-Sync Past Transactions
                </Button>
              </Card>
            ) : (
              journalEntries.map((je) => (
                <Card key={je.id} className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-900/60 p-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono font-bold text-foreground text-sm">{je.entryNumber}</span>
                      <span className="text-muted-foreground">·</span>
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" /> {je.date}
                      </span>
                      {je.referenceVoucherId && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <Badge variant="outline" className="font-mono text-[10px] bg-white dark:bg-slate-950">
                            Ref: {je.referenceVoucherId}
                          </Badge>
                        </>
                      )}
                      <Badge variant="secondary" className="text-[10px] uppercase font-mono">
                        {je.voucherType}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingJournalEntry(je)}
                        className="h-7 text-[11px] px-2 text-blue-600 hover:text-blue-800"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" /> View Voucher
                      </Button>
                      {isAdmin && je.status !== "voided" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleVoidJournalEntry(je)}
                          className="h-7 text-[11px] px-2 text-red-600 hover:text-red-800 hover:bg-red-50"
                          title="Void Journal Entry"
                        >
                          <Ban className="w-3.5 h-3.5 mr-1" /> Void
                        </Button>
                      )}
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Total: {fmt(je.totalDebit)}
                      </span>
                      {je.status === "voided" ? (
                        <span className="text-red-700 text-[10px] font-bold bg-red-50 dark:bg-red-950/50 px-2 py-0.5 rounded border border-red-200 dark:border-red-800">
                          VOIDED (ተሰርዟል)
                        </span>
                      ) : je.isBalanced ? (
                        <span className="text-emerald-700 text-[10px] font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Balanced
                        </span>
                      ) : (
                        <span className="text-rose-600 text-[10px] font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                          Unbalanced
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Lines Table */}
                  <div className="p-3 px-4">
                    <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2 italic">
                      Memo: {je.memo}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b text-[10px] font-bold uppercase text-muted-foreground text-left">
                            <th className="py-1 px-2">Account Code</th>
                            <th className="py-1 px-2">Account Title</th>
                            <th className="py-1 px-2">Description / Note</th>
                            <th className="py-1 px-2 text-right">Debit (ETB)</th>
                            <th className="py-1 px-2 text-right">Credit (ETB)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {(je.lines || []).map((line, idx) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-1.5 px-2 font-mono font-semibold text-slate-900 dark:text-slate-100">
                                {line.accountCode}
                              </td>
                              <td className="py-1.5 px-2 font-medium">{line.accountName}</td>
                              <td className="py-1.5 px-2 text-muted-foreground text-[11px]">{line.description || "—"}</td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                {line.debit > 0 ? fmt(line.debit) : "—"}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                {line.credit > 0 ? fmt(line.credit) : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t font-bold text-xs bg-slate-50/50">
                            <td colSpan={3} className="py-1 px-2 text-right">Totals:</td>
                            <td className="py-1 px-2 text-right font-mono text-emerald-700">{fmt(je.totalDebit)}</td>
                            <td className="py-1 px-2 text-right font-mono text-emerald-700">{fmt(je.totalCredit)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TAB 4: GENERAL LEDGER
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="ledger" className="space-y-4">
          {/* General Ledger Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <Select value={glAccountCode} onValueChange={setGlAccountCode}>
                <SelectTrigger className="w-[220px] h-9 text-xs bg-white dark:bg-slate-950">
                  <SelectValue placeholder="Select Account" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="all">All Accounts (ጠቅላላ ሂሳቦች)</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.code} value={a.code}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="relative w-[180px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search memo..."
                  value={glSearch}
                  onChange={(e) => setGlSearch(e.target.value)}
                  className="pl-8 h-9 text-xs bg-white dark:bg-slate-950"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportGlToExcel} className="text-xs h-9">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Export Excel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => printElement(reportPrintRef.current, "General_Ledger")}
                className="text-xs h-9"
              >
                <Printer className="w-3.5 h-3.5 mr-1" /> Print Ledger
              </Button>
            </div>
          </div>

          {/* Ledger Table */}
          <Card ref={reportPrintRef} className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 border-b bg-white dark:bg-slate-950 flex justify-between items-center print:block">
              <div>
                <h3 className="font-bold text-base">General Ledger Book (የጠቅላላ ሌጀር መዝገብ)</h3>
                <p className="text-xs text-muted-foreground">
                  Account: {glAccountCode === "all" ? "All Accounts" : `${glAccountCode} - ${accounts.find(a => a.code === glAccountCode)?.name || ""}`}
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs">
                {glLines.length} Ledger Line Items
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Entry #</th>
                    <th className="py-2.5 px-3">Ref Voucher</th>
                    <th className="py-2.5 px-3">Account</th>
                    <th className="py-2.5 px-3">Narration / Memo</th>
                    <th className="py-2.5 px-3 text-right">Debit (ETB)</th>
                    <th className="py-2.5 px-3 text-right">Credit (ETB)</th>
                    <th className="py-2.5 px-3 text-right">Running Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {glLines.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground">
                        No transactions found for the selected account / filter.
                      </td>
                    </tr>
                  ) : (
                    glLines.map((line) => (
                      <tr key={line.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/50">
                        <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">{line.date}</td>
                        <td className="py-2 px-3 font-mono font-semibold">{line.entryNumber}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-muted-foreground">{line.referenceVoucherId || "—"}</td>
                        <td className="py-2 px-3 font-medium">
                          <span className="font-mono font-bold mr-1">{line.accountCode}</span>
                          <span className="text-muted-foreground text-[11px]">({line.accountName})</span>
                        </td>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">{line.memo}</td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {line.debit > 0 ? fmt(line.debit) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                          {line.credit > 0 ? fmt(line.credit) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-blue-700 dark:text-blue-400 bg-slate-50/40">
                          {fmt(line.runningBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TAB 5: TRIAL BALANCE
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="trial" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={reportPeriod} onValueChange={(v: any) => setReportPeriod(v)}>
                <SelectTrigger className="w-[140px] h-9 text-xs bg-white dark:bg-slate-950">
                  <SelectValue placeholder="Period" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Daily (Today)</SelectItem>
                  <SelectItem value="week">Weekly (This Week)</SelectItem>
                  <SelectItem value="month">Monthly (This Month)</SelectItem>
                  <SelectItem value="custom">Custom Date Range</SelectItem>
                </SelectContent>
              </Select>

              {reportPeriod === "custom" && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-9 text-xs w-[130px] bg-white dark:bg-slate-950"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-9 text-xs w-[130px] bg-white dark:bg-slate-950"
                  />
                </div>
              )}

              {trialBalance.isBalanced ? (
                <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-700 text-xs font-semibold py-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Trial Balance is In Balance
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-xs font-semibold py-1">
                  Out of Balance: {fmt(trialBalance.difference)} ETB
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportTrialBalanceExcel} className="text-xs h-9">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Export Excel
              </Button>
            </div>
          </div>

          <Card className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b text-muted-foreground font-semibold uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Account Code</th>
                    <th className="py-2.5 px-3">Account Name</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3 text-right">Debit Total (ETB)</th>
                    <th className="py-2.5 px-3 text-right">Credit Total (ETB)</th>
                    <th className="py-2.5 px-3 text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {trialBalance.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground">
                        No transactions recorded for this period.
                      </td>
                    </tr>
                  ) : (
                    trialBalance.rows.map((r) => (
                      <tr key={r.accountCode} className="hover:bg-slate-50/50">
                        <td className="py-2 px-3 font-mono font-bold">{r.accountCode}</td>
                        <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">{r.accountName}</td>
                        <td className="py-2 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${CATEGORY_COLORS[r.accountType]?.bg}`}>
                            {r.accountType}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {r.debit > 0 ? fmt(r.debit) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {r.credit > 0 ? fmt(r.credit) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-black text-slate-900 dark:text-slate-100 bg-slate-50/50">
                          {fmt(r.netBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-100 dark:bg-slate-900 border-t-2 border-slate-300 font-extrabold text-xs">
                    <td colSpan={3} className="py-2.5 px-3 uppercase tracking-wider">
                      Grand Totals:
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 text-sm">
                      {fmt(trialBalance.totalDebit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 text-sm">
                      {fmt(trialBalance.totalCredit)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-sm text-slate-900">
                      {trialBalance.isBalanced ? "✓ BALANCED" : `DIFF: ${fmt(trialBalance.difference)}`}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════
            TAB 6: FINANCIAL STATEMENTS (P&L, BALANCE SHEET, CASH FLOW)
        ══════════════════════════════════════════════════════════════ */}
        <TabsContent value="reports" className="space-y-6">
          <Tabs defaultValue="pnl" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <TabsList className="bg-slate-100 dark:bg-slate-900 grid grid-cols-2 sm:grid-cols-5 w-full max-w-3xl">
                <TabsTrigger value="pnl" className="text-xs">
                  Profit & Loss
                </TabsTrigger>
                <TabsTrigger value="bs" className="text-xs">
                  Balance Sheet
                </TabsTrigger>
                <TabsTrigger value="cf" className="text-xs">
                  Cash Flow
                </TabsTrigger>
                <TabsTrigger value="expense_rpt" className="text-xs">
                  Expense Report
                </TabsTrigger>
                <TabsTrigger value="revenue_rpt" className="text-xs">
                  Revenue Report
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-wrap items-center gap-2">
                <Select value={reportPeriod} onValueChange={(v: any) => setReportPeriod(v)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs bg-white dark:bg-slate-950">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Daily (Today)</SelectItem>
                    <SelectItem value="week">Weekly (This Week)</SelectItem>
                    <SelectItem value="month">Monthly (This Month)</SelectItem>
                    <SelectItem value="custom">Custom Date Range</SelectItem>
                  </SelectContent>
                </Select>

                {reportPeriod === "custom" && (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="date"
                      value={customStartDate}
                      onChange={(e) => setCustomStartDate(e.target.value)}
                      className="h-8 text-xs w-[130px] bg-white dark:bg-slate-950"
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="date"
                      value={customEndDate}
                      onChange={(e) => setCustomEndDate(e.target.value)}
                      className="h-8 text-xs w-[130px] bg-white dark:bg-slate-950"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Sub-tab 1: Profit & Loss Statement */}
            <TabsContent value="pnl">
              <Card className="border border-slate-200 dark:border-slate-800 shadow-sm max-w-4xl mx-auto p-6 space-y-6">
                <div className="border-b pb-4 text-center">
                  <h2 className="text-xl font-bold tracking-tight">PROFIT & LOSS STATEMENT (የትርፍና ኪሳራ መግለጫ)</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Period: {reportPeriod === "all" ? "All Time" : reportPeriod.toUpperCase()} · Currency: ETB (Ethiopian Birr)
                  </p>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Revenue Section */}
                  <div>
                    <div className="flex justify-between font-bold text-sm bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      <span className="text-emerald-700">OPERATING REVENUE (የስራ ገቢዎች)</span>
                      <span className="text-emerald-700 font-mono">
                        {fmt(financialStatements.profitAndLoss.totalRevenue)}
                      </span>
                    </div>
                    <div className="divide-y px-3 py-1 space-y-1">
                      {financialStatements.profitAndLoss.revenueRows.map((r) => (
                        <div key={r.accountCode} className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                          <span>{r.accountCode} - {r.accountName}</span>
                          <span className="font-mono font-semibold">{fmt(r.netBalance)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* COGS Section */}
                  <div>
                    <div className="flex justify-between font-bold text-sm bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      <span className="text-rose-700">LESS: COST OF GOODS SOLD (የተሸጡ እቃዎች የመጀመሪያ ወጪ)</span>
                      <span className="text-rose-700 font-mono">
                        - {fmt(financialStatements.profitAndLoss.cogs)}
                      </span>
                    </div>
                  </div>

                  {/* Gross Profit Bar */}
                  <div className="flex justify-between font-black text-sm bg-slate-100 dark:bg-slate-800 p-2.5 rounded border">
                    <span>GROSS PROFIT (ጠቅላላ ትርፍ)</span>
                    <span className="font-mono text-emerald-800 dark:text-emerald-400">
                      {fmt(financialStatements.profitAndLoss.grossProfit)}
                    </span>
                  </div>

                  {/* Operating Expenses Section */}
                  <div>
                    <div className="flex justify-between font-bold text-sm bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      <span className="text-rose-700">OPERATING & ADMINISTRATIVE EXPENSES (ጠቅላላ ወጪዎች)</span>
                      <span className="text-rose-700 font-mono">
                        - {fmt(financialStatements.profitAndLoss.totalOperatingExpenses)}
                      </span>
                    </div>
                    <div className="divide-y px-3 py-1 space-y-1">
                      {financialStatements.profitAndLoss.operatingExpenseRows.map((r) => (
                        <div key={r.accountCode} className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                          <span>{r.accountCode} - {r.accountName}</span>
                          <span className="font-mono font-semibold">{fmt(r.netBalance)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Net Profit Bar */}
                  <div className="flex justify-between items-center font-extrabold text-base bg-emerald-50 dark:bg-emerald-950/40 p-3 rounded-lg border border-emerald-300">
                    <span className="text-emerald-900 dark:text-emerald-200">
                      NET OPERATING PROFIT / (LOSS) (የተጣራ ትርፍ / ኪሳራ)
                    </span>
                    <span
                      className={`font-mono text-lg ${
                        financialStatements.profitAndLoss.netProfit >= 0 ? "text-emerald-700" : "text-rose-600"
                      }`}
                    >
                      {fmt(financialStatements.profitAndLoss.netProfit)} ETB
                    </span>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Sub-tab 2: Balance Sheet */}
            <TabsContent value="bs">
              <Card className="border border-slate-200 dark:border-slate-800 shadow-sm max-w-4xl mx-auto p-6 space-y-6">
                <div className="border-b pb-4 text-center">
                  <h2 className="text-xl font-bold tracking-tight">BALANCE SHEET STATEMENT (የቀሪ ሂሳብ መግለጫ)</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    As of: {formatSafeDate(new Date())} · Currency: ETB · Equation: Assets = Liabilities + Equity
                  </p>
                </div>

                <div className="space-y-6 text-xs">
                  {/* Assets */}
                  <div>
                    <div className="flex justify-between font-bold text-sm bg-blue-50 dark:bg-blue-950/40 p-2 rounded text-blue-800 dark:text-blue-300">
                      <span>TOTAL ASSETS (ጠቅላላ ሀብቶች)</span>
                      <span className="font-mono">{fmt(financialStatements.balanceSheet.totalAssets)}</span>
                    </div>
                    <div className="divide-y px-3 py-1 space-y-1">
                      {financialStatements.balanceSheet.assetRows.map((r) => (
                        <div key={r.accountCode} className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                          <span>{r.accountCode} - {r.accountName}</span>
                          <span className="font-mono font-semibold">{fmt(r.netBalance)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Liabilities */}
                  <div>
                    <div className="flex justify-between font-bold text-sm bg-amber-50 dark:bg-amber-950/40 p-2 rounded text-amber-800 dark:text-amber-300">
                      <span>TOTAL LIABILITIES (ጠቅላላ እዳዎች)</span>
                      <span className="font-mono">{fmt(financialStatements.balanceSheet.totalLiabilities)}</span>
                    </div>
                    <div className="divide-y px-3 py-1 space-y-1">
                      {financialStatements.balanceSheet.liabilityRows.map((r) => (
                        <div key={r.accountCode} className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                          <span>{r.accountCode} - {r.accountName}</span>
                          <span className="font-mono font-semibold">{fmt(r.netBalance)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Equity */}
                  <div>
                    <div className="flex justify-between font-bold text-sm bg-purple-50 dark:bg-purple-950/40 p-2 rounded text-purple-800 dark:text-purple-300">
                      <span>TOTAL EQUITY (የባለቤት ካፒታልና የተጣራ ትርፍ)</span>
                      <span className="font-mono">{fmt(financialStatements.balanceSheet.totalEquity)}</span>
                    </div>
                    <div className="divide-y px-3 py-1 space-y-1">
                      {financialStatements.balanceSheet.equityRows.map((r) => (
                        <div key={r.accountCode} className="flex justify-between py-1 text-slate-700 dark:text-slate-300">
                          <span>{r.accountCode} - {r.accountName}</span>
                          <span className="font-mono font-semibold">{fmt(r.netBalance)}</span>
                        </div>
                      ))}
                      <div className="flex justify-between py-1 text-slate-700 dark:text-slate-300 font-semibold">
                        <span>Current Period Retained Profit (የአሁኑ ወቅት የተጣራ ትርፍ)</span>
                        <span className="font-mono">{fmt(financialStatements.balanceSheet.currentPeriodProfit)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Total Liabilities + Equity check */}
                  <div className="flex justify-between items-center font-extrabold text-sm bg-slate-100 dark:bg-slate-800 p-3 rounded-lg border">
                    <span>TOTAL LIABILITIES & EQUITY (ጠቅላላ እዳ እና ካፒታል)</span>
                    <span className="font-mono text-base">
                      {fmt(financialStatements.balanceSheet.totalLiabilities + financialStatements.balanceSheet.totalEquity)} ETB
                    </span>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Sub-tab 3: Cash Flow Statement */}
            <TabsContent value="cf">
              <Card className="border border-slate-200 dark:border-slate-800 shadow-sm max-w-4xl mx-auto p-6 space-y-6">
                <div className="border-b pb-4 text-center">
                  <h2 className="text-xl font-bold tracking-tight">STATEMENT OF CASH FLOWS (የገንዘብ እንቅስቃሴ መግለጫ)</h2>
                  <p className="text-xs text-muted-foreground mt-1">Direct Method · Operating Cash Receipts & Payments</p>
                </div>

                <div className="space-y-4 text-xs">
                  <div>
                    <div className="flex justify-between font-bold text-sm bg-slate-50 dark:bg-slate-900 p-2 rounded">
                      <span>CASH FLOWS FROM OPERATING ACTIVITIES</span>
                      <span className="font-mono">{fmt(financialStatements.cashFlow.netOperatingCashFlow)}</span>
                    </div>
                    <div className="divide-y px-3 py-2 space-y-1.5">
                      <div className="flex justify-between py-1">
                        <span className="text-slate-600">Cash Receipts from Customer Sales</span>
                        <span className="font-mono text-emerald-700 font-semibold">
                          + {fmt(financialStatements.cashFlow.cashReceipts)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-600">Cash Paid to Suppliers for Inventory</span>
                        <span className="font-mono text-rose-600 font-semibold">
                          - {fmt(financialStatements.cashFlow.cashSupplierDisbursements)}
                        </span>
                      </div>
                      <div className="flex justify-between py-1">
                        <span className="text-slate-600">Cash Paid for Operating Expenses</span>
                        <span className="font-mono text-rose-600 font-semibold">
                          - {fmt(financialStatements.cashFlow.cashExpenseDisbursements)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center font-bold text-sm bg-blue-50 dark:bg-blue-950/40 p-3 rounded border border-blue-200">
                    <span>ENDING LIQUID CASH & BANK POSITION</span>
                    <span className="font-mono text-blue-800 dark:text-blue-300 font-black">
                      {fmt(financialStatements.cashFlow.endingCashBalance)} ETB
                    </span>
                  </div>
                </div>
              </Card>
            </TabsContent>

            {/* Sub-tab 4: Expense Report */}
            <TabsContent value="expense_rpt" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border">
                <div>
                  <h3 className="text-sm font-bold">Operating Expenses & COGS Breakdown (የወጪዎች ዝርዝር ሪፖርት)</h3>
                  <p className="text-xs text-muted-foreground">
                    Period: {reportPeriod === "all" ? "All Time" : reportPeriod.toUpperCase()} · Total Expenses: {fmt(expenseReportData.totalExpenses)} ETB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportExpenseReportExcel} className="text-xs h-8">
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Export Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => printElement(expenseReportPrintRef.current, "Expense_Report")}
                    className="text-xs h-8"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1" /> Print Report
                  </Button>
                </div>
              </div>

              {/* Printable container */}
              <div ref={expenseReportPrintRef} className="space-y-4">
                {/* Expense KPI summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
                    <CardContent className="p-3.5 space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Total Period Expenses</span>
                      <p className="text-lg font-bold font-mono text-rose-600">{fmt(expenseReportData.totalExpenses)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
                    <CardContent className="p-3.5 space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Cost of Goods Sold (5010)</span>
                      <p className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
                        {fmt(financialStatements.profitAndLoss.cogs)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
                    <CardContent className="p-3.5 space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Operating Expenses</span>
                      <p className="text-lg font-bold font-mono text-amber-700">
                        {fmt(financialStatements.profitAndLoss.totalOperatingExpenses)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
                    <CardContent className="p-3.5 space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Expense Accounts</span>
                      <p className="text-lg font-bold font-mono text-blue-700">{expenseReportData.rows.length} Active</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Expense Categories Breakdown Table */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Expense Account Summary & Distribution
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b text-muted-foreground uppercase text-[10px]">
                        <tr>
                          <th className="py-2 px-3">Code</th>
                          <th className="py-2 px-3">Account Title</th>
                          <th className="py-2 px-3 hidden sm:table-cell">Amharic Title</th>
                          <th className="py-2 px-3 text-right">Amount (ETB)</th>
                          <th className="py-2 px-3 text-right">Share (%)</th>
                          <th className="py-2 px-3">Visual Ratio</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {expenseReportData.rows.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-6 text-center text-muted-foreground">
                              No expense records found for this period.
                            </td>
                          </tr>
                        ) : (
                          expenseReportData.rows.map((row) => {
                            const pct =
                              expenseReportData.totalExpenses > 0
                                ? Math.round((row.total / expenseReportData.totalExpenses) * 1000) / 10
                                : 0;
                            return (
                              <tr key={row.code} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {row.code}
                                </td>
                                <td className="py-2 px-3 font-semibold">{row.name}</td>
                                <td className="py-2 px-3 hidden sm:table-cell text-muted-foreground">{row.nameAmharic || "—"}</td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-rose-600">
                                  {fmt(row.total)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-semibold">{pct}%</td>
                                <td className="py-2 px-3 w-32">
                                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                                    <div
                                      className="bg-rose-500 h-2 rounded-full transition-all"
                                      style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      {expenseReportData.rows.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-50 dark:bg-slate-900 border-t font-bold">
                            <td colSpan={3} className="py-2 px-3 uppercase">Total Period Expenses:</td>
                            <td className="py-2 px-3 text-right font-mono text-rose-700 text-sm font-black">
                              {fmt(expenseReportData.totalExpenses)}
                            </td>
                            <td className="py-2 px-3 text-right font-mono">100.0%</td>
                            <td />
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </Card>

                {/* Detailed Expense Transactions Log */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Recent Expense Transaction Entries ({expenseReportData.transactions.length})
                    </h4>
                  </div>
                  <div className="overflow-x-auto max-h-[360px]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b text-muted-foreground uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Entry #</th>
                          <th className="py-2 px-3">Store</th>
                          <th className="py-2 px-3">Account</th>
                          <th className="py-2 px-3">Narration / Description</th>
                          <th className="py-2 px-3 text-right">Amount (ETB)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {expenseReportData.transactions.slice(0, 50).map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3 font-mono text-muted-foreground">{t.date}</td>
                            <td className="py-1.5 px-3 font-mono font-semibold">{t.entryNumber}</td>
                            <td className="py-1.5 px-3">{t.storeName || "—"}</td>
                            <td className="py-1.5 px-3 font-medium">
                              <span className="font-mono mr-1">{t.accountCode}</span>
                              <span className="text-[11px] text-muted-foreground">({t.accountName})</span>
                            </td>
                            <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">{t.memo}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-rose-600">
                              {fmt(t.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </TabsContent>

            {/* Sub-tab 5: Revenue Report */}
            <TabsContent value="revenue_rpt" className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg border">
                <div>
                  <h3 className="text-sm font-bold">Revenue & Sales Performance Report (የሽያጭና ገቢዎች ሪፖርት)</h3>
                  <p className="text-xs text-muted-foreground">
                    Period: {reportPeriod === "all" ? "All Time" : reportPeriod.toUpperCase()} · Net Revenue: {fmt(revenueReportData.netRevenue)} ETB
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={exportRevenueReportExcel} className="text-xs h-8">
                    <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" /> Export Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => printElement(revenueReportPrintRef.current, "Revenue_Report")}
                    className="text-xs h-8"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1" /> Print Report
                  </Button>
                </div>
              </div>

              {/* Printable container */}
              <div ref={revenueReportPrintRef} className="space-y-4">
                {/* Revenue KPI summary cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
                    <CardContent className="p-3.5 space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Gross Sales Revenue</span>
                      <p className="text-lg font-bold font-mono text-emerald-700">{fmt(revenueReportData.totalGrossRevenue)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
                    <CardContent className="p-3.5 space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Returns & Discounts (4090)</span>
                      <p className="text-lg font-bold font-mono text-rose-600">- {fmt(revenueReportData.totalReturnsDiscounts)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs bg-emerald-50/50 dark:bg-emerald-950/20">
                    <CardContent className="p-3.5 space-y-1">
                      <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase">Net Revenue</span>
                      <p className="text-lg font-black font-mono text-emerald-700">{fmt(revenueReportData.netRevenue)}</p>
                    </CardContent>
                  </Card>
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
                    <CardContent className="p-3.5 space-y-1">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase">Cost of Goods Sold (COGS)</span>
                      <p className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200">
                        {fmt(financialStatements.profitAndLoss.cogs)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Revenue Streams Table & Payment Channels */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Revenue by Stream */}
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Revenue by Stream / Account
                      </h4>
                    </div>
                    <div className="p-0">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b text-muted-foreground uppercase text-[10px]">
                          <tr>
                            <th className="py-2 px-3">Stream</th>
                            <th className="py-2 px-3 text-right">Revenue (ETB)</th>
                            <th className="py-2 px-3 text-right">Share (%)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {revenueReportData.streamRows.map((s) => {
                            const pct =
                              revenueReportData.totalGrossRevenue > 0
                                ? Math.round((s.total / revenueReportData.totalGrossRevenue) * 1000) / 10
                                : 0;
                            return (
                              <tr key={s.code} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 font-semibold">
                                  <span className="font-mono mr-1.5 font-bold">{s.code}</span>
                                  {s.name}
                                </td>
                                <td className="py-2 px-3 text-right font-mono font-bold text-emerald-700">
                                  {fmt(s.total)}
                                </td>
                                <td className="py-2 px-3 text-right font-mono">{pct}%</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  {/* Revenue by Payment Channel */}
                  <Card className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                    <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Collections by Payment Method / Channel
                      </h4>
                    </div>
                    <div className="p-0">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b text-muted-foreground uppercase text-[10px]">
                          <tr>
                            <th className="py-2 px-3">Payment Channel</th>
                            <th className="py-2 px-3 text-right">Collected (ETB)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {revenueReportData.channelTotals.map((c, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="py-2 px-3 font-semibold">{c.name}</td>
                              <td className="py-2 px-3 text-right font-mono font-bold text-blue-700 dark:text-blue-400">
                                {fmt(c.total)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </div>

                {/* Recent Sales Transactions Audit Log */}
                <Card className="border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 border-b flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Recent Sales Revenue Transactions ({revenueReportData.transactions.length})
                    </h4>
                  </div>
                  <div className="overflow-x-auto max-h-[360px]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-50/50 dark:bg-slate-900/50 border-b text-muted-foreground uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Entry #</th>
                          <th className="py-2 px-3">Ref Voucher</th>
                          <th className="py-2 px-3">Store</th>
                          <th className="py-2 px-3">Customer</th>
                          <th className="py-2 px-3">Narration / Memo</th>
                          <th className="py-2 px-3 text-right">Amount (ETB)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {revenueReportData.transactions.slice(0, 50).map((t, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="py-1.5 px-3 font-mono text-muted-foreground">{t.date}</td>
                            <td className="py-1.5 px-3 font-mono font-semibold">{t.entryNumber}</td>
                            <td className="py-1.5 px-3 font-mono text-muted-foreground">{t.reference || "—"}</td>
                            <td className="py-1.5 px-3">{t.storeName || "—"}</td>
                            <td className="py-1.5 px-3 font-medium">{t.customerName}</td>
                            <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300 max-w-xs truncate">{t.memo}</td>
                            <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-700">
                              {fmt(t.amount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* ── Add / Edit Account Modal ── */}
      <Dialog open={showAccountModal} onOpenChange={setShowAccountModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">
              {editingAccount ? "Edit Account" : "Add New Account to Chart of Accounts"}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Configure accounting category, code range, and ledger title.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 text-xs py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category *</Label>
                <Select
                  value={accountForm.type}
                  onValueChange={(val: AccountCategory) => {
                    let defaultCode = "1050";
                    let defaultSub = "current_asset";
                    if (val === "liability") { defaultCode = "2050"; defaultSub = "current_liability"; }
                    if (val === "equity") { defaultCode = "3050"; defaultSub = "equity"; }
                    if (val === "revenue") { defaultCode = "4050"; defaultSub = "operating_revenue"; }
                    if (val === "expense") { defaultCode = "6100"; defaultSub = "operating_expense"; }
                    setAccountForm((f) => ({ ...f, type: val, code: defaultCode, subType: defaultSub }));
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset">1000 Assets (ሀብቶች)</SelectItem>
                    <SelectItem value="liability">2000 Liabilities (እዳዎች)</SelectItem>
                    <SelectItem value="equity">3000 Equity (ካፒታል)</SelectItem>
                    <SelectItem value="revenue">4000 Revenue (ገቢዎች)</SelectItem>
                    <SelectItem value="expense">5000 Expenses (ወጪዎች)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs">Account Code *</Label>
                <Input
                  value={accountForm.code}
                  onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })}
                  placeholder="e.g. 1015"
                  className="h-9 text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Account Name (English) *</Label>
              <Input
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
                placeholder="e.g. Petty Cash"
                className="h-9 text-xs"
              />
            </div>

            <div>
              <Label className="text-xs">Account Name (Amharic / አማርኛ)</Label>
              <Input
                value={accountForm.nameAmharic}
                onChange={(e) => setAccountForm({ ...accountForm, nameAmharic: e.target.value })}
                placeholder="e.g. አነስተኛ የእጅ በእጅ ጥሬ ገንዘብ"
                className="h-9 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs flex items-center justify-between">
                  <span>Parent Account</span>
                  {bankAccounts.length > 0 && (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-normal">
                      Includes Accounts Module
                    </span>
                  )}
                </Label>
                <Select
                  value={currentParentSelectValue}
                  onValueChange={(val) => {
                    if (val === "none") {
                      setAccountForm((f) => ({
                        ...f,
                        parentCode: "",
                        parentName: "",
                      }));
                      return;
                    }
                    if (val.startsWith("bank_")) {
                      const bankId = val.replace("bank_", "");
                      const bank = bankAccounts.find((b) => b.id === bankId || b.accountNumber === bankId);
                      if (bank) {
                        const bankLabel = `${bank.bankName} - ${bank.accountNumber}${bank.personName ? ` (${bank.personName})` : ""}`;
                        setAccountForm((f) => ({
                          ...f,
                          parentCode: bank.accountNumber || bank.id,
                          parentName: bankLabel,
                          type: "asset",
                          subType: "bank",
                          name: f.name ? f.name : `${bank.bankName} (${bank.accountNumber})`,
                          nameAmharic: f.nameAmharic ? f.nameAmharic : `${bank.bankName} - ${bank.accountNumber}`,
                          code: (!f.code || f.code === "1050") ? (() => {
                            for (let c = 1023; c <= 1039; c++) {
                              if (!accounts.some((a) => a.code === String(c))) return String(c);
                            }
                            return "1025";
                          })() : f.code,
                        }));
                      }
                      return;
                    }
                    if (val.startsWith("coa_")) {
                      const code = val.replace("coa_", "");
                      const parent = accounts.find((a) => a.code === code);
                      setAccountForm((f) => ({
                        ...f,
                        parentCode: code,
                        parentName: parent?.name || "",
                      }));
                      return;
                    }
                    const parent = accounts.find((a) => a.code === val);
                    setAccountForm((f) => ({
                      ...f,
                      parentCode: val,
                      parentName: parent?.name || "",
                    }));
                  }}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="None (Header)" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[260px]">
                    <SelectItem value="none" className="text-xs">
                      None (Top-Level Header / ወላጅ የሌለው)
                    </SelectItem>

                    {bankAccounts.length > 0 && (
                      <SelectGroup>
                        <SelectLabel className="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50/70 dark:bg-blue-950/40 px-2 py-1 rounded-xs mt-1.5 mb-1 flex items-center gap-1.5 uppercase tracking-wider">
                          <Landmark className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          Accounts Module (ከ Accounts ሞጁል የተመዘገቡ)
                        </SelectLabel>
                        {bankAccounts.map((b) => (
                          <SelectItem key={b.id} value={`bank_${b.id}`} className="text-xs cursor-pointer">
                            <span className="font-semibold text-slate-800 dark:text-slate-100">{b.bankName}</span>
                            <span className="font-mono text-muted-foreground ml-1.5 text-[11px]">[{b.accountNumber}]</span>
                            {b.personName && (
                              <span className="text-[10px] text-muted-foreground italic ml-1.5">
                                • {b.personName}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    )}

                    <SelectGroup>
                      <SelectLabel className="text-[10px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-xs mt-2 mb-1 flex items-center gap-1.5 uppercase tracking-wider">
                        <BookOpen className="w-3 h-3 text-slate-600 dark:text-slate-400" />
                        Chart of Accounts (የሂሳብ ሠንጠረዥ)
                      </SelectLabel>
                      {accounts
                        .filter((a) => a.code !== accountForm.code)
                        .map((a) => (
                          <SelectItem key={a.code} value={`coa_${a.code}`} className="text-xs cursor-pointer">
                            <span className="font-mono font-bold mr-1.5">{a.code}</span>
                            <span>{a.name}</span>
                            {a.nameAmharic && (
                              <span className="text-muted-foreground ml-1.5 text-[10px]">
                                ({a.nameAmharic})
                              </span>
                            )}
                          </SelectItem>
                        ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {currentParentSelectValue.startsWith("bank_") && (
                  <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-blue-700 dark:text-blue-300 bg-blue-50/80 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900 px-2 py-1 rounded-xs">
                    <Landmark className="w-3 h-3 text-blue-600 shrink-0" />
                    <span className="truncate">
                      Linked to Accounts Module: <strong>{accountForm.parentName}</strong>
                    </span>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs">Status (Active / Inactive) *</Label>
                <Select
                  value={accountForm.isActive ? "active" : "inactive"}
                  onValueChange={(val) => setAccountForm({ ...accountForm, isActive: val === "active" })}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (ንቁ)</SelectItem>
                    <SelectItem value="inactive">Inactive (የቦዘነ)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Description / Memo</Label>
              <Input
                value={accountForm.description}
                onChange={(e) => setAccountForm({ ...accountForm, description: e.target.value })}
                placeholder="Brief account notes"
                className="h-9 text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAccountModal(false)} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveAccount} className="text-xs">
              Save Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manual Journal Entry Modal ── */}
      <Dialog open={showManualEntryModal} onOpenChange={setShowManualEntryModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>New Double-Entry Journal Entry</span>
              <Badge variant={isManualBalanced ? "secondary" : "destructive"} className="text-xs font-mono">
                {isManualBalanced ? "BALANCED ✓" : "UNBALANCED"}
              </Badge>
            </DialogTitle>
            <DialogDescription className="text-xs">
              Every journal entry must have equal Total Debits and Total Credits.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Transaction Date *</Label>
                <Input
                  type="date"
                  value={manualEntryDate}
                  onChange={(e) => setManualEntryDate(e.target.value)}
                  className="h-9 text-xs"
                />
              </div>
              <div>
                <Label className="text-xs">Memo / Narration *</Label>
                <Input
                  value={manualEntryMemo}
                  onChange={(e) => setManualEntryMemo(e.target.value)}
                  placeholder="e.g. Month-end adjustment / Owner Capital contribution"
                  className="h-9 text-xs"
                />
              </div>
            </div>

            {/* Lines */}
            <div className="border rounded-md p-3 space-y-2.5 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex justify-between items-center pb-1 border-b">
                <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                  Debits & Credits Lines
                </span>
                <Button size="sm" variant="outline" onClick={addManualLine} className="h-6 text-[11px] px-2">
                  <Plus className="w-3 h-3 mr-1" /> Add Line
                </Button>
              </div>

              {manualEntryLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-5">
                    <Select
                      value={line.accountCode}
                      onValueChange={(val) => updateManualLine(idx, "accountCode", val)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white dark:bg-slate-950">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-[220px]">
                        {accounts.map((a) => (
                          <SelectItem key={a.code} value={a.code}>
                            {a.code} - {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Debit"
                      value={line.debit === "0" ? "" : line.debit}
                      onChange={(e) => updateManualLine(idx, "debit", e.target.value)}
                      className="h-8 text-xs font-mono font-bold text-right"
                    />
                  </div>

                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="Credit"
                      value={line.credit === "0" ? "" : line.credit}
                      onChange={(e) => updateManualLine(idx, "credit", e.target.value)}
                      className="h-8 text-xs font-mono font-bold text-right"
                    />
                  </div>

                  <div className="col-span-1 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeManualLine(idx)}
                      disabled={manualEntryLines.length <= 2}
                      className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Totals Summary */}
              <div className="pt-2 border-t grid grid-cols-12 gap-2 font-bold text-xs">
                <div className="col-span-5 text-right">Totals:</div>
                <div className="col-span-3 text-right font-mono text-emerald-700">{fmt(manualDebitTotal)}</div>
                <div className="col-span-3 text-right font-mono text-emerald-700">{fmt(manualCreditTotal)}</div>
                <div className="col-span-1" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowManualEntryModal(false)} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleSaveManualEntry} disabled={!isManualBalanced} className="text-xs">
              Post Journal Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View / Print Journal Voucher Modal ── */}
      <Dialog open={!!viewingJournalEntry} onOpenChange={(open) => !open && setViewingJournalEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center justify-between">
              <span>Journal Entry Voucher</span>
              {viewingJournalEntry && (
                <Badge variant={viewingJournalEntry.isBalanced ? "secondary" : "destructive"} className="text-xs font-mono">
                  {viewingJournalEntry.isBalanced ? "BALANCED ✓" : "UNBALANCED"}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Official Double-Entry Accounting Voucher
            </DialogDescription>
          </DialogHeader>

          {viewingJournalEntry && (
            <div className="space-y-4 text-xs py-1">
              <div ref={journalVoucherPrintRef} className="border rounded-md p-4 bg-white dark:bg-slate-950 space-y-4">
                {/* Header */}
                <div className="border-b pb-3 flex justify-between items-start">
                  <div>
                    <h3 className="font-extrabold text-base tracking-tight">YESERAHUT ERP</h3>
                    <p className="text-[11px] text-muted-foreground uppercase font-semibold">Double-Entry Journal Voucher (የጆርናል ቫውቸር)</p>
                  </div>
                  <div className="text-right text-[11px] font-mono space-y-0.5">
                    <div><span className="text-muted-foreground">Voucher #:</span> <span className="font-bold">{viewingJournalEntry.entryNumber}</span></div>
                    <div><span className="text-muted-foreground">Date:</span> <span>{viewingJournalEntry.date}</span></div>
                    {viewingJournalEntry.referenceVoucherId && (
                      <div><span className="text-muted-foreground">Ref:</span> <span>{viewingJournalEntry.referenceVoucherId}</span></div>
                    )}
                    <div><span className="text-muted-foreground">Type:</span> <span className="uppercase">{viewingJournalEntry.voucherType}</span></div>
                  </div>
                </div>

                {/* Memo */}
                <div className="bg-slate-50 dark:bg-slate-900/50 p-2.5 rounded text-xs">
                  <span className="font-bold text-muted-foreground mr-1.5">Narration / Memo:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{viewingJournalEntry.memo}</span>
                </div>

                {/* Table of Debits and Credits */}
                <table className="w-full text-xs text-left border">
                  <thead className="bg-slate-100 dark:bg-slate-900 border-b text-[10px] font-bold uppercase text-muted-foreground">
                    <tr>
                      <th className="py-2 px-2.5 border-r">Account Code</th>
                      <th className="py-2 px-2.5 border-r">Account Title</th>
                      <th className="py-2 px-2.5 border-r">Description</th>
                      <th className="py-2 px-2.5 text-right border-r">Debit (ETB)</th>
                      <th className="py-2 px-2.5 text-right">Credit (ETB)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(viewingJournalEntry.lines || []).map((l, i) => (
                      <tr key={i} className="hover:bg-slate-50/50">
                        <td className="py-2 px-2.5 font-mono font-bold border-r">{l.accountCode}</td>
                        <td className="py-2 px-2.5 font-medium border-r">{l.accountName}</td>
                        <td className="py-2 px-2.5 text-muted-foreground text-[11px] border-r">{l.description || "—"}</td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold border-r">
                          {l.debit > 0 ? fmt(l.debit) : "—"}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold">
                          {l.credit > 0 ? fmt(l.credit) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-900 border-t-2 font-bold text-xs">
                      <td colSpan={3} className="py-2 px-2.5 text-right uppercase border-r">Grand Totals:</td>
                      <td className="py-2 px-2.5 text-right font-mono text-emerald-700 font-extrabold border-r">
                        {fmt(viewingJournalEntry.totalDebit)}
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono text-emerald-700 font-extrabold">
                        {fmt(viewingJournalEntry.totalCredit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Signatures */}
                <div className="grid grid-cols-3 gap-4 pt-6 border-t text-[11px] text-center text-muted-foreground">
                  <div>
                    <div className="border-b pb-8 font-medium">{viewingJournalEntry.createdByName || "Accountant"}</div>
                    <div className="pt-1 font-semibold">Prepared By</div>
                  </div>
                  <div>
                    <div className="border-b pb-8 font-medium">Internal Audit</div>
                    <div className="pt-1 font-semibold">Checked & Verified</div>
                  </div>
                  <div>
                    <div className="border-b pb-8 font-medium">Finance Manager</div>
                    <div className="pt-1 font-semibold">Authorized Signatory</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setViewingJournalEntry(null)} className="text-xs">
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => printElement(journalVoucherPrintRef.current, `Journal_Voucher_${viewingJournalEntry?.entryNumber || ""}`)}
              className="text-xs"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" /> Print Voucher
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {DeleteAuthDialog}
    </div>
  );
}
