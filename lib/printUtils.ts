/**
 * Resilient, multi-environment print utility.
 * Ensures the printed document matches the exact layout, table borders,
 * View-modal photo thumbnails (56px x 56px), colors, and styling shown on the screen modal,
 * while cleanly excluding digital QR code elements per user specification.
 */

export interface PrintElementOptions {
  title?: string;
  orientation?: "portrait" | "landscape";
}

function getDocumentStyles(): string {
  if (typeof document === "undefined") return "";
  const styles: string[] = [];

  // Copy linked stylesheets (e.g. external fonts, CSS bundles)
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
    try {
      styles.push(link.outerHTML);
    } catch {}
  });

  // Copy inline styles (Vite/Tailwind styles are injected into <style> tags)
  document.querySelectorAll<HTMLStyleElement>("style").forEach((st) => {
    try {
      if (st.textContent) {
        styles.push(`<style>${st.textContent}</style>`);
      }
    } catch {}
  });

  return styles.join("\n");
}

export function printElement(
  element: HTMLElement | null,
  titleOrOptions: string | PrintElementOptions = "Print Document"
) {
  if (!element) return;

  const options: PrintElementOptions =
    typeof titleOrOptions === "string"
      ? { title: titleOrOptions, orientation: "portrait" }
      : { title: "Print Document", orientation: "portrait", ...titleOrOptions };

  const isLandscape = options.orientation === "landscape";
  const title = options.title || "Print Document";
  const pageSizeRule = isLandscape ? "A4 landscape" : "auto";

  // Gather current styles from document
  const headStyles = getDocumentStyles();

  // Clone node and strip out any .no-print, [data-no-print], or QR containers so they never appear on print
  const cloned = element.cloneNode(true) as HTMLElement;
  cloned.querySelectorAll<HTMLElement>(
    '.no-print, .print\\:hidden, [data-no-print], .receipt-qr-container, [class*="receipt-qr"]'
  ).forEach((el) => {
    el.remove();
  });

  // Attempt Method 1: New window print (cleanest, matches on-screen view exactly)
  try {
    const printWindow = window.open(
      "",
      "_blank",
      isLandscape ? "width=1100,height=800" : "width=850,height=900"
    );
    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8" />
            <title>${title}</title>
            ${headStyles}
            <style>
              @page {
                size: ${pageSizeRule};
                margin: 6mm;
              }
              * {
                box-sizing: border-box !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              html, body {
                margin: 0 !important;
                padding: 6px !important;
                background: #ffffff !important;
                color: #0f172a !important;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
              }

              /* Outer card container styling */
              .receipt-a4, [class*="receipt"] {
                max-width: 100% !important;
                margin: 0 auto !important;
                background: #ffffff !important;
                border: 1px solid #cbd5e1 !important;
                border-radius: 8px !important;
                padding: 16px !important;
                box-shadow: none !important;
              }

              /* 2-Column Info Grid for metadata */
              .grid {
                display: grid !important;
              }
              .grid-cols-2 {
                grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
              }
              .grid-cols-3 {
                grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
              }
              .gap-1 { gap: 0.25rem !important; }
              .gap-2 { gap: 0.5rem !important; }
              .gap-3 { gap: 0.75rem !important; }
              .gap-4 { gap: 1rem !important; }

              /* Flexbox alignment */
              .flex { display: flex !important; }
              .flex-col { flex-direction: column !important; }
              .justify-between { justify-content: space-between !important; }
              .justify-end { justify-content: flex-end !important; }
              .items-center { align-items: center !important; }
              .items-end { align-items: flex-end !important; }

              /* Tables: crisp borders and headers matching on-screen view */
              table {
                width: 100% !important;
                border-collapse: collapse !important;
                margin-top: 8px !important;
                margin-bottom: 8px !important;
                font-size: 11px !important;
              }
              th, td {
                border: 1px solid #cbd5e1 !important;
                padding: 4px 6px !important;
                vertical-align: middle !important;
              }
              thead th, thead tr, tr.bg-muted, th {
                background-color: #f1f5f9 !important;
                color: #0f172a !important;
                font-weight: 600 !important;
              }
              tfoot tr, tr.bg-muted\\/30 {
                background-color: #f8fafc !important;
                font-weight: 700 !important;
              }

              /* Product Photo Column & Thumbnails: Sized cleanly matching the View modal (56px x 56px) */
              table img, .receipt-photo, td img {
                width: 56px !important;
                height: 56px !important;
                min-width: 56px !important;
                max-width: 56px !important;
                min-height: 56px !important;
                max-height: 56px !important;
                object-fit: cover !important;
                border-radius: 6px !important;
                display: block !important;
                margin: 0 auto !important;
                border: 1px solid #cbd5e1 !important;
              }
              td:has(img), th.photo-col, td.photo-col {
                width: 68px !important;
                min-width: 68px !important;
                max-width: 72px !important;
                text-align: center !important;
              }

              /* Borders */
              .border { border: 1px solid #cbd5e1 !important; }
              .border-t { border-top: 1px solid #cbd5e1 !important; }
              .border-b { border-bottom: 1px solid #cbd5e1 !important; }
              .rounded-lg { border-radius: 8px !important; }
              .rounded { border-radius: 4px !important; }

              /* Key colors */
              .text-muted-foreground { color: #64748b !important; }
              .text-foreground { color: #0f172a !important; }
              .text-green-600, .text-emerald-600, .text-emerald-700 {
                color: #059669 !important;
                font-weight: 600 !important;
              }
              .text-red-500, .text-red-600, .text-red-700 {
                color: #dc2626 !important;
                font-weight: 600 !important;
              }
              .text-blue-700 { color: #1d4ed8 !important; }
              .bg-muted { background-color: #f1f5f9 !important; }
              .bg-muted\\/20 { background-color: #f8fafc !important; }
              .bg-muted\\/30 { background-color: #f1f5f9 !important; }
              .bg-muted\\/40 { background-color: #f1f5f9 !important; }
              .bg-card { background-color: #ffffff !important; }

              /* Exclude QR code and digital receipt links on print */
              .no-print,
              .print\\:hidden,
              [data-no-print],
              .receipt-qr-container,
              [class*="receipt-qr"] {
                display: none !important;
              }
            </style>
          </head>
          <body>
            <div class="${cloned.className || ""}" style="${cloned.getAttribute("style") || ""}">
              ${cloned.innerHTML}
            </div>
            <script>
              function triggerPrint() {
                window.focus();
                window.print();
                setTimeout(function() {
                  try { window.close(); } catch {}
                }, 2000);
              }

              window.onload = function() {
                var imgs = Array.from(document.images);
                if (imgs.length === 0) {
                  setTimeout(triggerPrint, 200);
                  return;
                }
                var loaded = 0;
                var total = imgs.length;
                var done = false;
                function checkDone() {
                  if (done) return;
                  loaded++;
                  if (loaded >= total) {
                    done = true;
                    setTimeout(triggerPrint, 250);
                  }
                }
                imgs.forEach(function(img) {
                  if (img.complete) {
                    checkDone();
                  } else {
                    img.addEventListener('load', checkDone);
                    img.addEventListener('error', checkDone);
                  }
                });
                // Fallback timeout in case image loading is slow
                setTimeout(function() {
                  if (!done) {
                    done = true;
                    triggerPrint();
                  }
                }, 1600);
              };
            <\/script>
          </body>
        </html>
      `);
      printWindow.document.close();
      return;
    }
  } catch (err) {
    console.warn("Direct window.open printing blocked, falling back to in-page print:", err);
  }

  // Method 2: In-page print via CSS class and native window.print()
  element.classList.add("printable-content");
  document.body.classList.add("is-printing");
  if (isLandscape) {
    document.body.classList.add("is-printing-landscape");
  }

  setTimeout(() => {
    window.print();
    setTimeout(() => {
      element.classList.remove("printable-content");
      document.body.classList.remove("is-printing");
      document.body.classList.remove("is-printing-landscape");
    }, 600);
  }, 150);
}
