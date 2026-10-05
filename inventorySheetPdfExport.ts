import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { triggerFileDownload } from "./shareImage";
import { formatEthDate } from "@/lib/ethiopianCalendar";

export interface InventorySheetPdfItem {
  productId?: string;
  productCode: string;
  productName: string;
  quantityPerCarton: number;
  systemQuantity: number;
  systemCartons: number;
  verified?: boolean;
  physicalCartons?: string | number;
  physicalPieces?: string | number;
  totalPhysical?: string | number;
  damagePieces?: string | number;
  variance?: string | number;
  remark?: string;
}

export interface InventorySheetPdfExportOptions {
  storeName: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyLogo?: string;
  auditRef?: string;
  auditorName?: string;
  supervisorName?: string;
  dateStr?: string;
  items: InventorySheetPdfItem[];
  blankCountMode?: boolean;
  totals?: {
    totalProducts: number;
    totalSysPcs: number;
    totalSysCtns: number;
    totalPhysPcs: number;
    totalDamagePcs: number;
    verifiedCount: number;
  };
}

const isMobile = typeof navigator !== "undefined" && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || "") ||
  (typeof window !== "undefined" && window.innerWidth <= 768)
);

/**
 * Generates a high-precision, Landscape A4 PDF for Physical Inventory Count & Audit Sheet.
 * - Strict Landscape A4 orientation (297mm x 210mm)
 * - 13 columns mathematically measured to fill exactly 281mm printable width with zero truncation
 * - Clean corporate header with Audit Reference, Store, Auditor, and Date
 * - Verification checkboxes, physical count entries, damage entries, variance, and remarks
 * - Summary totals and Official Signatures verification block
 * - Mobile Web Share API support with direct file download fallback
 */
export async function exportInventorySheetPdf(
  options: InventorySheetPdfExportOptions
): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const {
      storeName,
      companyName = "YESERAHUT STOCK MANAGEMENT",
      auditRef = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`,
      auditorName = "",
      supervisorName = "",
      dateStr = formatEthDate(new Date(), { includeGregorian: true }),
      items,
      blankCountMode = false,
      totals,
    } = options;

    // Strict Landscape A4 Document: 297mm width × 210mm height
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
    doc.setFillColor(16, 185, 129); // Emerald 600 (#10B981)
    doc.rect(margin, currentY, printableWidth, 1.8, "F");
    currentY += 4.5;

    // 2. Company Header & Generation Timestamp
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(5, 150, 105); // Emerald 600
    doc.text(companyName.toUpperCase(), margin, currentY);

    const now = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139); // Slate 500
    doc.text(`Official Audit Sheet | Generated: ${dateStr} ${timeStr}`, pageWidth - margin, currentY, { align: "right" });
    currentY += 5.5;

    // 3. Document Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42); // Slate 900
    doc.text("PHYSICAL INVENTORY COUNT & AUDIT SHEET (የእቃ ቆጠራ እና የክምችት ቁጥጥር ሰነድ)", margin, currentY);
    currentY += 5;

    // 4. Metadata Information Bar (Audit Details)
    doc.setFillColor(241, 245, 249); // Slate 100
    doc.setDrawColor(226, 232, 240); // Slate 200
    doc.setLineWidth(0.2);
    const metaBoxHeight = 8;
    doc.roundedRect(margin, currentY, printableWidth, metaBoxHeight, 1, 1, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85); // Slate 700

    const metaLeft = `Store: ${storeName.toUpperCase()}    |    Audit Ref: ${auditRef}    |    Date: ${dateStr}`;
    doc.text(metaLeft, margin + 3, currentY + 5.2);

    const metaRight = `Auditor: ${auditorName || "____________________"}    |    Supervisor: ${supervisorName || "____________________"}    |    Items: ${items.length}`;
    doc.text(metaRight, pageWidth - margin - 3, currentY + 5.2, { align: "right" });

    currentY += metaBoxHeight + 3.5;

    // 5. Build Table Headers (13 Columns, exactly proportioned for Landscape A4)
    // Printable width: 281mm
    // Distribution:
    // 1. No: 9mm
    // 2. Code: 22mm
    // 3. Product Name: 60mm
    // 4. Qty/Ctn: 14mm
    // 5. Sys Pcs: 17mm
    // 6. Sys Ctns: 17mm
    // 7. Verified: 14mm
    // 8. Phys Ctns: 18mm
    // Printable width: 297 - 16 = 281mm
    // 12 Columns (Product Description removed per user requirement):
    // 0. No: 12mm
    // 1. Code: 35mm
    // 2. Qty/Ctn: 18mm
    // 3. Sys Pcs: 22mm
    // 4. Sys Ctns: 22mm
    // 5. Check: 16mm
    // 6. Phys Ctns: 24mm
    // 7. Phys Pcs: 24mm
    // 8. Total Count: 26mm
    // 9. Damage: 22mm
    // 10. Variance: 22mm
    // 11. Remark: 38mm
    // Sum = 12+35+18+22+22+16+24+24+26+22+22+38 = 281mm!
    const headers = [
      [
        "No.\n(ተ.ቁ)",
        "Product Code\n(የእቃ ኮድ)",
        "Qty/Ctn\n(ፍሬ/ካ)",
        "Sys. Pcs\n(ሲስተም ፍሬ)",
        "Sys. Ctns\n(ሲስተም ካር)",
        "Check\n[ ✓ ]",
        "Phys. Ctns\n(የተቆጠረ ካር)",
        "Phys. Pcs\n(የተቆጠረ ፍሬ)",
        "Total Count\n(ጠቅላላ ፍሬ)",
        "Damage\n(ብልሽት)",
        "Variance\n(ልዩነት)",
        "Remark / Notes\n(ማስታወሻ)",
      ],
    ];

    // Prepare table body rows
    let computedSysPcs = 0;
    let computedSysCtns = 0;
    let computedPhysPcs = 0;
    let computedDamagePcs = 0;
    let verifiedCount = 0;

    const body = items.map((it, idx) => {
      const qpc = it.quantityPerCarton > 0 ? it.quantityPerCarton : 1;
      computedSysPcs += it.systemQuantity;
      computedSysCtns += it.systemCartons;

      if (it.verified) verifiedCount++;
      if (it.damagePieces) computedDamagePcs += Number(it.damagePieces) || 0;

      const ctnVal = it.physicalCartons !== undefined && it.physicalCartons !== "" ? Number(it.physicalCartons) : null;
      const pcsVal = it.physicalPieces !== undefined && it.physicalPieces !== "" ? Number(it.physicalPieces) : null;

      let totalCountStr = "";
      let varianceStr = "";

      if (ctnVal !== null || pcsVal !== null) {
        const tot = (ctnVal || 0) * qpc + (pcsVal || 0);
        totalCountStr = String(tot);
        const diff = tot - it.systemQuantity;
        varianceStr = diff > 0 ? `+${diff}` : String(diff);
        computedPhysPcs += tot;
      } else if (it.totalPhysical !== undefined && it.totalPhysical !== "") {
        totalCountStr = String(it.totalPhysical);
        varianceStr = it.variance !== undefined ? String(it.variance) : "";
        computedPhysPcs += Number(it.totalPhysical) || 0;
      }

      return [
        String(idx + 1),
        it.productCode || "—",
        qpc > 1 ? String(qpc) : "—",
        blankCountMode ? "" : it.systemQuantity.toLocaleString("en-US"),
        blankCountMode ? "" : it.systemCartons.toLocaleString("en-US"),
        it.verified ? "[ ✓ ]" : "[   ]",
        it.physicalCartons !== undefined && it.physicalCartons !== "" ? String(it.physicalCartons) : "",
        it.physicalPieces !== undefined && it.physicalPieces !== "" ? String(it.physicalPieces) : "",
        totalCountStr,
        it.damagePieces !== undefined && it.damagePieces !== "" ? String(it.damagePieces) : "",
        varianceStr,
        it.remark || "",
      ];
    });

    const totSysPcs = totals?.totalSysPcs ?? computedSysPcs;
    const totSysCtns = totals?.totalSysCtns ?? computedSysCtns;
    const totPhysPcs = totals?.totalPhysPcs ?? computedPhysPcs;
    const totDamage = totals?.totalDamagePcs ?? computedDamagePcs;
    const totVerified = totals?.verifiedCount ?? verifiedCount;

    // Summary Foot Row
    const foot = [
      [
        "TOTAL",
        `${items.length} Items`,
        "",
        blankCountMode ? "" : totSysPcs.toLocaleString("en-US"),
        blankCountMode ? "" : totSysCtns.toLocaleString("en-US"),
        `${totVerified} Checked`,
        "",
        "",
        totPhysPcs > 0 ? totPhysPcs.toLocaleString("en-US") : "",
        totDamage > 0 ? totDamage.toLocaleString("en-US") : "",
        "",
        "",
      ],
    ];

    // Column Styles with exact widths summing to 281mm
    const columnStyles: Record<number, any> = {
      0: { cellWidth: 12, halign: "center" },  // No
      1: { cellWidth: 35, halign: "center" },  // Code
      2: { cellWidth: 18, halign: "right" },   // Qty/Ctn
      3: { cellWidth: 22, halign: "right" },   // Sys Pcs
      4: { cellWidth: 22, halign: "right" },   // Sys Ctns
      5: { cellWidth: 16, halign: "center" },  // Verified
      6: { cellWidth: 24, halign: "right" },   // Phys Ctns
      7: { cellWidth: 24, halign: "right" },   // Phys Pcs
      8: { cellWidth: 26, halign: "right" },   // Total Count
      9: { cellWidth: 22, halign: "right" },   // Damage
      10: { cellWidth: 22, halign: "right" },  // Variance
      11: { cellWidth: 38, halign: "left" },   // Remark
    };

    // Execute AutoTable in Landscape mode
    autoTable(doc, {
      startY: currentY,
      head: headers,
      body: body,
      foot: foot,
      margin: { left: margin, right: margin, bottom: 22, top: 12 },
      tableWidth: printableWidth,
      showHead: "everyPage",
      showFoot: "lastPage",
      rowPageBreak: "avoid",
      theme: "grid",
      headStyles: {
        fillColor: [15, 23, 42], // Deep Navy / Slate 900
        textColor: [255, 255, 255],
        font: "helvetica",
        fontStyle: "bold",
        fontSize: 6.8,
        halign: "center",
        valign: "middle",
        cellPadding: 1.6,
        lineWidth: 0.15,
        lineColor: [51, 65, 85],
      },
      bodyStyles: {
        font: "helvetica",
        fontSize: 6.8,
        textColor: [15, 23, 42],
        cellPadding: 1.5,
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
        fontSize: 7.2,
        cellPadding: 2,
        lineWidth: 0.15,
        lineColor: [0, 0, 0],
        valign: "middle",
      },
      columnStyles: columnStyles,
      didParseCell: (data) => {
        // Highlight verification checkboxes
        if (data.section === "body" && data.column.index === 6) {
          if (data.cell.raw === "[ ✓ ]") {
            data.cell.styles.textColor = [5, 150, 105]; // Emerald 600
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.textColor = [148, 163, 184]; // Slate 400
          }
        }
        // Variance column coloring
        if (data.section === "body" && data.column.index === 11) {
          const val = String(data.cell.raw || "");
          if (val.startsWith("-")) {
            data.cell.styles.textColor = [220, 38, 38]; // Red 600
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [254, 242, 242]; // Red 50
          } else if (val.startsWith("+")) {
            data.cell.styles.textColor = [5, 150, 105]; // Emerald 600
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
      didDrawPage: (data) => {
        const pNum = data.pageNumber;

        // Footer on every page
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184); // Slate 400

        // Subtle divider
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.line(margin, pageHeight - 8, pageWidth - margin, pageHeight - 8);

        // Footer left: Branding & Verification Notice
        doc.text("Yeserahut Physical Inventory Count & Audit Control Document — Official Record", margin, pageHeight - 4.5);

        // Footer right: Page X of Y
        const pageStr = `Page ${pNum} of ${totalPagesExp}`;
        doc.text(pageStr, pageWidth - margin, pageHeight - 4.5, { align: "right" });
      },
    });

    // 6. Draw Official Signatures Block on the last page if space permits, or new page
    const finalY = (doc as any).lastAutoTable?.finalY || currentY;
    const requiredSignHeight = 26;

    if (finalY + requiredSignHeight > pageHeight - 12) {
      doc.addPage();
    }

    const signY = finalY + requiredSignHeight > pageHeight - 12 ? 16 : finalY + 5;

    // Signature Block Container
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.2);
    doc.roundedRect(margin, signY, printableWidth, 20, 1, 1, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text("OFFICIAL AUDIT & VERIFICATION SIGNATURES (የቆጠራ እና ማረጋገጫ ፊርማዎች)", margin + 3, signY + 4);

    const colW = (printableWidth - 8) / 4;
    const signNames = [
      { title: "Prepared By (ያዘጋጀው):", name: auditorName || "____________________" },
      { title: "Auditor / Counter (ቆጣሪ):", name: "____________________" },
      { title: "Storekeeper (ባለእቃ):", name: "____________________" },
      { title: "Approved By (ያፀደቀው):", name: supervisorName || "____________________" },
    ];

    signNames.forEach((s, idx) => {
      const x = margin + 4 + idx * colW;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(100, 116, 139);
      doc.text(s.title, x, signY + 9);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text(s.name, x, signY + 13.5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6);
      doc.setTextColor(148, 163, 184);
      doc.text("Sign & Date: ________________", x, signY + 18);
    });

    // Replace total pages placeholder
    if (typeof (doc as any).putTotalPages === "function") {
      (doc as any).putTotalPages(totalPagesExp);
    }

    // Build PDF Blob
    const filename = `Inventory_Count_Sheet_${storeName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const pdfBlob = doc.output("blob");
    const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });

    // Mobile: Try Web Share first
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
        console.warn("Inventory sheet PDF Web Share failed, downloading directly:", shareErr);
      }
    }

    // Fallback & Desktop: Download directly
    triggerFileDownload(pdfBlob, filename);
    return "downloaded";
  } catch (err) {
    console.error("exportInventorySheetPdf error:", err);
    return "failed";
  }
}
