import React, { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { 
  Eye, 
  EyeOff, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  Upload, 
  Trash2, 
  ExternalLink,
  Image as ImageIcon,
  Images,
  Camera,
  CheckCircle2,
  RefreshCw
} from "lucide-react";
import { uploadImage } from "@/lib/cloudinary";

interface ReferencePhotoViewerProps {
  photoUrl: string;
  onPhotoChange?: (url: string) => void;
  onPhotoRemove?: () => void;
  isEditable?: boolean;
  title?: string;
  className?: string;
  defaultHidden?: boolean;
  onToggleHidden?: (hidden: boolean) => void;
  isUploading?: boolean;
  setIsUploading?: (uploading: boolean) => void;
}

export function ReferencePhotoViewer({
  photoUrl,
  onPhotoChange,
  onPhotoRemove,
  isEditable = true,
  title = "Reference Document (ማጣቀሻ ሰነድ)",
  className = "",
  defaultHidden = false,
  onToggleHidden,
  isUploading,
  setIsUploading,
}: ReferencePhotoViewerProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [internalUploading, setInternalUploading] = useState(false);
  const [localHidden, setLocalHidden] = useState(defaultHidden);
  const [isDragging, setIsDragging] = useState(false);

  // Separate refs for Gallery (no capture, opens device photo gallery) and Camera (capture="environment")
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const uploading = isUploading ?? internalUploading;
  const setUploading = setIsUploading ?? setInternalUploading;

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3.5));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => {
    setZoom(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const processFile = async (file: File) => {
    if (!file) return;
    try {
      setUploading(true);
      // Immediately create a temporary preview so the user sees the photo right away
      const tempUrl = URL.createObjectURL(file);
      onPhotoChange?.(tempUrl);

      // Upload to Cloudinary / storage
      const uploadedUrl = await uploadImage(file, "reference_photos");
      if (uploadedUrl) {
        onPhotoChange?.(uploadedUrl);
      }
    } catch (err) {
      console.error("Failed to upload reference photo:", err);
    } finally {
      setUploading(false);
      if (galleryInputRef.current) galleryInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const toggleHide = () => {
    const next = !localHidden;
    setLocalHidden(next);
    onToggleHidden?.(next);
  };

  if (!photoUrl && !isEditable) {
    return null;
  }

  // When no photo is uploaded yet and it's editable, show a clean upload card with Gallery & Camera options
  if (!photoUrl && isEditable) {
    return (
      <div 
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => {
          if (!uploading) galleryInputRef.current?.click();
        }}
        className={`p-4 rounded-xl border-2 border-dashed cursor-pointer transition-all text-center ${
          isDragging 
            ? "border-primary bg-primary/15 scale-[1.01]" 
            : "border-primary/30 bg-primary/5 hover:bg-primary/10"
        } ${className}`}
      >
        {/* Gallery file picker - No capture attribute ensures standard photo gallery opens on Android/iOS */}
        <input 
          ref={galleryInputRef} 
          type="file" 
          accept="image/*" 
          className="hidden" 
          onChange={handleFileSelect} 
        />
        {/* Camera file picker - Directly opens camera */}
        <input 
          ref={cameraInputRef} 
          type="file" 
          accept="image/*" 
          capture="environment"
          className="hidden" 
          onChange={handleFileSelect} 
        />

        <div className="flex flex-col items-center justify-center gap-2.5">
          <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
            {uploading ? (
              <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            ) : (
              <Images className="w-6 h-6 text-primary" />
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Attach Reference Photo (ማጣቀሻ ፎቶ)</p>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-sm mx-auto">
              Choose from Gallery or take a photo of invoice, delivery note, supplier voucher, or paper receipt
            </p>
          </div>

          <div className="flex items-center justify-center gap-2 pt-1 flex-wrap" onClick={(e) => e.stopPropagation()}>
            <Button 
              type="button"
              size="sm" 
              variant="default" 
              disabled={uploading}
              onClick={() => galleryInputRef.current?.click()}
              className="h-8 px-3 gap-1.5 text-xs font-semibold shadow-xs"
            >
              {uploading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Uploading...
                </>
              ) : (
                <>
                  <Images className="w-4 h-4" /> Upload from Gallery (ከጋለሪ ጫን)
                </>
              )}
            </Button>

            <Button 
              type="button"
              size="sm" 
              variant="outline" 
              disabled={uploading}
              onClick={() => cameraInputRef.current?.click()}
              className="h-8 px-3 gap-1.5 text-xs font-semibold bg-background"
            >
              <Camera className="w-3.5 h-3.5 text-muted-foreground" /> Take Photo (በካሜራ)
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // When photo is present but user chose to hide it
  if (localHidden) {
    return (
      <div className="p-3 bg-muted/40 border border-dashed rounded-lg flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ImageIcon className="w-4 h-4 text-primary" />
          <span>Reference Photo Attached (ተያይዟል)</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="h-7 text-xs gap-1.5"
          onClick={toggleHide}
        >
          <Eye className="w-3.5 h-3.5 text-primary" />
          Show Reference Photo (አሳይ)
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className={`flex flex-col rounded-xl border bg-card shadow-sm overflow-hidden ${className}`}>
        {/* Header toolbar */}
        <div className="p-2.5 px-3 bg-muted/60 border-b flex items-center justify-between gap-2 flex-wrap text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-foreground truncate flex items-center gap-1.5">
              <ImageIcon className="w-4 h-4 text-primary shrink-0" />
              {title}
            </span>
            {uploading && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium animate-pulse flex items-center gap-1">
                <RefreshCw className="w-3 h-3 animate-spin" /> Uploading...
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Zoom Controls */}
            <div className="flex items-center bg-background border rounded-md shadow-xs mr-1">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 0.5}
                title="Zoom Out"
                className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 rounded-l"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleResetZoom}
                title="Reset Zoom"
                className="px-1.5 text-[11px] font-mono font-semibold border-x hover:bg-muted"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 3.5}
                title="Zoom In"
                className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-40 rounded-r"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleRotate}
              title="Rotate 90°"
              className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md border bg-background"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(true)}
              title="Fullscreen / Enlarge"
              className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md border bg-background"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>

            <a
              href={photoUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Original Image"
              className="p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground rounded-md border bg-background"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            {/* Hide button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleHide}
              title="Hide Reference Photo"
              className="h-7 px-2 text-xs gap-1 ml-1"
            >
              <EyeOff className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Hide (ደብቅ)</span>
            </Button>

            {isEditable && onPhotoRemove && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onPhotoRemove}
                title="Remove Photo"
                className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>

        {/* Large Viewer Area: Clean White Background (Zero Dark Background) */}
        <div className="relative flex-1 min-h-[320px] max-h-[70vh] bg-white dark:bg-card overflow-auto flex items-center justify-center p-2 sm:p-3 select-none">
          <div 
            className="transition-transform duration-150 ease-out origin-center flex items-center justify-center w-full h-full"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
            }}
          >
            <img
              src={photoUrl}
              alt="Reference document"
              className="max-h-[65vh] max-w-full object-contain cursor-grab active:cursor-grabbing rounded-sm"
              crossOrigin="anonymous"
              draggable={false}
            />
          </div>
        </div>

        {/* Footer info & Change photo option if editable */}
        {isEditable && (
          <div className="p-2 px-3 bg-muted/30 border-t flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2">
            <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Attached to voucher
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => galleryInputRef.current?.click()}
                disabled={uploading}
                className="hover:underline text-primary font-medium cursor-pointer flex items-center gap-1"
              >
                <Images className="w-3 h-3" /> Change (ከጋለሪ ቀይር)
              </button>
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={uploading}
                className="hover:underline text-muted-foreground hover:text-foreground font-medium cursor-pointer flex items-center gap-1"
              >
                <Camera className="w-3 h-3" /> በካሜራ
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Fullscreen Modal View */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex flex-col p-4 animate-in fade-in duration-150"
          onClick={() => setIsFullscreen(false)}
        >
          <div className="flex items-center justify-between text-white pb-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5 text-primary" />
              <span className="font-bold text-sm">{title}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-white/10 rounded-md">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  className="p-2 hover:bg-white/20 text-white rounded-l"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="px-2 text-xs font-mono font-semibold"
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  className="p-2 hover:bg-white/20 text-white rounded-r"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={handleRotate}
                className="p-2 hover:bg-white/20 text-white rounded-md bg-white/10"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setIsFullscreen(false)}
                className="h-8 gap-1 ml-2"
              >
                Close
              </Button>
            </div>
          </div>
          <div 
            className="flex-1 overflow-auto flex items-center justify-center p-2"
            onClick={e => e.stopPropagation()}
          >
            <div 
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: "transform 150ms ease-out",
              }}
            >
              <img
                src={photoUrl}
                alt="Reference Document Fullscreen"
                className="max-h-[85vh] max-w-[90vw] object-contain rounded shadow-2xl"
                crossOrigin="anonymous"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
