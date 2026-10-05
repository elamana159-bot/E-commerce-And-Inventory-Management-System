import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { triggerFileDownload } from "./shareImage";
import { formatEthDate } from "@/lib/ethiopianCalendar";

export interface StoreBalancePdfItem {
  productName: string;
  productCode: string;
  quantityPerCarton: number;
  unitPrice: number;
  quantity: number; // units
  cartons: number;
  totalPrice: number;
}

export interface StoreBalancePdfExportOptions {
  storeName: string;
  companyName?: string;
  dateStr?: string;
  items: StoreBalancePdfItem[];
  totals: {
    totalProducts: number;
    totalUnits: number;
    totalCartons: number;
    grandTotalValue: number;
  };
}

const isMobile = typeof navigator !== "undefined" && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || "") ||
  (typeof window !== "undefined" && window.innerWidth <= 768)
);

/**
 * High-precision, Landscape A4 PDF Exporter for Store Balance.
 * - Strict Landscape A4 orientation (297mm x 210mm)
 * - Proportional column widths totaling exactly 281mm printable width (zero cutoff, zero column truncation)
 * - Automatic multi-line wrapping for long product names
 * - 4 Key Performance Indicator (KPI) Summary Cards (Products, Balance Units, Cartons, Inventory Value)
 * - Repeating headers on multi-page reports with Page X of Y pagination
 * - Web Share on mobile devices with fallback to clean file download
 */
export async function exportStoreBalancePdf(
  options: StoreBalancePdfExportOptions
): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const {
      storeName,
      companyName = "YESERAHUT STOCK MANAGEMENT",
      dateStr = formatEthDate(new Date(), { includeGregorian: true }),
      items,
      totals,
    } = options;

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth(); // 297mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210mm
    const margin = 8; // 8mm margin
    const printableWidth = pageWidth - margin * 2; // 281mm
    const totalPagesExp = "{total_pages_count_string}";

    let currentY = 10;

    // 1. Top Decorative Brand Accent Bar
    doc.setFillColor(37, 99, 235); // Royal Blue (#2563EB)
    doc.rect(margin, currentY, printableWidth, 1.8, "F");
    currentY += 4.5;

    // 2. Company Header & Generation Timestamp
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(37, 99, 235);
    doc.text(companyName.toUpperCase(), margin, currentY);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.text(`Generated: ${dateStr} ${timeStr}`, pageWidth - margin, currentY, { align: "right" });
    currentY += 5.5;

    // 3. Document Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text(`STORE BALANCE REPORT - ${storeName.toUpperCase()} (የስቶር ቀሪ ክምችት ሪፖርት)`, margin, currentY);
    currentY += 5.5;

    // 4. Summary KPI Cards (4 Cards across the 281mm printable width)
    const cardGap = 4;
    const cardW = (printableWidth - cardGap * 3) / 4;
    const cardH = 12;

    const kpis = [
      { label: "TOTAL PRODUCTS (የእቃ ብዛት)", value: totals.totalProducts.toLocaleString("en-US") },
      { label: "BALANCE IN UNITS (ቀሪ ፍሬ)", value: totals.totalUnits.toLocaleString("en-US") },
      { label: "BALANCE IN CARTONS (ቀሪ ካርቶን)", value: totals.totalCartons.toLocaleString("en-US") },
      {
        label: "TOTAL INVENTORY VALUE (ጠቅላላ ዋጋ)",
        value: totals.grandTotalValue > 0
          ? `${totals.grandTotalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`
          : "0.00 ETB",
      },
    ];

    kpis.forEach((kpi, idx) => {
      const cardX = margin + idx * (cardW + cardGap);

      doc.setFillColor(248, 250, 252); // Slate 50
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.setLineWidth(0.2);
      doc.roundedRect(cardX, currentY, cardW, cardH, 1, 1, "FD");

      // Label
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text(kpi.label, cardX + 3, currentY + 4.2);

      // Value
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text(kpi.value, cardX + 3, currentY + 9.5);
    });

    currentY += cardH + 4;

    // 5. Build 8 Columns for Landscape A4 (Exact widths sum to 281mm)
    // 1. No: 12mm
    // 2. Product Name: 75mm (auto-wraps, no truncated names)
    // 3. Code: 28mm
    // 4. Qty/Ctn: 22mm
    // 5. Unit Price: 32mm
    // 6. Balance Units: 34mm
    // 7. Cartons: 34mm
    // 8. Total Value: 44mm
    // Sum = 12 + 75 + 28 + 22 + 32 + 34 + 34 + 44 = 281mm!
    const headers = [
      [
        "No.\n(ተ.ቁ)",
        "Product Name\n(የእቃ ስም)",
        "Product Code\n(የእቃ ኮድ)",
        "Qty/Ctn\n(ፍሬ/ካ)",
        "Unit Price\n(የአንዱ ዋጋ)",
        "Balance Units\n(ቀሪ ፍሬ)",
        "Cartons\n(ካርቶን)",
        "Total Value\n(ጠቅላላ ዋጋ)",
      ],
    ];

    const body = items.map((it, idx) => {
      const unitPriceStr = it.unitPrice > 0
        ? it.unitPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—";
      const totalValStr = it.totalPrice > 0
        ? it.totalPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "—";

      return [
        String(idx + 1),
        it.productName,
        it.productCode || "—",
        it.quantityPerCarton > 0 ? String(it.quantityPerCarton) : "—",
        unitPriceStr,
        it.quantity.toLocaleString("en-US"),
        it.cartons > 0 ? String(it.cartons) : "—",
        totalValStr,
      ];
    });

    const foot = [
      [
        "TOTAL",
        `${items.length} Products in Stock`,
        "",
        "",
        "",
        totals.totalUnits.toLocaleString("en-US"),
        totals.totalCartons.toLocaleString("en-US"),
        totals.grandTotalValue > 0
          ? `${totals.grandTotalValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ETB`
          : "—",
      ],
    ];

    const columnStyles: Record<number, any> = {
      0: { cellWidth: 12, halign: "center" },  // No
      1: { cellWidth: 75, halign: "left" },    // Name (wrapping)
      2: { cellWidth: 28, halign: "center" },  // Code
      3: { cellWidth: 22, halign: "right" },   // Qty/Ctn
      4: { cellWidth: 32, halign: "right" },   // Unit Price
      5: { cellWidth: 34, halign: "right" },   // Balance Units
      6: { cellWidth: 34, halign: "right" },   // Cartons
      7: { cellWidth: 44, halign: "right" },   // Total Value
    };

    autoTable(doc, {
      startY: currentY,
      head: headers,
      body: body,
      foot: foot,
      margin: { left: margin, right: margin, bottom: 14, top: 12 },
      tableWidth: printableWidth,
      showHead: "everyPage",
      showFoot: "lastPage",
      rowPageBreak: "avoid",
      theme: "grid",
      headStyles: {
        fillColor: [30, 41, 59], // Deep Slate 800 / Navy
        textColor: [255, 255, 255],
        font: "helvetica",
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
        valign: "middle",
        cellPadding: 2,
        lineWidth: 0.15,
        lineColor: [51, 65, 85],
      },
      bodyStyles: {
        font: "helvetica",
        fontSize: 7.2,
        textColor: [30, 41, 59],
        cellPadding: 1.8,
        lineColor: [226, 232, 240], // Slate 200
        lineWidth: 0.1,
        overflow: "linebreak",
        valign: "middle",
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // Slate 50
      },
      footStyles: {
        fillColor: [15, 23, 42], // Slate 900
        textColor: [255, 255, 255],
        font: "helvetica",
        fontStyle: "bold",
        fontSize: 7.8,
        cellPadding: 2.2,
        lineWidth: 0.15,
        lineColor: [0, 0, 0],
        valign: "middle",
      },
      columnStyles: columnStyles,
      didDrawPage: (data) => {
        const pNum = data.pageNumber;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184); // Slate 400

        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(margin, pageHeight - 9, pageWidth - margin, pageHeight - 9);

        doc.text("Yeserahut Inventory & Store Balance Management System", margin, pageHeight - 5);

        const pageStr = `Page ${pNum} of ${totalPagesExp}`;
        doc.text(pageStr, pageWidth - margin, pageHeight - 5, { align: "right" });
      },
    });

    // Replace total pages placeholder
    if (typeof (doc as any).putTotalPages === "function") {
      (doc as any).putTotalPages(totalPagesExp);
    }

    const filename = `${storeName.replace(/\s+/g, "_")}_Store_Balance_${new Date().toISOString().slice(0, 10)}.pdf`;
    const pdfBlob = doc.output("blob");
    const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });

    if (isMobile && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
      try {
        if (navigator.canShare({ files: [pdfFile] })) {
          await navigator.share({
            files: [pdfFile],
            title: filename.replace(/\.pdf$/, ""),
          });
          return "shared";
        }
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") {
          return "shared";
        }
        console.warn("Store balance PDF share failed, downloading:", shareErr);
      }
    }

    triggerFileDownload(pdfBlob, filename);
    return "downloaded";
  } catch (err) {
    console.error("exportStoreBalancePdf error:", err);
    return "failed";
  }
}
