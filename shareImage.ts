// @ts-ignore
import domtoimage from "dom-to-image-more";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
// @ts-ignore
import XLSXStyle from "xlsx-js-style";
import { enhanceWorksheetWithProfessionalStyles } from "./excelExportUtils";

const XLSX = (XLSXStyle as any)?.default || XLSXStyle;

const isIOS = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");

/**
 * Capture a DOM element safely into a Canvas.
 * Solves iOS foreignObject taint, Tailwind v4 oklab/oklch crashes, and cross-origin issues.
 */
async function captureToCanvas(element: HTMLElement): Promise<HTMLCanvasElement | null> {
  if (!element) return null;

  // 1. On non-iOS devices, attempt dom-to-image-more first
  if (!isIOS) {
    try {
      const canvas = await domtoimage.toCanvas(element, {
        bgcolor: "#ffffff",
        scale: 2,
        quality: 0.95,
      });
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        return canvas;
      }
    } catch (domErr) {
      console.warn("dom-to-image-more failed, trying html2canvas fallback:", domErr);
    }
  }

  // 2. Fallback: html2canvas with sanitized styles and untainted canvas
  try {
    const canvas = await html2canvas(element, {
      scale: isMobile ? 1.75 : 2,
      useCORS: true,
      allowTaint: false, // Must be FALSE so canvas can be exported via toBlob / toDataURL
      logging: false,
      backgroundColor: "#ffffff",
      imageTimeout: 5000,
      onclone: (clonedDoc, clonedElement) => {
        try {
          // Remove external stylesheets that might cause cross-origin rule access errors
          const links = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
          links.forEach((link: any) => {
            try {
              if (link.href && !link.href.startsWith(window.location.origin)) {
                link.remove();
              }
            } catch {}
          });

          // Sanitize any modern oklab/oklch color definitions that crash html2canvas parser
          const styles = clonedDoc.querySelectorAll("style");
          styles.forEach((styleTag) => {
            if (styleTag.textContent && (styleTag.textContent.includes("oklab") || styleTag.textContent.includes("oklch") || styleTag.textContent.includes("color-mix"))) {
              styleTag.textContent = styleTag.textContent
                .replace(/oklab\([^)]+\)/gi, "rgb(17, 24, 39)")
                .replace(/oklch\([^)]+\)/gi, "rgb(17, 24, 39)")
                .replace(/color-mix\([^)]+\)/gi, "rgb(17, 24, 39)");
            }
          });

          // Sanitize elements inside receipt
          const nodes = clonedElement.querySelectorAll("*");
          nodes.forEach((node: any) => {
            if (node instanceof HTMLElement) {
              const comp = window.getComputedStyle(node);
              if (comp.color && comp.color.includes("okl")) {
                node.style.color = "#111827";
              }
              if (comp.backgroundColor && comp.backgroundColor.includes("okl")) {
                node.style.backgroundColor = "transparent";
              }
              if (comp.borderColor && comp.borderColor.includes("okl")) {
                node.style.borderColor = "#e5e7eb";
              }
              // Force images to anonymous CORS
              if (node.tagName === "IMG") {
                node.setAttribute("crossorigin", "anonymous");
              }
            }
          });
        } catch (cloneErr) {
          console.warn("html2canvas onclone warning:", cloneErr);
        }

        clonedElement.style.backgroundColor = "#ffffff";
        clonedElement.style.color = "#111827";
        clonedElement.style.opacity = "1";
        clonedElement.style.transform = "none";
      },
    });

    return canvas;
  } catch (h2cErr) {
    console.error("html2canvas capture failed:", h2cErr);
    return null;
  }
}

/** Convert Canvas to PNG Blob safely */
function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob || null), "image/png", 0.95);
    } catch (err) {
      console.warn("canvas.toBlob failed, trying toDataURL fallback:", err);
      try {
        const dataUrl = canvas.toDataURL("image/png", 0.95);
        const parts = dataUrl.split(",");
        const byteString = atob(parts[1]);
        const mimeString = parts[0].split(":")[1].split(";")[0];
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        resolve(new Blob([ab], { type: mimeString }));
      } catch {
        resolve(null);
      }
    }
  });
}

/**
 * Mobile-resilient file downloader for Blobs.
 * Works around iOS Safari iframe limitations and handles Android Chrome download managers.
 */
export function triggerFileDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);

  // iOS Safari special handling: Convert to DataURL or open in new window
  if (isIOS) {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      const win = window.open(dataUrl, "_blank");
      if (!win) {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 1500);
      }
    };
    reader.readAsDataURL(blob);
    return;
  }

  // Android & Desktop standard anchor download
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {}
    // Keep blob URL alive longer on mobile (60 seconds) so download manager can finish
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch {}
    }, 60000);
  }, 1000);
}

/**
 * Captures a DOM element as a PNG image and:
 * 1. Shares via Web Share API (WhatsApp/Telegram/Files on mobile)
 * 2. Or downloads the PNG directly to the device
 */
export async function shareAsImage(
  element: HTMLElement,
  filename = "receipt.png"
): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const canvas = await captureToCanvas(element);
    if (!canvas) return "failed";

    const blob = await canvasToBlob(canvas);
    if (!blob) return "failed";

    const file = new File([blob], filename, { type: "image/png" });

    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          title: filename.replace(/\.[^/.]+$/, ""),
        });
        return "shared";
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") {
          return "shared"; // User dismissed share sheet
        }
        console.warn("navigator.share failed, falling back to download:", shareErr);
      }
    }

    triggerFileDownload(blob, filename);
    return "downloaded";
  } catch (err) {
    console.error("shareAsImage failed:", err);
    return "failed";
  }
}

/**
 * Captures a DOM element as a high-quality PDF document and:
 * 1. Shares via Web Share API
 * 2. Or downloads the PDF directly
 */
export async function shareAsPdf(
  element: HTMLElement,
  filename = "receipt.pdf"
): Promise<"shared" | "downloaded" | "failed"> {
  try {
    const canvas = await captureToCanvas(element);
    if (!canvas) return "failed";

    const imgW = canvas.width;
    const imgH = canvas.height;
    if (!imgW || !imgH) return "failed";

    const dataUrl = canvas.toDataURL("image/png", 0.95);
    const isWide = imgW > imgH;
    const pdf = new jsPDF({
      orientation: isWide ? "landscape" : "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const scaledH = (imgH * pageW) / imgW;

    if (scaledH <= pageH) {
      pdf.addImage(dataUrl, "PNG", 0, 0, pageW, scaledH);
    } else {
      let yMm = 0;
      let first = true;
      while (yMm < scaledH) {
        if (!first) pdf.addPage();
        first = false;
        pdf.addImage(dataUrl, "PNG", 0, -yMm, pageW, scaledH);
        yMm += pageH;
      }
    }

    const pdfBlob = pdf.output("blob");
    const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });

    if (
      typeof navigator !== "undefined" &&
      navigator.share &&
      navigator.canShare &&
      navigator.canShare({ files: [pdfFile] })
    ) {
      try {
        await navigator.share({
          files: [pdfFile],
          title: filename.replace(/\.[^/.]+$/, ""),
        });
        return "shared";
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") {
          return "shared";
        }
        console.warn("navigator.share PDF failed, falling back to download:", shareErr);
      }
    }

    triggerFileDownload(pdfBlob, filename);
    return "downloaded";
  } catch (err) {
    console.error("shareAsPdf failed:", err);
    return "failed";
  }
}

/**
 * Mobile-first Excel export utility.
 * On mobile devices, attempts native Web Share so the user can send the Excel file
 * straight to WhatsApp, Telegram, Email, or Save to Files!
 * Falls back to robust mobile/desktop download.
 */
export async function exportToExcel(options: {
  data?: any[][];
  sheetName?: string;
  filename: string;
  workbook?: any;
  title?: string;
  subtitle?: string;
}): Promise<"shared" | "downloaded" | "failed"> {
  try {
    let wb = options.workbook;
    if (!wb && options.data) {
      wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(options.data);
      enhanceWorksheetWithProfessionalStyles(
        ws,
        options.title || options.sheetName || "Report",
        options.subtitle
      );
      XLSX.utils.book_append_sheet(wb, ws, options.sheetName || "Sheet1");
    }
    if (!wb) return "failed";

    // Auto-enhance any worksheets in the workbook that don't have explicit styling
    if (wb.SheetNames && wb.Sheets) {
      wb.SheetNames.forEach((name: string) => {
        const ws = wb.Sheets[name];
        if (ws && !ws["!styled"] && !ws["!views"]) {
          enhanceWorksheetWithProfessionalStyles(
            ws,
            options.title || name,
            options.subtitle
          );
        }
      });
    }

    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    const blob = new Blob([wbout], { type: mimeType });
    const fullFilename = options.filename.endsWith(".xlsx") ? options.filename : `${options.filename}.xlsx`;

    // On mobile phone: Try Web Share first so the user can share to WhatsApp/Telegram/Files
    if (isMobile && typeof navigator !== "undefined" && navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], fullFilename, { type: mimeType });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: fullFilename.replace(/\.xlsx$/, ""),
          });
          return "shared";
        }
      } catch (shareErr: any) {
        if (shareErr?.name === "AbortError") {
          return "shared"; // User cancelled share sheet
        }
        console.warn("Mobile share of Excel failed, falling back to download:", shareErr);
      }
    }

    // Fallback: trigger download
    triggerFileDownload(blob, fullFilename);
    return "downloaded";
  } catch (err) {
    console.error("Export to Excel failed:", err);
    return "failed";
  }
}

export { exportToPdf } from "./pdfExportUtils";
export type { PdfColumnDef, PdfExportOptions } from "./pdfExportUtils";

/**
 * Loads an image URL safely into an HTMLImageElement with CORS handling
 */
export async function loadImageElement(url: string): Promise<HTMLImageElement | null> {
  if (!url) return null;
  return new Promise((resolve) => {
    const img = new Image();
    if (!url.startsWith("data:")) {
      img.crossOrigin = "anonymous";
    }
    img.onload = () => resolve(img);
    img.onerror = () => {
      if (img.crossOrigin) {
        const retryImg = new Image();
        retryImg.onload = () => resolve(retryImg);
        retryImg.onerror = () => resolve(null);
        retryImg.src = url;
      } else {
        resolve(null);
      }
    };
    img.src = url;
  });
}

/**
 * Converts an image URL (data URI, firebase, or external URL) to a safe Data URL
 */
export async function loadImageToDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:")) return url;

  try {
    const img = await loadImageElement(url);
    if (img) {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 800;
      canvas.height = img.naturalHeight || img.height || 600;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        return canvas.toDataURL("image/jpeg", 0.92);
      }
    }
  } catch (e) {
    console.warn("Canvas toDataURL failed:", e);
  }

  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export interface ShareReceiptOptions {
  receiptElement: HTMLElement;
  referencePhotoUrl?: string;
  voucherId?: string;
  voucherTitle?: string;
  voucherSubtitle?: string;
  filenamePrefix?: string;
  format: "pdf" | "image";
  includeReferencePhoto: boolean;
}

/**
 * High-quality multi-device exporter (Mobile, Tablet, Desktop)
 * Allows choosing:
 *  1. Receipt Only
 *  2. Receipt + Attached Reference Photo (2-page PDF or combined PNG)
 */
export async function shareReceiptWithReference({
  receiptElement,
  referencePhotoUrl,
  voucherId = "voucher",
  voucherTitle = "RECEIPT VOUCHER",
  voucherSubtitle = "",
  filenamePrefix = "voucher",
  format,
  includeReferencePhoto,
}: ShareReceiptOptions): Promise<"shared" | "downloaded" | "failed"> {
  const cleanId = (voucherId || "voucher").replace(/[^a-zA-Z0-9_-]/g, "_");
  const filename = `${filenamePrefix}_${cleanId}${includeReferencePhoto && referencePhotoUrl ? "_with_ref" : ""}.${format === "pdf" ? "pdf" : "png"}`;

  if (format === "pdf") {
    if (!includeReferencePhoto || !referencePhotoUrl) {
      return shareAsPdf(receiptElement, filename);
    }

    try {
      const receiptCanvas = await captureToCanvas(receiptElement);
      if (!receiptCanvas) return "failed";

      const photoDataUrl = await loadImageToDataUrl(referencePhotoUrl);
      const photoImg = photoDataUrl ? await loadImageElement(photoDataUrl) : null;

      if (!photoImg) {
        return shareAsPdf(receiptElement, filename);
      }

      // Generate the clean side-by-side combined image (Receipt on left, Reference photo on right)
      // Zero surrounding margins, zero background banners, zero added headers
      const rW = receiptCanvas.width;
      const rH = receiptCanvas.height;
      const natW = photoImg.naturalWidth || photoImg.width || 800;
      const natH = photoImg.naturalHeight || photoImg.height || 600;

      const photoScale = rH / natH;
      const photoW = Math.round(natW * photoScale);
      const photoH = rH;

      const totalWidth = rW + photoW;
      const totalHeight = rH;

      const combinedCanvas = document.createElement("canvas");
      combinedCanvas.width = totalWidth;
      combinedCanvas.height = totalHeight;
      const ctx = combinedCanvas.getContext("2d");
      if (!ctx) return "failed";

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      // Draw receipt on the left
      ctx.drawImage(receiptCanvas, 0, 0, rW, rH);

      // Draw reference photo directly adjacent on the right
      ctx.drawImage(photoImg, rW, 0, photoW, photoH);

      const combinedDataUrl = combinedCanvas.toDataURL("image/png", 0.95);

      // Clean Landscape A4 without arbitrary banners or backgrounds
      const pdf = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();

      const scale = Math.min(pageW / totalWidth, pageH / totalHeight);
      const drawW = totalWidth * scale;
      const drawH = totalHeight * scale;
      const drawX = (pageW - drawW) / 2;
      const drawY = (pageH - drawH) / 2;

      pdf.addImage(combinedDataUrl, "PNG", drawX, drawY, drawW, drawH);

      const pdfBlob = pdf.output("blob");
      const pdfFile = new File([pdfBlob], filename, { type: "application/pdf" });

      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [pdfFile] })
      ) {
        try {
          await navigator.share({
            files: [pdfFile],
            title: filename.replace(/\.[^/.]+$/, ""),
          });
          return "shared";
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") return "shared";
          console.warn("navigator.share PDF failed, downloading:", shareErr);
        }
      }

      triggerFileDownload(pdfBlob, filename);
      return "downloaded";
    } catch (e) {
      console.error("Combined PDF failed, fallback to receipt:", e);
      return shareAsPdf(receiptElement, filename);
    }
  } else {
    // format === "image"
    if (!includeReferencePhoto || !referencePhotoUrl) {
      return shareAsImage(receiptElement, filename);
    }

    try {
      const receiptCanvas = await captureToCanvas(receiptElement);
      if (!receiptCanvas) return "failed";

      const photoDataUrl = await loadImageToDataUrl(referencePhotoUrl);
      const photoImg = photoDataUrl ? await loadImageElement(photoDataUrl) : null;

      if (!photoImg) {
        return shareAsImage(receiptElement, filename);
      }

      // Exact side-by-side combined image:
      // Receipt on the left, Reference photo on the right.
      // Zero surrounding margins, zero background banners, zero added headers.
      // Exactly matching the user's reference photo.
      const rW = receiptCanvas.width;
      const rH = receiptCanvas.height;

      const natW = photoImg.naturalWidth || photoImg.width || 800;
      const natH = photoImg.naturalHeight || photoImg.height || 600;

      // Match the photo height directly to the receipt canvas height
      const photoScale = rH / natH;
      const photoW = Math.round(natW * photoScale);
      const photoH = rH;

      const totalWidth = rW + photoW;
      const totalHeight = rH;

      const combinedCanvas = document.createElement("canvas");
      combinedCanvas.width = totalWidth;
      combinedCanvas.height = totalHeight;
      const ctx = combinedCanvas.getContext("2d");
      if (!ctx) return "failed";

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      // Clean white background with zero extra padding
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, totalWidth, totalHeight);

      // 1. Draw receipt on left
      ctx.drawImage(receiptCanvas, 0, 0, rW, rH);

      // 2. Draw reference photo directly on right
      ctx.drawImage(photoImg, rW, 0, photoW, photoH);

      const blob = await canvasToBlob(combinedCanvas);
      if (!blob) return "failed";

      const file = new File([blob], filename, { type: "image/png" });
      if (
        typeof navigator !== "undefined" &&
        navigator.share &&
        navigator.canShare &&
        navigator.canShare({ files: [file] })
      ) {
        try {
          await navigator.share({
            files: [file],
            title: filename.replace(/\.[^/.]+$/, ""),
          });
          return "shared";
        } catch (shareErr: any) {
          if (shareErr?.name === "AbortError") return "shared";
          console.warn("navigator.share image failed, downloading:", shareErr);
        }
      }

      triggerFileDownload(blob, filename);
      return "downloaded";
    } catch (e) {
      console.error("Combined image failed, fallback to receipt:", e);
      return shareAsImage(receiptElement, filename);
    }
  }
}



