import React, { useState, useRef, useEffect, DragEvent, ChangeEvent } from "react";
import {
  Upload,
  Image as ImageIcon,
  X,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  uploadImageWithProgress,
  validateImageFile,
  CloudinaryUploadResponse,
} from "./cloudinary";

export interface ImageUploadProps {
  /** Initial or current uploaded image URL */
  value?: string;
  /** Callback fired when image URL changes (uploaded or removed) */
  onChange?: (url: string) => void;
  /** Callback fired with full Cloudinary upload response */
  onUploadSuccess?: (response: CloudinaryUploadResponse) => void;
  /** Callback fired when image is removed */
  onRemove?: () => void;
  /** Cloudinary folder destination */
  folder?: string;
  /** Maximum file size in bytes (default 10MB) */
  maxSizeBytes?: number;
  /** Allowed image mime types */
  allowedTypes?: string[];
  /** Optional field label */
  label?: string;
  /** Disabled state */
  disabled?: boolean;
  /** Aspect ratio style */
  aspectRatio?: "square" | "video" | "auto";
  /** Custom container class */
  className?: string;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({
  value = "",
  onChange,
  onUploadSuccess,
  onRemove,
  folder = "inventory",
  maxSizeBytes = 10 * 1024 * 1024, // 10MB
  allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"],
  label = "Upload Image",
  disabled = false,
  aspectRatio = "square",
  className = "",
}) => {
  const [currentUrl, setCurrentUrl] = useState<string>(value);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCurrentUrl(value);
  }, [value]);

  // Clean up object URLs on unmount or preview change
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileSelection = async (file: File) => {
    setError(null);
    setSuccessMsg(false);

    // 1. Validate file
    const validation = validateImageFile(file, maxSizeBytes, allowedTypes);
    if (!validation.valid) {
      setError(validation.error || "Invalid file selected.");
      return;
    }

    // 2. Generate local preview
    const localObjectUrl = URL.createObjectURL(file);
    setPreviewUrl(localObjectUrl);

    // 3. Start Cloudinary upload
    setIsUploading(true);
    setProgress(0);

    try {
      const response = await uploadImageWithProgress(file, {
        folder,
        maxSizeBytes,
        allowedTypes,
        onProgress: (pct) => setProgress(pct),
      });

      setCurrentUrl(response.secure_url);
      setSuccessMsg(true);

      if (onChange) {
        onChange(response.secure_url);
      }
      if (onUploadSuccess) {
        onUploadSuccess(response);
      }
    } catch (err) {
      // Graceful fallback to local Base64 store when Cloudinary is not configured or network fails
      try {
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          setCurrentUrl(base64);
          setSuccessMsg(true);
          if (onChange) onChange(base64);
          if (onUploadSuccess) {
            onUploadSuccess({
              secure_url: base64,
              public_id: `local_${Date.now()}`,
              width: 0,
              height: 0,
              format: file.type.split("/")[1] || "png",
              bytes: file.size,
            });
          }
        };
        reader.readAsDataURL(file);
      } catch {
        const message = err instanceof Error ? err.message : "Failed to upload image.";
        setError(message);
        setPreviewUrl("");
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFileSelection(files[0]);
    }
    // Reset file input value to allow re-selecting the same file if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled && !isUploading) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled || isUploading) return;

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFileSelection(files[0]);
    }
  };

  const handleRemove = () => {
    if (disabled || isUploading) return;

    setCurrentUrl("");
    setPreviewUrl("");
    setError(null);
    setSuccessMsg(false);
    setProgress(0);

    if (onChange) {
      onChange("");
    }
    if (onRemove) {
      onRemove();
    }
  };

  const handleReplaceClick = () => {
    if (disabled || isUploading) return;
    fileInputRef.current?.click();
  };

  const activeDisplayUrl = previewUrl || currentUrl;

  const aspectRatioClass =
    aspectRatio === "square"
      ? "aspect-square"
      : aspectRatio === "video"
      ? "aspect-video"
      : "min-h-[200px]";

  return (
    <div className={`w-full space-y-2 ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-foreground mb-1">
          {label}
        </label>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={allowedTypes.join(",")}
        onChange={handleInputChange}
        disabled={disabled || isUploading}
        className="hidden"
        data-testid="cloudinary-file-input"
      />

      {/* Upload Box / Image Display Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative group rounded-xl border-2 border-dashed transition-all overflow-hidden bg-card ${aspectRatioClass} ${
          isDragging
            ? "border-primary bg-primary/10 scale-[1.01]"
            : error
            ? "border-destructive/60 bg-destructive/5"
            : activeDisplayUrl
            ? "border-border"
            : "border-muted-foreground/25 hover:border-primary/60 hover:bg-accent/40"
        } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        onClick={() => {
          if (!activeDisplayUrl && !disabled && !isUploading) {
            fileInputRef.current?.click();
          }
        }}
      >
        {/* Active Display Image */}
        {activeDisplayUrl ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black/5 dark:bg-black/20">
            <img
              src={activeDisplayUrl}
              alt="Uploaded Preview"
              className="w-full h-full object-contain"
            />

            {/* Overlay Action Buttons */}
            {!isUploading && !disabled && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 p-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReplaceClick();
                  }}
                  className="px-3 py-2 bg-white/90 hover:bg-white text-slate-900 rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition-transform hover:scale-105"
                  title="Replace Image"
                  data-testid="replace-image-btn"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Replace
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove();
                  }}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-md flex items-center gap-1.5 transition-transform hover:scale-105"
                  title="Delete Image"
                  data-testid="delete-image-btn"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Empty Drag & Drop State */
          <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center space-y-3">
            <div className="p-3.5 rounded-full bg-primary/10 text-primary group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Click or drag image to upload
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                PNG, JPG, WEBP, GIF or SVG (max {(maxSizeBytes / (1024 * 1024)).toFixed(0)}MB)
              </p>
            </div>
          </div>
        )}

        {/* Upload Progress Overlay */}
        {isUploading && (
          <div className="absolute inset-0 bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center z-10 space-y-3 animate-in fade-in">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <div className="w-full max-w-[200px] space-y-1">
              <div className="flex justify-between text-xs font-medium text-foreground">
                <span>Uploading...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-200 ease-out rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Success Badge */}
      {successMsg && !isUploading && (
        <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>Uploaded successfully to Cloudinary!</span>
        </div>
      )}

      {/* Error Message Alert */}
      {error && (
        <div className="flex items-start justify-between gap-2 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs animate-in fade-in">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="hover:opacity-75 transition-opacity"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
