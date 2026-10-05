import React from "react";
import { formatEthDate } from "@/lib/ethiopianCalendar";

export interface FormalVoucherHeaderProps {
  voucherTitle: string;
  voucherTitleAmharic?: string;
  voucherId: string;
  voucherDate?: string | Date;
  storeName?: string;
  fsNumber?: string;
  counterPartyLabel?: string; // e.g. "Customer" or "Supplier" or "Transfer To"
  counterPartyName?: string;
  counterPartyPhone?: string;
  counterPartyTin?: string;
  businessName?: string;
  businessTin?: string;
  businessAddress?: string;
  badgeContent?: React.ReactNode;
  additionalMetadata?: Array<{ label: string; value: React.ReactNode }>;
  className?: string;
}

export function FormalVoucherHeader({
  voucherTitle,
  voucherTitleAmharic,
  voucherId,
  voucherDate,
  storeName,
  fsNumber,
  counterPartyLabel,
  counterPartyName,
  counterPartyPhone,
  counterPartyTin,
  businessName = "YESERAHUT INVENTORY & COMMERCE",
  businessTin = "TIN: 0048291048 • VAT REG: 9841203",
  businessAddress = "Addis Ababa, Ethiopia • Tel: +251 911 000 000",
  badgeContent,
  additionalMetadata,
  className = "",
}: FormalVoucherHeaderProps) {
  const formattedDate = voucherDate
    ? formatEthDate(voucherDate, { includeGregorian: true })
    : formatEthDate(new Date(), { includeGregorian: true });

  return (
    <div className={`space-y-3 border-b-2 border-slate-800 pb-3 text-slate-900 ${className}`}>
      {/* Top Organization & Formal Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-center sm:text-left">
        <div>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight uppercase text-slate-950">
            {businessName}
          </h1>
          <p className="text-xs text-slate-600 font-medium">
            {businessAddress}
          </p>
          <p className="text-[11px] font-mono text-slate-500 font-semibold">
            {businessTin}
          </p>
        </div>

        {/* Voucher Title & Code Box */}
        <div className="sm:text-right flex flex-col sm:items-end justify-center">
          <div className="inline-block bg-slate-900 text-white px-3 py-1 rounded text-sm sm:text-base font-black tracking-wider uppercase">
            {voucherTitle}
          </div>
          {voucherTitleAmharic && (
            <div className="text-xs font-bold text-slate-700 mt-0.5">
              {voucherTitleAmharic}
            </div>
          )}
          <div className="flex items-center gap-1.5 sm:justify-end mt-1">
            <span className="text-xs font-mono font-bold text-slate-900 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded">
              NO: {voucherId}
            </span>
            {badgeContent}
          </div>
        </div>
      </div>

      {/* Formal 4-Quadrant Metadata Grid with crisp borders */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs border border-slate-300 rounded p-2.5 bg-slate-50/70">
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase font-bold text-slate-500">Date (ቀን)</div>
          <div className="font-semibold text-slate-900">{formattedDate}</div>
        </div>

        <div className="space-y-0.5">
          <div className="text-[10px] uppercase font-bold text-slate-500">Store / Branch (መደብር)</div>
          <div className="font-semibold text-slate-900">{storeName || "Main Store"}</div>
        </div>

        {fsNumber ? (
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold text-slate-500">FS / Ref Number (ደረሰኝ ቁጥር)</div>
            <div className="font-mono font-bold text-slate-900">{fsNumber}</div>
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold text-slate-500">Document Type</div>
            <div className="font-semibold text-slate-900">Official Voucher</div>
          </div>
        )}

        {counterPartyName ? (
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold text-slate-500">
              {counterPartyLabel || "Party"} (ተረካቢ/አቅራቢ)
            </div>
            <div className="font-bold text-slate-900 truncate" title={counterPartyName}>
              {counterPartyName}
            </div>
            {counterPartyPhone && (
              <div className="text-[10px] text-slate-600 font-mono">{counterPartyPhone}</div>
            )}
            {counterPartyTin && (
              <div className="text-[10px] text-slate-600 font-mono">TIN: {counterPartyTin}</div>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            <div className="text-[10px] uppercase font-bold text-slate-500">Status</div>
            <div className="font-semibold text-emerald-700">Valid Transaction</div>
          </div>
        )}

        {additionalMetadata &&
          additionalMetadata.map((m, idx) => (
            <div key={idx} className="space-y-0.5 col-span-1">
              <div className="text-[10px] uppercase font-bold text-slate-500">{m.label}</div>
              <div className="font-semibold text-slate-900">{m.value}</div>
            </div>
          ))}
      </div>
    </div>
  );
}
