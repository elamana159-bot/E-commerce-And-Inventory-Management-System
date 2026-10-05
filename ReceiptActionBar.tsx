import React, { useState, useEffect } from "react";
import {
  Share2,
  FileText,
  FileSpreadsheet,
  Printer,
  Loader2,
  Image as ImageIcon,
  ChevronRight,
  CheckCircle2,
  Save,
  Database,
  HardDrive,
  QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { shareReceiptWithReference, shareAsPdf, shareAsImage } from "./shareImage";
import { useToast } from "@/hooks/use-toast";
import {
  saveReceiptToLocalDb,
  isReceiptSavedInLocalDb,
  SAVED_RECEIPTS_EVENT,
} from "@/lib/savedReceipts";
import { SavedReceiptsModal } from "@/components/SavedReceiptsModal";
import { DigitalReceiptModal } from "@/components/DigitalReceiptModal";

export interface ReceiptActionBarProps {
  onPrint?: () => void;
  onShare?: () => void;
  onSharePdf?: () => void;
  onExportExcel?: () => void;
  onSave?: () => void;
  receiptRef?: React.RefObject<HTMLElement | null>;
  referencePhotoUrl?: string;
  voucherId?: string;
  voucherTitle?: string;
  voucherSubtitle?: string;
  filenamePrefix?: string;
  sharing?: boolean;
  sharingPdf?: boolean;
  exportingExcel?: boolean;
  disabled?: boolean;
  className?: string;
  documentType?: "receipt" | "statement" | "report" | "voucher";
  saveData?: Record<string, any>;
  showSaveButton?: boolean;
  showQrButton?: boolean;
  totalAmount?: number;
  customerName?: string;
  storeName?: string;
  voucherDate?: string;
}

export function ReceiptActionBar({
  onPrint,
  onShare,
  onSharePdf,
  onExportExcel,
  onSave,
  receiptRef,
  referencePhotoUrl,
  voucherId = "voucher",
  voucherTitle = "RECEIPT VOUCHER",
  voucherSubtitle = "",
  filenamePrefix = "voucher",
  sharing,
  sharingPdf,
  exportingExcel,
  disabled,
  className,
  documentType,
  saveData,
  showSaveButton = true,
  showQrButton = true,
  totalAmount,
  customerName,
  storeName,
  voucherDate,
}: ReceiptActionBarProps) {
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [activeFormat, setActiveFormat] = useState<"pdf" | "image">("pdf");
  const [internalBusy, setInternalBusy] = useState<string | null>(null);

  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Check on mount and on voucherId update if this receipt is already saved locally
  useEffect(() => {
    let active = true;
    if (voucherId) {
      isReceiptSavedInLocalDb(voucherId).then((saved) => {
        if (active) setIsSaved(saved);
      });
    } else {
      setIsSaved(false);
    }
    return () => {
      active = false;
    };
  }, [voucherId]);

  // Listen for local db updates (e.g. if deleted or updated)
  useEffect(() => {
    const handler = () => {
      if (voucherId) {
        isReceiptSavedInLocalDb(voucherId).then((saved) => {
          setIsSaved(saved);
        });
      }
    };
    window.addEventListener(SAVED_RECEIPTS_EVENT, handler);
    return () => window.removeEventListener(SAVED_RECEIPTS_EVENT, handler);
  }, [voucherId]);

  const hasReferencePhoto = Boolean(referencePhotoUrl && referencePhotoUrl.trim().length > 0);
  const isBusy = Boolean(sharing || sharingPdf || exportingExcel || internalBusy || isSaving);
  const btnClass = "flex-1 sm:flex-none justify-center h-8 px-2 sm:px-3 text-xs font-semibold min-w-0 sm:min-w-[85px] transition-all";

  // Trigger Save to Local Database flow
  const handleSaveClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isSaving) return;

    if (onSave) {
      onSave();
    }

    setIsSaving(true);
    try {
      await saveReceiptToLocalDb({
        receiptElement: receiptRef?.current,
        voucherId,
        voucherTitle,
        voucherSubtitle,
        filenamePrefix,
        referencePhotoUrl,
        type: documentType,
        data: saveData,
      });

      setIsSaved(true);
      toast({
        title: "Saved to Local Database! (በሎካል ዳታቤዝ ተቀምጧል)",
        description: `${voucherTitle} (${voucherId}) has been saved to your offline device storage.`,
      });
    } catch (err: any) {
      toast({
        title: "Save failed",
        description: err?.message || "Could not save to local database.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Trigger PDF flow directly (no popup)
  const handlePdfClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy || disabled) return;

    if (onSharePdf) {
      onSharePdf();
    } else if (receiptRef?.current) {
      runExport("pdf", false);
    }
  };

  // Trigger Share Image flow directly: directly share the receipt immediately without popup
  const handleShareClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isBusy || disabled) return;

    if (onShare) {
      onShare();
    } else if (receiptRef?.current) {
      runExport("image", false);
    }
  };

  const runExport = async (format: "pdf" | "image", includeRefPhoto: boolean) => {
    if (!includeRefPhoto) {
      if (format === "pdf" && onSharePdf) {
        setModalOpen(false);
        onSharePdf();
        return;
      }
      if (format === "image" && onShare) {
        setModalOpen(false);
        onShare();
        return;
      }
    }

    if (!receiptRef?.current) return;
    const taskLabel = format === "pdf"
      ? (includeRefPhoto ? "Generating 2-Page PDF with Photo…" : "Generating PDF…")
      : (includeRefPhoto ? "Sharing Image with Photo…" : "Sharing Image…");

    setInternalBusy(taskLabel);
    try {
      const res = await shareReceiptWithReference({
        receiptElement: receiptRef.current,
        referencePhotoUrl: includeRefPhoto ? referencePhotoUrl : undefined,
        voucherId,
        voucherTitle,
        voucherSubtitle,
        filenamePrefix,
        format,
        includeReferencePhoto: includeRefPhoto,
      });

      if (res === "failed") {
        toast({
          title: "Export failed",
          description: "Could not generate or share the document. Please try again.",
          variant: "destructive",
        });
      } else if (res === "shared") {
        toast({
          title: "Shared successfully",
          description: includeRefPhoto ? "Receipt & Reference Photo shared" : "Receipt shared",
        });
        setModalOpen(false);
      } else {
        toast({
          title: "Downloaded successfully",
          description: `${format.toUpperCase()} saved to your device.`,
        });
        setModalOpen(false);
      }
    } catch (err: any) {
      toast({
        title: "Export error",
        description: err?.message || "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setInternalBusy(null);
    }
  };

  return (
    <>
      <div className={`flex items-center gap-1.5 sm:gap-2 w-full sm:w-auto flex-wrap sm:flex-nowrap ${className || ""}`}>
        {onExportExcel && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isBusy || disabled) return;
              onExportExcel();
            }}
            disabled={disabled || isBusy}
            className={btnClass}
            data-testid="button-export-excel"
          >
            {exportingExcel ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-emerald-600" />
            ) : (
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            )}
            {exportingExcel ? "Exporting…" : "Excel"}
          </Button>
        )}

        {(onSharePdf || receiptRef) && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handlePdfClick}
            disabled={disabled || isBusy}
            className={btnClass}
            data-testid="button-share-pdf"
          >
            {sharingPdf || internalBusy?.includes("PDF") ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-red-600" />
            ) : (
              <FileText className="w-3.5 h-3.5 mr-1 text-red-600" />
            )}
            {sharingPdf || internalBusy?.includes("PDF") ? "Generating…" : "PDF"}
          </Button>
        )}

        {(onShare || receiptRef) && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleShareClick}
            disabled={disabled || isBusy}
            className={btnClass}
            data-testid="button-share"
          >
            {sharing || internalBusy?.includes("Image") ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-blue-600" />
            ) : (
              <Share2 className="w-3.5 h-3.5 mr-1 text-blue-600" />
            )}
            {sharing || internalBusy?.includes("Image") ? "Sharing…" : "Share"}
          </Button>
        )}

        {hasReferencePhoto && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isBusy || disabled) return;
              setActiveFormat("image");
              setModalOpen(true);
            }}
            disabled={disabled || isBusy}
            className={`${btnClass} text-primary border-primary/40 hover:bg-primary/10`}
            title="Export or share receipt with attached reference photo (ከነ ማጣቀሻ ፎቶው)"
          >
            <ImageIcon className="w-3.5 h-3.5 mr-1 text-primary" />
            + Photo
          </Button>
        )}

        {onPrint && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (isBusy || disabled) return;
              onPrint();
            }}
            disabled={disabled || isBusy}
            className={btnClass}
            data-testid="button-print"
          >
            <Printer className="w-3.5 h-3.5 mr-1 text-slate-700 dark:text-slate-200" /> Print
          </Button>
        )}

        {/* Customer QR Code Button: Generates & Displays Scannable Digital Receipt QR */}
        {showQrButton && voucherId && voucherId !== "voucher" && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setQrModalOpen(true);
            }}
            disabled={disabled}
            className={`${btnClass} text-indigo-700 dark:text-indigo-400 border-indigo-400/40 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-semibold`}
            title="Display Customer Digital Receipt QR Code (የደንበኛ ዲጂታል ደረሰኝ QR)"
            data-testid="button-receipt-qr"
          >
            <QrCode className="w-3.5 h-3.5 mr-1 text-indigo-600 dark:text-indigo-400" />
            QR Code
          </Button>
        )}

        {/* Save Button: Stores Receipt / Statement to Local IndexedDB Database */}
        {showSaveButton && (
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={handleSaveClick}
            disabled={disabled || isSaving}
            className={`${btnClass} ${
              isSaved
                ? "border-emerald-500/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-600/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 font-bold"
                : "text-emerald-700 dark:text-emerald-400 border-emerald-600/40 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 font-semibold"
            }`}
            title="Save this receipt or statement to browser Local Database (በሎካል ዳታቤዝ አስቀምጥ)"
            data-testid="button-save-local"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin text-emerald-600" />
            ) : isSaved ? (
              <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-1 text-emerald-600 dark:text-emerald-400" />
            )}
            {isSaving ? "Saving…" : isSaved ? "Saved" : "Save"}
          </Button>
        )}

        {/* Saved Docs Button: Open Local Database Archive */}
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSavedModalOpen(true);
          }}
          className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground hidden sm:inline-flex items-center gap-1 shrink-0"
          title="View all receipts and statements saved in Local Database (የተቀመጡ ሰነዶች ዝርዝር)"
          data-testid="button-saved-archive"
        >
          <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-[11px] font-medium">Saved Docs</span>
        </Button>
      </div>

      {/* Choice Prompt Dialog: With or Without Reference Photo */}
      <Dialog open={modalOpen} onOpenChange={(open) => { if (!internalBusy) setModalOpen(open); }}>
        <DialogContent className="max-w-md p-5 sm:p-6">
          <DialogHeader className="space-y-1.5 text-left">
            <div className="flex items-center gap-2 text-primary">
              {activeFormat === "pdf" ? <FileText className="w-5 h-5 text-red-600" /> : <Share2 className="w-5 h-5 text-blue-600" />}
              <DialogTitle className="text-base sm:text-lg font-bold">
                {activeFormat === "pdf" ? "Export to PDF (ፒዲኤፍ አውርድ / አጋራ)" : "Share Image (ፎቶ አጋራ / አውርድ)"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Voucher: <span className="font-mono font-semibold text-foreground">{voucherId}</span> • Reference Document Attached
            </DialogDescription>
          </DialogHeader>

          {/* Quick Notice Banner */}
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
            <ImageIcon className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold">ማጣቀሻ ሰነድ ተያይዟል (Reference Document Attached)</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                ደረሰኙን ብቻ ወይስ ከነ ማጣቀሻ ፎቶው ጋር ማጋራት / Export ማድረግ ይፈልጋሉ?
              </p>
            </div>
          </div>

          {/* Format Switcher: PDF vs Image */}
          <div className="flex rounded-lg bg-muted p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveFormat("pdf")}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
                activeFormat === "pdf"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-red-600" />
              PDF Document
            </button>
            <button
              type="button"
              onClick={() => setActiveFormat("image")}
              className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all ${
                activeFormat === "image"
                  ? "bg-card text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Share2 className="w-3.5 h-3.5 text-blue-600" />
              Image (PNG)
            </button>
          </div>

          {/* 2 Main Choice Cards */}
          <div className="space-y-3 pt-1">
            {/* Option 1: Receipt Only */}
            <button
              type="button"
              disabled={Boolean(internalBusy)}
              onClick={() => runExport(activeFormat, false)}
              className="w-full text-left p-3.5 rounded-xl border-2 border-border hover:border-primary/60 bg-card hover:bg-accent/40 transition-all flex items-center justify-between gap-3 group focus:outline-hidden focus:ring-2 focus:ring-primary/20 min-h-[60px]"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">📄</span>
                  <span className="font-semibold text-sm text-foreground group-hover:text-primary">
                    ደረሰኝ ብቻ (Receipt Only)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  {activeFormat === "pdf"
                    ? "መደበኛ የደረሰኝ ፒዲኤፍ (ያለ ማጣቀሻ ፎቶ)"
                    : "መደበኛ የደረሰኝ ፎቶ (ያለ ማጣቀሻ ፎቶ)"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-transform group-hover:translate-x-0.5 shrink-0" />
            </button>

            {/* Option 2: Receipt + Reference Photo */}
            <button
              type="button"
              disabled={Boolean(internalBusy)}
              onClick={() => runExport(activeFormat, true)}
              className="w-full text-left p-3.5 rounded-xl border-2 border-primary/50 bg-primary/5 hover:bg-primary/10 hover:border-primary transition-all flex items-center justify-between gap-3 group focus:outline-hidden focus:ring-2 focus:ring-primary min-h-[60px]"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">📑</span>
                  <span className="font-bold text-sm text-primary">
                    ከነ ማጣቀሻ ፎቶው ጋር (With Reference Photo)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground pl-6">
                  {activeFormat === "pdf"
                    ? "ደረሰኝ እና ማጣቀሻ ሰነድ ጎን ለጎን በወርድ (Landscape PDF Document)"
                    : "ደረሰኝ እና ማጣቀሻ ጎን ለጎን በአንድ ፎቶ (Side-by-Side: ያለ ተጨማሪ ዳራ)"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-primary transition-transform group-hover:translate-x-0.5 shrink-0" />
            </button>
          </div>

          {/* Reference Photo Thumbnail Preview */}
          {referencePhotoUrl && (
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/40 border text-xs">
              <img
                src={referencePhotoUrl}
                alt="Reference proof"
                className="w-12 h-12 rounded object-cover border bg-background shrink-0"
                crossOrigin="anonymous"
              />
              <div className="overflow-hidden">
                <p className="font-medium text-foreground truncate">Attached Proof Document</p>
                <p className="text-[11px] text-muted-foreground">ፎቶው በከፍተኛ ጥራት በሰነዱ ውስጥ ይካተታል</p>
              </div>
            </div>
          )}

          {internalBusy && (
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center gap-2 text-xs font-medium text-primary">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{internalBusy}</span>
            </div>
          )}

          <DialogFooter className="sm:justify-between pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setModalOpen(false)}
              disabled={Boolean(internalBusy)}
            >
              Cancel (ሰርዝ)
            </Button>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <span>Supports Mobile (WhatsApp/Telegram), PC & Tablets</span>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Saved Receipts & Statements Local Database Archive Modal */}
      <SavedReceiptsModal
        open={savedModalOpen}
        onOpenChange={setSavedModalOpen}
        highlightVoucherId={voucherId}
      />

      {/* Customer Digital Receipt QR Modal */}
      <DigitalReceiptModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        voucherId={voucherId}
        voucherTitle={voucherTitle}
        totalAmount={totalAmount ?? saveData?.totalAmount}
        customerName={customerName ?? saveData?.customerName}
        storeName={storeName ?? saveData?.storeName}
        voucherDate={voucherDate ?? saveData?.voucherDate}
      />
    </>
  );
}
