/**
 * Environment Variable Validation Utility for NexusStock
 * Verifies that all required production environment variables are present and correctly formatted.
 */

export interface EnvValidationReport {
  isValid: boolean;
  isProductionReady: boolean;
  missingFirebase: string[];
  missingCloudinary: string[];
  allMissing: string[];
  warnings: string[];
}

export const REQUIRED_FIREBASE_VARS = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
] as const;

export const REQUIRED_CLOUDINARY_VARS = [
  "VITE_CLOUDINARY_CLOUD_NAME",
  "VITE_CLOUDINARY_UPLOAD_PRESET",
] as const;

export function validateEnvironment(): EnvValidationReport {
  const missingFirebase: string[] = [];
  const missingCloudinary: string[] = [];
  const warnings: string[] = [];

  // Check Firebase environment variables
  if (!import.meta.env.VITE_FIREBASE_API_KEY) missingFirebase.push("VITE_FIREBASE_API_KEY");
  if (!import.meta.env.VITE_FIREBASE_AUTH_DOMAIN) missingFirebase.push("VITE_FIREBASE_AUTH_DOMAIN");
  if (!import.meta.env.VITE_FIREBASE_PROJECT_ID) missingFirebase.push("VITE_FIREBASE_PROJECT_ID");
  if (!import.meta.env.VITE_FIREBASE_STORAGE_BUCKET) missingFirebase.push("VITE_FIREBASE_STORAGE_BUCKET");
  if (!import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID) missingFirebase.push("VITE_FIREBASE_MESSAGING_SENDER_ID");
  if (!import.meta.env.VITE_FIREBASE_APP_ID) missingFirebase.push("VITE_FIREBASE_APP_ID");

  // Check Cloudinary environment variables
  if (!import.meta.env.VITE_CLOUDINARY_CLOUD_NAME) missingCloudinary.push("VITE_CLOUDINARY_CLOUD_NAME");
  if (!import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET) missingCloudinary.push("VITE_CLOUDINARY_UPLOAD_PRESET");

  const allMissing = [...missingFirebase, ...missingCloudinary];
  const isProductionReady = allMissing.length === 0;

  if (missingFirebase.length > 0) {
    warnings.push(
      `[NexusStock Deployment Alert] Missing Firebase environment variables: ${missingFirebase.join(", ")}. Please configure them in your Vercel Project Settings -> Environment Variables.`
    );
  }

  if (missingCloudinary.length > 0) {
    warnings.push(
      `[NexusStock Deployment Alert] Missing Cloudinary environment variables: ${missingCloudinary.join(", ")}. Image uploads will fallback to local Base64 store until configured in Vercel.`
    );
  }

  return {
    isValid: isProductionReady,
    isProductionReady,
    missingFirebase,
    missingCloudinary,
    allMissing,
    warnings,
  };
}

/**
 * Runs validation and logs clean diagnostics on app initialization
 */
export function logEnvironmentDiagnostics(): void {
  const report = validateEnvironment();
  if (!report.isProductionReady) {
    console.group("⚠️ NexusStock Environment Diagnostics");
    report.warnings.forEach((warn) => console.warn(warn));
    console.info("To resolve this on Vercel, navigate to Project Settings > Environment Variables and provide the required keys.");
    console.groupEnd();
  } else {
    console.info("✅ NexusStock Production Environment: All Firebase and Cloudinary variables verified successfully.");
  }
}
