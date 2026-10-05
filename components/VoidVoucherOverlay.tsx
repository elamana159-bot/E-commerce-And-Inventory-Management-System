import React from "react";
import { formatEthDate } from "@/lib/ethiopianCalendar";

export interface VoidVoucherOverlayProps {
  isVoided?: boolean;
  voidedAt?: string | Date;
  voidReason?: string;
  voidedBy?: string;
  className?: string;
}

/**
 * High-visibility red strikethrough lines and official stamp for voided vouchers.
 * Renders bold red diagonal cross-lines, red horizontal strikethroughs,
 * and an official "VOIDED / ተሰርዟል" watermark stamp across the entire voucher.
 * Fully compatible with screen display, print, PDF, and image export.
 */
export function VoidVoucherOverlay({
  isVoided = true,
  voidedAt,
  voidReason,
  voidedBy,
  className = "",
}: VoidVoucherOverlayProps) {
  if (!isVoided) return null;

  const dateStr = voidedAt
    ? formatEthDate(voidedAt, { includeGregorian: true })
    : "";

  return (
    <div
      className={`absolute inset-0 pointer-events-none z-30 overflow-hidden select-none flex flex-col justify-between ${className}`}
      style={{
        printColorAdjust: "exact",
        WebkitPrintColorAdjust: "exact",
      }}
      data-testid="void-voucher-overlay"
    >
      {/* 1. Top Formal Red Warning Ribbon */}
      <div className="bg-red-600 text-white text-center py-1 px-3 shadow-sm border-b-2 border-red-700">
        <div className="text-[11px] sm:text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5">
          <span>⚠</span>
          <span>VOIDED VOUCHER (የተሰረዘ ሰነድ) — TRANSACTION CANCELLED & INVALID</span>
          <span>⚠</span>
        </div>
      </div>

      {/* 2. Bold SVG Diagonal Red Cross-Through Lines across entire voucher */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
        style={{
          minHeight: "100%",
          width: "100%",
          printColorAdjust: "exact",
          WebkitPrintColorAdjust: "exact",
        }}
        preserveAspectRatio="none"
        viewBox="0 0 100 100"
      >
        {/* Red diagonal line from top-left to bottom-right */}
        <line
          x1="0"
          y1="0"
          x2="100"
          y2="100"
          stroke="#dc2626"
          strokeWidth="1.2"
          strokeLinecap="square"
        />
        {/* Red diagonal line from top-right to bottom-left */}
        <line
          x1="100"
          y1="0"
          x2="0"
          y2="100"
          stroke="#dc2626"
          strokeWidth="1.2"
          strokeLinecap="square"
        />
        {/* Secondary parallel red strike line */}
        <line
          x1="5"
          y1="0"
          x2="100"
          y2="95"
          stroke="#ef4444"
          strokeWidth="0.5"
          strokeDasharray="3 1"
          opacity="0.6"
        />
        <line
          x1="95"
          y1="0"
          x2="0"
          y2="95"
          stroke="#ef4444"
          strokeWidth="0.5"
          strokeDasharray="3 1"
          opacity="0.6"
        />
      </svg>

      {/* 3. Official Center Red Stamp: "VOIDED / ተሰርዟል" */}
      <div className="my-auto mx-auto py-6 px-4 z-40 transform -rotate-12 transition-transform">
        <div
          className="border-4 border-red-600 rounded-lg p-3 sm:p-5 bg-white/95 dark:bg-slate-950/95 shadow-xl text-center backdrop-blur-2xs"
          style={{
            borderColor: "#dc2626",
            boxShadow: "0 0 0 3px rgba(220, 38, 38, 0.2)",
          }}
        >
          <div className="border-2 border-red-600 border-dashed rounded px-4 sm:px-6 py-2">
            <h1
              className="text-3xl sm:text-5xl font-black tracking-widest text-red-600 uppercase leading-none"
              style={{ color: "#dc2626", textShadow: "1px 1px 0px rgba(0,0,0,0.1)" }}
            >
              VOIDED
            </h1>
            <div className="text-xl sm:text-2xl font-black text-red-700 mt-0.5 tracking-wider">
              ተሰርዟል
            </div>
            <div className="h-0.5 w-full bg-red-600 my-1.5" />
            <p className="text-[10px] sm:text-xs font-bold text-red-800 uppercase tracking-wider">
              OFFICIALLY CANCELLED • ዋጋ የለውም
            </p>
            {dateStr && (
              <p className="text-[10px] font-semibold text-red-700 mt-1">
                Date: {dateStr}
              </p>
            )}
            {voidedBy && (
              <p className="text-[10px] font-medium text-red-700">
                Voided By: <span className="font-bold">{voidedBy}</span>
              </p>
            )}
            {voidReason && (
              <p className="text-[10px] font-medium text-red-700 italic max-w-xs mx-auto truncate">
                Reason: {voidReason}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 4. Bottom Formal Red Legal Warning */}
      <div className="bg-red-50 dark:bg-red-950/80 border-t-2 border-red-600 text-red-800 dark:text-red-200 text-center py-1 px-3 text-[10px] sm:text-[11px] font-semibold">
        ይህ ደረሰኝ በሲስተሙ የተሰረዘ (Void) በመሆኑ ለማንኛውም ክፍያ ወይም እቃ ዝውውር ዋጋ የለውም። (This document is voided and invalid).
      </div>
    </div>
  );
}
