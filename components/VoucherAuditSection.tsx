import React, { useState, useEffect } from "react";
import { CheckCircle2, ShieldCheck, FileCheck, Loader2, RotateCcw, AlertCircle, Check, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { update } from "@/lib/firestore";

interface VoucherAuditSectionProps {
  collectionName: string;
  docId: string;
  isChecked?: boolean;
  checkedBy?: string;
  checkedAt?: string | any;
  checkedNote?: string;
  onAuditChange?: (newChecked: boolean, auditorName: string, note?: string) => void;
  voucherNumber?: string;
  className?: string;
}

export function VoucherAuditSection({
  collectionName,
  docId,
  isChecked = false,
  checkedBy = "",
  checkedAt,
  checkedNote = "",
  onAuditChange,
  voucherNumber,
  className = "",
}: VoucherAuditSectionProps) {
  const { user, isAdmin, isAuditor, canAudit, registeredAuditors } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [note, setNote] = useState(checkedNote || "");
  const [selectedAuditorId, setSelectedAuditorId] = useState<string>(() => {
    if (isAuditor && user?.uid) return user.uid;
    return registeredAuditors[0]?.uid || registeredAuditors[0]?.id || "";
  });

  useEffect(() => {
    if (!selectedAuditorId && registeredAuditors.length > 0) {
      if (isAuditor && user?.uid) {
        setSelectedAuditorId(user.uid);
      } else {
        setSelectedAuditorId(registeredAuditors[0]?.uid || registeredAuditors[0]?.id || "");
      }
    }
  }, [registeredAuditors, isAuditor, user, selectedAuditorId]);

  async function handleMarkChecked() {
    if (!user) return;
    if (!docId) {
      toast({ title: "Cannot check: Missing document ID", variant: "destructive" });
      return;
    }

    let auditorName = "";
    let auditorId = "";

    if (isAuditor) {
      auditorName = user.name || user.displayName || user.email || "Auditor";
      auditorId = user.uid || user.id || "";
    } else if (isAdmin && registeredAuditors.length > 0) {
      const selected = registeredAuditors.find(a => (a.uid || a.id) === selectedAuditorId) || registeredAuditors[0];
      auditorName = selected?.name || selected?.email || "Auditor";
      auditorId = selected?.uid || selected?.id || "";
    } else {
      toast({
        title: "አጣሪ አልተመዘገበም (No Auditor Registered)",
        description: "ይህን ሰነድ ራይት (Check) ለማድረግ እባክዎ መጀመሪያ አጣሪ ይመዝግቡ!",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    const nowIso = new Date().toISOString();

    try {
      await update(collectionName, docId, {
        isChecked: true,
        checkedBy: auditorName,
        checkedById: auditorId,
        checkedAt: nowIso,
        checkedNote: note.trim() || "",
      });

      toast({
        title: "✓ Record Verified & Checked! (በትክክል ተረጋግጧል)",
        description: `Checked By: ${auditorName} — receipt updated.`,
      });

      onAuditChange?.(true, auditorName, note.trim());
      setShowNoteInput(false);
    } catch (err) {
      console.error("Audit verification error:", err);
      toast({
        title: "Failed to mark as checked",
        description: String(err instanceof Error ? err.message : err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleUncheck() {
    if (!user || !docId) return;
    setLoading(true);

    try {
      await update(collectionName, docId, {
        isChecked: false,
        checkedBy: "",
        checkedById: "",
        checkedAt: null,
        checkedNote: "",
      });

      toast({
        title: "Audit mark removed",
        description: "Status returned to Pending Review.",
      });

      onAuditChange?.(false, "", "");
      setNote("");
    } catch (err) {
      toast({
        title: "Failed to remove audit mark",
        description: String(err instanceof Error ? err.message : err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const formattedDate = checkedAt
    ? typeof checkedAt === "string"
      ? new Date(checkedAt).toLocaleString()
      : checkedAt.toDate
      ? checkedAt.toDate().toLocaleString()
      : new Date().toLocaleString()
    : "";

  return (
    <div className={`rounded-lg transition-all ${className}`}>
      {isChecked ? (
        <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-950 dark:text-emerald-200">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-start sm:items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center flex-shrink-0 font-bold shadow-sm">
                <Check className="w-5 h-5 stroke-[2.5]" />
              </div>
              <div>
                <div className="font-bold text-xs sm:text-sm flex items-center gap-1.5 text-emerald-900 dark:text-emerald-200">
                  <span>✓ Checked & Verified (በትክክል ተረጋግጧል)</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-400 text-emerald-800 bg-emerald-100 dark:bg-emerald-900/60 font-semibold">
                    Rite / ትክክል ነው
                  </Badge>
                </div>
                <div className="text-xs text-emerald-800/90 dark:text-emerald-300/90 mt-0.5">
                  Checked By: <span className="font-bold font-mono text-emerald-950 dark:text-white">{checkedBy}</span>
                  {formattedDate && <span className="ml-2 opacity-75">· {formattedDate}</span>}
                </div>
                {checkedNote && (
                  <p className="text-[11px] text-emerald-900 dark:text-emerald-300 italic mt-0.5 bg-emerald-100/50 dark:bg-emerald-900/30 px-2 py-0.5 rounded">
                    "{checkedNote}"
                  </p>
                )}
              </div>
            </div>

            {canAudit && (
              <div className="flex items-center gap-1.5 self-end sm:self-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-emerald-300 dark:border-emerald-800 hover:bg-emerald-100 text-emerald-900 dark:text-emerald-200"
                  onClick={handleUncheck}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                  Uncheck / ቀይር
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="p-3 rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2">
              <div className="p-1.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 flex-shrink-0">
                <AlertCircle className="w-4 h-4" />
              </div>
              <div>
                <span className="font-bold text-xs sm:text-sm text-amber-950 dark:text-amber-200 block">
                  Pending Verification (ያልተጣራ ሰነድ)
                </span>
                <span className="text-[11px] text-muted-foreground block">
                  {isAuditor
                    ? `You are logged in as registered auditor (${user?.name}). Verify items & click 'Rite / ትክክል ነው' to stamp.`
                    : isAdmin && registeredAuditors.length > 0
                    ? `Select registered auditor and click 'Rite / ትክክል ነው' to stamp.`
                    : "Awaiting review and approval by registered auditor. (በተመዘገበው አጣሪ እስኪጣራ ድረስ በመጠባበቅ ላይ።)"}
                </span>
              </div>
            </div>

            {canAudit ? (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Registered Auditor Identification / Selection */}
                {isAuditor ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-amber-100/80 dark:bg-amber-900/40 border border-amber-300 text-xs font-semibold text-amber-900 dark:text-amber-200">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Auditor (አጣሪ): <strong>{user?.name}</strong></span>
                  </div>
                ) : isAdmin && registeredAuditors.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-amber-900 dark:text-amber-200 whitespace-nowrap">Auditor (አጣሪ):</span>
                    <select
                      value={selectedAuditorId}
                      onChange={e => setSelectedAuditorId(e.target.value)}
                      className="h-8 text-xs font-medium rounded border border-amber-300 bg-background px-2 text-foreground"
                    >
                      {registeredAuditors.map(a => (
                        <option key={a.uid || a.id} value={a.uid || a.id}>
                          {a.name} ({a.email})
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {showNoteInput ? (
                  <div className="flex items-center gap-1">
                    <Input
                      placeholder="Optional audit remark..."
                      value={note}
                      onChange={e => setNote(e.target.value)}
                      className="h-8 text-xs min-w-[170px]"
                    />
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1 shadow-sm whitespace-nowrap"
                      onClick={handleMarkChecked}
                      disabled={loading}
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 stroke-[3]" />}
                      Confirm
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowNoteInput(true)}
                      className="text-[11px] text-muted-foreground hover:underline px-1"
                    >
                      + Note
                    </button>
                    <Button
                      size="sm"
                      className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 shadow-sm whitespace-nowrap"
                      onClick={handleMarkChecked}
                      disabled={loading}
                      data-testid="button-mark-checked"
                    >
                      {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                      Rite / Mark as Checked (ትክክል ነው ✓)
                    </Button>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Clean receipt line for display in printable voucher, image export, and A4/thermal receipts.
 */
export function ReceiptCheckedByLine({
  checkedBy,
  isChecked = false,
  checkedAt,
  className = "",
}: {
  checkedBy?: string;
  isChecked?: boolean;
  checkedAt?: string | any;
  className?: string;
}) {
  const isVerified = Boolean(checkedBy || isChecked);

  if (isVerified) {
    return (
      <div className={`flex items-center justify-between py-1.5 px-2.5 my-1.5 rounded bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100 text-xs font-semibold print:bg-emerald-50 print:border-emerald-500 print:text-black ${className}`}>
        <span className="flex items-center gap-1.5 font-bold">
          <span className="w-4 h-4 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center text-[10px]">
            ✓
          </span>
          Checked By (ያጣራው / አረጋጋጭ):
        </span>
        <span className="font-bold font-mono text-sm tracking-wide text-emerald-950 dark:text-emerald-50">
          {checkedBy || "Audited & Verified"}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between py-1 px-1 text-xs text-muted-foreground print:text-gray-500 ${className}`}>
      <span className="font-medium">Checked By (ያጣራው):</span>
      <span className="italic text-[11px]">Pending Review (ያልተጣራ)</span>
    </div>
  );
}

/**
 * Reusable table badge for lists and voucher tables.
 */
export function AuditStatusBadge({
  isChecked,
  checkedBy,
  checkedAt,
  canAudit,
  onQuickCheck,
  loading = false,
}: {
  isChecked?: boolean;
  checkedBy?: string;
  checkedAt?: any;
  canAudit?: boolean;
  onQuickCheck?: () => void;
  loading?: boolean;
}) {
  if (isChecked) {
    return (
      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 shadow-xs" title={`Checked By: ${checkedBy || "Verified"}`}>
        <span className="font-bold">✓</span>
        <span className="truncate max-w-[120px]">{checkedBy ? `Checked: ${checkedBy}` : "Checked"}</span>
      </div>
    );
  }

  if (canAudit && onQuickCheck) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onQuickCheck();
        }}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300 hover:bg-emerald-100 hover:text-emerald-800 hover:border-emerald-400 transition-colors cursor-pointer"
        title="Click to Mark as Checked / ራይት አድርግ"
      >
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3 stroke-[2.5]" />}
        Rite (ራይት)
      </button>
    );
  }

  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] text-muted-foreground bg-muted/50">
      Unchecked
    </span>
  );
}

/**
 * Shared helper to perform standard table-level quick audit stamping
 * strictly enforcing that only the user registered under "Add Auditor (አጣሪ ጨምር)"
 * (or admin delegating to that registered auditor) can stamp records.
 */
export async function performQuickAudit({
  collectionName,
  docId,
  currentChecked,
  isAuditor,
  isAdmin,
  user,
  registeredAuditors,
  activeAuditorName,
  toast,
  onSuccess,
}: {
  collectionName: string;
  docId: string;
  currentChecked?: boolean;
  isAuditor: boolean;
  isAdmin: boolean;
  user: any;
  registeredAuditors: any[];
  activeAuditorName: string;
  toast: (options: any) => void;
  onSuccess?: (newChecked: boolean, auditorName: string) => void;
}) {
  const newChecked = !currentChecked;
  let auditorName = "";
  let auditorId = "";

  if (newChecked) {
    if (isAuditor) {
      auditorName = user?.name || user?.displayName || user?.email || "Auditor";
      auditorId = user?.uid || user?.id || "";
    } else if (isAdmin && registeredAuditors.length > 0) {
      auditorName = activeAuditorName || registeredAuditors[0]?.name || registeredAuditors[0]?.email || "Auditor";
      auditorId = registeredAuditors[0]?.uid || registeredAuditors[0]?.id || "";
    } else {
      toast({
        title: "አጣሪ አልተመዘገበም (No Auditor Registered)",
        description: "ይህን ሰነድ ራይት (Check) ለማድረግ እባክዎ መጀመሪያ አጣሪ ይመዝግቡ!",
        variant: "destructive",
      });
      return;
    }
  }

  try {
    await update(collectionName, docId, {
      isChecked: newChecked,
      checkedBy: auditorName,
      checkedById: auditorId,
      checkedAt: newChecked ? new Date().toISOString() : null,
    });

    onSuccess?.(newChecked, auditorName);

    toast({
      title: newChecked
        ? `✓ Verified & Checked by ${auditorName} (በትክክል ተረጋግጧል)`
        : "Audit status reset (ያልተጣራ ሆኗል)",
    });
  } catch (err: any) {
    toast({
      title: "Failed to update audit status",
      description: err?.message || String(err),
      variant: "destructive",
    });
  }
}
