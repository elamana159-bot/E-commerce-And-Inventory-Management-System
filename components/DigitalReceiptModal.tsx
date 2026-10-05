import React, { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  QrCode,
  Smartphone,
  ExternalLink,
  Copy,
  Check,
  Download,
  Share2,
  CheckCircle2,
  Receipt,
  MessageCircle,
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
import { Badge } from "@/components/ui/badge";
import { buildDigitalReceiptUrl, downloadQrCodePng, shareDigitalReceipt } from "@/lib/qrReceiptUtils";
import { useToast } from "@/hooks/use-toast";

export interface DigitalReceiptModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  voucherId: string;
  voucherTitle?: string;
  totalAmount?: number;
  customerName?: string;
  storeName?: string;
  voucherDate?: string;
}

export function DigitalReceiptModal({
  open,
  onOpenChange,
  voucherId,
  voucherTitle = "Digital Receipt",
  totalAmount,
  customerName,
  storeName,
  voucherDate,
}: DigitalReceiptModalProps) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const digitalUrl = buildDigitalReceiptUrl(voucherId, {
    voucherId,
    totalAmount,
    customerName,
    storeName,
    voucherDate,
  });

  const handleCopyLink = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(digitalUrl);
      setCopied(true);
      toast({
        title: "Link Copied!",
        description: "Customer can open this link to view their digital receipt.",
      });
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleOpenReceipt = () => {
    if (typeof window !== "undefined") {
      window.open(`/receipt/${encodeURIComponent(voucherId)}`, "_blank");
    }
  };

  const handleDownloadPng = async () => {
    if (!svgRef.current) return;
    setDownloading(true);
    try {
      const ok = await downloadQrCodePng(svgRef.current, `qr-${voucherId}.png`);
      if (ok) {
        toast({
          title: "QR Code Downloaded",
          description: `Saved as qr-${voucherId}.png for printing or signage.`,
        });
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Hello ${customerName || "Customer"}, here is your digital receipt for Voucher #${voucherId}${
        totalAmount !== undefined ? ` (Total: ${Number(totalAmount).toLocaleString()} ETB)` : ""
      }:\n${digitalUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, "_blank");
  };

  const handleShareGeneral = async () => {
    await shareDigitalReceipt(voucherId, digitalUrl, {
      storeName,
      totalAmount,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md flex flex-col items-center text-center p-6 gap-4">
        <DialogHeader className="items-center space-y-1.5">
          <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mx-auto">
            <QrCode className="w-6 h-6" />
          </div>
          <DialogTitle className="text-xl font-bold">
            Customer Digital Receipt QR
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Allow customer to scan with their smartphone camera for an instant digital copy.
          </DialogDescription>
        </DialogHeader>

        {/* Voucher Tag */}
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 font-bold">
            {voucherId}
          </Badge>
          {totalAmount !== undefined && (
            <Badge className="bg-emerald-600 text-white text-xs px-2 py-0.5">
              {Number(totalAmount).toLocaleString()} ETB
            </Badge>
          )}
        </div>

        {/* High-Resolution QR Code */}
        <div className="p-4 bg-white rounded-2xl border-2 border-indigo-100 dark:border-indigo-900/60 shadow-md">
          <QRCodeSVG
            ref={svgRef}
            value={digitalUrl}
            size={210}
            level="H"
            includeMargin={true}
            className="rounded-lg"
          />
        </div>

        {/* Instructions */}
        <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400 max-w-xs">
          <p className="font-medium text-slate-900 dark:text-slate-100 flex items-center justify-center gap-1.5">
            <Smartphone className="w-4 h-4 text-indigo-600" />
            Scan with any mobile camera (በሞባይል ካሜራ ይቃኙ)
          </p>
          <p className="text-[11px] text-muted-foreground">
            Opens the verified digital receipt with full item breakdown, totals, and download options.
          </p>
        </div>

        {/* Link Bar */}
        <div className="w-full flex items-center gap-2 p-1.5 rounded-lg border bg-slate-50 dark:bg-slate-900 text-xs">
          <input
            type="text"
            readOnly
            value={digitalUrl}
            className="flex-1 bg-transparent px-2 text-[11px] font-mono text-slate-600 dark:text-slate-300 outline-hidden select-all truncate"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyLink}
            className="h-7 px-2.5 text-xs gap-1 shrink-0 font-medium"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied!" : "Copy"}
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="w-full grid grid-cols-2 gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenReceipt}
            className="h-9 text-xs gap-1.5"
          >
            <ExternalLink className="w-3.5 h-3.5 text-primary" />
            Open Digital Copy
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPng}
            disabled={downloading}
            className="h-9 text-xs gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {downloading ? "Saving…" : "Save QR (PNG)"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleShareWhatsApp}
            className="h-9 text-xs gap-1.5 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Send via WhatsApp
          </Button>

          <Button
            variant="default"
            size="sm"
            onClick={handleShareGeneral}
            className="h-9 text-xs gap-1.5"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share Link
          </Button>
        </div>

        <DialogFooter className="w-full sm:justify-center border-t pt-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs text-muted-foreground"
          >
            Close Window
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
