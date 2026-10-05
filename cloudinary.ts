// Cloudinary Utility for Direct Image and Video Uploads

export interface CloudinaryUploadResponse {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
  resource_type?: string;
  created_at?: string;
}

export interface CloudinaryUploadOptions {
  folder?: string;
  onProgress?: (progressPercent: number) => void;
  maxSizeBytes?: number; // Default 10MB
  allowedTypes?: string[]; // Default ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
  resourceType?: "image" | "video" | "auto";
}

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

const DEFAULT_CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || "";
const DEFAULT_UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || "";
const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB
const DEFAULT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "image/heic",
  "image/heif",
  "image/bmp",
];

/**
 * Validates file type and size before upload
 */
export function validateImageFile(
  file: File,
  maxSizeBytes: number = DEFAULT_MAX_SIZE,
  allowedTypes: string[] = DEFAULT_ALLOWED_TYPES
): ImageValidationResult {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  // Type validation
  if (allowedTypes && allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    const readableTypes = allowedTypes
      .map((t) => t.replace("image/", "").replace("video/", "").replace("+xml", "").toUpperCase())
      .join(", ");
    return {
      valid: false,
      error: `Invalid file format "${file.type || "unknown"}". Allowed: ${readableTypes}`,
    };
  }

  // Size validation
  if (file.size > maxSizeBytes) {
    const sizeInMB = (maxSizeBytes / (1024 * 1024)).toFixed(1);
    const actualSizeInMB = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size (${actualSizeInMB}MB) exceeds maximum limit of ${sizeInMB}MB.`,
    };
  }

  return { valid: true };
}

/**
 * Uploads an image or video directly to Cloudinary with real-time upload progress tracking
 */
export async function uploadImageWithProgress(
  file: File,
  options: CloudinaryUploadOptions = {}
): Promise<CloudinaryUploadResponse> {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || DEFAULT_UPLOAD_PRESET;
  const {
    folder = "inventory",
    onProgress,
    maxSizeBytes,
    allowedTypes,
    resourceType = "image",
  } = options;

  // Validate before starting upload
  const validation = validateImageFile(file, maxSizeBytes, allowedTypes);
  if (!validation.valid) {
    throw new Error(validation.error || "File validation failed.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);
  if (folder) {
    formData.append("folder", folder);
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/upload`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open("POST", endpoint, true);

    if (onProgress && xhr.upload) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response: CloudinaryUploadResponse = JSON.parse(xhr.responseText);
          if (onProgress) onProgress(100);
          resolve(response);
        } catch {
          reject(new Error("Failed to parse Cloudinary response."));
        }
      } else {
        try {
          const errorRes = JSON.parse(xhr.responseText);
          const msg = errorRes?.error?.message || `Upload failed with status ${xhr.status}`;
          reject(new Error(msg));
        } catch {
          reject(new Error(`Upload failed with status ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("Network error occurred during upload. Please check your internet connection."));
    };

    xhr.ontimeout = () => {
      reject(new Error("Upload request timed out. Please try again."));
    };

    xhr.send(formData);
  });
}

/**
 * Reads and optionally compresses a file to a Base64 Data URL as a reliable offline/fallback store
 */
export async function fileToDataUrl(file: File, maxWidth = 1200, maxHeight = 1200, quality = 0.85): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let { width, height } = img;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL(file.type || "image/jpeg", quality));
        } else {
          resolve(event.target?.result as string || "");
        }
      };
      img.onerror = () => {
        resolve(event.target?.result as string || "");
      };
      img.src = event.target?.result as string;
    };
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

/**
 * Convenience function returning secure image URL string with automatic fallback
 */
export async function uploadImage(file: File, folder = "inventory"): Promise<string> {
  try {
    const result = await uploadImageWithProgress(file, { folder, resourceType: "image" });
    if (result.secure_url) {
      return result.secure_url;
    }
  } catch (err) {
    console.warn("Cloudinary upload failed, using optimized local data URL fallback:", err);
  }

  // Graceful fallback to compressed Data URL
  return await fileToDataUrl(file);
}

/**
 * Convenience function returning secure video URL string
 */
export async function uploadVideo(file: File, folder = "promotions"): Promise<string> {
  const result = await uploadImageWithProgress(file, {
    folder,
    resourceType: "video",
    maxSizeBytes: 100 * 1024 * 1024, // 100MB max for video
    allowedTypes: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"],
  });
  return result.secure_url;
}

/**
 * Generates an optimized Cloudinary image URL with width/height/quality transformations
 */
export function getOptimizedImageUrl(
  publicIdOrUrl: string,
  options: { width?: number; height?: number; quality?: string } = {}
): string {
  if (!publicIdOrUrl) return "";

  if (publicIdOrUrl.startsWith("http") && !publicIdOrUrl.includes("res.cloudinary.com")) {
    return publicIdOrUrl;
  }

  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || DEFAULT_CLOUD_NAME;
  const { width, height, quality = "auto" } = options;
  const transforms = ["f_auto", `q_${quality}`];
  if (width) transforms.push(`w_${width}`);
  if (height) transforms.push(`h_${height}`);
  const transformStr = transforms.join(",");

  let cleanPublicId = publicIdOrUrl;
  if (publicIdOrUrl.includes("/upload/")) {
    const parts = publicIdOrUrl.split("/upload/");
    const afterUpload = parts[1];
    cleanPublicId = afterUpload.replace(/^v\d+\//, "").replace(/^[a-z]_[^/]+\//, "");
  }

  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformStr}/${cleanPublicId}`;
}

export { DEFAULT_CLOUD_NAME as CLOUD_NAME, DEFAULT_UPLOAD_PRESET as UPLOAD_PRESET };
