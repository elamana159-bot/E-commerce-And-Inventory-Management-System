import React, { useState, useEffect, useMemo } from "react";
import { Sparkles, Plus, X, Layers, RotateCcw, Check, ArrowRight, Tag, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export interface ProductSizeRangeSelectorProps {
  value: string;
  onChange: (value: string, sizesArray: string[], rangeSummary: string) => void;
  className?: string;
  label?: string;
  id?: string;
}

// Preset Ranges commonly used in footwear & retail in Ethiopia & East Africa
const SIZE_PRESETS: { name: string; labelAm: string; start: number | string; end: number | string; customList?: string[] }[] = [
  { name: "Men Shoes (ወንድ ጫማ)", labelAm: "39 - 45", start: 39, end: 45 },
  { name: "Women Shoes (ሴት ጫማ)", labelAm: "36 - 41", start: 36, end: 41 },
  { name: "All-Gender (ሁሉም)", labelAm: "36 - 45", start: 36, end: 45 },
  { name: "Kids / Boys (ልጆች)", labelAm: "26 - 35", start: 26, end: 35 },
  { name: "Toddlers / Babies", labelAm: "20 - 25", start: 20, end: 25 },
  { name: "Apparel / ልብስ (S-3XL)", labelAm: "S - 3XL", start: "S", end: "3XL", customList: ["S", "M", "L", "XL", "XXL", "3XL"] },
  { name: "Jeans / Pants (ሱሪ)", labelAm: "28 - 38 (Even)", start: 28, end: 38, customList: ["28", "30", "32", "34", "36", "38"] },
  { name: "Free Size (ነጠላ)", labelAm: "Free Size", start: "Free Size", end: "Free Size", customList: ["Free Size"] },
];

/**
 * Helper to generate consecutive numbers between start and end inclusive.
 */
export function generateConsecutiveSizes(startNum: number, endNum: number, step: number = 1): string[] {
  if (isNaN(startNum) || isNaN(endNum)) return [];
  const min = Math.min(startNum, endNum);
  const max = Math.max(startNum, endNum);
  const effectiveStep = Math.max(0.1, Math.abs(step) || 1);

  const result: string[] = [];
  // Cap at 100 sizes to prevent excessive loops
  for (let val = min; val <= max + 0.0001 && result.length < 100; val += effectiveStep) {
    // Clean float issues like 38.50000001 -> 38.5
    const formatted = Number.isInteger(val) ? String(val) : String(Math.round(val * 10) / 10);
    result.push(formatted);
  }
  return result;
}

/**
 * Helper to parse any range string like "38-44" or "38 to 44" or comma-separated "38, 39, 40"
 */
export function parseSizeInput(inputStr: string): string[] {
  if (!inputStr || !inputStr.trim()) return [];

  const trimmed = inputStr.trim();
  // Check for range patterns like "38-44", "38 - 44", "38to44", "38 to 44"
  const rangeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(?:-|–|—|to|እስከ)\s*(\d+(?:\.\d+)?)$/i);
  if (rangeMatch) {
    const s = parseFloat(rangeMatch[1]);
    const e = parseFloat(rangeMatch[2]);
    if (!isNaN(s) && !isNaN(e)) {
      return generateConsecutiveSizes(s, e, 1);
    }
  }

  // Otherwise split by comma, space, or slash
  return trimmed
    .split(/[,/;\s]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

export const ProductSizeRangeSelector: React.FC<ProductSizeRangeSelectorProps> = ({
  value = "",
  onChange,
  className = "",
  label = "Product Sizes / የዕቃው ሳይዝ (መነሻ - መድረሻ)",
  id,
}) => {
  // Range inputs
  const [startSize, setStartSize] = useState<string>("");
  const [endSize, setEndSize] = useState<string>("");
  const [step, setStep] = useState<string>("1");
  const [customAddInput, setCustomAddInput] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Parse current active sizes from value prop
  const currentSizes = useMemo(() => {
    if (!value || !value.trim()) return [];
    return value
      .split(",")
      .map(s => s.trim())
      .filter(Boolean);
  }, [value]);

  // Synchronize start & end initial state from existing value if it looks like a numeric sequence
  useEffect(() => {
    if (currentSizes.length > 0 && !startSize && !endSize) {
      const numericSizes = currentSizes.map(s => parseFloat(s)).filter(n => !isNaN(n));
      if (numericSizes.length >= 2) {
        setStartSize(String(Math.min(...numericSizes)));
        setEndSize(String(Math.max(...numericSizes)));
      } else if (numericSizes.length === 1) {
        setStartSize(String(numericSizes[0]));
        setEndSize(String(numericSizes[0]));
      }
    }
  }, [currentSizes, startSize, endSize]);

  // Helper to commit sizes to parent
  function commitSizes(sizesList: string[]) {
    // Deduplicate while preserving sequence
    const unique = Array.from(new Set(sizesList.map(s => s.trim()))).filter(Boolean);
    const joinedStr = unique.join(", ");
    
    // Compute summary range string (e.g. "38-44")
    let summary = "";
    if (unique.length > 1) {
      const first = unique[0];
      const last = unique[unique.length - 1];
      summary = `${first}-${last}`;
    } else if (unique.length === 1) {
      summary = unique[0];
    }

    onChange(joinedStr, unique, summary);
  }

  // Generate consecutive sizes from Start to End
  function handleGenerateRange() {
    const s = parseFloat(startSize);
    const e = parseFloat(endSize);
    const st = parseFloat(step) || 1;

    if (!isNaN(s) && !isNaN(e)) {
      const generated = generateConsecutiveSizes(s, e, st);
      commitSizes(generated);
    } else if (startSize.trim() && endSize.trim()) {
      // Non-numeric custom range (e.g. S to XL)
      commitSizes([startSize.trim(), endSize.trim()]);
    }
  }

  // Handle Preset Click
  function handleSelectPreset(preset: typeof SIZE_PRESETS[0]) {
    if (preset.customList) {
      commitSizes(preset.customList);
      if (typeof preset.start === "number") setStartSize(String(preset.start));
      if (typeof preset.end === "number") setEndSize(String(preset.end));
    } else if (typeof preset.start === "number" && typeof preset.end === "number") {
      setStartSize(String(preset.start));
      setEndSize(String(preset.end));
      const generated = generateConsecutiveSizes(preset.start, preset.end, 1);
      commitSizes(generated);
    }
  }

  // Toggle or Remove single size
  function handleRemoveSize(sizeToRemove: string) {
    const next = currentSizes.filter(s => s !== sizeToRemove);
    commitSizes(next);
  }

  // Add individual custom size
  function handleAddSingleSize(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!customAddInput.trim()) return;

    // Check if user typed a range like "38-44" in the custom box
    const parsed = parseSizeInput(customAddInput);
    if (parsed.length > 0) {
      commitSizes([...currentSizes, ...parsed]);
      setCustomAddInput("");
      return;
    }

    commitSizes([...currentSizes, customAddInput.trim()]);
    setCustomAddInput("");
  }

  // Clear all sizes
  function handleClearAll() {
    onChange("", [], "");
  }

  // Calculate preview of what would be generated by current start and end
  const previewGenerated = useMemo(() => {
    const s = parseFloat(startSize);
    const e = parseFloat(endSize);
    const st = parseFloat(step) || 1;
    if (!isNaN(s) && !isNaN(e)) {
      return generateConsecutiveSizes(s, e, st);
    }
    return [];
  }, [startSize, endSize, step]);

  return (
    <div id={id} className={`space-y-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 ${className}`}>
      {/* Header & Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <Label className="text-xs font-bold text-foreground block">
              {label}
            </Label>
            <p className="text-[11px] text-muted-foreground">
              ከመነሻ እስከ መጨረሻ ያለውን ቁጥር ያስገቡ (Start to End Size Auto-Filler)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {currentSizes.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-7 px-2 text-[11px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <RotateCcw className="w-3 h-3 mr-1" /> Clear (አፅዳ)
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            <SlidersHorizontal className="w-3 h-3 mr-1" /> {showAdvanced ? "Hide Presets" : "Presets"}
          </Button>
        </div>
      </div>

      {/* Main Consecutive Range Generator Bar */}
      <div className="p-3 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-2xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-center">
          {/* Start Size Input */}
          <div className="sm:col-span-4">
            <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Start Size (መነሻ ሳይዝ) *
            </Label>
            <Input
              type="number"
              placeholder="e.g. 38"
              value={startSize}
              onChange={(e) => setStartSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGenerateRange();
                }
              }}
              className="h-9 text-sm font-semibold bg-slate-50 dark:bg-slate-900"
            />
          </div>

          {/* Arrow indicator */}
          <div className="hidden sm:flex sm:col-span-1 justify-center pt-5">
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
          </div>

          {/* End Size Input */}
          <div className="sm:col-span-4">
            <Label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1 mb-1">
              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
              End Size (መድረሻ ሳይዝ) *
            </Label>
            <Input
              type="number"
              placeholder="e.g. 44"
              value={endSize}
              onChange={(e) => setEndSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleGenerateRange();
                }
              }}
              className="h-9 text-sm font-semibold bg-slate-50 dark:bg-slate-900"
            />
          </div>

          {/* Generate Button */}
          <div className="sm:col-span-3 pt-0 sm:pt-5">
            <Button
              type="button"
              onClick={handleGenerateRange}
              disabled={!startSize || !endSize}
              className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Generate (አፍልቅ)
            </Button>
          </div>
        </div>

        {/* Live Preview of sequence when user types start/end */}
        {previewGenerated.length > 0 && (!currentSizes.length || previewGenerated.join(", ") !== currentSizes.join(", ")) && (
          <div className="p-2 rounded-md bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/50 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-blue-900 dark:text-blue-300">
                Sequence ({previewGenerated.length} sizes):
              </span>
              <span className="font-mono font-bold text-blue-700 dark:text-blue-400">
                {previewGenerated.join(", ")}
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleGenerateRange}
              className="h-6 px-2 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              <Check className="w-3 h-3 mr-1" /> Apply Sequence
            </Button>
          </div>
        )}
      </div>

      {/* Preset Quick Buttons */}
      {showAdvanced && (
        <div className="p-2.5 rounded-lg bg-muted/40 border space-y-2">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">
            ⚡ Quick Presets (ፈጣን የተዘጋጁ ሳይዞች)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SIZE_PRESETS.map((preset, idx) => (
              <Button
                key={idx}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleSelectPreset(preset)}
                className="h-7 px-2.5 text-xs bg-background hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 hover:border-blue-300"
              >
                <Tag className="w-3 h-3 mr-1 text-muted-foreground" />
                <span className="font-semibold">{preset.name}</span>
                <span className="text-[10px] text-muted-foreground ml-1">({preset.labelAm})</span>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Active Selected Size Badges / Chips Display */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <span>Selected Product Sizes (የተመረጡ ሳይዞች):</span>
            <Badge variant="secondary" className="font-bold text-[10px] h-5 px-1.5 bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
              {currentSizes.length} size{currentSizes.length !== 1 ? "s" : ""}
            </Badge>
          </span>

          {currentSizes.length > 1 && (
            <span className="text-[11px] font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded">
              Range: {currentSizes[0]} – {currentSizes[currentSizes.length - 1]}
            </span>
          )}
        </div>

        {/* Badges container */}
        <div className="p-3 rounded-lg border bg-background min-h-[50px] flex flex-wrap items-center gap-1.5">
          {currentSizes.length === 0 ? (
            <div className="w-full text-center py-2 text-xs text-muted-foreground italic flex items-center justify-center gap-1.5">
              <span>No sizes specified yet. Enter Start & End numbers above to auto-fill (e.g. 38 to 44).</span>
            </div>
          ) : (
            currentSizes.map((sz, idx) => (
              <span
                key={`${sz}-${idx}`}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold font-mono bg-blue-50 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200 border border-blue-200 dark:border-blue-800/80 shadow-2xs group hover:border-red-300 transition-colors"
              >
                <span>{sz}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveSize(sz)}
                  title={`Remove size ${sz}`}
                  className="w-3.5 h-3.5 rounded-full hover:bg-red-100 dark:hover:bg-red-900/50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      {/* Manual Add / Direct String input field */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <div className="flex-1 min-w-[200px] flex items-center gap-1.5">
          <Input
            placeholder="Add specific size or range (e.g. 45 or 38-44)..."
            value={customAddInput}
            onChange={(e) => setCustomAddInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddSingleSize();
              }
            }}
            className="h-8 text-xs bg-background"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleAddSingleSize()}
            disabled={!customAddInput.trim()}
            className="h-8 text-xs px-2.5 flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1" /> Add
          </Button>
        </div>

        {/* Fast Common Single Size Buttons */}
        <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
          {["38", "39", "40", "41", "42", "43", "44", "45", "Free Size"].map((s) => {
            const isAdded = currentSizes.includes(s);
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  if (isAdded) {
                    handleRemoveSize(s);
                  } else {
                    commitSizes([...currentSizes, s]);
                  }
                }}
                className={`h-7 px-2 text-[11px] font-mono rounded border transition-all cursor-pointer ${
                  isAdded
                    ? "bg-blue-600 text-white border-blue-600 font-bold"
                    : "bg-background text-foreground border-border hover:bg-muted"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
