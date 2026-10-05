// @ts-ignore
import XLSXStyle from "xlsx-js-style";
import { getStoredBrandName, replaceBrandInTitle } from "@/lib/brandConfig";

export const XLSX = (XLSXStyle as any)?.default || XLSXStyle;

export interface ExcelColumnDef {
  header: string;
  key: string;
  width?: number;
  align?: "left" | "center" | "right";
  isNumeric?: boolean;
  isCurrency?: boolean;
  isInteger?: boolean;
}

export interface ExcelExportOptions {
  title: string;
  subtitle?: string;
  sheetName?: string;
  columns: ExcelColumnDef[];
  rows: Record<string, any>[];
  rowStyler?: (row: any, index: number) => {
    isMultiCategory?: boolean;
    isSubtotal?: boolean;
    isGrandTotal?: boolean;
    textColor?: string;
    bgColor?: string;
    bold?: boolean;
  } | null;
}

/**
 * Standard colors for professional Excel exports
 */
export const EXCEL_THEME = {
  fontFamily: "Calibri",
  titleColor: "0F172A", // Slate 900
  subtitleColor: "475569", // Slate 600
  headerBg: "1E293B", // Deep Slate / Navy
  headerText: "FFFFFF",
  headerBorder: "0F172A",
  cellBorder: "E2E8F0", // Slate 200
  cellBorderDark: "CBD5E1", // Slate 300
  cellTextColor: "1E293B",
  
  // Multi-Category highlight in red (ቀይ ቀለም)
  multiCategoryTextColor: "DC2626", // Crimson Red 600
  multiCategoryBg: "FEF2F2", // Soft Red 50
  multiCategoryBorder: "FCA5A5", // Red 300
  
  // Subtotal row highlight
  subtotalBg: "EFF6FF", // Blue 50
  subtotalText: "1E3A8A", // Blue 900
  subtotalBorder: "93C5FD", // Blue 300
  
  // Grand Total row highlight
  grandTotalBg: "0F172A", // Slate 900
  grandTotalText: "FFFFFF",
  grandTotalBorder: "000000",
};

/**
 * Formats a number cleanly: whole numbers without unnecessary decimal zeros,
 * currency with 2 decimal places if applicable.
 */
export function formatNumericValue(val: any, isCurrency = false, isInteger = false): number | string {
  if (val === null || val === undefined || val === "") return "";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return val;

  if (isInteger || Math.round(num) === num) {
    return Math.round(num);
  }
  return isCurrency ? Math.round(num * 100) / 100 : num;
}

/**
 * Builds a beautifully styled, business-ready worksheet.
 */
export function buildStyledWorksheet(options: ExcelExportOptions): any {
  const { title, subtitle, columns, rows, rowStyler } = options;

  const totalCols = columns.length;
  const sheetData: any[][] = [];
  const brand = getStoredBrandName();
  const displayTitle = replaceBrandInTitle(title, brand);

  // Row 1: Report Title
  sheetData.push([displayTitle.toUpperCase()]);
  
  // Row 2: Subtitle / Metadata
  const dateStr = new Date().toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const metaText = subtitle
    ? `${subtitle} | Generated: ${dateStr}`
    : `${brand} Inventory & Management System | Generated: ${dateStr}`;
  sheetData.push([metaText]);

  // Row 3: Blank spacing row
  sheetData.push([]);

  // Row 4: Column Headers
  const headerRow = columns.map(c => c.header);
  sheetData.push(headerRow);

  // Row 5+: Data rows
  rows.forEach(row => {
    const rowValues = columns.map(col => {
      const val = row[col.key] !== undefined ? row[col.key] : "";
      if (col.isNumeric || col.isInteger || col.isCurrency) {
        if (typeof val === "number") {
          return val;
        }
        if (typeof val === "string" && val.trim() !== "" && !isNaN(Number(val))) {
          return Number(val);
        }
      }
      return val;
    });
    sheetData.push(rowValues);
  });

  const ws = XLSX.utils.aoa_to_sheet(sheetData);

  // Configure Title Row (A1)
  if (ws["A1"]) {
    ws["A1"].s = {
      font: {
        name: EXCEL_THEME.fontFamily,
        sz: 15,
        bold: true,
        color: { rgb: EXCEL_THEME.titleColor },
      },
      alignment: { vertical: "center", horizontal: "left" },
    };
  }

  // Configure Subtitle Row (A2)
  if (ws["A2"]) {
    ws["A2"].s = {
      font: {
        name: EXCEL_THEME.fontFamily,
        sz: 10,
        italic: true,
        color: { rgb: EXCEL_THEME.subtitleColor },
      },
      alignment: { vertical: "center", horizontal: "left" },
    };
  }

  // Configure Header Row (Row 4, index 3)
  const headerRowIdx = 3; // 0-based
  columns.forEach((col, cIdx) => {
    const cellRef = XLSX.utils.encode_cell({ r: headerRowIdx, c: cIdx });
    if (ws[cellRef]) {
      ws[cellRef].s = {
        font: {
          name: EXCEL_THEME.fontFamily,
          sz: 11,
          bold: true,
          color: { rgb: EXCEL_THEME.headerText },
        },
        fill: {
          patternType: "solid",
          fgColor: { rgb: EXCEL_THEME.headerBg },
        },
        border: {
          top: { style: "thin", color: { rgb: EXCEL_THEME.headerBorder } },
          bottom: { style: "medium", color: { rgb: EXCEL_THEME.headerBorder } },
          left: { style: "thin", color: { rgb: "334155" } },
          right: { style: "thin", color: { rgb: "334155" } },
        },
        alignment: {
          vertical: "center",
          horizontal: col.align || (col.isNumeric ? "right" : "center"),
          wrapText: true,
        },
      };
    }
  });

  // Configure Data Rows (Row 5+, index 4+)
  const dataStartRowIdx = 4;
  rows.forEach((row, rIdx) => {
    const currentR = dataStartRowIdx + rIdx;
    const styleInfo = rowStyler ? rowStyler(row, rIdx) : null;

    const isMultiCat = styleInfo?.isMultiCategory;
    const isSubtotal = styleInfo?.isSubtotal;
    const isGrandTotal = styleInfo?.isGrandTotal;

    columns.forEach((col, cIdx) => {
      const cellRef = XLSX.utils.encode_cell({ r: currentR, c: cIdx });
      const cell = ws[cellRef];
      if (!cell) return;

      const isNumeric = col.isNumeric || col.isInteger || col.isCurrency;
      const isWholeNum = col.isInteger || (typeof cell.v === "number" && Math.round(cell.v) === cell.v);

      // Determine formatting & colors
      let fontColor = EXCEL_THEME.cellTextColor;
      let fontBold = false;
      let fontSz = 10;
      let bgColor: string | undefined = undefined;
      let borderStyle = {
        top: { style: "thin", color: { rgb: EXCEL_THEME.cellBorder } },
        bottom: { style: "thin", color: { rgb: EXCEL_THEME.cellBorder } },
        left: { style: "thin", color: { rgb: EXCEL_THEME.cellBorder } },
        right: { style: "thin", color: { rgb: EXCEL_THEME.cellBorder } },
      };

      if (isGrandTotal) {
        bgColor = EXCEL_THEME.grandTotalBg;
        fontColor = EXCEL_THEME.grandTotalText;
        fontBold = true;
        fontSz = 11;
        borderStyle = {
          top: { style: "medium", color: { rgb: "000000" } },
          bottom: { style: "double", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "334155" } },
          right: { style: "thin", color: { rgb: "334155" } },
        };
      } else if (isSubtotal) {
        bgColor = EXCEL_THEME.subtotalBg;
        fontColor = EXCEL_THEME.subtotalText;
        fontBold = true;
        fontSz = 10.5;
        borderStyle = {
          top: { style: "thin", color: { rgb: EXCEL_THEME.subtotalBorder } },
          bottom: { style: "medium", color: { rgb: EXCEL_THEME.subtotalBorder } },
          left: { style: "thin", color: { rgb: EXCEL_THEME.subtotalBorder } },
          right: { style: "thin", color: { rgb: EXCEL_THEME.subtotalBorder } },
        };
      } else if (isMultiCat) {
        // Multi-Category Red Font Color (ቀይ ቀለም)
        fontColor = EXCEL_THEME.multiCategoryTextColor;
        bgColor = EXCEL_THEME.multiCategoryBg;
        fontBold = true;
        borderStyle = {
          top: { style: "thin", color: { rgb: EXCEL_THEME.multiCategoryBorder } },
          bottom: { style: "thin", color: { rgb: EXCEL_THEME.multiCategoryBorder } },
          left: { style: "thin", color: { rgb: EXCEL_THEME.multiCategoryBorder } },
          right: { style: "thin", color: { rgb: EXCEL_THEME.multiCategoryBorder } },
        };
      }

      if (styleInfo?.textColor) fontColor = styleInfo.textColor;
      if (styleInfo?.bgColor) bgColor = styleInfo.bgColor;
      if (styleInfo?.bold !== undefined) fontBold = styleInfo.bold;

      // Number formatting: No unnecessary decimals for whole numbers!
      let numFmt: string | undefined = undefined;
      if (isNumeric && typeof cell.v === "number") {
        if (col.isCurrency) {
          numFmt = isWholeNum ? "#,##0" : "#,##0.00";
        } else {
          numFmt = isWholeNum ? "#,##0" : "#,##0.00";
        }
      }

      const alignH = col.align || (isNumeric ? "right" : "left");

      cell.s = {
        font: {
          name: EXCEL_THEME.fontFamily,
          sz: fontSz,
          bold: fontBold,
          color: { rgb: fontColor },
        },
        fill: bgColor ? { patternType: "solid", fgColor: { rgb: bgColor } } : undefined,
        border: borderStyle,
        alignment: {
          vertical: "center",
          horizontal: alignH,
          wrapText: !isNumeric,
        },
        numFmt: numFmt,
      };
    });
  });

  // Calculate auto column widths
  const colWidths: { wch: number }[] = columns.map((col, cIdx) => {
    if (col.width) return { wch: col.width };

    let maxLen = col.header.length;
    rows.forEach(row => {
      const val = row[col.key];
      if (val !== null && val !== undefined) {
        const str = String(val);
        // If text contains newlines or pipes, check maximum segment
        const parts = str.split(/[|\n]/);
        parts.forEach(p => {
          maxLen = Math.max(maxLen, p.trim().length);
        });
      }
    });

    // Add comfortable padding, clamp between 14 and 65
    const computedW = Math.min(Math.max(maxLen + 4, 14), 65);
    return { wch: computedW };
  });

  ws["!cols"] = colWidths;

  // Row heights
  const rowHeights: { hpt: number }[] = [
    { hpt: 32 }, // Title
    { hpt: 20 }, // Subtitle
    { hpt: 10 }, // Blank
    { hpt: 28 }, // Headers
  ];
  rows.forEach((row, idx) => {
    const styleInfo = rowStyler ? rowStyler(row, idx) : null;
    if (styleInfo?.isGrandTotal) {
      rowHeights.push({ hpt: 26 });
    } else if (styleInfo?.isSubtotal) {
      rowHeights.push({ hpt: 24 });
    } else {
      rowHeights.push({ hpt: 22 });
    }
  });
  ws["!rows"] = rowHeights;

  // Freeze header row (Row 4 is 1-based index 4, split after row 4)
  ws["!views"] = [
    {
      state: "frozen",
      xSplit: 0,
      ySplit: 4, // Freeze above row 5
      topLeftCell: "A5",
      activeCell: "A5",
    },
  ];

  return ws;
}

/**
 * Automatically applies professional styles (title, headers, borders, colors, freeze panes)
 * to any existing or plain worksheet that might be exported.
 */
export function enhanceWorksheetWithProfessionalStyles(
  ws: any,
  title: string,
  subtitle?: string
): any {
  if (!ws || !ws["!ref"]) return ws;

  const range = XLSX.utils.decode_range(ws["!ref"]);
  const numCols = range.e.c - range.s.c + 1;

  // Style Header Row (row 0)
  for (let C = range.s.c; C <= range.e.c; ++C) {
    const headerRef = XLSX.utils.encode_cell({ r: range.s.r, c: C });
    if (ws[headerRef]) {
      ws[headerRef].s = {
        font: {
          name: EXCEL_THEME.fontFamily,
          sz: 11,
          bold: true,
          color: { rgb: EXCEL_THEME.headerText },
        },
        fill: {
          patternType: "solid",
          fgColor: { rgb: EXCEL_THEME.headerBg },
        },
        border: {
          top: { style: "thin", color: { rgb: EXCEL_THEME.headerBorder } },
          bottom: { style: "medium", color: { rgb: EXCEL_THEME.headerBorder } },
          left: { style: "thin", color: { rgb: "334155" } },
          right: { style: "thin", color: { rgb: "334155" } },
        },
        alignment: {
          vertical: "center",
          horizontal: "center",
          wrapText: true,
        },
      };
    }
  }

  // Style data rows
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    // Check if subtotal or grand total row
    let isSubtotal = false;
    let isGrandTotal = false;
    let isMultiCategory = false;

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];
      if (cell && typeof cell.v === "string") {
        const lower = cell.v.toLowerCase();
        if (lower.includes("grand total") || lower.includes("ጠቅላላ ድምር")) isGrandTotal = true;
        if (lower.includes("subtotal") || lower.includes("ድምር")) isSubtotal = true;
        if (lower.includes("multi-category") || lower.includes("ሁለት እና ከዚያ በላይ") || lower.includes("yes (ሁለት")) isMultiCategory = true;
      }
    }

    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = ws[cellRef];
      if (!cell) continue;

      const isNum = typeof cell.v === "number";
      const isWhole = isNum && Math.round(cell.v) === cell.v;

      let fontColor = EXCEL_THEME.cellTextColor;
      let fontBold = false;
      let bgColor: string | undefined = undefined;
      let borderStyle = {
        top: { style: "thin", color: { rgb: EXCEL_THEME.cellBorder } },
        bottom: { style: "thin", color: { rgb: EXCEL_THEME.cellBorder } },
        left: { style: "thin", color: { rgb: EXCEL_THEME.cellBorder } },
        right: { style: "thin", color: { rgb: EXCEL_THEME.cellBorder } },
      };

      if (isGrandTotal) {
        bgColor = EXCEL_THEME.grandTotalBg;
        fontColor = EXCEL_THEME.grandTotalText;
        fontBold = true;
        borderStyle = {
          top: { style: "medium", color: { rgb: "000000" } },
          bottom: { style: "double", color: { rgb: "000000" } },
          left: { style: "thin", color: { rgb: "334155" } },
          right: { style: "thin", color: { rgb: "334155" } },
        };
      } else if (isSubtotal) {
        bgColor = EXCEL_THEME.subtotalBg;
        fontColor = EXCEL_THEME.subtotalText;
        fontBold = true;
        borderStyle = {
          top: { style: "thin", color: { rgb: EXCEL_THEME.subtotalBorder } },
          bottom: { style: "medium", color: { rgb: EXCEL_THEME.subtotalBorder } },
          left: { style: "thin", color: { rgb: EXCEL_THEME.subtotalBorder } },
          right: { style: "thin", color: { rgb: EXCEL_THEME.subtotalBorder } },
        };
      } else if (isMultiCategory) {
        fontColor = EXCEL_THEME.multiCategoryTextColor;
        bgColor = EXCEL_THEME.multiCategoryBg;
        fontBold = true;
        borderStyle = {
          top: { style: "thin", color: { rgb: EXCEL_THEME.multiCategoryBorder } },
          bottom: { style: "thin", color: { rgb: EXCEL_THEME.multiCategoryBorder } },
          left: { style: "thin", color: { rgb: EXCEL_THEME.multiCategoryBorder } },
          right: { style: "thin", color: { rgb: EXCEL_THEME.multiCategoryBorder } },
        };
      }

      cell.s = {
        font: {
          name: EXCEL_THEME.fontFamily,
          sz: 10,
          bold: fontBold,
          color: { rgb: fontColor },
        },
        fill: bgColor ? { patternType: "solid", fgColor: { rgb: bgColor } } : undefined,
        border: borderStyle,
        alignment: {
          vertical: "center",
          horizontal: isNum ? "right" : "left",
          wrapText: true,
        },
        numFmt: isNum ? (isWhole ? "#,##0" : "#,##0.00") : undefined,
      };
    }
  }

  // Ensure column widths
  if (!ws["!cols"]) {
    const colWidths: { wch: number }[] = [];
    for (let C = range.s.c; C <= range.e.c; ++C) {
      let maxLen = 10;
      for (let R = range.s.r; R <= range.e.r; ++R) {
        const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[cellRef];
        if (cell && cell.v !== undefined && cell.v !== null) {
          maxLen = Math.max(maxLen, String(cell.v).length);
        }
      }
      colWidths.push({ wch: Math.min(Math.max(maxLen + 4, 12), 50) });
    }
    ws["!cols"] = colWidths;
  }

  // Freeze header row
  if (!ws["!views"]) {
    ws["!views"] = [{ state: "frozen", xSplit: 0, ySplit: range.s.r + 1 }];
  }

  return ws;
}
