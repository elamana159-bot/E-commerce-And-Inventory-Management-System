import jsPDF from "jspdf";
import autoTable, { UserOptions } from "jspdf-autotable";
import { triggerFileDownload } from "./shareImage";
import {
  getStoredBrandName,
  getStoredBrandTagline,
  replaceBrandInTitle,
  getSystemHeaderBadge,
  getSystemFooterBranding,
} from "@/lib/brandConfig";

export interface PdfColumnDef {
  header: string;
  key: string;
  width?: number; // relative weight or approximate mm
  align?: "left" | "center" | "right";
  isNumeric?: boolean;
  isCurrency?: boolean;
  isInteger?: boolean;
}

export interface PdfExportOptions {
  title: string;
  subtitle?: string;
  filename: string;
  brandName?: string;
  brandTagline?: string;
  orientation?: "portrait" | "landscape" | "auto";
  columns: PdfColumnDef[];
  rows: Record<string, any>[];
  summaryCards?: { label: string; value: string | number }[];
  rowStyler?: (row: any, index: number) => {
    isMultiCategory?: boolean;
    isSubtotal?: boolean;
    isGrandTotal?: boolean;
    textColor?: [number, number, number];
    bgColor?: [number, number, number];
    bold?: boolean;
  } | null;
  footRows?: (string | number)[][];
}

/**
 * Format numeric value cleanly:
 * - Whole numbers have NO decimals (e.g. 1,200)
 * - Decimals only when there are fraction values or isCurrency (e.g. 1,200.50)
 */
export function formatPdfNumeric(val: any, isCurrency = false, isInteger = false): string {
  if (val === null || val === undefined || val === "") return "";
  const num = typeof val === "number" ? val : parseFloat(String(val).replace(/,/g, ""));
  if (isNaN(num)) return String(val);

  if (isInteger || Math.round(num) === num) {
    return Math.round(num).toLocaleString("en-US");
  }

  if (isCurrency) {
    return num.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return num.toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

/**
 * Generates a high-precision, vector-rendered business PDF report using jsPDF + AutoTable.
 * Adheres strictly to the Yeserahut corporate design language:
 * - Crisp corporate branding header with "YESERAHUT"
 * - Deep navy header fills with white bold typography
 * - Automatic landscape/portrait selection based on column density
 * - Text-wrapping for long product names without clipping
 * - Total / subtotal styling and multi-category red highlighting
 * - Repeating headers on multi-page reports
 * - Dynamic "Page X of Y" and timestamp in the footer
 * - Native Web Share support on mobile devices with fallback to clean file download
 */
export async function exportToPdf(options: PdfExportOptions): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const {
      title,
      subtitle,
      filename,
      columns,
      rows,
      summaryCards,
      rowStyler,
      footRows,
    } = options;

    // Determine orientation: if > 6 columns or explicit landscape, use landscape for A4
    const orientation =
      options.orientation === "landscape" || (!options.orientation || options.orientation === "auto") && columns.length >= 6
        ? "landscape"
        : "portrait";

    const doc = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 10;
    const printableWidth = pageWidth - margin * 2;

    // Setup total pages placeholder string for "Page X of Y"
    const totalPagesExp = "{total_pages_count_string}";

    // Determine effective brand and tagline
    const effectiveBrand = (options.brandName || getStoredBrandName() || "YESERAHUT").trim();
    const effectiveTagline = (options.brandTagline || getStoredBrandTagline() || "MANAGEMENT SYSTEM").trim();
    const headerBadge = getSystemHeaderBadge(effectiveBrand, effectiveTagline);
    const displayTitle = replaceBrandInTitle(title, effectiveBrand);

    // --- Header Section on Page 1 ---
    let currentY = 12;

    // Top Accent Bar (Royal Blue)
    doc.setFillColor(37, 99, 235); // #2563EB
    doc.rect(margin, currentY, printableWidth, 1.5, "F");
    currentY += 4.5;

    // Corporate Badge & Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(37, 99, 235);
    doc.text(headerBadge, margin, currentY);

    // Generation Date & Time (Right-aligned)
    const now = new Date();
    const dateFormatted = now.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.text(`Generated: ${dateFormatted}`, pageWidth - margin, currentY, { align: "right" });
    currentY += 6;

    // Main Report Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text(displayTitle.toUpperCase(), margin, currentY);
    currentY += 5;

    // Subtitle if provided
    if (subtitle) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105); // Slate 600
      doc.text(subtitle, margin, currentY);
      currentY += 4.5;
    }

    // Summary Cards (KPIs) if provided
    if (summaryCards && summaryCards.length > 0) {
      currentY += 1.5;
      const cardGap = 3;
      const totalCards = summaryCards.length;
      const cardWidth = (printableWidth - cardGap * (totalCards - 1)) / totalCards;
      const cardHeight = 11;

      summaryCards.forEach((card, idx) => {
        const cardX = margin + idx * (cardWidth + cardGap);
        
        // Card Background
        doc.setFillColor(248, 250, 252); // Slate 50
        doc.setDrawColor(226, 232, 240); // Slate 200
        doc.setLineWidth(0.2);
        doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 1, 1, "FD");

        // Card Label
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        doc.text(card.label.toUpperCase(), cardX + 2.5, currentY + 4);

        // Card Value
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(15, 23, 42);
        const valStr = typeof card.value === "number" ? formatPdfNumeric(card.value) : String(card.value);
        doc.text(valStr, cardX + 2.5, currentY + 8.8);
      });

      currentY += cardHeight + 4;
    } else {
      currentY += 2;
    }

    // --- Build Table Headers & Data ---
    const head = [columns.map(c => c.header)];

    // Calculate relative column width weights
    const totalExplicitWeight = columns.reduce((acc, c) => acc + (c.width || 20), 0);
    const columnStyles: Record<number, any> = {};

    columns.forEach((col, idx) => {
      const colWidthRatio = (col.width || 20) / totalExplicitWeight;
      const calculatedWidth = printableWidth * colWidthRatio;

      columnStyles[idx] = {
        halign: col.align || (col.isNumeric || col.isCurrency || col.isInteger ? "right" : "left"),
        cellWidth: calculatedWidth,
      };
    });

    // Prepare table body rows
    const body = rows.map((row, rowIdx) => {
      const rowData = columns.map(col => {
        const rawVal = row[col.key];
        if (col.isNumeric || col.isCurrency || col.isInteger) {
          return formatPdfNumeric(rawVal, col.isCurrency, col.isInteger);
        }
        return rawVal !== null && rawVal !== undefined ? String(rawVal) : "";
      });
      return rowData;
    });

    // Prepare foot rows if provided
    let foot: any[] | undefined = undefined;
    if (footRows && footRows.length > 0) {
      foot = footRows.map(fRow =>
        fRow.map(v => (typeof v === "number" ? formatPdfNumeric(v) : String(v || "")))
      );
    }

    // Execute AutoTable
    autoTable(doc, {
      startY: currentY,
      head: head,
      body: body,
      foot: foot,
      margin: { left: margin, right: margin, bottom: 14, top: 12 },
      tableWidth: printableWidth,
      showHead: "everyPage",
      showFoot: "lastPage",
      rowPageBreak: "avoid",
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59], // Slate 800 / Navy
        textColor: [255, 255, 255],
        font: "helvetica",
        fontStyle: "bold",
        fontSize: orientation === "landscape" ? 7.5 : 8,
        halign: "center",
        valign: "middle",
        cellPadding: 2,
        lineWidth: 0.15,
        lineColor: [51, 65, 85],
      },
      bodyStyles: {
        font: "helvetica",
        fontSize: orientation === "landscape" ? 7 : 7.5,
        textColor: [30, 41, 59],
        cellPadding: 1.8,
        lineColor: [226, 232, 240], // Slate 200
        lineWidth: 0.1,
        overflow: "linebreak",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // Slate 50
      },
      footStyles: {
        fillColor: [15, 23, 42], // Slate 900
        textColor: [255, 255, 255],
        font: "helvetica",
        fontStyle: "bold",
        fontSize: orientation === "landscape" ? 7.5 : 8,
        cellPadding: 2,
        lineWidth: 0.15,
        lineColor: [0, 0, 0],
      },
      columnStyles: columnStyles,
      didParseCell: (data) => {
        // Custom styling for specific rows (e.g. Subtotals, Multi-Category, Grand Totals)
        if (data.section === "body" && rowStyler) {
          const rawRow = rows[data.row.index];
          if (rawRow) {
            const style = rowStyler(rawRow, data.row.index);
            if (style) {
              if (style.isGrandTotal) {
                data.cell.styles.fillColor = [15, 23, 42];
                data.cell.styles.textColor = [255, 255, 255];
                data.cell.styles.fontStyle = "bold";
              } else if (style.isSubtotal) {
                data.cell.styles.fillColor = [239, 246, 255]; // Soft Blue
                data.cell.styles.textColor = [30, 58, 138]; // Blue 900
                data.cell.styles.fontStyle = "bold";
              } else if (style.isMultiCategory) {
                data.cell.styles.textColor = [220, 38, 38]; // Crimson Red 600
                data.cell.styles.fontStyle = "bold";
              }

              if (style.bgColor) data.cell.styles.fillColor = style.bgColor;
              if (style.textColor) data.cell.styles.textColor = style.textColor;
              if (style.bold) data.cell.styles.fontStyle = "bold";
            }
          }
        }
      },
      didDrawPage: (data) => {
        // Footer on every page
        const pNum = data.pageNumber;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // Slate 400

        // Subtle divider above footer
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);

        // Footer left: Company Branding
        doc.text(getSystemFooterBranding(effectiveBrand), margin, pageHeight - 5);

        // Footer right: Page X of Y
        const pageStr = `Page ${pNum} of ${totalPagesExp}`;
        doc.text(pageStr, pageWidth - margin, pageHeight - 5, { align: "right" });
      },
    });

    // Replace total pages placeholder
    if (typeof (doc as any).putTotalPages === "function") {
      (doc as any).putTotalPages(totalPagesExp);
    }

    // Build PDF Blob
    const pdfBlob = doc.output("blob");
    const fullFilename = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
    const pdfFile = new File([pdfBlob], fullFilename, { type: "application/pdf" });

    // Mobile: Try Web Share first
    if (isMobile && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
      try {
        if (navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title: fullFilename.replace(/\.pdf$/, ""),
          });
          return "shared";
        }
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") {
          return "shared"; // User cancelled share dialog
        }
        console.warn("PDF Web Share failed, falling back to download:", shareErr);
      }
    }

    // Desktop & Fallback: Download file
    triggerFileDownload(pdfBlob, fullFilename);
    return "downloaded";
  } catch (err) {
    console.error("exportToPdf error:", err);
    return "failed";
  }
}
