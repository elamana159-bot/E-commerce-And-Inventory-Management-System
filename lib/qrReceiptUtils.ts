/**
 * Utilities for Digital Receipt QR Code generation, encoding, and sharing.
 */

export interface ReceiptQrPayloadData {
  voucherId: string;
  totalAmount?: number;
  voucherDate?: string;
  storeName?: string;
  customerName?: string;
  paymentMethod?: string;
  itemsCount?: number;
  type?: string;
}

/**
 * Get base URL for public digital receipts.
 * Works seamlessly in production, preview domains, or localhost.
 */
export function getDigitalReceiptBaseUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/receipt`;
  }
  return "/receipt";
}

/**
 * Encodes summary data into URL search parameters for fast offline-resilient digital receipt rendering.
 */
export function buildDigitalReceiptUrl(
  voucherId: string,
  extraData?: Partial<ReceiptQrPayloadData>
): string {
  const cleanId = (voucherId || "").trim();
  const baseUrl = getDigitalReceiptBaseUrl();
  if (!cleanId) return baseUrl;

  const url = new URL(`${baseUrl}/${encodeURIComponent(cleanId)}`, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");

  if (extraData) {
    if (extraData.totalAmount !== undefined) url.searchParams.set("amt", String(extraData.totalAmount));
    if (extraData.voucherDate) url.searchParams.set("dt", extraData.voucherDate);
    if (extraData.storeName) url.searchParams.set("st", extraData.storeName);
    if (extraData.customerName) url.searchParams.set("cu", extraData.customerName);
    if (extraData.paymentMethod) url.searchParams.set("pm", extraData.paymentMethod);
    if (extraData.itemsCount !== undefined) url.searchParams.set("cnt", String(extraData.itemsCount));
    if (extraData.type) url.searchParams.set("tp", extraData.type);
  }

  return url.toString();
}

/**
 * Downloads a rendered SVG QR code element as a high-resolution PNG image.
 */
export async function downloadQrCodePng(
  svgElement: SVGSVGElement | null,
  filename: string = "receipt-qr-code.png"
): Promise<boolean> {
  if (!svgElement) return false;

  try {
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });

    const canvas = document.createElement("canvas");
    const scale = 3; // high-res for printing
    canvas.width = (svgElement.clientWidth || 200) * scale;
    canvas.height = (svgElement.clientHeight || 200) * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;

    // Fill white background for scan reliability
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    URL.revokeObjectURL(url);

    const pngUrl = canvas.toDataURL("image/png");
    const downloadLink = document.createElement("a");
    downloadLink.href = pngUrl;
    downloadLink.download = filename;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    return true;
  } catch (err) {
    console.error("Failed to download QR code PNG:", err);
    return false;
  }
}

/**
 * Share digital receipt link via Web Share API or fallback to WhatsApp / clipboard.
 */
export async function shareDigitalReceipt(
  voucherId: string,
  url: string,
  details?: { storeName?: string; totalAmount?: number }
): Promise<"shared" | "copied" | "whatsapp"> {
  const store = details?.storeName ? ` from ${details.storeName}` : "";
  const total = details?.totalAmount ? ` (Total: ${details.totalAmount} ETB)` : "";
  const title = `Digital Receipt #${voucherId}`;
  const text = `Here is your official digital receipt #${voucherId}${store}${total}. Tap the link to view:`;

  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({
        title,
        text,
        url,
      });
      return "shared";
    } catch (err: any) {
      if (err.name === "AbortError") return "shared";
    }
  }

  // Fallback: Copy link to clipboard
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      return "copied";
    }
  } catch {}

  return "copied";
}
