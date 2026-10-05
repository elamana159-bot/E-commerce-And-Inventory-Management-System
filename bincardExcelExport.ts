import ExcelJS from "exceljs";
import type { ProductBincardGroup, BincardEntry } from "@/pages/Bincard";
import { todayIsoDate } from "@/lib/dateUtils";
import { formatEthDate } from "./ethiopianCalendar";
import { triggerFileDownload } from "./shareImage";

const isMobileDevice = typeof window !== "undefined" && (
  window.innerWidth <= 768 ||
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || "")
);

export interface BincardExcelExportOptions {
  groups: ProductBincardGroup[];
  allGroups?: ProductBincardGroup[];
  storeName?: string | null;
  companyName?: string;
  selectedProductName?: string | null;
}

// Color Palette for Excel Styles (ARGB format: AARRGGBB)
const COLORS = {
  navyDark: "FF0F172A",     // Slate 900
  navyMedium: "FF1E293B",   // Slate 800
  navyLight: "FF334155",    // Slate 700
  white: "FFFFFFFF",
  slate100: "FFF1F5F9",
  slate200: "FFE2E8F0",
  slate300: "FFCBD5E1",
  slate400: "FF94A3B8",
  slate500: "FF64748B",
  slate600: "FF475569",
  
  // Gebi / In (+) Colors (Green)
  greenBg: "FFDCFCE7",      // Soft Green 100
  greenText: "FF15803D",    // Green 700
  greenBadge: "FF16A34A",
  
  // Wechi / Out (-) Colors (Red)
  redBg: "FFFEE2E2",        // Soft Red 100
  redText: "FFB91C1C",      // Red 700
  redBadge: "FFDC2626",
  
  // Balance Colors (Blue / Cyan)
  blueBg: "FFE0F2FE",       // Sky 100
  blueText: "FF0369A1",     // Sky 700
  blueBadge: "FF0284C7",
  
  // Amber / Highlight for dropdown cell
  amberBg: "FFFEF3C7",      // Amber 100
  amberBorder: "FFF59E0B",  // Amber 500
  amberText: "FF92400E",    // Amber 800

  // Card Header Gray
  cardHeaderBg: "FFF8FAFC", // Slate 50
  cardBorder: "FF94A3B8",   // Slate 400
};

const BORDER_THIN = {
  top: { style: "thin" as const, color: { argb: COLORS.slate200 } },
  bottom: { style: "thin" as const, color: { argb: COLORS.slate200 } },
  left: { style: "thin" as const, color: { argb: COLORS.slate200 } },
  right: { style: "thin" as const, color: { argb: COLORS.slate200 } },
};

const BORDER_MEDIUM_BOTTOM = {
  top: { style: "thin" as const, color: { argb: COLORS.slate200 } },
  bottom: { style: "medium" as const, color: { argb: COLORS.navyMedium } },
  left: { style: "thin" as const, color: { argb: COLORS.slate200 } },
  right: { style: "thin" as const, color: { argb: COLORS.slate200 } },
};

/**
 * Builds and exports the comprehensive Bincard Excel workbook featuring:
 * 1. "🎯 Product Dropdown (መምረጫ)" - Interactive Data Validation dropdown cell with live KPI cards and filtered movement table
 * 2. "📂 Grouped Bincards (በየምርቱ)" - Grouped cards matching the UI screenshot with native Excel [+] / [-] collapsible outline groups!
 * 3. "📋 Master Ledger (ሙሉ ዝውውር)" - Complete flat ledger with Excel AutoFilter dropdowns on all columns
 * 4. "📦 Products List (የእቃዎች ዝርዝር)" - Reference master table of all products with total In, Out, and Balance
 */
export async function exportBincardInteractiveExcel({
  groups,
  allGroups,
  storeName,
  companyName = "YESERAHUT STOCK MANAGEMENT",
  selectedProductName,
}: BincardExcelExportOptions): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Yeserahut Stock Management System";
    workbook.lastModifiedBy = "Stock Manager";
    workbook.created = new Date();
    workbook.modified = new Date();

    const activeGroups = groups.length > 0 ? groups : (allGroups || []);
    const refGroups = (allGroups && allGroups.length > 0) ? allGroups : activeGroups;
    const storeLabel = storeName || "All Stores (ሁሉም ስቶሮች)";
    const dateStr = todayIsoDate();
    const firstGroup = activeGroups[0] || refGroups[0];

    // =========================================================================
    // SHEET 4 FIRST: "Products List" (Needed as range reference for Dropdown)
    // =========================================================================
    const wsProducts = workbook.addWorksheet("Products List", {
      properties: { tabColor: { argb: "FF64748B" } },
      views: [{ state: "frozen", ySplit: 4, xSplit: 0 }],
    });

    // Title & Meta
    wsProducts.mergeCells("A1:J1");
    const pTitle = wsProducts.getCell("A1");
    pTitle.value = `${companyName.toUpperCase()} - PRODUCTS MASTER CATALOG (የምርቶች ማጠቃለያ)`;
    pTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.white } };
    pTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyDark } };
    pTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsProducts.getRow(1).height = 30;

    wsProducts.mergeCells("A2:J2");
    const pSub = wsProducts.getCell("A2");
    pSub.value = `Store: ${storeLabel} | Date: ${dateStr} | Total Products: ${refGroups.length}`;
    pSub.font = { name: "Calibri", size: 10, italic: true, color: { argb: COLORS.slate600 } };
    pSub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsProducts.getRow(2).height = 20;

    wsProducts.getRow(3).height = 10; // blank row

    // Table Headers
    const prodHeaders = [
      "#",
      "Product Name (የእቃ ስም)",
      "Product Code (ኮድ)",
      "Qty/Ctn (ፍሬ/ካርቶን)",
      "Total In / ገቢ (+)",
      "Total Out / ወጪ (-)",
      "Balance (Pcs / ፍሬ)",
      "Balance (Ctns / ካርቶን)",
      "Movements (ዝውውር)",
      "Status (ሁኔታ)",
    ];
    const prodHRow = wsProducts.addRow(prodHeaders);
    prodHRow.height = 26;
    prodHRow.eachCell((cell, colNum) => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyMedium } };
      cell.alignment = { vertical: "middle", horizontal: colNum >= 4 && colNum <= 9 ? "right" : colNum === 1 ? "center" : "left" };
      cell.border = BORDER_MEDIUM_BOTTOM;
    });

    // Add Product Rows
    refGroups.forEach((g, idx) => {
      const qpc = g.product.quantityPerCarton > 0 ? g.product.quantityPerCarton : 1;
      const r = wsProducts.addRow([
        idx + 1,
        g.product.name,
        g.product.code || "",
        qpc,
        g.totalIn,
        g.totalOut,
        g.balance,
        g.balanceCartons,
        g.entries.length,
        g.balance > 0 ? "In Stock (በክምችት)" : g.balance === 0 ? "Zero Stock (ባዶ)" : "Negative (ተቀናሽ)",
      ]);
      r.height = 22;
      r.eachCell((cell, colNum) => {
        cell.font = { name: "Calibri", size: 10, color: { argb: COLORS.navyDark } };
        cell.border = BORDER_THIN;
        if (colNum === 1) cell.alignment = { vertical: "middle", horizontal: "center" };
        else if (colNum === 2) cell.alignment = { vertical: "middle", horizontal: "left" };
        else if (colNum === 3) {
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.font = { name: "Consolas", size: 10, color: { argb: COLORS.slate600 } };
        } else if (colNum === 5) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.greenText } };
          cell.numFmt = "#,##0";
        } else if (colNum === 6) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.redText } };
          cell.numFmt = "#,##0";
        } else if (colNum === 7) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.blueText } };
          cell.numFmt = "#,##0";
        } else if (colNum === 8) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.numFmt = "0.00";
        } else if (colNum >= 4) {
          cell.alignment = { vertical: "middle", horizontal: "right" };
          cell.numFmt = "#,##0";
        }
      });
    });

    // Products List Totals Row
    const pTotRow = wsProducts.addRow([
      "",
      "TOTALS (ድምር)",
      "",
      "",
      { formula: `SUM(E5:E${refGroups.length + 4})` },
      { formula: `SUM(F5:F${refGroups.length + 4})` },
      { formula: `SUM(G5:G${refGroups.length + 4})` },
      { formula: `SUM(H5:H${refGroups.length + 4})` },
      { formula: `SUM(I5:I${refGroups.length + 4})` },
      "",
    ]);
    pTotRow.height = 25;
    pTotRow.eachCell((cell, colNum) => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyDark } };
      cell.alignment = { vertical: "middle", horizontal: colNum >= 4 ? "right" : "left" };
      cell.border = {
        top: { style: "medium", color: { argb: COLORS.navyDark } },
        bottom: { style: "double", color: { argb: COLORS.navyDark } },
      };
      if (colNum >= 5 && colNum <= 7) cell.numFmt = "#,##0";
      if (colNum === 8) cell.numFmt = "0.00";
    });

    wsProducts.columns = [
      { width: 6 },
      { width: 34 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 16 },
      { width: 18 },
      { width: 16 },
      { width: 14 },
      { width: 18 },
    ];
    wsProducts.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: refGroups.length + 4, column: 10 },
    };


    // =========================================================================
    // SHEET 3: "Master Ledger" (Complete Flat Ledger for Dynamic Lookup & Filtering)
    // =========================================================================
    const wsMaster = workbook.addWorksheet("Master Ledger", {
      properties: { tabColor: { argb: "FF0284C7" } },
      views: [{ state: "frozen", ySplit: 4, xSplit: 0 }],
    });

    wsMaster.mergeCells("A1:K1");
    const mTitle = wsMaster.getCell("A1");
    mTitle.value = `${companyName.toUpperCase()} - MASTER BINCARD LEDGER (የሁሉም እቃዎች ዝውውር መዝገብ)`;
    mTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.white } };
    mTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyDark } };
    mTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsMaster.getRow(1).height = 30;

    wsMaster.mergeCells("A2:K2");
    const mSub = wsMaster.getCell("A2");
    mSub.value = `Store: ${storeLabel} | Date: ${dateStr} | Click the dropdown arrow on Product column to filter!`;
    mSub.font = { name: "Calibri", size: 10, italic: true, color: { argb: COLORS.slate600 } };
    mSub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsMaster.getRow(2).height = 20;

    wsMaster.getRow(3).height = 10;

    const masterHeaders = [
      "Product Name (የእቃ ስም)",
      "Product Code (ኮድ)",
      "Date (ቀን)",
      "Type (ዓይነት)",
      "Details (ዝርዝር)",
      "Voucher ID (ደረሰኝ)",
      "Store (ስቶር)",
      "Cartons (ካርቶን)",
      "In / ገቢ (+)",
      "Out / ወጪ (-)",
      "Balance (ቀሪ)",
    ];
    const mHRow = wsMaster.addRow(masterHeaders);
    mHRow.height = 26;
    mHRow.eachCell((cell, colNum) => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyMedium } };
      cell.alignment = { vertical: "middle", horizontal: colNum >= 8 ? "right" : colNum === 3 || colNum === 4 || colNum === 6 ? "center" : "left" };
      cell.border = BORDER_MEDIUM_BOTTOM;
    });

    let totalLedgerRows = 0;
    activeGroups.forEach(g => {
      g.entries.forEach(e => {
        totalLedgerRows++;
        const inQty = e.direction === "in" ? e.quantity : 0;
        const outQty = e.direction === "out" ? e.quantity : 0;
        const r = wsMaster.addRow([
          g.product.name,
          g.product.code || "",
          e.date ? `${formatEthDate(e.date, { short: true })} (${e.date})` : "",
          e.type,
          e.details || "",
          e.voucherId,
          e.storeName,
          e.cartons > 0 ? e.cartons : "",
          inQty > 0 ? inQty : 0,
          outQty > 0 ? outQty : 0,
          e.balance,
        ]);
        r.height = 20;
        r.eachCell((cell, colNum) => {
          cell.font = { name: "Calibri", size: 10, color: { argb: COLORS.navyDark } };
          cell.border = BORDER_THIN;
          if (colNum === 1) cell.alignment = { vertical: "middle", horizontal: "left" };
          else if (colNum === 2 || colNum === 3 || colNum === 4 || colNum === 6) {
            cell.alignment = { vertical: "middle", horizontal: "center" };
          } else if (colNum === 5 || colNum === 7) {
            cell.alignment = { vertical: "middle", horizontal: "left" };
          } else if (colNum === 8) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = "0.00";
          } else if (colNum === 9) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = "#,##0";
            if (inQty > 0) cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.greenText } };
          } else if (colNum === 10) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = "#,##0";
            if (outQty > 0) cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.redText } };
          } else if (colNum === 11) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = "#,##0";
            cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.navyDark } };
          }
        });
      });
    });

    wsMaster.columns = [
      { width: 32 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
      { width: 28 },
      { width: 16 },
      { width: 22 },
      { width: 12 },
      { width: 14 },
      { width: 14 },
      { width: 15 },
    ];
    const lastMasterRow = Math.max(totalLedgerRows + 4, 5);
    wsMaster.autoFilter = {
      from: { row: 4, column: 1 },
      to: { row: lastMasterRow, column: 11 },
    };


    // =========================================================================
    // SHEET 1: "🎯 Product Dropdown (መምረጫ)"
    // Live interactive selector cell with Data Validation, live KPI formulas & ledger
    // =========================================================================
    const wsDropdown = workbook.addWorksheet("🎯 Product Dropdown (መምረጫ)", {
      properties: { tabColor: { argb: "FF10B981" } },
      views: [{ state: "normal", showGridLines: true }],
    });

    // Banner Header
    wsDropdown.mergeCells("A1:H1");
    const dTitle = wsDropdown.getCell("A1");
    dTitle.value = `🎯 ${companyName.toUpperCase()} - INTERACTIVE BINCARD SELECTOR`;
    dTitle.font = { name: "Calibri", size: 15, bold: true, color: { argb: COLORS.white } };
    dTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyDark } };
    dTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsDropdown.getRow(1).height = 32;

    wsDropdown.mergeCells("A2:H2");
    const dSub = wsDropdown.getCell("A2");
    dSub.value = `Store: ${storeLabel} | Date: ${dateStr} | 👇 Click Cell C4 below to select any product from the dropdown list!`;
    dSub.font = { name: "Calibri", size: 10, italic: true, color: { argb: COLORS.slate600 } };
    dSub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsDropdown.getRow(2).height = 20;

    wsDropdown.getRow(3).height = 12; // spacer

    // Row 4: Prominent Dropdown Selection Control
    wsDropdown.getRow(4).height = 34;

    wsDropdown.getCell("B4").value = "👉 Select Product (እቃ ይምረጡ):";
    wsDropdown.getCell("B4").font = { name: "Calibri", size: 11.5, bold: true, color: { argb: COLORS.navyDark } };
    wsDropdown.getCell("B4").alignment = { vertical: "middle", horizontal: "right" };

    // Cell C4 is the interactive Drop Down!
    const dropdownCell = wsDropdown.getCell("C4");
    const defaultProduct = firstGroup ? firstGroup.product.name : "Select Product";
    dropdownCell.value = defaultProduct;
    dropdownCell.font = { name: "Calibri", size: 12, bold: true, color: { argb: COLORS.amberText } };
    dropdownCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.amberBg } };
    dropdownCell.border = {
      top: { style: "medium", color: { argb: COLORS.amberBorder } },
      bottom: { style: "medium", color: { argb: COLORS.amberBorder } },
      left: { style: "medium", color: { argb: COLORS.amberBorder } },
      right: { style: "medium", color: { argb: COLORS.amberBorder } },
    };
    dropdownCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

    // Apply Excel Data Validation: list referencing Products List
    const numRefProds = refGroups.length;
    dropdownCell.dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: [`'Products List'!$B$5:$B$${numRefProds + 4}`],
      showErrorMessage: true,
      errorTitle: "Invalid Product",
      error: "Please select a product from the dropdown list.",
      promptTitle: "Select Product (ምርት ይምረጡ)",
      prompt: "Click the dropdown arrow to view this product's In, Out, and Balance.",
    };

    wsDropdown.getCell("D4").value = "◀ Click arrow to switch product! (እቃ ለመቀየር ቀስቱን ጠቅ ያድርጉ)";
    wsDropdown.getCell("D4").font = { name: "Calibri", size: 10, italic: true, color: { argb: COLORS.slate500 } };
    wsDropdown.getCell("D4").alignment = { vertical: "middle", horizontal: "left" };

    wsDropdown.getRow(5).height = 14; // spacer

    // Row 6 & 7: KPI Metric Cards (Calculated dynamically from the selected product in C4!)
    wsDropdown.getRow(6).height = 20;
    wsDropdown.getRow(7).height = 32;

    interface KpiCardDef {
      col: string;
      title: string;
      formula: string;
      fallbackVal: number | string;
      numFmt?: string;
      bg: string;
      textColor: string;
      sz: number;
    }

    const firstQpc = firstGroup?.product.quantityPerCarton || 1;
    const kpiCards: KpiCardDef[] = [
      {
        col: "B",
        title: "Product Code (የእቃ ኮድ)",
        formula: `IFERROR(VLOOKUP($C$4, 'Products List'!$B$5:$J$${numRefProds + 4}, 2, FALSE), "")`,
        fallbackVal: firstGroup?.product.code || "",
        bg: COLORS.slate100,
        textColor: COLORS.navyDark,
        sz: 12,
      },
      {
        col: "C",
        title: "Qty / Carton (ፍሬ/ካርቶን)",
        formula: `IFERROR(VLOOKUP($C$4, 'Products List'!$B$5:$J$${numRefProds + 4}, 3, FALSE), 1)`,
        fallbackVal: firstQpc,
        numFmt: "#,##0",
        bg: COLORS.slate100,
        textColor: COLORS.navyDark,
        sz: 12,
      },
      {
        col: "D",
        title: "Total In / Gebi (ጠቅላላ ገቢ +)",
        formula: `IFERROR(SUMIFS('Master Ledger'!$I:$I, 'Master Ledger'!$A:$A, $C$4), 0)`,
        fallbackVal: firstGroup?.totalIn || 0,
        numFmt: "#,##0",
        bg: COLORS.greenBg,
        textColor: COLORS.greenText,
        sz: 14,
      },
      {
        col: "E",
        title: "Total Out / Wechi (ጠቅላላ ወጪ -)",
        formula: `IFERROR(SUMIFS('Master Ledger'!$J:$J, 'Master Ledger'!$A:$A, $C$4), 0)`,
        fallbackVal: firstGroup?.totalOut || 0,
        numFmt: "#,##0",
        bg: COLORS.redBg,
        textColor: COLORS.redText,
        sz: 14,
      },
      {
        col: "F",
        title: "Stock Balance (ቀሪ ፍሬ)",
        formula: `IFERROR(D7-E7, 0)`,
        fallbackVal: firstGroup?.balance || 0,
        numFmt: "#,##0",
        bg: COLORS.blueBg,
        textColor: COLORS.blueText,
        sz: 15,
      },
      {
        col: "G",
        title: "Balance (Cartons / ካርቶን)",
        formula: `IFERROR(IF(C7>0, ROUND(F7/C7, 2), 0), 0)`,
        fallbackVal: firstGroup?.balanceCartons || 0,
        numFmt: "0.00",
        bg: COLORS.blueBg,
        textColor: COLORS.blueText,
        sz: 13,
      },
      {
        col: "H",
        title: "Transactions (የዝውውር ብዛት)",
        formula: `IFERROR(COUNTIF('Master Ledger'!$A:$A, $C$4), 0)`,
        fallbackVal: firstGroup?.entries.length || 0,
        numFmt: "#,##0",
        bg: COLORS.slate100,
        textColor: COLORS.navyDark,
        sz: 12,
      },
    ];

    kpiCards.forEach(card => {
      // Header Card
      const hCell = wsDropdown.getCell(`${card.col}6`);
      hCell.value = card.title;
      hCell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: COLORS.slate600 } };
      hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.slate200 } };
      hCell.alignment = { vertical: "middle", horizontal: "center" };
      hCell.border = {
        top: { style: "thin", color: { argb: COLORS.slate300 } },
        bottom: { style: "thin", color: { argb: COLORS.slate300 } },
        left: { style: "thin", color: { argb: COLORS.slate300 } },
        right: { style: "thin", color: { argb: COLORS.slate300 } },
      };

      // Value Card
      const vCell = wsDropdown.getCell(`${card.col}7`);
      vCell.value = {
        formula: card.formula,
        result: card.fallbackVal as any,
      };
      vCell.font = { name: "Calibri", size: card.sz, bold: true, color: { argb: card.textColor } };
      vCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: card.bg } };
      vCell.alignment = { vertical: "middle", horizontal: "center" };
      vCell.border = {
        top: { style: "thin", color: { argb: COLORS.slate300 } },
        bottom: { style: "medium", color: { argb: COLORS.slate400 } },
        left: { style: "thin", color: { argb: COLORS.slate300 } },
        right: { style: "thin", color: { argb: COLORS.slate300 } },
      };
      if (card.numFmt) vCell.numFmt = card.numFmt;
    });

    wsDropdown.getRow(8).height = 14; // spacer

    // Row 9: Table Section Title
    wsDropdown.mergeCells("B9:H9");
    const secTitle = wsDropdown.getCell("B9");
    secTitle.value = "Movement Ledger for Selected Product (የተመረጠው እቃ ዝውውር ታሪክ)";
    secTitle.font = { name: "Calibri", size: 11.5, bold: true, color: { argb: COLORS.navyDark } };
    secTitle.alignment = { vertical: "middle", horizontal: "left" };
    wsDropdown.getRow(9).height = 24;

    // Row 10: Table Column Headers
    const ddHeaders = [
      "",
      "Date (ቀን)",
      "Type (ዓይነት)",
      "Details (ዝርዝር)",
      "Voucher ID (ደረሰኝ)",
      "Store (ስቶር)",
      "Cartons (ካርቶን)",
      "In / ገቢ (+)",
      "Out / ወጪ (-)",
      "Balance (ቀሪ)",
    ];
    const ddHRow = wsDropdown.getRow(10);
    ddHRow.height = 26;
    for (let c = 1; c <= 9; c++) {
      const colLetter = String.fromCharCode(65 + c); // B, C, D, ... J
      const cell = wsDropdown.getCell(`${colLetter}10`);
      cell.value = ddHeaders[c];
      cell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyMedium } };
      cell.alignment = { vertical: "middle", horizontal: c >= 6 ? "right" : c === 1 || c === 2 || c === 4 ? "center" : "left" };
      cell.border = BORDER_MEDIUM_BOTTOM;
    }

    // Pre-populate initial movement rows for first product for universal compatibility across all Excel versions
    const firstEntries = firstGroup ? firstGroup.entries : [];
    if (firstEntries.length === 0) {
      const emptyRow = wsDropdown.getRow(11);
      emptyRow.height = 24;
      wsDropdown.mergeCells("B11:J11");
      const emptyCell = wsDropdown.getCell("B11");
      emptyCell.value = "No transactions recorded yet for this product. Select another product from cell C4 above.";
      emptyCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: COLORS.slate500 } };
      emptyCell.alignment = { vertical: "middle", horizontal: "center" };
      emptyCell.border = BORDER_THIN;
    } else {
      firstEntries.forEach((e, idx) => {
        const rowNum = 11 + idx;
        const row = wsDropdown.getRow(rowNum);
        row.height = 20;

        const inQty = e.direction === "in" ? e.quantity : 0;
        const outQty = e.direction === "out" ? e.quantity : 0;

        const rowValues = [
          e.date ? `${formatEthDate(e.date, { short: true })} (${e.date})` : "",
          e.type,
          e.details || "",
          e.voucherId,
          e.storeName,
          e.cartons > 0 ? e.cartons : "",
          inQty > 0 ? inQty : 0,
          outQty > 0 ? outQty : 0,
          e.balance,
        ];

        for (let c = 0; c < rowValues.length; c++) {
          const colLetter = String.fromCharCode(66 + c); // B to J
          const cell = wsDropdown.getCell(`${colLetter}${rowNum}`);
          cell.value = rowValues[c];
          cell.font = { name: "Calibri", size: 10, color: { argb: COLORS.navyDark } };
          cell.border = BORDER_THIN;

          if (c === 0 || c === 1 || c === 3) {
            cell.alignment = { vertical: "middle", horizontal: "center" };
          } else if (c === 2 || c === 4) {
            cell.alignment = { vertical: "middle", horizontal: "left" };
          } else if (c === 5) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = "0.00";
          } else if (c === 6) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = "#,##0";
            if (inQty > 0) cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.greenText } };
          } else if (c === 7) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = "#,##0";
            if (outQty > 0) cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.redText } };
          } else if (c === 8) {
            cell.alignment = { vertical: "middle", horizontal: "right" };
            cell.numFmt = "#,##0";
            cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.navyDark } };
          }
        }
      });

      // Initial Total Summary Row
      const totRowNum = 11 + firstEntries.length;
      const tRow = wsDropdown.getRow(totRowNum);
      tRow.height = 24;
      wsDropdown.mergeCells(`B${totRowNum}:G${totRowNum}`);
      const tCell = wsDropdown.getCell(`B${totRowNum}`);
      tCell.value = `Balance for ${firstGroup.product.name}:`;
      tCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.navyDark } };
      tCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
      tCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.slate100 } };
      tCell.border = { top: { style: "medium", color: { argb: COLORS.navyDark } }, bottom: { style: "double", color: { argb: COLORS.navyDark } } };

      const inTotCell = wsDropdown.getCell(`H${totRowNum}`);
      inTotCell.value = firstGroup.totalIn;
      inTotCell.numFmt = "#,##0";
      inTotCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.greenText } };
      inTotCell.alignment = { vertical: "middle", horizontal: "right" };
      inTotCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenBg } };
      inTotCell.border = { top: { style: "medium", color: { argb: COLORS.navyDark } }, bottom: { style: "double", color: { argb: COLORS.navyDark } } };

      const outTotCell = wsDropdown.getCell(`I${totRowNum}`);
      outTotCell.value = firstGroup.totalOut;
      outTotCell.numFmt = "#,##0";
      outTotCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.redText } };
      outTotCell.alignment = { vertical: "middle", horizontal: "right" };
      outTotCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.redBg } };
      outTotCell.border = { top: { style: "medium", color: { argb: COLORS.navyDark } }, bottom: { style: "double", color: { argb: COLORS.navyDark } } };

      const balTotCell = wsDropdown.getCell(`J${totRowNum}`);
      balTotCell.value = firstGroup.balance;
      balTotCell.numFmt = "#,##0";
      balTotCell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.blueText } };
      balTotCell.alignment = { vertical: "middle", horizontal: "right" };
      balTotCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blueBg } };
      balTotCell.border = { top: { style: "medium", color: { argb: COLORS.navyDark } }, bottom: { style: "double", color: { argb: COLORS.navyDark } } };
    }

    wsDropdown.columns = [
      { width: 4 },   // A
      { width: 14 },  // B (Date)
      { width: 16 },  // C (Type / Dropdown)
      { width: 26 },  // D (Details / In)
      { width: 16 },  // E (Voucher / Out)
      { width: 22 },  // F (Store / Bal)
      { width: 14 },  // G (Ctns)
      { width: 14 },  // H (In)
      { width: 14 },  // I (Out)
      { width: 16 },  // J (Bal)
    ];


    // =========================================================================
    // SHEET 2: "📂 Grouped Bincards (በየምርቱ)"
    // Native Excel Accordion Grouping ([+] / [-] Outlines matching UI screenshot!)
    // =========================================================================
    const wsGrouped = workbook.addWorksheet("📂 Grouped Bincards (በየምርቱ)", {
      properties: { 
        tabColor: { argb: "FF6366F1" },
        outlineProperties: { summaryBelow: true, summaryRight: true },
      },
      views: [{ state: "frozen", ySplit: 4, xSplit: 0, showGridLines: true }],
    });

    wsGrouped.mergeCells("A1:I1");
    const gTitle = wsGrouped.getCell("A1");
    gTitle.value = `${companyName.toUpperCase()} - GROUPED BINCARD CARDS (በየምርቱ የተከፋፈለ)`;
    gTitle.font = { name: "Calibri", size: 14, bold: true, color: { argb: COLORS.white } };
    gTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyDark } };
    gTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsGrouped.getRow(1).height = 30;

    wsGrouped.mergeCells("A2:I2");
    const gSub = wsGrouped.getCell("A2");
    gSub.value = `Store: ${storeLabel} | Date: ${dateStr} | Total Products: ${activeGroups.length} | Click [+] or [-] on the left to collapse or expand!`;
    gSub.font = { name: "Calibri", size: 10, italic: true, color: { argb: COLORS.slate600 } };
    gSub.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    wsGrouped.getRow(2).height = 20;

    wsGrouped.getRow(3).height = 10;

    // Table Column Headers (Top)
    const groupedColHeaders = [
      "Date (ቀን)",
      "Type (ዓይነት)",
      "Details (ዝርዝር)",
      "Voucher ID (ደረሰኝ)",
      "Store (ስቶር)",
      "Ctns (ካርቶን)",
      "In / ገቢ (+)",
      "Out / ወጪ (-)",
      "Balance (ቀሪ)",
    ];
    const gHRow = wsGrouped.addRow(groupedColHeaders);
    gHRow.height = 26;
    gHRow.eachCell((cell, colNum) => {
      cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: COLORS.white } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navyMedium } };
      cell.alignment = { vertical: "middle", horizontal: colNum >= 6 ? "right" : colNum === 1 || colNum === 2 || colNum === 4 ? "center" : "left" };
      cell.border = BORDER_MEDIUM_BOTTOM;
    });

    let currentGRow = 5;

    activeGroups.forEach(g => {
      const qpc = g.product.quantityPerCarton > 0 ? g.product.quantityPerCarton : 1;

      // 1. PRODUCT HEADER BANNER ROW (Matches screenshot banner!)
      // Screenshot: Wireless ANC Pro Headphones | ELEC-001 | Qty/Ctn: 10 • 3 movements | +300 in | -10 out | Bal: 290 pcs (29 ctn)
      const bannerRow = wsGrouped.getRow(currentGRow);
      bannerRow.height = 28;

      // Merge A:C for Product Name & Code
      wsGrouped.mergeCells(`A${currentGRow}:C${currentGRow}`);
      const pCell = wsGrouped.getCell(`A${currentGRow}`);
      pCell.value = `📦 ${g.product.name}   [${g.product.code || "NO-CODE"}]`;
      pCell.font = { name: "Calibri", size: 11.5, bold: true, color: { argb: COLORS.navyDark } };
      pCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.cardHeaderBg } };
      pCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      pCell.border = {
        top: { style: "medium", color: { argb: COLORS.cardBorder } },
        bottom: { style: "thin", color: { argb: COLORS.slate300 } },
        left: { style: "medium", color: { argb: COLORS.cardBorder } },
      };

      // Merge D:E for Qty/Ctn & movement count
      wsGrouped.mergeCells(`D${currentGRow}:E${currentGRow}`);
      const metaCell = wsGrouped.getCell(`D${currentGRow}`);
      metaCell.value = `Qty/Ctn: ${qpc} • ${g.entries.length} movements`;
      metaCell.font = { name: "Calibri", size: 10, color: { argb: COLORS.slate600 } };
      metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.cardHeaderBg } };
      metaCell.alignment = { vertical: "middle", horizontal: "left" };
      metaCell.border = {
        top: { style: "medium", color: { argb: COLORS.cardBorder } },
        bottom: { style: "thin", color: { argb: COLORS.slate300 } },
      };

      // F: Ctns balance
      const fCell = wsGrouped.getCell(`F${currentGRow}`);
      fCell.value = `${g.balanceCartons} ctns`;
      fCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.navyLight } };
      fCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.cardHeaderBg } };
      fCell.alignment = { vertical: "middle", horizontal: "right" };
      fCell.border = {
        top: { style: "medium", color: { argb: COLORS.cardBorder } },
        bottom: { style: "thin", color: { argb: COLORS.slate300 } },
      };

      // G: In (+) badge
      const gCell = wsGrouped.getCell(`G${currentGRow}`);
      gCell.value = `+${g.totalIn} in`;
      gCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.greenText } };
      gCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenBg } };
      gCell.alignment = { vertical: "middle", horizontal: "center" };
      gCell.border = {
        top: { style: "medium", color: { argb: COLORS.cardBorder } },
        bottom: { style: "thin", color: { argb: COLORS.slate300 } },
      };

      // H: Out (-) badge
      const hCell = wsGrouped.getCell(`H${currentGRow}`);
      hCell.value = `-${g.totalOut} out`;
      hCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.redText } };
      hCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.redBg } };
      hCell.alignment = { vertical: "middle", horizontal: "center" };
      hCell.border = {
        top: { style: "medium", color: { argb: COLORS.cardBorder } },
        bottom: { style: "thin", color: { argb: COLORS.slate300 } },
      };

      // I: Bal badge
      const iCell = wsGrouped.getCell(`I${currentGRow}`);
      iCell.value = `Bal: ${g.balance} (${g.balanceCartons} ctn)`;
      iCell.font = { name: "Calibri", size: 10.5, bold: true, color: { argb: COLORS.blueText } };
      iCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blueBg } };
      iCell.alignment = { vertical: "middle", horizontal: "center" };
      iCell.border = {
        top: { style: "medium", color: { argb: COLORS.cardBorder } },
        bottom: { style: "thin", color: { argb: COLORS.slate300 } },
        right: { style: "medium", color: { argb: COLORS.cardBorder } },
      };

      currentGRow++;

      // 2. TRANSACTION ROWS (With outlineLevel = 1 for Excel tree collapse/expand!)
      if (g.entries.length === 0) {
        const noMovRow = wsGrouped.getRow(currentGRow);
        noMovRow.height = 20;
        noMovRow.outlineLevel = 1;
        wsGrouped.mergeCells(`A${currentGRow}:I${currentGRow}`);
        const c = wsGrouped.getCell(`A${currentGRow}`);
        c.value = "No movement recorded for this product";
        c.font = { name: "Calibri", size: 9.5, italic: true, color: { argb: COLORS.slate500 } };
        c.alignment = { vertical: "middle", horizontal: "center" };
        c.border = BORDER_THIN;
        currentGRow++;
      } else {
        g.entries.forEach(e => {
          const mRow = wsGrouped.getRow(currentGRow);
          mRow.height = 20;
          mRow.outlineLevel = 1; // Allows collapsing/expanding with Excel native [+] / [-]!

          const inQty = e.direction === "in" ? e.quantity : 0;
          const outQty = e.direction === "out" ? e.quantity : 0;

          const rowVals = [
            e.date ? `${formatEthDate(e.date, { short: true })} (${e.date})` : "",
            e.type,
            e.details || "",
            e.voucherId,
            e.storeName,
            e.cartons > 0 ? e.cartons : "",
            inQty > 0 ? inQty : "",
            outQty > 0 ? outQty : "",
            e.balance,
          ];

          for (let c = 0; c < rowVals.length; c++) {
            const colLetter = String.fromCharCode(65 + c);
            const cell = wsGrouped.getCell(`${colLetter}${currentGRow}`);
            cell.value = rowVals[c];
            cell.font = { name: "Calibri", size: 9.5, color: { argb: COLORS.navyDark } };
            cell.border = BORDER_THIN;

            if (c === 0 || c === 1 || c === 3) {
              cell.alignment = { vertical: "middle", horizontal: "center" };
            } else if (c === 2 || c === 4) {
              cell.alignment = { vertical: "middle", horizontal: "left" };
            } else if (c === 5) {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              cell.numFmt = "0.00";
            } else if (c === 6) {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              cell.numFmt = "#,##0";
              if (inQty > 0) cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: COLORS.greenText } };
            } else if (c === 7) {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              cell.numFmt = "#,##0";
              if (outQty > 0) cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: COLORS.redText } };
            } else if (c === 8) {
              cell.alignment = { vertical: "middle", horizontal: "right" };
              cell.numFmt = "#,##0";
              cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: COLORS.navyDark } };
            }
          }
          currentGRow++;
        });
      }

      // 3. PRODUCT BALANCE SUMMARY ROW (Bottom Footer Bar)
      // Matches screenshot: Balance for Wireless ANC Pro Headphones: +300 in, -10 out, 290 pcs (29 ctn)
      const sumRow = wsGrouped.getRow(currentGRow);
      sumRow.height = 24;
      sumRow.outlineLevel = 0;

      wsGrouped.mergeCells(`A${currentGRow}:E${currentGRow}`);
      const sumTitleCell = wsGrouped.getCell(`A${currentGRow}`);
      sumTitleCell.value = `Balance for ${g.product.name}:`;
      sumTitleCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.navyDark } };
      sumTitleCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
      sumTitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.slate100 } };
      sumTitleCell.border = {
        top: { style: "thin", color: { argb: COLORS.slate300 } },
        bottom: { style: "medium", color: { argb: COLORS.cardBorder } },
        left: { style: "medium", color: { argb: COLORS.cardBorder } },
      };

      const ctnSum = wsGrouped.getCell(`F${currentGRow}`);
      ctnSum.value = `${g.balanceCartons} ctns`;
      ctnSum.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.navyLight } };
      ctnSum.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.slate100 } };
      ctnSum.alignment = { vertical: "middle", horizontal: "right" };
      ctnSum.border = {
        top: { style: "thin", color: { argb: COLORS.slate300 } },
        bottom: { style: "medium", color: { argb: COLORS.cardBorder } },
      };

      const inSum = wsGrouped.getCell(`G${currentGRow}`);
      inSum.value = `+${g.totalIn}`;
      inSum.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.greenText } };
      inSum.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.greenBg } };
      inSum.alignment = { vertical: "middle", horizontal: "right" };
      inSum.border = {
        top: { style: "thin", color: { argb: COLORS.slate300 } },
        bottom: { style: "medium", color: { argb: COLORS.cardBorder } },
      };

      const outSum = wsGrouped.getCell(`H${currentGRow}`);
      outSum.value = `-${g.totalOut}`;
      outSum.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.redText } };
      outSum.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.redBg } };
      outSum.alignment = { vertical: "middle", horizontal: "right" };
      outSum.border = {
        top: { style: "thin", color: { argb: COLORS.slate300 } },
        bottom: { style: "medium", color: { argb: COLORS.cardBorder } },
      };

      const balSum = wsGrouped.getCell(`I${currentGRow}`);
      balSum.value = `${g.balance} pcs (${g.balanceCartons} ctn)`;
      balSum.font = { name: "Calibri", size: 10, bold: true, color: { argb: COLORS.blueText } };
      balSum.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.blueBg } };
      balSum.alignment = { vertical: "middle", horizontal: "right" };
      balSum.border = {
        top: { style: "thin", color: { argb: COLORS.slate300 } },
        bottom: { style: "medium", color: { argb: COLORS.cardBorder } },
        right: { style: "medium", color: { argb: COLORS.cardBorder } },
      };

      currentGRow++;

      // Blank spacing row between product cards
      const spacerRow = wsGrouped.getRow(currentGRow);
      spacerRow.height = 12;
      currentGRow++;
    });

    wsGrouped.columns = [
      { width: 14 },  // Date
      { width: 16 },  // Type
      { width: 28 },  // Details
      { width: 16 },  // Voucher
      { width: 22 },  // Store
      { width: 12 },  // Ctns
      { width: 14 },  // In (+)
      { width: 14 },  // Out (-)
      { width: 24 },  // Balance
    ];


    // =========================================================================
    // WRITE WORKBOOK & TRIGGER DOWNLOAD / MOBILE SHARE
    // =========================================================================
    const buffer = await workbook.xlsx.writeBuffer();
    const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = new Blob([buffer], { type: mimeType });
    const filename = `bincard_${(storeName || "all_stores").replace(/[^a-zA-Z0-9_-]/g, "_")}_${dateStr}.xlsx`;

    // Try Web Share API on mobile devices first
    if (isMobileDevice && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], filename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: filename.replace(/\.xlsx$/, ""),
          });
          return "shared";
        }
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") {
          return "shared";
        }
        console.warn("navigator.share failed, downloading directly:", shareErr);
      }
    }

    triggerFileDownload(blob, filename);
    return "downloaded";
  } catch (err) {
    console.error("exportBincardInteractiveExcel failed:", err);
    return "failed";
  }
}
