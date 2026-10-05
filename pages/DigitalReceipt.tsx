import React, { useEffect, useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  CheckCircle2,
  ShieldCheck,
  Printer,
  Download,
  Share2,
  Copy,
  Check,
  QrCode,
  Package,
  Calendar,
  Store as StoreIcon,
  User,
  CreditCard,
  FileText,
  Search,
  ExternalLink,
  ArrowLeft,
  Sparkles,
  Phone,
  MapPin,
  Clock,
  AlertCircle,
  FileCheck2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { lookupReceipt, UniversalReceiptData } from "@/lib/receiptLookup";
import { buildDigitalReceiptUrl, shareDigitalReceipt } from "@/lib/qrReceiptUtils";
import { formatEthDate } from "@/lib/ethiopianCalendar";
import { printElement } from "@/lib/printUtils";
import { shareAsPdf, shareAsImage } from "@/shareImage";
import { QRCodeSVG } from "qrcode.react";
import { getStoredBrandName, getStoredBrandTagline } from "@/lib/brandConfig";

export default function DigitalReceipt() {
  const [matched, params] = useRoute<{ id: string }>("/receipt/:id");
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [receipt, setReceipt] = useState<UniversalReceiptData | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [downloadingImg, setDownloadingImg] = useState(false);

  const receiptCardRef = useRef<HTMLDivElement>(null);

  // Extract ID from URL route or query param
  const voucherId = (matched && params?.id)
    ? decodeURIComponent(params.id)
    : typeof window !== "undefined"
    ? new URLSearchParams(window.location.search).get("id") ||
      new URLSearchParams(window.location.search).get("voucherId") ||
      ""
    : "";

  // Parse query params for instant fallback
  const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const fallbackAmount = searchParams?.get("amt") ? parseFloat(searchParams.get("amt")!) : undefined;
  const fallbackStore = searchParams?.get("st") || undefined;
  const fallbackCustomer = searchParams?.get("cu") || undefined;
  const fallbackDate = searchParams?.get("dt") || undefined;
  const fallbackPayment = searchParams?.get("pm") || undefined;

  useEffect(() => {
    let active = true;
    if (!voucherId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    lookupReceipt(voucherId)
      .then((data) => {
        if (!active) return;
        if (data) {
          setReceipt(data);
        } else if (fallbackAmount !== undefined || fallbackStore) {
          // Construct minimal fallback receipt from URL params
          setReceipt({
            id: voucherId,
            voucherId: voucherId,
            type: "general",
            title: "CUSTOMER DIGITAL RECEIPT (ዲጂታል ደረሰኝ)",
            subtitle: "Verified Transaction Summary",
            voucherDate: fallbackDate || new Date().toISOString(),
            storeName: fallbackStore || "Store",
            customerName: fallbackCustomer || "Customer",
            paymentMethod: fallbackPayment || "cash",
            items: [],
            subtotal: fallbackAmount || 0,
            totalAmount: fallbackAmount || 0,
            amountPaid: fallbackAmount || 0,
            brandName: getStoredBrandName(),
          });
        } else {
          setReceipt(null);
        }
      })
      .catch((err) => {
        console.error("Failed to load digital receipt:", err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [voucherId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLocation(`/receipt/${encodeURIComponent(searchQuery.trim())}`);
  };

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      const url = window.location.href;
      navigator.clipboard.writeText(url);
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Receipt link copied to your clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handlePrint = () => {
    if (receiptCardRef.current) {
      printElement(receiptCardRef.current, `Receipt_${voucherId}`);
    } else {
      window.print();
    }
  };

  const handleDownloadPdf = async () => {
    if (!receiptCardRef.current) return;
    setDownloadingPdf(true);
    try {
      await shareAsPdf(receiptCardRef.current, `Receipt_${voucherId}.pdf`);
      toast({ title: "PDF Ready", description: "Downloaded digital receipt PDF." });
    } catch (err: any) {
      toast({
        title: "PDF generation failed",
        description: err?.message || "Please use the Print option.",
        variant: "destructive",
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleDownloadImage = async () => {
    if (!receiptCardRef.current) return;
    setDownloadingImg(true);
    try {
      await shareAsImage(receiptCardRef.current, `Receipt_${voucherId}.png`);
      toast({ title: "Image Saved", description: "Receipt image downloaded." });
    } catch (err: any) {
      toast({
        title: "Image export failed",
        description: err?.message || "Please use the Print option.",
        variant: "destructive",
      });
    } finally {
      setDownloadingImg(false);
    }
  };

  const handleShare = async () => {
    if (!receipt) return;
    await shareDigitalReceipt(receipt.voucherId, window.location.href, {
      storeName: receipt.storeName,
      totalAmount: receipt.totalAmount,
    });
  };

  const fmt = (num?: number) =>
    Number(num || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-start p-3 sm:p-6 md:p-8">
      {/* Top Brand Navigation / Bar */}
      <header className="w-full max-w-2xl flex items-center justify-between mb-4 pb-2 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-black text-sm">
            <QrCode className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase">
              {receipt?.brandName || getStoredBrandName()}
            </h1>
            <p className="text-[10px] text-muted-foreground">
              Official Digital Receipt Service
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setLocation("/ecommerce")}
            className="text-xs h-7 gap-1 text-muted-foreground hover:text-foreground"
          >
            Store Front <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-2xl">
        {loading ? (
          <Card className="p-6 space-y-4">
            <div className="flex justify-center">
              <Skeleton className="h-10 w-48 rounded-lg" />
            </div>
            <Skeleton className="h-28 w-full rounded-lg" />
            <Skeleton className="h-44 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </Card>
        ) : !receipt ? (
          /* Receipt Not Found / Search Screen */
          <Card className="p-6 sm:p-8 text-center space-y-6 bg-white dark:bg-slate-900 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <Search className="w-8 h-8" />
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h2 className="text-xl font-bold">
                {voucherId ? "Receipt Not Found" : "Look Up Digital Receipt"}
              </h2>
              <p className="text-xs text-muted-foreground">
                {voucherId
                  ? `We could not find voucher "${voucherId}". Please check the voucher number or enter it below.`
                  : "Enter your voucher or transaction ID to view your official digital copy."}
              </p>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 max-w-sm mx-auto">
              <Input
                placeholder="e.g. POS-2026-0001, DS-..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-sm font-mono"
              />
              <Button type="submit" className="gap-1.5 shrink-0">
                <Search className="w-4 h-4" /> Look Up
              </Button>
            </form>

            <div className="pt-4 border-t text-xs text-muted-foreground">
              Tip: You can scan the QR code printed at the bottom of your physical paper receipt to open this page directly.
            </div>
          </Card>
        ) : (
          /* Render Complete Digital Receipt */
          <div className="space-y-4">
            {/* Customer Quick Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-white dark:bg-slate-900 border shadow-2xs">
              <div className="flex items-center gap-1.5">
                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1 py-0.5">
                  <ShieldCheck className="w-3 h-3" /> Verified Official Receipt
                </Badge>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="h-8 text-xs gap-1"
                  title="Copy link to digital receipt"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{copied ? "Copied" : "Copy Link"}</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                  className="h-8 text-xs gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{downloadingPdf ? "Exporting…" : "PDF"}</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadImage}
                  disabled={downloadingImg}
                  className="h-8 text-xs gap-1"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{downloadingImg ? "Saving…" : "Save Image"}</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePrint}
                  className="h-8 text-xs gap-1"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Print</span>
                </Button>

                <Button
                  size="sm"
                  variant="default"
                  onClick={handleShare}
                  className="h-8 text-xs gap-1"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  <span>Share</span>
                </Button>
              </div>
            </div>

            {/* Printable & Screen Digital Receipt Card */}
            <div
              ref={receiptCardRef}
              className="receipt-digital-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-7 shadow-xs space-y-5 text-slate-900 dark:text-slate-100"
            >
              {/* Receipt Header */}
              <div className="text-center pb-4 border-b border-slate-200 dark:border-slate-800 space-y-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  <Sparkles className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>{receipt.brandName}</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
                  {receipt.title}
                </h2>
                <p className="text-xs text-muted-foreground">{receipt.subtitle}</p>

                <div className="pt-2 flex items-center justify-center gap-2">
                  <span className="font-mono text-base sm:text-lg font-bold text-primary bg-primary/5 dark:bg-primary/10 px-3 py-0.5 rounded border border-primary/20">
                    {receipt.voucherId}
                  </span>
                </div>
              </div>

              {/* Transaction Metadata Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Store / Location</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">{receipt.storeName}</span>
                  {receipt.storeAddress && (
                    <div className="text-[10px] text-muted-foreground truncate">{receipt.storeAddress}</div>
                  )}
                  {receipt.storePhone && (
                    <div className="text-[10px] text-muted-foreground">{receipt.storePhone}</div>
                  )}
                </div>

                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Customer</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {receipt.customerName || "Walk-in Customer"}
                  </span>
                  {receipt.customerPhone && (
                    <div className="text-[10px] text-muted-foreground">{receipt.customerPhone}</div>
                  )}
                </div>

                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Date & Time</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {formatEthDate(receipt.voucherDate, { includeGregorian: true })}
                  </span>
                </div>

                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Payment Method</span>
                  <span className="font-semibold capitalize text-slate-800 dark:text-slate-200">
                    {receipt.paymentMethod || "Cash"}
                  </span>
                  {receipt.accountBankName && (
                    <div className="text-[10px] text-blue-600 dark:text-blue-400">
                      {receipt.accountBankName} {receipt.accountPersonName ? `(${receipt.accountPersonName})` : ""}
                    </div>
                  )}
                </div>

                {receipt.fsNumber && (
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">FS Number</span>
                    <span className="font-mono font-semibold">{receipt.fsNumber}</span>
                  </div>
                )}

                {receipt.createdByName && (
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold">Cashier / Staff</span>
                    <span className="font-medium">{receipt.createdByName}</span>
                  </div>
                )}
              </div>

              {/* Itemized Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-muted-foreground">Product</th>
                      <th className="px-3 py-2 text-center font-semibold text-muted-foreground">Qty</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Price</th>
                      <th className="px-3 py-2 text-right font-semibold text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {receipt.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground italic">
                          No item details recorded for this transaction.
                        </td>
                      </tr>
                    ) : (
                      receipt.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                          <td className="px-3 py-2.5 text-center text-muted-foreground font-mono w-8">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2">
                              {item.photoUrl ? (
                                <img
                                  src={item.photoUrl}
                                  alt={item.productName}
                                  className="w-8 h-8 rounded object-cover border shrink-0"
                                  crossOrigin="anonymous"
                                />
                              ) : null}
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-slate-100">
                                  {item.productName}
                                </div>
                                {item.productCode && (
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    {item.productCode}
                                  </div>
                                )}
                                {item.reason && (
                                  <div className="text-[10px] text-amber-600 dark:text-amber-400">
                                    Reason: {item.reason}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className="font-bold">{item.quantity}</span>
                            {item.cartons !== undefined && item.cartons > 0 && (
                              <span className="text-[10px] text-muted-foreground block">
                                ({item.cartons} ctn)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono">
                            {fmt(item.unitPrice)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                            {fmt(item.totalPrice)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Financial Totals */}
              <div className="flex flex-col items-end gap-1.5 pt-2 text-xs">
                <div className="w-full sm:w-64 space-y-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal:</span>
                    <span className="font-mono">{fmt(receipt.subtotal)} ETB</span>
                  </div>

                  {receipt.discount ? (
                    <div className="flex justify-between text-emerald-600 font-medium">
                      <span>Discount:</span>
                      <span className="font-mono">-{fmt(receipt.discount)} ETB</span>
                    </div>
                  ) : null}

                  <div className="flex justify-between text-sm font-bold text-slate-900 dark:text-slate-100 pt-1 border-t">
                    <span>Total Amount:</span>
                    <span className="font-mono text-primary">{fmt(receipt.totalAmount)} ETB</span>
                  </div>

                  {receipt.amountPaid !== undefined && (
                    <div className="flex justify-between text-emerald-700 dark:text-emerald-400 font-medium pt-1 border-t">
                      <span>Amount Paid:</span>
                      <span className="font-mono">{fmt(receipt.amountPaid)} ETB</span>
                    </div>
                  )}

                  {receipt.remainingBalance !== undefined && receipt.remainingBalance > 0 && (
                    <div className="flex justify-between text-rose-600 font-bold">
                      <span>Remaining Balance:</span>
                      <span className="font-mono">{fmt(receipt.remainingBalance)} ETB</span>
                    </div>
                  )}
                </div>

                {receipt.customerTotalBalance !== undefined && receipt.customerTotalBalance > 0 && (
                  <div className="text-[11px] text-rose-600 font-medium pt-1">
                    Customer Total Outstanding Account Balance:{" "}
                    <span className="font-bold">{fmt(receipt.customerTotalBalance)} ETB</span>
                  </div>
                )}
              </div>

              {/* Remark */}
              {receipt.remark && (
                <div className="p-3 bg-muted/40 rounded-lg text-xs space-y-0.5 border">
                  <span className="font-semibold text-muted-foreground">Remark / Note:</span>
                  <p className="text-slate-800 dark:text-slate-200">{receipt.remark}</p>
                </div>
              )}

              {/* Reference Photo if attached */}
              {receipt.referencePhotoUrl && (
                <div className="border rounded-xl p-3 space-y-2 bg-slate-50/50 dark:bg-slate-800/30">
                  <span className="text-xs font-semibold text-muted-foreground block">
                    Attached Photo Proof (የተያያዘ ፎቶ)
                  </span>
                  <img
                    src={receipt.referencePhotoUrl}
                    alt="Receipt Reference"
                    className="max-h-64 rounded-lg object-contain mx-auto border"
                    crossOrigin="anonymous"
                  />
                </div>
              )}

              {/* Verification Stamp & QR Code Bottom Box */}
              <div className="border-t pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-1.5 bg-white rounded-lg border shadow-2xs">
                    <QRCodeSVG
                      value={buildDigitalReceiptUrl(receipt.voucherId)}
                      size={64}
                      level="M"
                    />
                  </div>
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Verified Digital Record</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Scannable digital twin for return checks & audits.
                    </p>
                    <p className="text-[9px] font-mono text-muted-foreground">
                      ID: {receipt.voucherId}
                    </p>
                  </div>
                </div>

                <div className="text-center sm:text-right text-[10px] text-muted-foreground space-y-0.5">
                  <p className="font-medium text-slate-700 dark:text-slate-300">
                    Thank you for your business! (ስለመረጡን እናመሰግናለን!)
                  </p>
                  <p>{receipt.brandName} • Electronic Receipt System</p>
                  {receipt.checkedBy && (
                    <p className="text-emerald-600">Audited by: {receipt.checkedBy}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="w-full max-w-2xl text-center mt-8 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs text-muted-foreground space-y-1">
        <p>© {new Date().getFullYear()} {getStoredBrandName()} Management System</p>
        <p className="text-[10px]">
          Digital copies are generated in real-time and remain accessible 24/7.
        </p>
      </footer>
    </div>
  );
}
