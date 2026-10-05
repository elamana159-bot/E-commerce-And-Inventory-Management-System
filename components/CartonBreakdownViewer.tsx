import React, { useState, useEffect, useMemo } from "react";
import { Package, Layers, PieChart, RefreshCw, CheckCircle2, AlertCircle, Sparkles, Plus, Minus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category, CartonSizeItem, CartonCategorySummary } from "@/types";
import { calculateCartonBreakdown } from "@/categorySizeUtils";

export interface CartonBreakdownViewerProps {
  sizes: string[];
  quantityPerCarton: number;
  categories: Category[];
  selectedCategoryId?: string;
  value?: CartonSizeItem[];
  onChange?: (breakdown: CartonSizeItem[], categorySummaries: CartonCategorySummary[]) => void;
  editable?: boolean;
  className?: string;
  id?: string;
}

export const CartonBreakdownViewer: React.FC<CartonBreakdownViewerProps> = ({
  sizes = [],
  quantityPerCarton = 1,
  categories = [],
  selectedCategoryId,
  value,
  onChange,
  editable = true,
  className = "",
  id,
}) => {
  const [customCounts, setCustomCounts] = useState<Record<string, number>>({});
  const [isManualMode, setIsManualMode] = useState<boolean>(false);

  // Sort sizes naturally (numeric if numbers, else string)
  const cleanSizes = useMemo(() => {
    const raw = sizes.map(s => s.trim()).filter(Boolean);
    return raw.sort((a, b) => {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b, undefined, { numeric: true });
    });
  }, [sizes]);

  const qpc = Math.max(1, Number(quantityPerCarton) || 1);

  // Initialize or calculate breakdown
  const computed = useMemo(() => {
    return calculateCartonBreakdown(
      cleanSizes,
      qpc,
      categories,
      selectedCategoryId,
      isManualMode ? customCounts : undefined
    );
  }, [cleanSizes, qpc, categories, selectedCategoryId, isManualMode, customCounts]);

  // Sync to parent onChange if provided
  useEffect(() => {
    if (onChange) {
      onChange(computed.items, computed.categorySummaries);
    }
  }, [computed.items, computed.categorySummaries, onChange]);

  // Update single size piece count
  const handlePieceCountChange = (sz: string, newCountStr: string) => {
    const val = Math.max(0, parseInt(newCountStr, 10) || 0);
    setIsManualMode(true);
    setCustomCounts(prev => {
      const next = { ...prev };
      // initialize existing from computed if empty
      cleanSizes.forEach(s => {
        if (next[s] === undefined) {
          const item = computed.items.find(it => it.size === s);
          next[s] = item ? item.count : 0;
        }
      });
      next[sz] = val;
      return next;
    });
  };

  // Increment single size piece count (+)
  const handleIncrement = (sz: string) => {
    setIsManualMode(true);
    setCustomCounts(prev => {
      const next = { ...prev };
      cleanSizes.forEach(s => {
        if (next[s] === undefined) {
          const item = computed.items.find(it => it.size === s);
          next[s] = item ? item.count : 0;
        }
      });
      next[sz] = (next[sz] || 0) + 1;
      return next;
    });
  };

  // Decrement single size piece count (-)
  const handleDecrement = (sz: string) => {
    setIsManualMode(true);
    setCustomCounts(prev => {
      const next = { ...prev };
      cleanSizes.forEach(s => {
        if (next[s] === undefined) {
          const item = computed.items.find(it => it.size === s);
          next[s] = item ? item.count : 0;
        }
      });
      next[sz] = Math.max(0, (next[sz] || 0) - 1);
      return next;
    });
  };

  // Reset to auto even distribution
  const handleResetToAuto = () => {
    setIsManualMode(false);
    setCustomCounts({});
  };

  const totalSum = computed.items.reduce((acc, it) => acc + it.count, 0);
  const isBalanced = totalSum === qpc;

  if (cleanSizes.length === 0) {
    return null;
  }

  return (
    <div id={id} className={`p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-2xs space-y-3.5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <span>Carton Size & Category Allocation (በ 1 ካርቶን ውስጥ ያሉ ሳይዞችና ምድቦች)</span>
              <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-4 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200">
                {qpc} pcs / Carton
              </Badge>
            </h4>
            <p className="text-[11px] text-muted-foreground">
              ከ {qpc} ጠቅላላ ፍሬዎች ውስጥ ለእያንዳንዱ ሳይዝ የሚደርሰውን ፍሬ በቀላሉ በ (+) እና (-) ይጨምሩ/ይቀንሱ
            </p>
          </div>
        </div>

        {editable && (
          <div className="flex items-center gap-1.5">
            {isManualMode ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetToAuto}
                className="h-7 px-2.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400 gap-1.5 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 hover:bg-blue-100"
              >
                <RefreshCw className="w-3 h-3" /> Auto Distribute (እኩል አካፍል)
              </Button>
            ) : (
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900">
                <Sparkles className="w-3 h-3" /> Auto-Distributed Evenly
              </span>
            )}
          </div>
        )}
      </div>

      {/* Category Summaries Pills */}
      {computed.categorySummaries.length > 0 && (
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-800 space-y-1.5">
          <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
            <PieChart className="w-3 h-3 text-blue-600 dark:text-blue-400" />
            Category Distribution in 1 Carton (በካርቶን ውስጥ ያሉ ምድቦች ድርሻ):
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 pt-0.5">
            {computed.categorySummaries.map((cat, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xs"
              >
                <div className="min-w-0 pr-2">
                  <span className="font-bold text-xs text-foreground block truncate">
                    {cat.categoryName}
                  </span>
                  <span className="text-[10px] text-muted-foreground block truncate">
                    Sizes: {cat.sizes?.join(", ")}
                  </span>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="font-mono font-black text-sm text-blue-600 dark:text-blue-400">
                    {cat.count} <span className="text-[10px] font-normal text-muted-foreground">pcs</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground block font-mono">
                    ({cat.percentage}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pieces Per Size Grid with + / - Increment/Decrement controls */}
      <div className="space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
          <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
            <span>Pieces Per Size in 1 Carton (በእያንዳንዱ ሳይዝ የሚገኙ ፍሬዎች):</span>
          </span>
          <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
            isBalanced
              ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300"
              : "bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300"
          }`}>
            {isBalanced ? (
              <>
                <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Total: {totalSum} / {qpc} pcs (Matched)
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 text-amber-600" /> Total: {totalSum} / {qpc} pcs ({totalSum < qpc ? `Missing ${qpc - totalSum}` : `Over by ${totalSum - qpc}`})
              </>
            )}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {computed.items.map((item, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 hover:border-blue-300 dark:hover:border-blue-700 transition-colors flex flex-col justify-between items-center text-center space-y-2"
            >
              {/* Size Header */}
              <div className="w-full">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block">
                  SIZE
                </span>
                <span className="text-lg font-black font-mono text-blue-600 dark:text-blue-400 leading-tight">
                  {item.size}
                </span>
              </div>

              {/* Counter with Minus (-) & Plus (+) Buttons */}
              {editable ? (
                <div className="w-full flex items-center justify-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleDecrement(item.size)}
                    disabled={item.count <= 0}
                    title="ቀንስ (Minus 1)"
                    className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-600 dark:hover:bg-rose-950/40 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>

                  <div className="relative flex-1 min-w-[50px]">
                    <Input
                      type="number"
                      min="0"
                      value={item.count}
                      onChange={(e) => handlePieceCountChange(item.size, e.target.value)}
                      className="h-7 text-center font-black text-xs font-mono bg-white dark:bg-slate-900 px-1 border-slate-300 dark:border-slate-700 focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="absolute right-1 top-1.5 text-[8px] font-medium text-slate-400 pointer-events-none">
                      pcs
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleIncrement(item.size)}
                    title="ጨምር (Plus 1)"
                    className="w-7 h-7 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 dark:hover:bg-emerald-950/40 text-slate-700 dark:text-slate-200 font-bold flex items-center justify-center transition-all active:scale-95 shadow-2xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <span className="text-xs font-bold font-mono text-foreground bg-white dark:bg-slate-900 px-2 py-1 rounded-md border border-slate-200 dark:border-slate-800">
                  {item.count} pcs
                </span>
              )}

              {/* Category Name */}
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-full block leading-tight px-1">
                {item.categoryName || "General"}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
