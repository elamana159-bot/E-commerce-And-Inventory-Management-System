import { useState, useRef } from "react";
import {
  FileUp, Download, CheckCircle2, AlertCircle, RefreshCw, FileSpreadsheet,
  X, Layers, Loader2, Check, ArrowRight, UploadCloud, Info
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { create, update, COLLECTIONS, generateVoucherId, syncProductAcrossCollections } from "@/lib/firestore";
import { exportToExcel } from "@/shareImage";
import * as XLSX from "xlsx";
import type { Product, Category, PricingRecord } from "@/lib/types";

export interface ProductImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingProducts: Product[];
  categories: Category[];
  pricing: PricingRecord[];
  onSuccess: () => Promise<void> | void;
}

interface ParsedProductRow {
  rowIndex: number;
  name: string;
  code: string;
  categoryName: string;
  brand: string;
  unitCost: number;
  sellingPrice: number;
  quantityPerCarton: number;
  minCartonAlert: number;
  sizeRange: string;
  unit: string;
  barcodeValue: string;
  description: string;
  status: "new" | "update" | "invalid";
  existingProduct?: Product;
  errorMessage?: string;
}

export function ProductImportDialog({
  open,
  onOpenChange,
  existingProducts,
  categories,
  pricing,
  onSuccess,
}: ProductImportDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<ParsedProductRow[]>([]);
  const [updateExisting, setUpdateExisting] = useState<boolean>(true);
  const [autoCreateCategories, setAutoCreateCategories] = useState<boolean>(true);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [filterPreview, setFilterPreview] = useState<"all" | "new" | "update" | "invalid">("all");

  const resetState = () => {
    setFileName("");
    setParsedRows([]);
    setIsProcessing(false);
    setProgress({ current: 0, total: 0 });
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleClose = (newOpen: boolean) => {
    if (isProcessing) return;
    if (!newOpen) resetState();
    onOpenChange(newOpen);
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = async () => {
    try {
      const templateData = [
        {
          "Product Name": "Men's Classic Leather Shoe",
          "Code / SKU": "SH-001",
          "Category": "Shoes",
          "Brand": "Habesha Leather",
          "Unit Cost": 1400,
          "Selling Price": 2100,
          "Qty Per Carton": 12,
          "Min Alert": 2,
          "Sizes / Range": "39-44",
          "Unit": "pair",
          "Barcode": "893452001",
          "Description": "Pure genuine leather classic shoe"
        },
        {
          "Product Name": "Cotton Casual Polo T-Shirt",
          "Code / SKU": "TS-102",
          "Category": "Clothing",
          "Brand": "Urban Style",
          "Unit Cost": 650,
          "Selling Price": 950,
          "Qty Per Carton": 24,
          "Min Alert": 3,
          "Sizes / Range": "S, M, L, XL",
          "Unit": "pcs",
          "Barcode": "893452102",
          "Description": "100% breathable cotton polo shirt"
        },
        {
          "Product Name": "Smart Sport Running Sneaker",
          "Code / SKU": "SN-305",
          "Category": "Shoes",
          "Brand": "SpeedPro",
          "Unit Cost": 1800,
          "Selling Price": 2700,
          "Qty Per Carton": 10,
          "Min Alert": 2,
          "Sizes / Range": "40-45",
          "Unit": "pair",
          "Barcode": "893452305",
          "Description": "Lightweight cushioned athletic sneaker"
        }
      ];

      const ws = XLSX.utils.json_to_sheet(templateData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Product Template");

      await exportToExcel({
        workbook: wb,
        filename: "Product_Catalog_Import_Template.xlsx",
        title: "PRODUCT CATALOG IMPORT TEMPLATE",
        subtitle: "Fill in the columns and upload to bulk import or update products",
      });

      toast({
        title: "Template Downloaded",
        description: "Product_Catalog_Import_Template.xlsx has been downloaded successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Template Download Failed",
        description: err.message || "Failed to generate Excel template",
        variant: "destructive",
      });
    }
  };

  // Helper to find column value by multiple possible header keys
  const getColValue = (row: Record<string, any>, candidateKeys: string[]): any => {
    const rowKeys = Object.keys(row);
    for (const cand of candidateKeys) {
      const match = rowKeys.find(k => k.trim().toLowerCase() === cand.trim().toLowerCase());
      if (match !== undefined && row[match] !== undefined && row[match] !== null) {
        return row[match];
      }
    }
    return undefined;
  };

  // Handle file upload and parsing
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const wb = XLSX.read(arrayBuffer, { type: "array" });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) {
        throw new Error("No sheet found in Excel workbook.");
      }

      const ws = wb.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);

      if (rawRows.length === 0) {
        throw new Error("The selected Excel sheet contains no data rows.");
      }

      // Existing SKU map (case-insensitive)
      const existingSkuMap = new Map<string, Product>();
      existingProducts.forEach(p => {
        if (p.code) {
          existingSkuMap.set(p.code.trim().toLowerCase(), p);
        }
      });

      const parsed: ParsedProductRow[] = rawRows.map((row, idx) => {
        const nameVal = String(
          getColValue(row, ["Product Name", "Name", "Item Name", "Item", "Title", "የምርት ስም", "ስም"]) || ""
        ).trim();

        const codeVal = String(
          getColValue(row, ["Code / SKU", "Code", "SKU", "Product Code", "Item Code", "ኮድ", "sku"]) || ""
        ).trim();

        const categoryVal = String(
          getColValue(row, ["Category", "Category Name", "የምርት ክፍል", "ክፍል"]) || ""
        ).trim();

        const brandVal = String(
          getColValue(row, ["Brand", "Brand Name", "ብራንድ"]) || ""
        ).trim();

        const unitCostVal = Number(
          getColValue(row, ["Unit Cost", "Cost", "Purchase Price", "Buy Price", "የግዢ ዋጋ"]) || 0
        );

        const sellingPriceVal = Number(
          getColValue(row, ["Selling Price", "Price", "Sale Price", "የሽያጭ ዋጋ"]) || 0
        );

        const qpcVal = Number(
          getColValue(row, ["Qty Per Carton", "QPC", "Quantity Per Carton", "Pieces Per Carton", "ፍሬ በካርቶን"]) || 1
        );

        const minAlertVal = Number(
          getColValue(row, ["Min Alert", "Min Carton Alert", "Alert", "አነስተኛ ማስጠንቀቂያ"]) || 1
        );

        const sizeRangeVal = String(
          getColValue(row, ["Sizes / Range", "Sizes", "Size Range", "Size", "መጠኖች", "መጠን"]) || ""
        ).trim();

        const unitVal = String(
          getColValue(row, ["Unit", "መለኪያ"]) || "pcs"
        ).trim();

        const barcodeVal = String(
          getColValue(row, ["Barcode", "Barcode Value", "ባርኮድ"]) || codeVal
        ).trim();

        const descVal = String(
          getColValue(row, ["Description", "Remark", "Notes", "መግለጫ"]) || ""
        ).trim();

        let status: "new" | "update" | "invalid" = "new";
        let errorMessage = "";
        let existingProd: Product | undefined;

        if (!nameVal || !codeVal) {
          status = "invalid";
          errorMessage = !nameVal && !codeVal ? "Missing Name and Code" : (!nameVal ? "Missing Name" : "Missing Code");
        } else {
          const matchExisting = existingSkuMap.get(codeVal.toLowerCase());
          if (matchExisting) {
            status = "update";
            existingProd = matchExisting;
          } else {
            status = "new";
          }
        }

        return {
          rowIndex: idx + 2, // Excel 1-based row number with header as row 1
          name: nameVal,
          code: codeVal,
          categoryName: categoryVal,
          brand: brandVal,
          unitCost: isNaN(unitCostVal) ? 0 : unitCostVal,
          sellingPrice: isNaN(sellingPriceVal) ? 0 : sellingPriceVal,
          quantityPerCarton: isNaN(qpcVal) || qpcVal < 1 ? 1 : Math.round(qpcVal),
          minCartonAlert: isNaN(minAlertVal) || minAlertVal < 1 ? 1 : Math.round(minAlertVal),
          sizeRange: sizeRangeVal,
          unit: unitVal || "pcs",
          barcodeValue: barcodeVal || codeVal,
          description: descVal,
          status,
          existingProduct: existingProd,
          errorMessage,
        };
      });

      setParsedRows(parsed);
      toast({
        title: "File Loaded & Analyzed",
        description: `Found ${parsed.length} items (${parsed.filter(r => r.status === "new").length} new, ${parsed.filter(r => r.status === "update").length} existing, ${parsed.filter(r => r.status === "invalid").length} invalid).`,
      });
    } catch (err: any) {
      toast({
        title: "Failed to read Excel file",
        description: err.message || "Invalid file format",
        variant: "destructive",
      });
      resetState();
    }
  };

  // Perform bulk import
  const handleExecuteImport = async () => {
    const validRows = parsedRows.filter(r => r.status !== "invalid");
    if (validRows.length === 0) {
      toast({
        title: "No Valid Products",
        description: "Please fix invalid rows or upload a file containing product names and codes.",
        variant: "destructive",
      });
      return;
    }

    const rowsToProcess = validRows.filter(r => r.status === "new" || (r.status === "update" && updateExisting));
    if (rowsToProcess.length === 0) {
      toast({
        title: "No Products to Import",
        description: "All products in file exist and 'Update existing' option is turned off.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    setProgress({ current: 0, total: rowsToProcess.length });

    try {
      // Build local category cache
      const categoryMap = new Map<string, Category>();
      categories.forEach(c => categoryMap.set(c.name.trim().toLowerCase(), c));

      let createdCount = 0;
      let updatedCount = 0;

      for (let i = 0; i < rowsToProcess.length; i++) {
        const row = rowsToProcess[i];
        setProgress({ current: i + 1, total: rowsToProcess.length });

        // Category resolution
        let catId = "";
        let catName = row.categoryName;
        if (catName) {
          const lowerCat = catName.toLowerCase();
          let existingCat = categoryMap.get(lowerCat);
          if (!existingCat && autoCreateCategories) {
            try {
              const newCatId = await create(COLLECTIONS.CATEGORIES, {
                name: catName,
                description: "Auto-created via Excel Import",
              });
              const newCatObj: Category = {
                id: newCatId,
                name: catName,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              };
              categoryMap.set(lowerCat, newCatObj);
              catId = newCatId;
            } catch (catErr) {
              console.warn("Could not auto-create category:", catErr);
            }
          } else if (existingCat) {
            catId = existingCat.id;
            catName = existingCat.name;
          }
        }

        // Product payload
        const productPayload: Record<string, unknown> = {
          name: row.name,
          code: row.code,
          brand: row.brand,
          barcodeValue: row.barcodeValue || row.code,
          categoryId: catId,
          categoryName: catName,
          unit: row.unit || "pcs",
          quantityPerCarton: row.quantityPerCarton,
          minCartonAlert: row.minCartonAlert,
          purchasePrice: row.unitCost,
          sellingPrice: row.sellingPrice,
          sizeRange: row.sizeRange,
          size: row.sizeRange,
          description: row.description,
          isVoided: false,
        };

        let prodId = "";

        if (row.status === "update" && row.existingProduct) {
          prodId = row.existingProduct.id;
          const cleanName = row.name.trim();
          const cleanCode = row.code.trim();
          const prevName = (row.existingProduct.name || "").trim();
          const prevCode = (row.existingProduct.code || "").trim();
          if ((prevName && prevName !== cleanName) || (prevCode && prevCode !== cleanCode)) {
            productPayload.previousName = prevName;
            productPayload.previousCode = prevCode;
            productPayload.beforeEditMemo = `Before Edit: ${prevName} (${prevCode})`;
            productPayload.lastEditedAt = new Date().toISOString();
            productPayload.lastEditedBy = "Excel Import";
          }
          await update(COLLECTIONS.PRODUCTS, prodId, productPayload);
          syncProductAcrossCollections(prodId, {
            name: row.name,
            code: row.code,
            categoryName: catName,
            quantityPerCarton: row.quantityPerCarton,
            size: row.sizeRange,
          }).catch(() => {});
          updatedCount++;
        } else {
          productPayload.voucherId = generateVoucherId("PROD");
          productPayload.photoUrls = [];
          productPayload.photoUrl = "";
          prodId = await create(COLLECTIONS.PRODUCTS, productPayload);
          createdCount++;
        }

        // Sync Pricing
        if (prodId && (row.unitCost > 0 || row.sellingPrice > 0)) {
          const existingPrice = pricing.find(pr => pr.productId === prodId);
          const margin = row.unitCost > 0 ? ((row.sellingPrice - row.unitCost) / row.unitCost) * 100 : 0;
          const priceData = {
            productId: prodId,
            productName: row.name,
            productCode: row.code,
            unitCost: row.unitCost,
            profitMargin: Math.round(margin * 10) / 10,
            sellingPrice: row.sellingPrice,
            ecommercePiecePrice: row.sellingPrice,
          };

          if (existingPrice) {
            await update(COLLECTIONS.PRICING, existingPrice.id, priceData);
          } else {
            await create(COLLECTIONS.PRICING, priceData);
          }
        }
      }

      toast({
        title: "Excel Import Successful",
        description: `Processed ${rowsToProcess.length} products: ${createdCount} created, ${updatedCount} updated.`,
      });

      await onSuccess();
      handleClose(false);
    } catch (err: any) {
      toast({
        title: "Import Error",
        description: err.message || "Failed during bulk import",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const newCount = parsedRows.filter(r => r.status === "new").length;
  const updateCount = parsedRows.filter(r => r.status === "update").length;
  const invalidCount = parsedRows.filter(r => r.status === "invalid").length;

  const filteredPreviewRows = parsedRows.filter(r => {
    if (filterPreview === "all") return true;
    return r.status === filterPreview;
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6">
        <DialogHeader className="border-b pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold">Import Products from Excel (ከ Excel አስገባ)</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Upload Excel spreadsheet (.xlsx, .xls) or CSV to bulk import products into your catalog.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-2">
          {/* Action Row: Template Download & File Upload Trigger */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Step 1: Download Template */}
            <Card className="border-dashed">
              <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                    <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">1</span>
                    Download Excel Template
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Get a pre-formatted Excel template with correct column headers and sample rows.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="w-full text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" /> Download Template (.xlsx)
                </Button>
              </CardContent>
            </Card>

            {/* Step 2: Upload Excel File */}
            <Card className="border-dashed">
              <CardContent className="p-4 flex flex-col justify-between h-full space-y-2">
                <div>
                  <div className="flex items-center gap-1.5 font-semibold text-xs sm:text-sm text-slate-800 dark:text-slate-200">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-[11px] font-bold flex items-center justify-center">2</span>
                    Select Excel File
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {fileName ? `Loaded: ${fileName}` : "Upload your completed spreadsheet to analyze and import."}
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileChange}
                />

                <Button
                  type="button"
                  variant={fileName ? "secondary" : "default"}
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full text-xs font-semibold"
                >
                  <UploadCloud className="w-3.5 h-3.5 mr-1.5" />
                  {fileName ? "Change Excel File" : "Upload Excel File"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Analysis & Summary Badges */}
          {parsedRows.length > 0 && (
            <div className="space-y-3">
              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">File Analysis:</span>
                  <Badge variant="outline" className="cursor-pointer hover:bg-slate-200" onClick={() => setFilterPreview("all")}>
                    Total: {parsedRows.length}
                  </Badge>
                  <Badge className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer" onClick={() => setFilterPreview("new")}>
                    <CheckCircle2 className="w-3 h-3 mr-1" /> {newCount} New Products
                  </Badge>
                  <Badge className="bg-amber-600 hover:bg-amber-700 text-white cursor-pointer" onClick={() => setFilterPreview("update")}>
                    <RefreshCw className="w-3 h-3 mr-1" /> {updateCount} Existing SKU
                  </Badge>
                  {invalidCount > 0 && (
                    <Badge variant="destructive" className="cursor-pointer" onClick={() => setFilterPreview("invalid")}>
                      <AlertCircle className="w-3 h-3 mr-1" /> {invalidCount} Invalid Rows
                    </Badge>
                  )}
                </div>

                {/* Filter Selector */}
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground text-[11px]">Filter View:</span>
                  <select
                    value={filterPreview}
                    onChange={e => setFilterPreview(e.target.value as any)}
                    className="text-xs bg-background border rounded px-2 py-1 font-medium"
                  >
                    <option value="all">All ({parsedRows.length})</option>
                    <option value="new">New Only ({newCount})</option>
                    <option value="update">Updates Only ({updateCount})</option>
                    {invalidCount > 0 && <option value="invalid">Invalid Only ({invalidCount})</option>}
                  </select>
                </div>
              </div>

              {/* Import Options Checkboxes */}
              <div className="flex flex-wrap gap-4 px-1 text-xs">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="updateExisting"
                    checked={updateExisting}
                    onCheckedChange={checked => setUpdateExisting(!!checked)}
                  />
                  <Label htmlFor="updateExisting" className="text-xs cursor-pointer">
                    Update existing products if Code / SKU matches (ተመሳሳይ ኮድ ያላቸውን አድስ)
                  </Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="autoCreateCategories"
                    checked={autoCreateCategories}
                    onCheckedChange={checked => setAutoCreateCategories(!!checked)}
                  />
                  <Label htmlFor="autoCreateCategories" className="text-xs cursor-pointer">
                    Auto-create new categories if not found (አዳዲስ ክፍሎችን በራስ-ሰር መዝግብ)
                  </Label>
                </div>
              </div>

              {/* Scrollable Preview Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-60 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[650px]">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 sticky top-0 font-semibold border-b">
                      <tr>
                        <th className="p-2 w-10 text-center">#</th>
                        <th className="p-2 w-24">Status</th>
                        <th className="p-2 min-w-[140px]">Product Name</th>
                        <th className="p-2 w-24 font-mono">Code / SKU</th>
                        <th className="p-2 w-28">Category</th>
                        <th className="p-2 w-20 text-right">Cost</th>
                        <th className="p-2 w-20 text-right">Price</th>
                        <th className="p-2 w-16 text-center">QPC</th>
                        <th className="p-2 w-24">Sizes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredPreviewRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-4 text-center text-muted-foreground">
                            No rows match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredPreviewRows.slice(0, 100).map((row, idx) => (
                          <tr
                            key={idx}
                            className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 ${
                              row.status === "invalid"
                                ? "bg-red-50/40 dark:bg-red-950/20"
                                : row.status === "update"
                                ? "bg-amber-50/30 dark:bg-amber-950/10"
                                : ""
                            }`}
                          >
                            <td className="p-2 text-center text-slate-400 font-mono text-[11px]">{row.rowIndex}</td>
                            <td className="p-2">
                              {row.status === "new" ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                  New
                                </span>
                              ) : row.status === "update" ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  Update
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" title={row.errorMessage}>
                                  Invalid
                                </span>
                              )}
                            </td>
                            <td className="p-2 font-medium text-slate-900 dark:text-slate-100 truncate max-w-[180px]">
                              {row.name || <span className="text-red-500 italic">Empty Name</span>}
                            </td>
                            <td className="p-2 font-mono text-slate-700 dark:text-slate-300 truncate max-w-[100px]">
                              {row.code || <span className="text-red-500 italic">Empty Code</span>}
                            </td>
                            <td className="p-2 text-slate-600 dark:text-slate-400 truncate max-w-[120px]">
                              {row.categoryName || "—"}
                            </td>
                            <td className="p-2 text-right font-mono text-slate-700 dark:text-slate-300">
                              {row.unitCost > 0 ? row.unitCost.toLocaleString() : "—"}
                            </td>
                            <td className="p-2 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                              {row.sellingPrice > 0 ? row.sellingPrice.toLocaleString() : "—"}
                            </td>
                            <td className="p-2 text-center text-slate-700 dark:text-slate-300">
                              {row.quantityPerCarton}
                            </td>
                            <td className="p-2 text-slate-600 dark:text-slate-400 truncate max-w-[100px]">
                              {row.sizeRange || "—"}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredPreviewRows.length > 100 && (
                  <div className="p-2 text-center text-xs text-muted-foreground bg-slate-50 dark:bg-slate-900 border-t">
                    Showing first 100 of {filteredPreviewRows.length} rows
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Progress Banner during import */}
          {isProcessing && (
            <div className="bg-primary/10 border border-primary/20 p-3 rounded-lg flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-primary">
                  Importing products into Firebase... ({progress.current} / {progress.total})
                </p>
                <div className="w-full bg-primary/20 rounded-full h-1.5 mt-1.5 overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-200"
                    style={{
                      width: progress.total > 0 ? `${Math.round((progress.current / progress.total) * 100)}%` : "0%",
                    }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between border-t pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => handleClose(false)}
            disabled={isProcessing}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            {parsedRows.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={resetState}
                disabled={isProcessing}
              >
                Reset
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              onClick={handleExecuteImport}
              disabled={isProcessing || parsedRows.length === 0 || (newCount === 0 && (!updateExisting || updateCount === 0))}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FileUp className="w-4 h-4 mr-1.5" />
                  Import {newCount + (updateExisting ? updateCount : 0)} Products
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
