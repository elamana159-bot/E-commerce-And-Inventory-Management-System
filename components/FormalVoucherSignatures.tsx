import React from "react";
import { formatEthDate } from "@/lib/ethiopianCalendar";

export interface FormalVoucherSignaturesProps {
  preparedBy?: string;
  checkedBy?: string;
  isChecked?: boolean;
  checkedAt?: string | Date;
  approvedBy?: string;
  receivedBy?: string;
  date?: string | Date;
  notes?: string;
  className?: string;
}

export function FormalVoucherSignatures({
  preparedBy,
  checkedBy,
  isChecked = false,
  checkedAt,
  approvedBy,
  receivedBy,
  date,
  notes,
  className = "",
}: FormalVoucherSignaturesProps) {
  const dateStr = date ? formatEthDate(date, { short: true }) : "";
  const auditDateStr = checkedAt ? formatEthDate(checkedAt, { short: true }) : dateStr;

  return (
    <div className={`space-y-4 pt-3 border-t-2 border-slate-700 text-slate-900 ${className}`}>
      {notes && (
        <div className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded p-2">
          <span className="font-bold">Remarks / ማስታወሻ: </span>
          {notes}
        </div>
      )}

      {/* 4-Box Official Accounting Signatures */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        {/* 1. Prepared By */}
        <div className="border border-slate-300 rounded p-2 bg-white flex flex-col justify-between min-h-[95px]">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500">
              Prepared By (ያዘጋጀው)
            </div>
            <div className="font-semibold text-slate-900 truncate mt-0.5">
              {preparedBy || "Cashier / Operator"}
            </div>
          </div>
          <div className="pt-3 border-t border-dashed border-slate-300">
            <div className="text-[9px] text-slate-400">Sign & Date:</div>
            <div className="text-[10px] font-mono text-slate-600">{dateStr}</div>
          </div>
        </div>

        {/* 2. Checked By (Auditor) */}
        <div className="border border-slate-300 rounded p-2 bg-white flex flex-col justify-between min-h-[95px]">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500">
              Checked By (ያረጋገጠው)
            </div>
            <div className="font-semibold text-slate-900 truncate mt-0.5 flex items-center gap-1">
              {isChecked ? (
                <>
                  <span className="text-emerald-700 font-bold">✓ {checkedBy || "Auditor"}</span>
                </>
              ) : checkedBy ? (
                checkedBy
              ) : (
                <span className="text-slate-400 italic">Pending Check</span>
              )}
            </div>
          </div>
          <div className="pt-3 border-t border-dashed border-slate-300">
            <div className="text-[9px] text-slate-400">Audit Status / Date:</div>
            <div className="text-[10px] font-mono text-slate-600">
              {isChecked ? `✓ Verified (${auditDateStr})` : "Unchecked"}
            </div>
          </div>
        </div>

        {/* 3. Approved By */}
        <div className="border border-slate-300 rounded p-2 bg-white flex flex-col justify-between min-h-[95px]">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500">
              Approved By (ያፀደቀው)
            </div>
            <div className="font-semibold text-slate-900 truncate mt-0.5">
              {approvedBy || "Manager / ስራ አስኪያጅ"}
            </div>
          </div>
          <div className="pt-3 border-t border-dashed border-slate-300">
            <div className="text-[9px] text-slate-400">Sign & Seal:</div>
            <div className="text-[10px] font-mono text-slate-600">{dateStr}</div>
          </div>
        </div>

        {/* 4. Received By */}
        <div className="border border-slate-300 rounded p-2 bg-white flex flex-col justify-between min-h-[95px]">
          <div>
            <div className="text-[10px] uppercase font-bold text-slate-500">
              Received By (የተረከበው)
            </div>
            <div className="font-semibold text-slate-900 truncate mt-0.5">
              {receivedBy || "Customer / Receiver"}
            </div>
          </div>
          <div className="pt-3 border-t border-dashed border-slate-300">
            <div className="text-[9px] text-slate-400">Sign & Date:</div>
            <div className="text-[10px] font-mono text-slate-600">{dateStr}</div>
          </div>
        </div>
      </div>

      {/* Formal Footer notice */}
      <div className="flex flex-col sm:flex-row items-center justify-between text-[10px] text-slate-500 pt-1">
        <span>Yeserahut ERP • Multi-Device Synchronized Inventory & POS</span>
        <span>Original Voucher (ዋና ሰነድ) • Page 1 of 1</span>
      </div>
    </div>
  );
}
