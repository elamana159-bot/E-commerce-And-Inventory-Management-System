import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Eye,
  EyeOff,
  Image as ImageIcon,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ExternalLink,
  Columns,
  FileText,
} from "lucide-react";

interface ReceiptWithReferenceViewProps {
  receiptNode?: React.ReactNode;
  children?: React.ReactNode;
  referencePhotoUrl?: string;
  voucherId?: string;
  className?: string;
}

export function ReceiptWithReferenceView({
  receiptNode,
  children,
  referencePhotoUrl,
  voucherId,
  className = "",
}: ReceiptWithReferenceViewProps) {
  const [viewMode, setViewMode] = useState<"both" | "receipt" | "photo">("both");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const content = receiptNode || children;
  const hasPhoto = Boolean(referencePhotoUrl);

  if (!hasPhoto) {
    return <div className={`w-full ${className}`}>{content}</div>;
  }

  const handleZoomIn = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((prev) => Math.max(prev - 0.25, 0.75));
  };

  const handleResetZoom = (e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom(1);
    setRotation(0);
  };

  const handleRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setRotation((prev) => (prev + 90) % 360);
  };

  const openOriginal = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (referencePhotoUrl) {
      window.open(referencePhotoUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className={`w-full space-y-2.5 ${className}`}>
      {/* Sleek Minimal Header: View Mode Switch & Reference Document Badge */}
      <div className="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
          <span className="font-semibold text-foreground truncate">
            Attached Reference (ማጣቀሻ ሰነድ)
          </span>
          {voucherId && (
            <span className="font-mono text-muted-foreground hidden sm:inline truncate">
              • {voucherId}
            </span>
          )}
        </div>

        {/* View Mode Segmented Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-md flex items-center gap-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setViewMode("both")}
              className={`px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                viewMode === "both"
                  ? "bg-white dark:bg-slate-950 text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Side-by-side view (ጎን ለጎን)"
            >
              <Columns className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Side by Side (ጎን ለጎን)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("receipt")}
              className={`px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                viewMode === "receipt"
                  ? "bg-white dark:bg-slate-950 text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Receipt Only (ደረሰኝ ብቻ)"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Receipt Only</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("photo")}
              className={`px-2 py-1 rounded font-medium transition-colors flex items-center gap-1 ${
                viewMode === "photo"
                  ? "bg-white dark:bg-slate-950 text-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              title="Reference Photo Only (ማጣቀሻ ብቻ)"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Photo Only</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main View Area: Clean Side-by-Side (Matching Share View) */}
      <div
        className={
          viewMode === "both"
            ? "grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch"
            : "w-full flex justify-center"
        }
      >
        {/* Printable Receipt (Left Column in Side-by-Side) */}
        {(viewMode === "both" || viewMode === "receipt") && (
          <div className={`w-full overflow-x-auto ${viewMode === "receipt" ? "max-w-2xl mx-auto" : ""}`}>
            {content}
          </div>
        )}

        {/* Reference Document Photo (Right Column in Side-by-Side) */}
        {(viewMode === "both" || viewMode === "photo") && (
          <div
            className={`w-full flex flex-col ${
              viewMode === "photo" ? "max-w-3xl mx-auto" : ""
            }`}
          >
            {/* Reference Container: Completely Clean White Canvas (Background Removed) */}
            <div className="relative w-full h-full min-h-[420px] bg-white dark:bg-card border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs flex flex-col">
              {/* Floating Action Controls Overlay (Top Right) */}
              <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-lg p-1 shadow-sm">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.75}
                  title="Zoom Out (-)"
                  className="h-7 w-7 p-0 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  title="Reset Zoom & Rotation"
                  className="h-7 px-1.5 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  title="Zoom In (+)"
                  className="h-7 w-7 p-0 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleRotate}
                  title="Rotate 90° (አሽከርክር)"
                  className="h-7 w-7 p-0 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsFullscreen(true)}
                  title="Full Screen (ሙሉ ስክሪን)"
                  className="h-7 w-7 p-0 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={openOriginal}
                  title="Open Original Image in New Tab"
                  className="h-7 w-7 p-0 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Clean Reference Document Canvas: Zero Dark Background */}
              <div
                className="relative flex-1 w-full flex items-center justify-center p-2 sm:p-3 overflow-auto bg-white dark:bg-card select-none"
                style={{ minHeight: "440px" }}
              >
                <div
                  className="transition-transform duration-200 ease-out origin-center flex items-center justify-center w-full h-full"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                  }}
                >
                  <img
                    src={referencePhotoUrl}
                    alt="Reference document proof"
                    className="max-h-[75vh] w-auto max-w-full object-contain cursor-zoom-in rounded-sm"
                    crossOrigin="anonymous"
                    draggable={false}
                    onClick={() => setIsFullscreen(true)}
                    title="Click to expand fullscreen (ሙሉ ስክሪን ለማየት ይጫኑ)"
                  />
                </div>
              </div>

              {/* Minimal Clean Footer Info */}
              <div className="p-2 px-3 bg-slate-50/80 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                  <ImageIcon className="w-3.5 h-3.5 text-primary" />
                  Original Attached Document (የተያያዘ ሰነድ)
                </span>
                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="text-primary hover:underline font-medium text-[11px]"
                >
                  Click to Enlarge (አጉላ)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Lightbox Modal */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md flex flex-col p-3 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setIsFullscreen(false)}
        >
          {/* Top Bar */}
          <div
            className="flex items-center justify-between text-white pb-3 border-b border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              <span className="font-semibold text-sm sm:text-base">
                Reference Document (የማጣቀሻ ሰነድ ሙሉ እይታ)
              </span>
              {voucherId && (
                <span className="font-mono text-xs text-white/60">
                  • {voucherId}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoom <= 0.75}
                className="h-8 px-2.5 text-xs text-white bg-white/10 border-white/20 hover:bg-white/20"
              >
                <ZoomOut className="w-3.5 h-3.5 mr-1" /> Zoom -
              </Button>
              <button
                type="button"
                onClick={handleResetZoom}
                className="px-2 py-1 text-xs font-mono font-semibold bg-white/10 rounded text-white hover:bg-white/20"
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoom >= 3}
                className="h-8 px-2.5 text-xs text-white bg-white/10 border-white/20 hover:bg-white/20"
              >
                <ZoomIn className="w-3.5 h-3.5 mr-1" /> Zoom +
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRotate}
                className="h-8 px-2.5 text-xs text-white bg-white/10 border-white/20 hover:bg-white/20"
              >
                <RotateCw className="w-3.5 h-3.5 mr-1" /> Rotate
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsFullscreen(false)}
                className="h-8 px-3 text-xs"
              >
                <Minimize2 className="w-3.5 h-3.5 mr-1" /> Close (ዝጋ)
              </Button>
            </div>
          </div>

          {/* Fullscreen Image Canvas */}
          <div
            className="flex-1 overflow-auto flex items-center justify-center p-4 select-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="transition-transform duration-200 ease-out origin-center flex items-center justify-center max-w-full max-h-full"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
              }}
            >
              <img
                src={referencePhotoUrl}
                alt="Reference document fullscreen"
                className="max-h-[85vh] max-w-full object-contain rounded shadow-2xl"
                crossOrigin="anonymous"
                draggable={false}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
