import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "react-barcode", replacement: path.resolve(__dirname, "./Barcode.tsx") },
      { find: "@/lib/utils", replacement: path.resolve(__dirname, "./utils.ts") },
      { find: "#lib/utils", replacement: path.resolve(__dirname, "./utils.ts") },
      { find: "../../lib/utils", replacement: path.resolve(__dirname, "./utils.ts") },
      { find: "../lib/utils", replacement: path.resolve(__dirname, "./utils.ts") },
      
      // Component & hook root mappings
      { find: "@/components/ui", replacement: path.resolve(__dirname, "./ui") },
      { find: "#components/ui", replacement: path.resolve(__dirname, "./ui") },
      { find: "@/ui", replacement: path.resolve(__dirname, "./ui") },

      { find: "@/components/Layout", replacement: path.resolve(__dirname, "./Layout.tsx") },
      { find: "@/components/ImageUpload", replacement: path.resolve(__dirname, "./ImageUpload.tsx") },
      { find: "@/components/BarcodeScannerButton", replacement: path.resolve(__dirname, "./BarcodeScannerButton.tsx") },
      { find: "@/components/ReceiptActionBar", replacement: path.resolve(__dirname, "./ReceiptActionBar.tsx") },
      { find: "@/components/HabeshaDatePicker", replacement: path.resolve(__dirname, "./components/HabeshaDatePicker.tsx") },
      { find: "@/components/SupplierSelect", replacement: path.resolve(__dirname, "./components/SupplierSelect.tsx") },
      { find: "@/components/CustomerSelect", replacement: path.resolve(__dirname, "./components/CustomerSelect.tsx") },
      { find: "@/components/ProductSizeRangeSelector", replacement: path.resolve(__dirname, "./components/ProductSizeRangeSelector.tsx") },
      { find: "@/components/CartonBreakdownViewer", replacement: path.resolve(__dirname, "./components/CartonBreakdownViewer.tsx") },

      { find: "@/hooks/use-toast", replacement: path.resolve(__dirname, "./use-toast.ts") },
      { find: "@/hooks/useDeleteAuth", replacement: path.resolve(__dirname, "./useDeleteAuth.tsx") },
      { find: "@/hooks/useNotifications", replacement: path.resolve(__dirname, "./useNotifications.ts") },
      { find: "@/hooks/use-mobile", replacement: path.resolve(__dirname, "./use-mobile.tsx") },

      // Specific root lib mappings
      { find: "@/lib/ethiopianCalendar", replacement: path.resolve(__dirname, "./ethiopianCalendar.ts") },
      { find: "@/lib/firebase", replacement: path.resolve(__dirname, "./firebase.ts") },
      { find: "@/firebase", replacement: path.resolve(__dirname, "./firebase.ts") },
      { find: "@/lib/firestore", replacement: path.resolve(__dirname, "./firestore.ts") },
      { find: "@/lib/auth", replacement: path.resolve(__dirname, "./auth.tsx") },
      { find: "@/lib/currency", replacement: path.resolve(__dirname, "./currency.ts") },
      { find: "@/lib/stockUtils", replacement: path.resolve(__dirname, "./stockUtils.ts") },
      { find: "@/lib/categorySizeUtils", replacement: path.resolve(__dirname, "./categorySizeUtils.ts") },
      { find: "@/categorySizeUtils", replacement: path.resolve(__dirname, "./categorySizeUtils.ts") },
      { find: "@/lib/types", replacement: path.resolve(__dirname, "./types.ts") },
      { find: "@/lib/share", replacement: path.resolve(__dirname, "./share.ts") },
      { find: "@/lib/shareImage", replacement: path.resolve(__dirname, "./shareImage.ts") },
      { find: "@/lib/printUtils", replacement: path.resolve(__dirname, "./printUtils.ts") },
      { find: "@/lib/cloudinary", replacement: path.resolve(__dirname, "./cloudinary.ts") },

      // Subdirectory mappings
      { find: "@/lib", replacement: path.resolve(__dirname, "./lib") },
      { find: "#lib", replacement: path.resolve(__dirname, "./lib") },
      { find: "@/components", replacement: path.resolve(__dirname, "./components") },
      { find: "#components", replacement: path.resolve(__dirname, "./components") },
      { find: "@/hooks", replacement: path.resolve(__dirname, ".") },
      { find: "#hooks", replacement: path.resolve(__dirname, ".") },

      { find: "@", replacement: path.resolve(__dirname, ".") },
    ],
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
  },
});
