import React, { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Database,
  Search,
  Printer,
  Trash2,
  Eye,
  FileText,
  Calendar,
  X,
  FileSpreadsheet,
  CheckCircle2,
  HardDrive,
  Cloud,
  Clock,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import {
  SavedReceiptRecord,
  getSavedReceiptsFromLocalDb,
  deleteSavedReceiptFromLocalDb,
  clearAllSavedReceiptsFromLocalDb,
  SAVED_RECEIPTS_EVENT,
} from "@/lib/savedReceipts";
import { printElement } from "@/lib/printUtils";
import { useToast } from "@/hooks/use-toast";

interface SavedReceiptsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Highlight or scroll to a specific voucher if requested */
  highlightVoucherId?: string;
}

export function SavedReceiptsModal({ open, onOpenChange, highlightVoucherId }: SavedReceiptsModalProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<SavedReceiptRecord[]>([]);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<"all" | "receipt" | "statement" | "report">("all");
  const [previewItem, setPreviewItem] = useState<SavedReceiptRecord | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const loadItems = async () => {
    const list = await getSavedReceiptsFromLocalDb();
    setItems(list);
  };

  useEffect(() => {
    if (open) {
      loadItems();
    }
  }, [open]);

  // Listen for background updates
  useEffect(() => {
    const handler = () => {
      loadItems();
    };
    window.addEventListener(SAVED_RECEIPTS_EVENT, handler);
    return () => window.removeEventListener(SAVED_RECEIPTS_EVENT, handler);
  }, []);

  const handleDelete = async (id: string, voucherId: string) => {
    await deleteSavedReceiptFromLocalDb(id);
    toast({
      title: "Removed Document",
      description: `Receipt ${voucherId} was removed.`,
    });
    if (previewItem?.id === id) {
      setPreviewItem(null);
    }
    loadItems();
  };

  const handleClearAll = async () => {
    await clearAllSavedReceiptsFromLocalDb();
    setConfirmClear(false);
    setPreviewItem(null);
    toast({
      title: "Documents Cleared",
      description: "All saved receipts and statements have been cleared.",
    });
    loadItems();
  };

  const handlePrintItem = (item: SavedReceiptRecord) => {
    if (previewRef.current) {
      printElement(previewRef.current, item.voucherId || "saved_receipt");
    } else {
      // Create temporary element to print
      const div = document.createElement("div");
      div.innerHTML = item.htmlContent || `<div style="padding:20px;"><h2>${item.voucherTitle}</h2><p>${item.voucherId}</p><pre>${item.textContent || ""}</pre></div>`;
      document.body.appendChild(div);
      printElement(div, item.voucherId || "saved_receipt");
      document.body.removeChild(div);
    }
  };

  const filteredItems = items.filter((item) => {
    if (selectedType !== "all" && item.type !== selectedType) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (item.voucherId && item.voucherId.toLowerCase().includes(q)) ||
      (item.voucherTitle && item.voucherTitle.toLowerCase().includes(q)) ||
      (item.voucherSubtitle && item.voucherSubtitle.toLowerCase().includes(q)) ||
      (item.ethiopianDate && item.ethiopianDate.toLowerCase().includes(q)) ||
      (item.textContent && item.textContent.toLowerCase().includes(q))
    );
  });

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "statement":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200 border border-blue-200 dark:border-blue-700">Statement (ስቴትመንት)</span>;
      case "report":
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-100 text-purple-800 dark:bg-purple-900/60 dark:text-purple-200 border border-purple-200 dark:border-purple-700">Report (ሪፖርት)</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-700">Receipt (ደረሰኝ)</span>;
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="p-4 sm:p-5 border-b bg-muted/30">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                    <span>Saved Receipts & Statements</span>
                    <span className="text-xs font-normal text-muted-foreground">
                      (የተቀመጡ ሰነዶች)
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <Cloud className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Saved in Cloud Firestore · Shared across devices</span>
                    <span className="inline-block w-1 h-1 rounded-full bg-muted-foreground" />
                    <span className="font-semibold text-foreground">{items.length} saved</span>
                  </DialogDescription>
                </div>
              </div>

              {items.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmClear(true)}
                    className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear All
                  </Button>
                </div>
              )}
            </div>

            {/* Search and Filters */}
            <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by Voucher #, Title, Customer, Date... (ፈልግ)"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedType("all")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    selectedType === "all" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({items.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("receipt")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    selectedType === "receipt" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Receipts ({items.filter((i) => i.type === "receipt" || i.type === "voucher").length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("statement")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    selectedType === "statement" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Statements ({items.filter((i) => i.type === "statement").length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedType("report")}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    selectedType === "report" ? "bg-background text-foreground shadow-xs font-semibold" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Reports ({items.filter((i) => i.type === "report").length})
                </button>
              </div>
            </div>
          </DialogHeader>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[300px]">
            {filteredItems.length === 0 ? (
              <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Database className="w-6 h-6 text-muted-foreground/60" />
                </div>
                <h4 className="text-sm font-semibold text-foreground">
                  {search ? "No matching saved documents found" : "No saved receipts or statements yet"}
                </h4>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  {search
                    ? `Try searching with a different voucher number or title.`
                    : "When viewing any Receipt or Statement, click the 'Save' button in the toolbar to store it in Cloud Firestore."}
                </p>
              </div>
            ) : (
              filteredItems.map((item) => {
                const isHighlighted = highlightVoucherId && item.voucherId === highlightVoucherId;
                return (
                  <div
                    key={item.id}
                    className={`p-3 sm:p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isHighlighted
                        ? "bg-emerald-500/10 border-emerald-500/40 shadow-xs"
                        : "bg-card hover:bg-muted/30 border-border/70"
                    }`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getTypeBadge(item.type)}
                        <span className="font-mono font-bold text-xs text-foreground">
                          {item.voucherId}
                        </span>
                        <span className="text-[11px] font-medium text-muted-foreground">
                          • {item.voucherTitle}
                        </span>
                        {item.referencePhotoUrl && (
                          <span className="inline-flex items-center gap-1 text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                            <Sparkles className="w-3 h-3" /> Photo
                          </span>
                        )}
                      </div>

                      {item.voucherSubtitle && (
                        <div className="text-xs text-muted-foreground truncate">
                          {item.voucherSubtitle}
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.savedAtFormatted}
                        </span>
                        {item.ethiopianDate && (
                          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                            <Calendar className="w-3 h-3" />
                            {item.ethiopianDate}
                          </span>
                        )}
                        <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold text-[10px]">
                          <CheckCircle2 className="w-3 h-3" /> Stored in Cloud
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPreviewItem(item)}
                        className="h-7 px-2.5 text-xs gap-1"
                        title="View rendered receipt snapshot"
                      >
                        <Eye className="w-3.5 h-3.5 text-blue-600" />
                        Preview
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePrintItem(item)}
                        className="h-7 px-2.5 text-xs gap-1"
                        title="Print saved receipt"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        Print
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(item.id, item.voucherId)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        title="Delete document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <DialogFooter className="p-3 border-t bg-muted/20 flex flex-row items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Total {filteredItems.length} document(s) in device memory
            </span>
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} className="h-8 text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {previewItem && (
        <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) setPreviewItem(null); }}>
          <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
            <DialogHeader className="p-3 sm:p-4 border-b bg-muted/30 flex flex-row items-center justify-between">
              <div className="space-y-0.5">
                <DialogTitle className="text-sm sm:text-base font-bold flex items-center gap-2">
                  <span>{previewItem.voucherTitle}</span>
                  <span className="font-mono text-xs font-normal text-muted-foreground">({previewItem.voucherId})</span>
                </DialogTitle>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>Saved: {previewItem.savedAtFormatted}</span>
                  {previewItem.ethiopianDate && <span>• {previewItem.ethiopianDate}</span>}
                </div>
              </div>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-900/60">
              <div
                ref={previewRef}
                className="bg-white text-slate-900 rounded-lg p-4 sm:p-6 shadow-xs max-w-2xl mx-auto border border-slate-200"
              >
                {previewItem.htmlContent ? (
                  <div
                    dangerouslySetInnerHTML={{ __html: previewItem.htmlContent }}
                    className="saved-receipt-render"
                  />
                ) : (
                  <div className="space-y-4">
                    <div className="border-b pb-2">
                      <h2 className="text-lg font-bold">{previewItem.voucherTitle}</h2>
                      <div className="font-mono text-sm text-slate-600">{previewItem.voucherId}</div>
                      {previewItem.voucherSubtitle && (
                        <div className="text-xs text-slate-500 mt-1">{previewItem.voucherSubtitle}</div>
                      )}
                    </div>
                    {previewItem.textContent && (
                      <pre className="text-xs whitespace-pre-wrap font-mono bg-slate-50 p-3 rounded border">
                        {previewItem.textContent}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="p-3 border-t bg-background flex flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => handlePrintItem(previewItem)}
                  className="h-8 text-xs gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> Print
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(previewItem.id, previewItem.voucherId)}
                  className="h-8 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                </Button>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPreviewItem(null)}
                className="h-8 text-xs"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Confirm Clear All Dialog */}
      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" /> Clear All Saved Documents?
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              This will remove all {items.length} saved receipts and statements from your database. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 pt-3">
            <Button variant="outline" size="sm" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleClearAll}>
              Yes, Clear All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
