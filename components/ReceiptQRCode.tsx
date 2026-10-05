import React, { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode, Smartphone, ExternalLink, Copy, Check, Sparkles } from "lucide-react";
import { buildDigitalReceiptUrl, downloadQrCodePng, ReceiptQrPayloadData } from "@/lib/qrReceiptUtils";
import { useToast } from "@/hooks/use-toast";

export interface ReceiptQRCodeProps {
  voucherId: string;
  voucherData?: Partial<ReceiptQrPayloadData>;
  size?: number;
  className?: string;
  showCaption?: boolean;
  showLink?: boolean;
  compact?: boolean;
  align?: "center" | "left" | "right";
}

export function ReceiptQRCode({
  voucherId,
  voucherData,
  size = 100,
  className = "",
  showCaption = true,
  showLink = false,
  compact = false,
  align = "center",
}: ReceiptQRCodeProps) {
  const { toast } = useToast();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [copied, setCopied] = useState(false);

  if (!voucherId) return null;

  const url = buildDigitalReceiptUrl(voucherId, {
    voucherId,
    totalAmount: voucherData?.totalAmount,
    voucherDate: voucherData?.voucherDate,
    storeName: voucherData?.storeName,
    customerName: voucherData?.customerName,
    paymentMethod: voucherData?.paymentMethod,
    itemsCount: voucherData?.itemsCount,
    type: voucherData?.type,
  });

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopied(true);
      toast({
        title: "Digital Receipt Link Copied!",
        description: `Link for ${voucherId} copied to clipboard.`,
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleOpenDigital = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof window !== "undefined") {
      window.open(`/receipt/${encodeURIComponent(voucherId)}`, "_blank");
    }
  };

  const alignClass =
    align === "left"
      ? "items-start text-left"
      : align === "right"
      ? "items-end text-right"
      : "items-center text-center";

  if (compact) {
    return (
      <div className={`inline-flex flex-col items-center gap-1 p-1 bg-white text-slate-900 rounded ${className}`}>
        <QRCodeSVG
          ref={svgRef}
          value={url}
          size={size}
          level="M"
          includeMargin={false}
          className="rounded"
        />
        <span className="text-[9px] font-mono font-bold tracking-tight text-slate-700">
          SCAN RECEIPT
        </span>
      </div>
    );
  }

  return (
    <div
      className={`receipt-qr-container flex flex-col ${alignClass} gap-1.5 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-800/80 bg-slate-50/60 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 transition-colors ${className}`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
        <Smartphone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span>Digital Receipt (ዲጂታል ደረሰኝ)</span>
      </div>

      <div
        onClick={handleOpenDigital}
        className="cursor-pointer p-2 bg-white rounded-md shadow-2xs border border-slate-200 hover:border-indigo-400 hover:shadow-xs transition-all relative group"
        title="Click to preview Customer Digital Receipt"
      >
        <QRCodeSVG
          ref={svgRef}
          value={url}
          size={size}
          level="M"
          includeMargin={false}
          className="rounded"
        />
        <div className="absolute inset-0 bg-indigo-900/10 opacity-0 group-hover:opacity-100 rounded-md flex items-center justify-center transition-opacity">
          <ExternalLink className="w-5 h-5 text-indigo-700 drop-shadow-sm" />
        </div>
      </div>

      {showCaption && (
        <div className="space-y-0.5 text-center">
          <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400">
            Scan with smartphone camera to view copy
          </p>
          <p className="text-[9px] font-mono text-slate-400">
            {voucherId}
          </p>
        </div>
      )}

      {showLink && (
        <div className="flex items-center gap-1 mt-0.5">
          <button
            type="button"
            onClick={handleCopyLink}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200"
          >
            {copied ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
            {copied ? "Copied" : "Copy Link"}
          </button>
          <button
            type="button"
            onClick={handleOpenDigital}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded border border-indigo-200 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100"
          >
            <ExternalLink className="w-2.5 h-2.5" />
            View
          </button>
        </div>
      )}
    </div>
  );
}
